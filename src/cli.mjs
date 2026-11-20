import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * The CLI's package name.
 */
export const cliPackage = '@visual-check/cli'

/**
 * The CLI majors this Action major runs: every `0.x` and `1.x`, up to but not including 2.0.
 */
const supportedMajors = [0, 1]

/**
 * The lockfiles that show a package manager, in the order the CLI's `init` tries them.
 */
const lockfileOwners = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
]

/**
 * The command that adds the CLI as a dev dependency, for each package manager.
 */
const installCommands = {
  npm: `npm install --save-dev ${cliPackage}`,
  pnpm: `pnpm add --save-dev ${cliPackage}`,
  yarn: `yarn add --dev ${cliPackage}`,
  bun: `bun add --dev ${cliPackage}`,
}

/**
 * The installed CLI the Action runs.
 *
 * @typedef {object} InstalledCli
 * @property {string} folder The package's folder.
 * @property {string} version The package's version.
 * @property {string} bin The absolute path of its `visual-check` bin.
 */

/**
 * Returns `folder` and each of its parents, nearest first, up to the filesystem root.
 *
 * @param {string} folder An absolute folder.
 * @returns {string[]}
 */
export function foldersUpToRoot(folder) {
  const parent = dirname(folder)

  return parent === folder ? [folder] : [folder, ...foldersUpToRoot(parent)]
}

/**
 * Finds the CLI the project installed, as Node resolves a package from `cwd`: the nearest
 * `node_modules/@visual-check/cli` in `cwd` or a parent. It gives `undefined` when none is installed.
 *
 * @param {string} cwd An absolute folder.
 * @returns {InstalledCli | undefined}
 * @throws {Error} When the package's manifest can't be read or names no `visual-check` bin.
 */
export function findCli(cwd) {
  const folder = foldersUpToRoot(cwd)
    .map((each) => join(each, 'node_modules', ...cliPackage.split('/')))
    .find((each) => existsSync(join(each, 'package.json')))

  if (folder === undefined) {
    return undefined
  }

  const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['visual-check']

  if (typeof bin !== 'string') {
    throw new Error(`${join(folder, 'package.json')} names no visual-check bin.`)
  }

  return { folder, version: String(manifest.version), bin: resolve(folder, bin) }
}

/**
 * Whether this Action runs the CLI version: a version whose major is 0 or 1, prereleases of those included.
 *
 * @param {string} version The CLI's version, such as `0.4.1`.
 * @returns {boolean}
 */
export function isSupportedVersion(version) {
  const match = /^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(version)

  return match !== null && supportedMajors.includes(Number(match[1]))
}

/**
 * Gives the package manager the first lockfile in `cwd` or a parent shows, else npm. The search stops after the
 * folder that holds `.git`, as the CLI's config search does.
 *
 * @param {string} cwd An absolute folder.
 * @returns {'npm' | 'pnpm' | 'yarn' | 'bun'}
 */
export function packageManagerOf(cwd) {
  for (const folder of foldersUpToRoot(cwd)) {
    const owner = lockfileOwners.find(([name]) => existsSync(join(folder, name)))

    if (owner) {
      return /** @type {'npm' | 'pnpm' | 'yarn' | 'bun'} */ (owner[1])
    }

    if (existsSync(join(folder, '.git'))) {
      break
    }
  }

  return 'npm'
}

/**
 * Gives the command that adds the CLI as a dev dependency with the package manager.
 *
 * @param {'npm' | 'pnpm' | 'yarn' | 'bun'} packageManager
 * @returns {string}
 */
export function installCommandOf(packageManager) {
  return installCommands[packageManager]
}

/**
 * Explains why the Action can't run the CLI it found, or didn't find, and how to install one it can. It gives
 * `undefined` when the CLI is there and supported.
 *
 * @param {InstalledCli | undefined} cli The CLI `findCli` found.
 * @param {string} installCommand The command `installCommandOf` gives.
 * @param {string} cwd The folder the CLI was resolved from, for the message.
 * @returns {string | undefined}
 */
export function cliProblemOf(cli, installCommand, cwd) {
  if (cli === undefined) {
    return (
      `visual-check/action runs the project's own ${cliPackage}, and none is installed from ${cwd}. ` +
      `Add it with \`${installCommand}\`, and install the project's dependencies before this step.`
    )
  }

  if (!isSupportedVersion(cli.version)) {
    return (
      `visual-check/action@v1 runs ${cliPackage} 0.x and 1.x, but ${cli.folder} has ${cli.version}. ` +
      `Install a version it runs with \`${installCommand}@1\`, or use the Action major for your CLI.`
    )
  }

  return undefined
}
