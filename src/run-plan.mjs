/**
 * The events the `affected` input applies on: those with a base branch, which `GITHUB_BASE_REF` names.
 */
const pullRequestEvents = ['pull_request', 'pull_request_target']

/**
 * What one run of the Action does, worked out from its inputs and event.
 *
 * @typedef {object} RunPlan
 * @property {string[]} args The CLI's arguments, `test` first.
 * @property {string} artifactName The name the report's artifact takes.
 * @property {boolean} affected Whether the run passes `--affected`, so the base's history has to be fetched.
 * @property {string} [note] A line for the log, when the Action ignores an input.
 */

/**
 * The inputs a run plan reads, already parsed.
 *
 * @typedef {object} PlanInputs
 * @property {boolean} affected Whether `affected` is on.
 * @property {boolean} consistency Whether `consistency` is on.
 * @property {string[]} extraArgs The `args` input, split.
 * @property {string} eventName The event that started the workflow, `GITHUB_EVENT_NAME`.
 * @property {string} [storybook] The `storybook` input, when given.
 * @property {{ index: number, total: number }} [shard] The `shard` input, when given.
 */

/**
 * Whether the event is a pull request, the only kind the `affected` input applies on.
 *
 * @param {string} eventName The event's name, `GITHUB_EVENT_NAME`.
 * @returns {boolean}
 */
export function isPullRequestEvent(eventName) {
  return pullRequestEvents.includes(eventName)
}

/**
 * Names the report's artifact: `visual-check-report[-<storybook>][-<k>-of-<n>]`, or
 * `visual-check-consistency[-<storybook>]` for the consistency check. The report folder has the same name on every
 * shard and Storybook, so the name tells them apart.
 *
 * @param {{ consistency: boolean, storybook?: string, shard?: { index: number, total: number } }} options
 * @returns {string}
 */
export function artifactNameOf({ consistency, storybook, shard }) {
  const parts = [consistency ? 'visual-check-consistency' : 'visual-check-report']

  if (storybook) {
    parts.push(storybook)
  }

  if (shard && !consistency) {
    parts.push(`${shard.index}-of-${shard.total}`)
  }

  return parts.join('-')
}

/**
 * Works out the run: the CLI's arguments, the artifact's name, and whether `--affected` applies. `affected` applies on
 * pull requests only, since elsewhere the base is the branch itself; on other events it's left out with a note. The
 * Action passes only `--storybook`, `--shard`, `--affected` and `--consistency`, then the `args` input as given.
 *
 * @param {PlanInputs} inputs
 * @returns {RunPlan}
 */
export function runPlanOf({ affected, consistency, extraArgs, eventName, storybook, shard }) {
  const affectedApplies = affected && isPullRequestEvent(eventName)
  const args = [
    'test',
    ...(storybook ? ['--storybook', storybook] : []),
    ...(shard ? ['--shard', `${shard.index}/${shard.total}`] : []),
    ...(affectedApplies ? ['--affected'] : []),
    ...(consistency ? ['--consistency'] : []),
    ...extraArgs,
  ]
  const note =
    affected && !affectedApplies
      ? `visual-check: the affected input applies on pull requests only, so this ${eventName || 'run'} event covers every story.`
      : undefined

  return {
    args,
    artifactName: artifactNameOf({ consistency, storybook, shard }),
    affected: affectedApplies,
    ...(note ? { note } : {}),
  }
}
