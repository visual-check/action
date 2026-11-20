import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { logLinesOf, runSummaryUrlOf, summaryLinkOf } from '../src/links.mjs'

describe('runSummaryUrlOf', () => {
  it("links this attempt's summary", () => {
    const url = runSummaryUrlOf({
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'acme/web',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '2',
    })

    assert.equal(url, 'https://github.com/acme/web/actions/runs/123/attempts/2')
  })
})

describe('summaryLinkOf', () => {
  it("links the artifact by name, under the CLI's 1 KiB", () => {
    const url = 'https://github.com/acme/web/actions/runs/123/artifacts/456'
    const markdown = summaryLinkOf('visual-check-report-web-2-of-4', url)

    assert.match(
      markdown,
      /\[visual-check-report-web-2-of-4\]\(https:\/\/github\.com\/acme\/web\/actions\/runs\/123\/artifacts\/456\)/,
    )
    assert.ok(Buffer.byteLength(markdown) < 1024)
  })
})

describe('logLinesOf', () => {
  it('ends with the summary and the artifact', () => {
    assert.deepEqual(
      logLinesOf({ runSummaryUrl: 'https://s', artifactName: 'visual-check-report', artifactUrl: 'https://a' }),
      ['Summary: https://s', 'Report: https://a (artifact visual-check-report)'],
    )
  })

  it('gives only the summary when nothing was uploaded', () => {
    assert.deepEqual(logLinesOf({ runSummaryUrl: 'https://s', artifactName: 'visual-check-report' }), [
      'Summary: https://s',
    ])
  })
})
