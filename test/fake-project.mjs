import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The fake CLI's bin. It records its arguments in `cli-args.json`, appends a line to the step summary as the real CLI
 * does, leaves a report folder beside the config unless it passes, and exits with `FAKE_CLI_EXIT`, 0 by default.
 */
const fakeBin = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const exitCode = Number(process.env.FAKE_CLI_EXIT ?? '0')
const project = process.env.FAKE_CLI_PROJECT ?? process.cwd()

writeFileSync(join(project, 'cli-args.json'), JSON.stringify(process.argv.slice(2)))

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## visual-check (fake CLI)\\n\\nexit ' + exitCode)
}

if (exitCode !== 0 && process.env.FAKE_CLI_NO_REPORT !== 'true') {
  const report = join(project, '.visual-check', 'report')

  mkdirSync(join(report, 'images'), { recursive: true })
  writeFileSync(join(report, 'report.json'), JSON.stringify({ version: 1, exitCode }))
}

console.log('fake visual-check exits ' + exitCode)
process.exitCode = exitCode
`

/**
 * Writes a project with a config file and, unless `version` is `null`, a fake `@visual-check/cli` at that version in
 * its `node_modules`.
 *
 * @param {string} folder The project's folder, made when missing.
 * @param {object} [options]
 * @param {string | null} [options.version] The fake CLI's version, `0.1.0` by default; `null` installs none.
 * @param {string} [options.lockfile] A lockfile to write, such as `pnpm-lock.yaml`.
 */
export function writeFakeProject(folder, { version = '0.1.0', lockfile } = {}) {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'fake-project', private: true }))
  writeFileSync(join(folder, 'visual-check.config.mjs'), 'export default {}\n')

  if (lockfile) {
    writeFileSync(join(folder, lockfile), '')
  }

  if (version === null) {
    return
  }

  const cli = join(folder, 'node_modules', '@visual-check', 'cli')

  mkdirSync(join(cli, 'dist'), { recursive: true })
  writeFileSync(
    join(cli, 'package.json'),
    JSON.stringify({ name: '@visual-check/cli', version, type: 'module', bin: { 'visual-check': './dist/bin.js' } }),
  )
  writeFileSync(join(cli, 'dist', 'bin.js'), fakeBin)
}

// Run as a script: `node test/fake-project.mjs <folder> [version|none]`, for the Action's end-to-end workflow.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [folder, version] = process.argv.slice(2)

  writeFakeProject(resolve(folder), { version: version === 'none' ? null : (version ?? '0.1.0') })
}
