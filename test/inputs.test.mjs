import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { booleanInput, InputError, shardInput, splitArgs } from '../src/inputs.mjs'

describe('booleanInput', () => {
  it('reads true and false in any case, and empty as false', () => {
    assert.equal(booleanInput('affected', 'true'), true)
    assert.equal(booleanInput('affected', 'TRUE'), true)
    assert.equal(booleanInput('affected', 'false'), false)
    assert.equal(booleanInput('affected', ''), false)
    assert.equal(booleanInput('affected', undefined), false)
  })

  it('rejects anything else, naming the input', () => {
    assert.throws(
      () => booleanInput('affected', 'yes'),
      new InputError("The affected input takes true or false. Got 'yes'."),
    )
  })
})

describe('shardInput', () => {
  it('reads k/n', () => {
    assert.deepEqual(shardInput('2/4'), { index: 2, total: 4 })
    assert.deepEqual(shardInput(' 1/1 '), { index: 1, total: 1 })
  })

  it('gives no shard for an empty value', () => {
    assert.equal(shardInput(''), undefined)
    assert.equal(shardInput(undefined), undefined)
  })

  for (const value of ['0/4', '5/4', '2', '2/', 'a/b', '2/4/6', '-1/4', '1.5/4']) {
    it(`rejects ${value}`, () => {
      assert.throws(() => shardInput(value), InputError)
    })
  }
})

describe('splitArgs', () => {
  it('splits on whitespace', () => {
    assert.deepEqual(splitArgs('  --workers 2\t--reporter\nlog '), ['--workers', '2', '--reporter', 'log'])
  })

  it('gives nothing for an empty value', () => {
    assert.deepEqual(splitArgs(''), [])
    assert.deepEqual(splitArgs(undefined), [])
  })

  it('keeps quoted text as one argument', () => {
    assert.deepEqual(splitArgs(`--filter 'button--.* primary' --config "a b/c.ts"`), [
      '--filter',
      'button--.* primary',
      '--config',
      'a b/c.ts',
    ])
  })

  it('joins quoted and bare text with no space between', () => {
    assert.deepEqual(splitArgs(`--filter='a b'c`), ['--filter=a bc'])
  })

  it('keeps an empty quoted argument', () => {
    assert.deepEqual(splitArgs(`a '' b`), ['a', '', 'b'])
  })

  it('unescapes \\" and \\\\ in double quotes only', () => {
    assert.deepEqual(splitArgs(`"say \\"hi\\" \\\\ \\n"`), ['say "hi" \\ \\n'])
    assert.deepEqual(splitArgs(`'\\"'`), ['\\"'])
  })

  it('keeps the character after a backslash outside quotes', () => {
    assert.deepEqual(splitArgs('a\\ b \\$HOME'), ['a b', '$HOME'])
  })

  it('expands nothing', () => {
    assert.deepEqual(splitArgs('$HOME $(id) `id` *'), ['$HOME', '$(id)', '`id`', '*'])
  })

  for (const value of [`'open`, `"open`, 'trailing\\']) {
    it(`rejects ${value}`, () => {
      assert.throws(() => splitArgs(value), InputError)
    })
  }
})
