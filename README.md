# esc-code-lint

A linter for terminal escape sequences. It reads text files and reports
malformed or suspicious ANSI/VT escape codes with a file:line:column, the
same shape as any other linter's output.

## Why

Any program that prints untrusted text straight to a terminal - a CI log
viewer, `less`, a chat client, a test runner dumping stdout - is also
interpreting whatever escape sequences happen to be embedded in that text.
A stray `ESC ]` sequence can rewrite the window title, hide following output,
or (on a subset of terminals) trigger an OSC 52 clipboard write. Most of the
time these show up by accident: a binary blob got treated as text, a
sequence got truncated mid-stream, a control byte leaked into a fixture file.
Either way, "is this text full of well-formed escape sequences" is a
mechanical question worth checking before the text ships somewhere it can do
damage.

This tool answers that question. It does not try to be a full terminal
emulator - it does not know what `CSI 38;5;196m` means - it only checks
structure: does every `ESC [ ... ` sequence reach a valid final byte, does
every `ESC ] ...` sequence get terminated, is every `ESC` byte actually the
start of something recognizable.

## Usage

```sh
npm run build
node dist/cli.js path/to/file.log
```

Given a file containing a truncated OSC sequence (built here from its parts
so this README does not itself contain a raw escape byte):

```js
const ESC = String.fromCharCode(27)
const sample = `startup ok\n${ESC}]0;evil title` // never terminated with BEL or ST
```

running the linter against that content reports:

```
fixture.log:2:12: OSC sequence is missing its BEL or ST terminator [no-unterminated-escape]
```

Exit code is `0` when a file has no findings, `1` when findings were
reported, `2` on a usage or read error.

## Rules

- `no-unterminated-escape` - a CSI, OSC, or DCS sequence starts but never
  reaches its final byte or terminator.
- `no-bare-esc` - an `ESC` byte (0x1B) is followed by something that is not
  a recognized sequence start.
- `no-raw-control-chars` - a C0 control byte other than tab, newline, or
  carriage return shows up outside any escape sequence.

## Library use

`src/rules.ts` exports `lint(source: string): Finding[]`, and `src/scanner.ts`
exports the lower-level `tokenize(source: string): Token[]` if you want to
write your own rules against the token stream.

## Status

Early skeleton. Single-file scanning from the CLI, three rules, no config
file yet. See the roadmap in the project notes for what's next.
