/**
 * Gives the link to this run attempt's summary page, where the CLI's step summary shows, from GitHub's variables.
 *
 * @param {Record<string, string | undefined>} environment
 * @returns {string}
 */
export function runSummaryUrlOf(environment) {
  const server = environment.GITHUB_SERVER_URL ?? 'https://github.com'
  const attempt = environment.GITHUB_RUN_ATTEMPT ?? '1'

  return `${server}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}/attempts/${attempt}`
}

/**
 * Gives the Markdown the Action appends to the step summary: the report artifact's link. It stays well under the
 * 1 KiB the CLI leaves free in the summary for it.
 *
 * @param {string} artifactName
 * @param {string} artifactUrl
 * @returns {string}
 */
export function summaryLinkOf(artifactName, artifactUrl) {
  return `\n\n**Report:** [${artifactName}](${artifactUrl}) (zipped \`report.json\` and images)\n`
}

/**
 * Gives the lines the Action ends the job log with, which is where a failed check's Details opens: the run summary's
 * link, then the report artifact's when one was uploaded.
 *
 * @param {object} options
 * @param {string} options.runSummaryUrl
 * @param {string} [options.artifactName]
 * @param {string} [options.artifactUrl]
 * @returns {string[]}
 */
export function logLinesOf({ runSummaryUrl, artifactName, artifactUrl }) {
  return [
    `Summary: ${runSummaryUrl}`,
    ...(artifactUrl ? [`Report: ${artifactUrl}${artifactName ? ` (artifact ${artifactName})` : ''}`] : []),
  ]
}
