import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

/**
 * Sets a step output, in the file `GITHUB_OUTPUT` names, using a delimiter so any value is safe.
 *
 * @param {Record<string, string | undefined>} environment
 * @param {string} name
 * @param {string} value
 */
export function setOutput(environment, name, value) {
  const path = environment.GITHUB_OUTPUT

  if (!path) {
    return
  }

  const delimiter = `visual-check-${randomUUID()}`

  appendFileSync(path, `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
}
