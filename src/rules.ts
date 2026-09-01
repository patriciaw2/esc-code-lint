import { tokenize, type Token } from './scanner.js'

export interface Finding {
  line: number
  col: number
  ruleId: string
  message: string
}

export interface Rule {
  id: string
  check(tokens: Token[]): Finding[]
}

const unterminatedMessages: Partial<Record<Token['kind'], string>> = {
  'unterminated-csi': 'CSI sequence never reaches a final byte (0x40-0x7E)',
  'unterminated-osc': 'OSC sequence is missing its BEL or ST terminator',
  'unterminated-dcs': 'DCS sequence is missing its ST terminator',
}

const noUnterminatedEscape: Rule = {
  id: 'no-unterminated-escape',
  check(tokens) {
    const findings: Finding[] = []
    for (const t of tokens) {
      const message = unterminatedMessages[t.kind]
      if (message) {
        findings.push({ line: t.line, col: t.col, ruleId: noUnterminatedEscape.id, message })
      }
    }
    return findings
  },
}

const noBareEsc: Rule = {
  id: 'no-bare-esc',
  check(tokens) {
    return tokens
      .filter((t) => t.kind === 'bare-esc')
      .map((t) => ({
        line: t.line,
        col: t.col,
        ruleId: noBareEsc.id,
        message: 'ESC byte is not followed by a recognized sequence',
      }))
  },
}

const noRawControlChars: Rule = {
  id: 'no-raw-control-chars',
  check(tokens) {
    return tokens
      .filter((t) => t.kind === 'control')
      .map((t) => ({
        line: t.line,
        col: t.col,
        ruleId: noRawControlChars.id,
        message: `raw control byte 0x${t.raw.charCodeAt(0).toString(16).padStart(2, '0')} outside any escape sequence`,
      }))
  },
}

export const rules: Rule[] = [noUnterminatedEscape, noBareEsc, noRawControlChars]

export function lint(source: string): Finding[] {
  const tokens = tokenize(source)
  const findings = rules.flatMap((rule) => rule.check(tokens))
  findings.sort((a, b) => a.line - b.line || a.col - b.col)
  return findings
}
