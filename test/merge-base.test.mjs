import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { fetchUntilMergeBase } from '../src/merge-base.mjs'

/**
 * Runs git in `cwd`, with a fixed identity, and gives its trimmed output.
 *
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/**
 * Commits a file, then `count` empty commits after it.
 *
 * @param {string} repo
 * @param {string} name
 * @param {number} count
 */
function commit(repo, name, count) {
  writeFileSync(join(repo, name), `${name}\n`)
  git(repo, ['add', name])
  git(repo, ['commit', '-q', '-m', name])
  execFileSync('sh', ['-c', `for i in $(seq ${count}); do git commit -q --allow-empty -m "${name} $i"; done`], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  })
}

/**
 * Makes an origin with `main` and a `feature` branch off it, each 60 commits past their merge base, which has 150
 * commits before it, and a pull request merge ref as GitHub keeps one, `refs/pull/1/merge`.
 */
function origin() {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'visual-check-origin-')))

  git(folder, ['init', '-q'])
  commit(folder, 'base.txt', 150)
  git(folder, ['checkout', '-q', '-b', 'feature'])
  commit(folder, 'feature.txt', 59)
  git(folder, ['checkout', '-q', 'main'])
  commit(folder, 'main.txt', 59)
  git(folder, ['checkout', '-q', '--detach', 'main'])
  git(folder, ['merge', '-q', '--no-ff', '-m', 'merge', 'feature'])
  git(folder, ['update-ref', 'refs/pull/1/merge', 'HEAD'])
  git(folder, ['checkout', '-q', 'main'])
  // GitHub serves any reachable commit, which a fetch by SHA needs.
  git(folder, ['config', 'uploadpack.allowReachableSHA1InWant', 'true'])

  return folder
}

/**
 * Clones `ref` of the origin as `actions/checkout` does by default: one commit deep, no branches, detached.
 *
 * @param {string} originFolder
 * @param {string} ref
 * @param {number | undefined} depth
 */
function checkout(originFolder, ref, depth = 1) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'visual-check-clone-')))

  git(folder, ['init', '-q'])
  git(folder, ['remote', 'add', 'origin', pathToFileURL(originFolder).href])
  git(folder, ['fetch', '-q', '--no-tags', ...(depth ? [`--depth=${depth}`] : []), 'origin', ref])
  git(folder, ['checkout', '-q', '--detach', 'FETCH_HEAD'])

  return folder
}

describe('fetchUntilMergeBase', () => {
  const originFolder = origin()

  it("resolves a pull request's merge commit in two fetches", () => {
    const clone = checkout(originFolder, 'refs/pull/1/merge')
    const result = fetchUntilMergeBase({ cwd: clone, baseRef: 'main' })

    assert.deepEqual(result, { resolved: true, fetches: 2 })
    assert.equal(git(clone, ['merge-base', 'HEAD', 'origin/main']), git(originFolder, ['rev-parse', 'main']))
  })

  it("deepens a branch head's history until the merge base resolves", () => {
    const clone = checkout(originFolder, 'refs/heads/feature')
    const result = fetchUntilMergeBase({ cwd: clone, baseRef: 'main' })

    // The base to 50, then both deepened by 50, which doesn't reach the merge base 60 commits back, then by 100.
    assert.deepEqual(result, { resolved: true, fetches: 3 })
    assert.equal(
      git(clone, ['merge-base', 'HEAD', 'origin/main']),
      git(originFolder, ['merge-base', 'main', 'feature']),
    )
    assert.equal(git(clone, ['rev-parse', '--is-shallow-repository']), 'true')
  })

  it('fetches the base branch into a full clone', () => {
    const clone = checkout(originFolder, 'refs/heads/feature', 0)

    assert.deepEqual(fetchUntilMergeBase({ cwd: clone, baseRef: 'main' }), { resolved: true, fetches: 1 })
  })

  it('fetches nothing when the merge base already resolves', () => {
    const clone = checkout(originFolder, 'refs/heads/feature', 0)

    git(clone, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main'])

    assert.deepEqual(fetchUntilMergeBase({ cwd: clone, baseRef: 'main' }), { resolved: true, fetches: 0 })
  })

  it("gives git's reason when the base doesn't exist", () => {
    const clone = checkout(originFolder, 'refs/heads/feature')
    const result = fetchUntilMergeBase({ cwd: clone, baseRef: 'missing' })

    assert.equal(result.resolved, false)
    assert.match(result.problem ?? '', /^git fetch failed: /)
  })
})
