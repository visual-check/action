import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cliProblemOf, findCli, installCommandOf, isSupportedVersion, packageManagerOf } from '../src/cli.mjs'
import { writeFakeProject } from './fake-project.mjs'

/**
 * Makes an empty temporary folder, by its real path.
 */
function tempFolder() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'visual-check-action-')))
}

describe('isSupportedVersion', () => {
  for (const version of ['0.1.0', '0.0.0', '0.12.3', '1.0.0', '1.9.9', '1.0.0-beta.1', '0.3.0+build']) {
    it(`runs ${version}`, () => {
      assert.equal(isSupportedVersion(version), true)
    })
  }

  for (const version of ['2.0.0', '2.0.0-beta.1', '10.0.0', '1', 'latest', '']) {
    it(`doesn't run '${version}'`, () => {
      assert.equal(isSupportedVersion(version), false)
    })
  }
})

describe('findCli', () => {
  it('finds the CLI installed in the folder', () => {
    const project = tempFolder()

    writeFakeProject(project, { version: '0.4.1' })

    assert.deepEqual(findCli(project), {
      folder: join(project, 'node_modules', '@visual-check', 'cli'),
      version: '0.4.1',
      bin: join(project, 'node_modules', '@visual-check', 'cli', 'dist', 'bin.js'),
    })
  })

  it("finds a workspace root's CLI from a package folder", () => {
    const root = tempFolder()
    const app = join(root, 'apps', 'web')

    writeFakeProject(root)
    mkdirSync(app, { recursive: true })

    assert.equal(findCli(app)?.folder, join(root, 'node_modules', '@visual-check', 'cli'))
  })

  it('gives nothing when none is installed', () => {
    assert.equal(findCli(tempFolder()), undefined)
  })
})

describe('packageManagerOf', () => {
  it('reads the lockfile', () => {
    const project = tempFolder()

    writeFileSync(join(project, 'pnpm-lock.yaml'), '')

    assert.equal(packageManagerOf(project), 'pnpm')
  })

  it("reads a parent's lockfile, up to the repository's root", () => {
    const root = tempFolder()
    const repo = join(root, 'repo')
    const app = join(repo, 'apps', 'web')

    writeFileSync(join(root, 'yarn.lock'), '')
    mkdirSync(join(repo, '.git'), { recursive: true })
    mkdirSync(app, { recursive: true })

    assert.equal(packageManagerOf(app), 'npm')

    writeFileSync(join(repo, 'bun.lock'), '')

    assert.equal(packageManagerOf(app), 'bun')
  })
})

describe('cliProblemOf', () => {
  const install = installCommandOf('pnpm')

  it('names the install command when the CLI is missing', () => {
    assert.equal(
      cliProblemOf(undefined, install, '/work/app'),
      "visual-check/action runs the project's own @visual-check/cli, and none is installed from /work/app. " +
        "Add it with `pnpm add --save-dev @visual-check/cli`, and install the project's dependencies before this step.",
    )
  })

  it('names the version and the install command when the CLI is out of range', () => {
    const cli = { folder: '/work/node_modules/@visual-check/cli', version: '2.0.0', bin: '/x' }

    assert.equal(
      cliProblemOf(cli, install, '/work'),
      'visual-check/action@v1 runs @visual-check/cli 0.x and 1.x, but /work/node_modules/@visual-check/cli has 2.0.0. ' +
        'Install a version it runs with `pnpm add --save-dev @visual-check/cli@1`, or use the Action major for your CLI.',
    )
  })

  it('gives nothing for a supported CLI', () => {
    assert.equal(cliProblemOf({ folder: '/f', version: '0.2.0', bin: '/b' }, install, '/w'), undefined)
  })
})
