# visual-check Action

Runs your project's [visual-check](https://github.com/visual-check/visual-check) CLI in GitHub Actions. When snapshots differ from their baselines, or the run stops on an error, it uploads the report as an artifact and links it from the step summary and the job log's last lines.

```yaml
jobs:
  visual:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx storybook build
      - run: npx http-server storybook-static -p 6006 -a 127.0.0.1 --silent &
      - run: npx wait-on tcp:127.0.0.1:6006
      - uses: visual-check/action@v1
```

The Action doesn't build or serve Storybook: serve each static build on the port in its config's `url`, then run the Action. The docs use Linux runners.

## Which CLI it runs

The project's own `@visual-check/cli`, resolved from `working-directory`, so your lockfile picks the version. The Action never installs one, and never runs `update`.

`v1` runs every CLI from `0.x` up to, but not including, 2.0. When the CLI is missing or out of that range, the Action fails before running anything and names the install command.

## Inputs

| Input               | Default                  | Does                                                                                                                                                                         |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storybook`         | Every Storybook          | Runs one named Storybook (`--storybook`)                                                                                                                                     |
| `shard`             |                          | This job's share as `k/n`, such as `2/4` (`--shard`). It also names the artifact                                                                                             |
| `affected`          | `false`                  | Covers only the stories the changes can alter (`--affected`), on pull requests only; ignored with a note elsewhere. Fetches the base's history until the merge base resolves |
| `consistency`       | `false`                  | Runs only the consistency check (`--consistency`)                                                                                                                            |
| `working-directory` | `.`                      | Where the CLI runs and the config search starts                                                                                                                              |
| `args`              |                          | Extra CLI arguments, such as `--workers 2`. Split as a shell would, without expanding anything                                                                               |
| `retention-days`    | The repository's setting | How long to keep the report's artifact                                                                                                                                       |

With no selection input, a CI run covers every story.

## Outputs

| Output         | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| `exit-code`    | The CLI's exit code: 0 passed, 1 found differences, 2 stopped |
| `report-dir`   | The report folder's absolute path, when the run left one      |
| `artifact-url` | The report artifact's link, when it was uploaded              |

## When a run fails

On exit 1 or 2, the Action:

1. uploads `.visual-check/report/` (`report.json` and the images) as one artifact, named `visual-check-report[-<storybook>][-<k>-of-<n>]`, or `visual-check-consistency[-<storybook>]` for the consistency check;
2. appends the artifact's link to the step summary the CLI wrote;
3. ends the job log, where a failed check's Details opens, with the run summary's link and the artifact's;
4. exits with the CLI's code.

It needs no permissions beyond `contents: read`, so it works on pull requests from forks. It writes no annotations and caches nothing.

## Sharding

Run the consistency check in a job of its own, and the shards with `fail-fast: false`:

```yaml
jobs:
  consistency:
    runs-on: ubuntu-24.04
    steps:
      # checkout, setup-node, install, build and serve Storybook, as above
      - uses: visual-check/action@v1
        with:
          consistency: true

  visual:
    needs: consistency
    runs-on: ubuntu-24.04
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      # checkout, setup-node, install, build and serve Storybook, as above
      - uses: visual-check/action@v1
        with:
          shard: ${{ matrix.shard }}/${{ strategy.job-total }}
```

## Versions

Releases are immutable `vX.Y.Z` tags, plus a moving `v1` tag. The major goes up only when an input or a behaviour breaks.

## Developing

The Action is a composite `action.yml` with plain Node scripts in `src/`, and no build. `npm test` runs the tests with Node's test runner; CI also runs the Action itself against projects with a fake CLI.

## License

MIT
