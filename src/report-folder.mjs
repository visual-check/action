import { existsSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'

/**
 * The names a config file takes, in the order the CLI's search tries them in each folder.
 */
const configFileNames = [
  'visual-check.config.ts',
  'visual-check.config.mts',
  'visual-check.config.js',
  'visual-check.config.mjs',
]

/**
 * Whether a path is a file. A folder or a missing path isn't.
 *
 * @param {string} path
 * @returns {boolean}
 */
function isFile(path) {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
  } catch {
    return false
  }
}

/**
 * Returns `folder` and its parents, nearest first, stopping after the folder that holds `.git` or at the filesystem
 * root, as the CLI's config search does.
 *
 * @param {string} folder An absolute folder.
 * @returns {string[]}
 */
function foldersUpToRepo(folder) {
  const parent = dirname(folder)

  if (parent === folder || existsSync(join(folder, '.git'))) {
    return [folder]
  }

  return [folder, ...foldersUpToRepo(parent)]
}

/**
 * Gives the `--config` path in the arguments, from `--config <path>` or `--config=<path>`, the last one winning as
 * it does for the CLI. It gives `undefined` when there's none.
 *
 * @param {string[]} args The CLI's arguments.
 * @returns {string | undefined}
 */
export function configArgOf(args) {
  let given

  args.forEach((arg, index) => {
    if (arg === '--config' && index + 1 < args.length) {
      given = args[index + 1]
    } else if (arg.startsWith('--config=')) {
      given = arg.slice('--config='.length)
    }
  })

  return given
}

/**
 * Gives the absolute path of the config the CLI loads from `cwd`: the `--config` path when the arguments give one and
 * it's a config file, else the first config file in `cwd` or a parent up to the repository's root. It gives
 * `undefined` when there's none.
 *
 * @param {string} cwd An absolute folder.
 * @param {string[]} args The CLI's arguments.
 * @returns {string | undefined}
 */
export function locateConfig(cwd, args) {
  const given = configArgOf(args)

  if (given !== undefined) {
    const path = resolve(cwd, given)
    const hasConfigExtension = configFileNames.some((name) => extname(name) === extname(path))

    return hasConfigExtension && isFile(path) ? path : undefined
  }

  return foldersUpToRepo(cwd)
    .flatMap((folder) => configFileNames.map((name) => join(folder, name)))
    .find((path) => isFile(path))
}

/**
 * Gives the report folder the CLI writes for a run from `cwd`: `.visual-check/report` beside the config file. It gives
 * `undefined` when there's no config, so no report.
 *
 * @param {string} cwd An absolute folder.
 * @param {string[]} args The CLI's arguments.
 * @returns {string | undefined}
 */
export function reportFolderOf(cwd, args) {
  const config = locateConfig(cwd, args)

  return config === undefined ? undefined : join(dirname(config), '.visual-check', 'report')
}
