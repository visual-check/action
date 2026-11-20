import { spawnSync } from 'node:child_process'

/**
 * How many commits deep a shallow clone first fetches the base branch.
 */
const firstDepth = 50

/**
 * How many commits each later fetch adds to the base's and `HEAD`'s shallow history, in turn, before the history is
 * fetched whole.
 */
const deepenSteps = [50, 100, 200, 400, 800, 1600]

/**
 * Runs git in `cwd` and gives whether it succeeded, with its output. It never throws for git's own failures.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })

  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
}

/**
 * The result of fetching the base's history.
 *
 * @typedef {object} FetchResult
 * @property {boolean} resolved Whether the merge base of `HEAD` and the base resolves.
 * @property {number} fetches How many fetches it took.
 * @property {string} [problem] Why it doesn't resolve, for the log.
 */

/**
 * Fetches the base branch and deepens the history until the merge base of `HEAD` and `origin/<base>` resolves, which
 * is what the CLI's `--affected` measures changes from. The CLI never fetches. A full clone needs at most the base
 * branch. A shallow one, as `actions/checkout` makes by default, fetches the base to a depth, then deepens the base and
 * `HEAD` further on each fetch, then fetches them whole; a pull request's merge commit needs two fetches. A fetch that fails stops it, with git's reason, so the CLI
 * decides what to cover.
 *
 * @param {object} options
 * @param {string} options.cwd A folder in the repository.
 * @param {string} options.baseRef The base branch, `GITHUB_BASE_REF`.
 * @param {(line: string) => void} [options.log] Where progress lines go.
 * @returns {FetchResult}
 */
export function fetchUntilMergeBase({ cwd, baseRef, log = () => undefined }) {
  const remoteRef = `refs/remotes/origin/${baseRef}`
  const refspec = `+refs/heads/${baseRef}:${remoteRef}`
  const head = git(cwd, ['rev-parse', 'HEAD'])
  let fetches = 0

  if (!head.ok) {
    return { resolved: false, fetches, problem: `git couldn't read HEAD: ${head.stderr}` }
  }

  const resolves = () => git(cwd, ['merge-base', 'HEAD', remoteRef]).ok
  const isShallow = () => git(cwd, ['rev-parse', '--is-shallow-repository']).stdout === 'true'
  const hasBase = () => git(cwd, ['rev-parse', '--verify', '--quiet', remoteRef]).ok
  const fetch = (/** @type {string[]} */ extra, /** @type {string[]} */ wants) => {
    fetches += 1
    log(`visual-check: fetching origin/${baseRef} (${extra.join(' ') || 'full history'})`)

    return git(cwd, ['fetch', '--no-tags', '--no-recurse-submodules', ...extra, 'origin', ...wants])
  }

  if (resolves()) {
    return { resolved: true, fetches }
  }

  // `--depth` sets a new ref's depth, but leaves a commit the clone already has, such as `HEAD`, as it is; `--deepen`
  // deepens both from where they stop, but fetches a new ref whole. So a shallow clone without the base fetches it to
  // a depth first, then deepens both.
  const steps = isShallow()
    ? [
        ...(hasBase() ? [] : [{ extra: [`--depth=${firstDepth}`], wants: [refspec] }]),
        ...deepenSteps.map((step) => ({ extra: [`--deepen=${step}`], wants: [refspec, head.stdout] })),
        { extra: ['--unshallow'], wants: [refspec, head.stdout] },
      ]
    : [{ extra: [], wants: [refspec] }]

  for (const { extra, wants } of steps) {
    const result = fetch(extra, wants)

    if (!result.ok) {
      return { resolved: false, fetches, problem: `git fetch failed: ${result.stderr}` }
    }

    if (resolves()) {
      return { resolved: true, fetches }
    }

    if (!isShallow()) {
      break
    }
  }

  return { resolved: false, fetches, problem: `HEAD and origin/${baseRef} share no history` }
}
