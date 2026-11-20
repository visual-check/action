/**
 * An input the Action can't use, such as a `shard` that isn't `k/n`. The Action fails with its message before the CLI
 * runs.
 */
export class InputError extends Error {
  /**
   * The class's name, so a log line reads `InputError`.
   */
  name = 'InputError'
}

/**
 * Reads a boolean input: `true` or `false` in any case, and an empty value as `false`.
 *
 * @param {string} name The input's name, for the error.
 * @param {string | undefined} value The input's value.
 * @returns {boolean}
 * @throws {InputError} For any other value.
 */
export function booleanInput(name, value) {
  const text = (value ?? '').trim().toLowerCase()

  if (text === '' || text === 'false') {
    return false
  }

  if (text === 'true') {
    return true
  }

  throw new InputError(`The ${name} input takes true or false. Got '${value}'.`)
}

/**
 * Reads the `shard` input: `k/n`, two whole numbers written in digits, with 1 ≤ k ≤ n. An empty value gives no shard.
 *
 * @param {string | undefined} value The input's value.
 * @returns {{ index: number, total: number } | undefined}
 * @throws {InputError} For any other value.
 */
export function shardInput(value) {
  const text = (value ?? '').trim()

  if (text === '') {
    return undefined
  }

  const match = /^(\d+)\/(\d+)$/.exec(text)
  const index = match ? Number(match[1]) : 0
  const total = match ? Number(match[2]) : 0

  if (!match || index < 1 || index > total) {
    throw new InputError(`The shard input takes k/n, two whole numbers with 1 ≤ k ≤ n, such as 2/4. Got '${value}'.`)
  }

  return { index, total }
}

/**
 * Splits the `args` input into arguments as a POSIX shell would, without running one: whitespace separates them,
 * single quotes keep everything up to the next single quote, double quotes keep everything but `\"` and `\\`, which
 * they unescape, and a backslash outside quotes keeps the next character. Nothing is expanded.
 *
 * @param {string | undefined} value The input's value.
 * @returns {string[]}
 * @throws {InputError} For a quote that isn't closed, or a backslash at the end.
 */
export function splitArgs(value) {
  const text = value ?? ''
  /** @type {string[]} */
  const args = []
  let current = ''
  let started = false
  let index = 0

  while (index < text.length) {
    const char = text[index]

    if (/\s/.test(char)) {
      if (started) {
        args.push(current)
        current = ''
        started = false
      }

      index += 1
    } else if (char === "'") {
      const end = text.indexOf("'", index + 1)

      if (end === -1) {
        throw new InputError(`The args input has a ' that isn't closed: ${text}`)
      }

      current += text.slice(index + 1, end)
      started = true
      index = end + 1
    } else if (char === '"') {
      index += 1

      while (index < text.length && text[index] !== '"') {
        if (text[index] === '\\' && (text[index + 1] === '"' || text[index + 1] === '\\')) {
          index += 1
        }

        current += text[index]
        index += 1
      }

      if (index >= text.length) {
        throw new InputError(`The args input has a " that isn't closed: ${text}`)
      }

      started = true
      index += 1
    } else if (char === '\\') {
      if (index + 1 >= text.length) {
        throw new InputError(`The args input ends with a \\: ${text}`)
      }

      current += text[index + 1]
      started = true
      index += 2
    } else {
      current += char
      started = true
      index += 1
    }
  }

  if (started) {
    args.push(current)
  }

  return args
}
