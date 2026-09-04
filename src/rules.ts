import { tokenize, type Token } from './scanner.js'

const BEL = 0x07

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

// Pulls the URI out of an OSC 8 hyperlink sequence's raw text, if that's
// what the sequence is. Returns null for any other OSC sequence. The scanner
// already validated that `raw` reaches a BEL or ST terminator, so this only
// has to strip that terminator and split the body on ';'.
function parseHyperlinkUri(raw: string): string | null {
  const body = raw.charCodeAt(raw.length - 1) === BEL ? raw.slice(2, -1) : raw.slice(2, -2)
  if (!body.startsWith('8;')) return null
  const params = body.slice(2)
  const sep = params.indexOf(';')
  if (sep === -1) return null
  return params.slice(sep + 1)
}

const noUnpairedHyperlink: Rule = {
  id: 'no-unpaired-hyperlink',
  check(tokens) {
    const findings: Finding[] = []
    let openToken: Token | null = null

    for (const t of tokens) {
      if (t.kind !== 'osc') continue
      const uri = parseHyperlinkUri(t.raw)
      if (uri === null) continue

      if (uri === '') {
        if (!openToken) {
          findings.push({
            line: t.line,
            col: t.col,
            ruleId: noUnpairedHyperlink.id,
            message: 'OSC 8 hyperlink close has no matching open',
          })
        }
        openToken = null
      } else {
        if (openToken) {
          findings.push({
            line: openToken.line,
            col: openToken.col,
            ruleId: noUnpairedHyperlink.id,
            message: 'OSC 8 hyperlink is opened again before the previous one was closed',
          })
        }
        openToken = t
      }
    }

    if (openToken) {
      findings.push({
        line: openToken.line,
        col: openToken.col,
        ruleId: noUnpairedHyperlink.id,
        message: 'OSC 8 hyperlink is never closed',
      })
    }

    return findings
  },
}

export const rules: Rule[] = [noUnterminatedEscape, noBareEsc, noRawControlChars, noUnpairedHyperlink]

export function lint(source: string): Finding[] {
  const tokens = tokenize(source)
  const findings = rules.flatMap((rule) => rule.check(tokens))
  findings.sort((a, b) => a.line - b.line || a.col - b.col)
  return findings
}
