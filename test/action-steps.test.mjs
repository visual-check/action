import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { writeFakeProject } from './fake-project.mjs'

/**
 * The Action's `src` folder.
 */
const src = fileURLToPath(new URL('../src/', import.meta.url))

/**
 * A runner's files for one job: a workspace holding a repository, and the output and summary files.
 */
function runner() {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'visual-check-runner-')))
  const workspace = join(folder, 'workspace')

  mkdirSync(join(workspace, '.git'), { recursive: true })
  writeFileSync(join(folder, 'output'), '')
  writeFileSync(join(folder, 'summary'), '')

  return {
    workspace,
    outputPath: join(folder, 'output'),
    summaryPath: join(folder, 'summary'),
  }
}

/**
 * Reads the step outputs a step wrote in the delimiter format.
 *
 * @param {string} path
 * @returns {Record<string, string>}
 */
function outputsOf(path) {
  /** @type {Record<string, string>} */
  const outputs = {}

  for (const match of readFileSync(path, 'utf8').matchAll(/^(.+?)<<(.+)\n([\s\S]*?)\n\2$/gm)) {
    outputs[match[1]] = match[3]
  }

  return outputs
}

/**
 * Runs one of the Action's scripts as the composite step does.
 *
 * @param {string} script
 * @param {string} cwd
 * @param {Record<string, string>} environment
 */
function step(script, cwd, environment) {
  const result = spawnSync(process.execPath, [join(src, script)], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'acme/web',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_EVENT_NAME: 'push',
      ...environment,
    },
  })

  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('the run step', () => {
  it('runs the CLI with the inputs, and asks for no upload when it passes', () => {
    const { workspace, outputPath, summaryPath } = runner()
    const project = join(workspace, 'web')

    writeFakeProject(project)

    const result = step('run.mjs', workspace, {
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      INPUT_WORKING_DIRECTORY: 'web',
      INPUT_STORYBOOK: 'web',
      INPUT_ARGS: '--workers 2',
      FAKE_CLI_EXIT: '0',
    })

    assert.equal(result.exitCode, 0, result.stderr)
    assert.deepEqual(JSON.parse(readFileSync(join(project, 'cli-args.json'), 'utf8')), [
      'test',
      '--storybook',
      'web',
      '--workers',
      '2',
    ])
    assert.deepEqual(outputsOf(outputPath), {
      'exit-code': '0',
      'artifact-name': 'visual-check-report-web',
      'report-dir': '',
      upload: 'false',
    })
  })

  it('records the exit code and the report folder when the CLI fails', () => {
    const { workspace, outputPath } = runner()

    writeFakeProject(workspace)

    const result = step('run.mjs', workspace, {
      GITHUB_OUTPUT: outputPath,
      INPUT_SHARD: '2/4',
      FAKE_CLI_EXIT: '1',
    })

    assert.equal(result.exitCode, 0, result.stderr)
    assert.deepEqual(outputsOf(outputPath), {
      'exit-code': '1',
      'artifact-name': 'visual-check-report-2-of-4',
      'report-dir': join(workspace, '.visual-check', 'report'),
      upload: 'true',
    })
  })

  it('asks for no upload when an exit 2 left no report', () => {
    const { workspace, outputPath } = runner()

    writeFakeProject(workspace)

    step('run.mjs', workspace, {
      GITHUB_OUTPUT: outputPath,
      INPUT_CONSISTENCY: 'true',
      FAKE_CLI_EXIT: '2',
      FAKE_CLI_NO_REPORT: 'true',
    })

    assert.equal(outputsOf(outputPath).upload, 'false')
    assert.equal(outputsOf(outputPath)['exit-code'], '2')
  })

  it('ignores affected on a push, with a note', () => {
    const { workspace, outputPath } = runner()

    writeFakeProject(workspace)

    const result = step('run.mjs', workspace, { GITHUB_OUTPUT: outputPath, INPUT_AFFECTED: 'true' })

    assert.match(result.stdout, /the affected input applies on pull requests only, so this push event covers every/)
    assert.deepEqual(JSON.parse(readFileSync(join(workspace, 'cli-args.json'), 'utf8')), ['test'])
  })

  it('fails before running a missing CLI, naming the install command', () => {
    const { workspace, outputPath } = runner()

    writeFakeProject(workspace, { version: null, lockfile: 'pnpm-lock.yaml' })

    const result = step('run.mjs', workspace, { GITHUB_OUTPUT: outputPath })

    assert.equal(result.exitCode, 1)
    assert.match(result.stderr, /none is installed from .*`pnpm add --save-dev @visual-check\/cli`/)
    assert.deepEqual(outputsOf(outputPath), {})
  })

  it('fails before running a CLI out of range, naming the install command', () => {
    const { workspace, outputPath } = runner()

    writeFakeProject(workspace, { version: '2.0.0' })

    const result = step('run.mjs', workspace, { GITHUB_OUTPUT: outputPath })

    assert.equal(result.exitCode, 1)
    assert.match(
      result.stderr,
      /runs @visual-check\/cli 0\.x and 1\.x, but .* has 2\.0\.0\. .*`npm install --save-dev @visual-check\/cli@1`/,
    )
    assert.equal(existsSync(join(workspace, 'cli-args.json')), false)
  })

  it('fails on an input it can not use', () => {
    const { workspace, outputPath } = runner()

    writeFakeProject(workspace)

    const result = step('run.mjs', workspace, { GITHUB_OUTPUT: outputPath, INPUT_SHARD: '5/4' })

    assert.equal(result.exitCode, 1)
    assert.match(result.stderr, /The shard input takes k\/n/)
  })
})

describe('the finish step', () => {
  it('exits 0 and prints nothing when the CLI passed', () => {
    const { workspace, summaryPath } = runner()
    const result = step('finish.mjs', workspace, { GITHUB_STEP_SUMMARY: summaryPath, VISUAL_CHECK_EXIT_CODE: '0' })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, '')
    assert.equal(readFileSync(summaryPath, 'utf8'), '')
  })

  it("links the artifact in the summary and the log's last lines, and exits with the CLI's code", () => {
    const { workspace, summaryPath } = runner()
    const artifactUrl = 'https://github.com/acme/web/actions/runs/123/artifacts/456'
    const result = step('finish.mjs', workspace, {
      GITHUB_STEP_SUMMARY: summaryPath,
      VISUAL_CHECK_EXIT_CODE: '2',
      VISUAL_CHECK_ARTIFACT_NAME: 'visual-check-consistency',
      VISUAL_CHECK_ARTIFACT_URL: artifactUrl,
    })

    assert.equal(result.exitCode, 2)
    assert.match(
      readFileSync(summaryPath, 'utf8'),
      /\[visual-check-consistency\]\(https:\/\/github\.com\/acme\/web\/actions\/runs\/123\/artifacts\/456\)/,
    )
    assert.deepEqual(result.stdout.trimEnd().split('\n'), [
      'Summary: https://github.com/acme/web/actions/runs/123/attempts/1',
      `Report: ${artifactUrl} (artifact visual-check-consistency)`,
    ])
  })

  it('prints the summary link alone when nothing was uploaded', () => {
    const { workspace } = runner()
    const result = step('finish.mjs', workspace, { VISUAL_CHECK_EXIT_CODE: '1' })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, 'Summary: https://github.com/acme/web/actions/runs/123/attempts/1\n')
  })
})
