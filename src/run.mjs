import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { constants } from 'node:os'
import { resolve } from 'node:path'
import { cliProblemOf, findCli, installCommandOf, packageManagerOf } from './cli.mjs'
import { booleanInput, InputError, shardInput, splitArgs } from './inputs.mjs'
import { fetchUntilMergeBase } from './merge-base.mjs'
import { reportFolderOf } from './report-folder.mjs'
import { runPlanOf } from './run-plan.mjs'
import { setOutput } from './step-output.mjs'

/**
 * The Action's first step. It checks the inputs and the installed CLI, fetches the base's history when `affected`
 * applies, and runs the CLI in the working directory. It records the CLI's exit code, the report folder and whether to
 * upload it as step outputs, and exits 0 once the CLI has run, so the upload and the last step run; those exit with the
 * CLI's code. It exits 1 before running the CLI when an input or the CLI is wrong.
 */
function main() {
  const environment = process.env
  const cwd = resolve(environment.INPUT_WORKING_DIRECTORY || '.')

  let plan

  try {
    plan = runPlanOf({
      affected: booleanInput('affected', environment.INPUT_AFFECTED),
      consistency: booleanInput('consistency', environment.INPUT_CONSISTENCY),
      extraArgs: splitArgs(environment.INPUT_ARGS),
      eventName: environment.GITHUB_EVENT_NAME ?? '',
      storybook: environment.INPUT_STORYBOOK?.trim() || undefined,
      shard: shardInput(environment.INPUT_SHARD),
    })
  } catch (error) {
    if (error instanceof InputError) {
      console.error(error.message)

      return 1
    }

    throw error
  }

  if (!existsSync(cwd)) {
    console.error(`The working-directory input names ${cwd}, which doesn't exist.`)

    return 1
  }

  const cli = findCli(cwd)
  const problem = cliProblemOf(cli, installCommandOf(packageManagerOf(cwd)), cwd)

  if (problem !== undefined || cli === undefined) {
    console.error(problem)

    return 1
  }

  if (plan.note) {
    console.log(plan.note)
  }

  if (plan.affected) {
    const baseRef = environment.GITHUB_BASE_REF ?? ''
    const fetched = fetchUntilMergeBase({ cwd, baseRef, log: (line) => console.log(line) })

    if (!fetched.resolved) {
      console.log(`visual-check: the merge base with origin/${baseRef} doesn't resolve: ${fetched.problem}`)
    }
  }

  console.log(`visual-check: running ${cli.folder} ${cli.version}: visual-check ${plan.args.join(' ')}`)

  const result = spawnSync(process.execPath, [cli.bin, ...plan.args], { cwd, stdio: 'inherit' })

  if (result.error) {
    console.error(`visual-check/action couldn't start ${cli.bin}: ${result.error.message}`)

    return 1
  }

  const exitCode = result.status ?? 128 + (constants.signals[result.signal ?? 'SIGTERM'] ?? 15)
  const reportFolder = reportFolderOf(cwd, plan.args)
  const hasReport = reportFolder !== undefined && existsSync(reportFolder)

  setOutput(environment, 'exit-code', String(exitCode))
  setOutput(environment, 'artifact-name', plan.artifactName)
  setOutput(environment, 'report-dir', hasReport ? reportFolder : '')
  setOutput(environment, 'upload', String(hasReport && (exitCode === 1 || exitCode === 2)))

  return 0
}

process.exitCode = main()
