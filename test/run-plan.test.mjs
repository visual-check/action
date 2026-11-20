import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { artifactNameOf, isPullRequestEvent, runPlanOf } from '../src/run-plan.mjs'

/**
 * The inputs of a run with nothing set, on a push.
 */
const none = { affected: false, consistency: false, extraArgs: [], eventName: 'push' }

describe('artifactNameOf', () => {
  it('names the report, its Storybook and its shard', () => {
    assert.equal(artifactNameOf({ consistency: false }), 'visual-check-report')
    assert.equal(artifactNameOf({ consistency: false, storybook: 'web' }), 'visual-check-report-web')
    assert.equal(artifactNameOf({ consistency: false, shard: { index: 2, total: 4 } }), 'visual-check-report-2-of-4')
    assert.equal(
      artifactNameOf({ consistency: false, storybook: 'web', shard: { index: 2, total: 4 } }),
      'visual-check-report-web-2-of-4',
    )
  })

  it('names the consistency check and its Storybook', () => {
    assert.equal(artifactNameOf({ consistency: true }), 'visual-check-consistency')
    assert.equal(artifactNameOf({ consistency: true, storybook: 'web' }), 'visual-check-consistency-web')
  })
})

describe('isPullRequestEvent', () => {
  it('is true for pull request events only', () => {
    assert.equal(isPullRequestEvent('pull_request'), true)
    assert.equal(isPullRequestEvent('pull_request_target'), true)
    assert.equal(isPullRequestEvent('push'), false)
    assert.equal(isPullRequestEvent('merge_group'), false)
    assert.equal(isPullRequestEvent(''), false)
  })
})

describe('runPlanOf', () => {
  it('runs test with no flags by default', () => {
    assert.deepEqual(runPlanOf(none), { args: ['test'], artifactName: 'visual-check-report', affected: false })
  })

  it('passes the four flags, then the extra arguments', () => {
    const plan = runPlanOf({
      ...none,
      eventName: 'pull_request',
      affected: true,
      storybook: 'web',
      shard: { index: 1, total: 3 },
      extraArgs: ['--workers', '2'],
    })

    assert.deepEqual(plan.args, ['test', '--storybook', 'web', '--shard', '1/3', '--affected', '--workers', '2'])
    assert.equal(plan.artifactName, 'visual-check-report-web-1-of-3')
    assert.equal(plan.affected, true)
    assert.equal(plan.note, undefined)
  })

  it('passes --consistency', () => {
    const plan = runPlanOf({ ...none, consistency: true, storybook: 'web' })

    assert.deepEqual(plan.args, ['test', '--storybook', 'web', '--consistency'])
    assert.equal(plan.artifactName, 'visual-check-consistency-web')
  })

  it('ignores affected outside pull requests, with a note', () => {
    const plan = runPlanOf({ ...none, affected: true })

    assert.deepEqual(plan.args, ['test'])
    assert.equal(plan.affected, false)
    assert.equal(
      plan.note,
      'visual-check: the affected input applies on pull requests only, so this push event covers every story.',
    )
  })
})
