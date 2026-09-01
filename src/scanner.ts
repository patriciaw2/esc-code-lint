// Tokenizes a string into runs of plain text and terminal escape sequences,
// tracking line/column so callers can report findings against real source
// positions. This intentionally does not interpret sequence semantics
// (colors, cursor moves, etc) - just whether a sequence is well formed.

export type TokenKind =
  | 'csi'
  | 'osc'
  | 'dcs'
  | 'esc-simple'
  | 'unterminated-csi'
  | 'unterminated-osc'
  | 'unterminated-dcs'
  | 'bare-esc'
  | 'control'

export interface Token {
  kind: TokenKind
  raw: string
  line: number
  col: number
}

const ESC = 0x1b
const BEL = 0x07

// ECMA-48 byte ranges used to recognize CSI/simple escape structure.
function isParamOrIntermediate(code: number): boolean {
  return code >= 0x20 && code <= 0x3f
}
function isCsiFinal(code: number): boolean {
  return code >= 0x40 && code <= 0x7e
}
function isEscIntermediate(code: number): boolean {
  return code >= 0x20 && code <= 0x2f
}
function isEscFinal(code: number): boolean {
  return code >= 0x30 && code <= 0x7e
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let line = 1
  let col = 1
  let i = 0
  const len = source.length

  function step(ch: string): void {
    if (ch === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
  }

  // Advances line/col over source[from..to] and returns that slice.
  function consume(from: number, to: number): string {
    for (let k = from; k <= to; k++) step(source[k])
    return source.slice(from, to + 1)
  }

  while (i < len) {
    const code = source.charCodeAt(i)

    if (code === ESC) {
      const startLine = line
      const startCol = col

      if (source[i + 1] === '[') {
        let j = i + 2
        while (j < len && isParamOrIntermediate(source.charCodeAt(j))) j++
        if (j < len && isCsiFinal(source.charCodeAt(j))) {
          tokens.push({ kind: 'csi', raw: consume(i, j), line: startLine, col: startCol })
          i = j + 1
        } else {
          const end = j - 1
          tokens.push({ kind: 'unterminated-csi', raw: consume(i, end), line: startLine, col: startCol })
          i = j
        }
        continue
      }

      if (source[i + 1] === ']' || source[i + 1] === 'P') {
        const isDcs = source[i + 1] === 'P'
        let j = i + 2
        let terminatedAt = -1
        while (j < len) {
          const c = source.charCodeAt(j)
          if (!isDcs && c === BEL) {
            terminatedAt = j
            break
          }
          if (c === ESC && source[j + 1] === '\\') {
            terminatedAt = j + 1
            break
          }
          if (source[j] === '\n') break
          j++
        }
        if (terminatedAt >= 0) {
          tokens.push({
            kind: isDcs ? 'dcs' : 'osc',
            raw: consume(i, terminatedAt),
            line: startLine,
            col: startCol,
          })
          i = terminatedAt + 1
        } else {
          const end = j - 1
          tokens.push({
            kind: isDcs ? 'unterminated-dcs' : 'unterminated-osc',
            raw: consume(i, end),
            line: startLine,
            col: startCol,
          })
          i = j
        }
        continue
      }

      // Simple escape: ESC, optional intermediate bytes, one final byte.
      let j = i + 1
      while (j < len && isEscIntermediate(source.charCodeAt(j))) j++
      if (j < len && isEscFinal(source.charCodeAt(j))) {
        tokens.push({ kind: 'esc-simple', raw: consume(i, j), line: startLine, col: startCol })
        i = j + 1
      } else {
        tokens.push({ kind: 'bare-esc', raw: consume(i, i), line: startLine, col: startCol })
        i += 1
      }
      continue
    }

    // C0 control bytes other than tab/newline/CR, sitting outside any
    // escape sequence, are usually accidental (binary pasted into text,
    // truncated sequences, etc).
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      const startLine = line
      const startCol = col
      tokens.push({ kind: 'control', raw: consume(i, i), line: startLine, col: startCol })
      i += 1
      continue
    }

    step(source[i])
    i += 1
  }

  return tokens
}
