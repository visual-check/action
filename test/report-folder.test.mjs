import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { configArgOf, reportFolderOf } from '../src/report-folder.mjs'

/**
 * Makes a repository folder, holding `.git`, inside a temporary folder that holds a config of its own, which the
 * search must not reach.
 */
function repoFolder() {
  const outer = realpathSync(mkdtempSync(join(tmpdir(), 'visual-check-action-')))
  const repo = join(outer, 'repo')

  writeFileSync(join(outer, 'visual-check.config.ts'), '')
  mkdirSync(join(repo, '.git'), { recursive: true })

  return repo
}

describe('configArgOf', () => {
  it('reads --config <path> and --config=<path>, the last winning', () => {
    assert.equal(configArgOf(['--config', 'a.ts']), 'a.ts')
    assert.equal(configArgOf(['--config=a.ts', '--config', 'b.ts']), 'b.ts')
    assert.equal(configArgOf(['--workers', '2']), undefined)
    assert.equal(configArgOf(['--config']), undefined)
  })
})

describe('reportFolderOf', () => {
  it('is beside the nearest config, searching up from the working directory', () => {
    const repo = repoFolder()
    const app = join(repo, 'apps', 'web', 'src')

    mkdirSync(app, { recursive: true })
    writeFileSync(join(repo, 'apps', 'web', 'visual-check.config.mts'), '')

    assert.equal(reportFolderOf(app, ['test']), join(repo, 'apps', 'web', '.visual-check', 'report'))
  })

  it("stops at the repository's root", () => {
    const repo = repoFolder()

    assert.equal(reportFolderOf(repo, ['test']), undefined)
  })

  it('follows --config', () => {
    const repo = repoFolder()

    mkdirSync(join(repo, 'tools'))
    writeFileSync(join(repo, 'tools', 'visual.config.ts'), '')
    writeFileSync(join(repo, 'visual-check.config.ts'), '')

    assert.equal(
      reportFolderOf(repo, ['test', '--config', 'tools/visual.config.ts']),
      join(repo, 'tools', '.visual-check', 'report'),
    )
    assert.equal(reportFolderOf(repo, ['test', '--config=missing.ts']), undefined)
  })
})
