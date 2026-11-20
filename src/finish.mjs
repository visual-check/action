import { appendFileSync } from 'node:fs'
import { logLinesOf, runSummaryUrlOf, summaryLinkOf } from './links.mjs'

/**
 * The Action's last step, after the report's upload. On a failed run, it appends the artifact's link to the step
 * summary and ends the job log with the run summary's link and the artifact's. It exits with the CLI's code.
 */
function main() {
  const environment = process.env
  const exitCode = Number(environment.VISUAL_CHECK_EXIT_CODE)
  const artifactName = environment.VISUAL_CHECK_ARTIFACT_NAME || undefined
  const artifactUrl = environment.VISUAL_CHECK_ARTIFACT_URL || undefined

  if (exitCode === 0) {
    return 0
  }

  if (artifactUrl && artifactName && environment.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(environment.GITHUB_STEP_SUMMARY, summaryLinkOf(artifactName, artifactUrl))
    } catch (error) {
      console.log(`visual-check/action couldn't add the report's link to the step summary: ${error}`)
    }
  }

  for (const line of logLinesOf({ runSummaryUrl: runSummaryUrlOf(environment), artifactName, artifactUrl })) {
    console.log(line)
  }

  return Number.isInteger(exitCode) && exitCode > 0 ? exitCode : 1
}

process.exitCode = main()
