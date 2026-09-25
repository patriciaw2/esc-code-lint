import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize } from './scanner.js'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

test('plain text produces no tokens', () => {
  assert.deepEqual(tokenize('hello world\n'), [])
})

test('recognizes a complete CSI sequence and its position', () => {
  const source = `hi ${ESC}[38;5;196mred`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'csi')
  assert.equal(tokens[0].raw, `${ESC}[38;5;196m`)
  assert.equal(tokens[0].line, 1)
  assert.equal(tokens[0].col, 4)
})

test('flags a CSI sequence that never reaches a final byte', () => {
  const source = `${ESC}[38;5;`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'unterminated-csi')
  assert.equal(tokens[0].raw, source)
})

test('a CSI sequence broken by a newline is unterminated, not merged across lines', () => {
  const source = `${ESC}[38;5\nnext line`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'unterminated-csi')
  assert.equal(tokens[0].raw, `${ESC}[38;5`)
})

test('OSC sequence terminated by BEL', () => {
  const source = `${ESC}]0;title${BEL}after`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'osc')
  assert.equal(tokens[0].raw, `${ESC}]0;title${BEL}`)
})

test('OSC sequence terminated by ST (ESC backslash)', () => {
  const source = `${ESC}]0;title${ESC}\\after`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'osc')
  assert.equal(tokens[0].raw, `${ESC}]0;title${ESC}\\`)
})

test('OSC sequence cut off by a newline is unterminated', () => {
  const source = `${ESC}]0;title\nnext`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'unterminated-osc')
  assert.equal(tokens[0].raw, `${ESC}]0;title`)
})

test('DCS sequence ignores BEL and only closes on ST', () => {
  const source = `${ESC}Psome${BEL}data${ESC}\\after`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'dcs')
  assert.equal(tokens[0].raw, `${ESC}Psome${BEL}data${ESC}\\`)
})

test('DCS sequence cut off by a newline is unterminated', () => {
  const source = `${ESC}Psome data\nnext`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'unterminated-dcs')
  assert.equal(tokens[0].raw, `${ESC}Psome data`)
})

test('simple escape with no intermediate bytes', () => {
  const source = `${ESC}7rest`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'esc-simple')
  assert.equal(tokens[0].raw, `${ESC}7`)
})

test('simple escape with an intermediate byte', () => {
  const source = `${ESC}(Brest`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'esc-simple')
  assert.equal(tokens[0].raw, `${ESC}(B`)
})

test('ESC followed by a byte that is not a valid final is a bare escape', () => {
  const source = `${ESC}\x01rest`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 2)
  assert.equal(tokens[0].kind, 'bare-esc')
  assert.equal(tokens[0].raw, ESC)
  assert.equal(tokens[1].kind, 'control')
})

test('ESC at end of input with nothing following is a bare escape', () => {
  const tokens = tokenize(`text${ESC}`)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'bare-esc')
  assert.equal(tokens[0].raw, ESC)
})

test('raw control bytes outside escapes are flagged, tab/newline/CR are not', () => {
  const source = 'a\tb\rc\nd\x01e'
  const tokens = tokenize(source)
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].kind, 'control')
  assert.equal(tokens[0].raw, '\x01')
})

test('line and column tracking survives multiple lines and multiple tokens', () => {
  const source = `first\n${ESC}[1msecond\nthird ${ESC}[0m`
  const tokens = tokenize(source)
  assert.equal(tokens.length, 2)
  assert.equal(tokens[0].line, 2)
  assert.equal(tokens[0].col, 1)
  assert.equal(tokens[1].line, 3)
  assert.equal(tokens[1].col, 7)
})
