import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { writeFakeProject } from './fake-project.mjs'

/**
 * Writes a fake project in a new folder and runs its fake CLI there.
 *
 * @param {string[]} args
 * @param {Record<string, string>} environment
 */
function runFakeCli(args, environment) {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'visual-check-fake-project-')))

  writeFakeProject(project)

  const bin = join(project, 'node_modules', '@visual-check', 'cli', 'dist', 'bin.js')
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...environment },
  })

  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('the fake CLI', () => {
  const expected = '^test --storybook web (--consistency|--shard [1-4]/4)$'

  it('exits with FAKE_CLI_EXIT when its arguments match FAKE_CLI_EXPECT', () => {
    const { exitCode } = runFakeCli(['test', '--storybook', 'web', '--shard', '2/4'], {
      FAKE_CLI_EXIT: '0',
      FAKE_CLI_EXPECT: expected,
    })

    assert.equal(exitCode, 0)
  })

  it("exits 2, naming both, when they don't", () => {
    const { exitCode, stderr } = runFakeCli(['test', '--shard', '2/4'], {
      FAKE_CLI_EXIT: '0',
      FAKE_CLI_EXPECT: expected,
    })

    assert.equal(exitCode, 2)
    assert.match(stderr, /expected arguments matching .*, not: test --shard 2\/4/)
  })
})
