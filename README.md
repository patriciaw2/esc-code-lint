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

Directory arguments are scanned recursively:

```sh
node dist/cli.js src/
```

`node_modules`, `.git`, and `dist` are skipped by default. Pass `--ignore`
(repeatable) with a name or a `*` glob to skip more, matched against each
path segment's basename:

```sh
node dist/cli.js --ignore '*.min.js' --ignore fixtures src/
```

A file passed directly on the command line is always scanned, even if its
name matches an ignore pattern - ignore patterns only prune directory
walks.

Exit code is `0` when a file has no findings, `1` when findings were
reported, `2` on a usage or read error.

Pass `--json` to get machine-readable output instead: an array of
`{ path, findings }` objects, one per file argument, written as a single
JSON line to stdout.

```sh
node dist/cli.js --json fixture.log
```

```json
[{"path":"fixture.log","findings":[{"line":2,"col":12,"ruleId":"no-unterminated-escape","message":"OSC sequence is missing its BEL or ST terminator"}]}]
```

## Rules

- `no-unterminated-escape` - a CSI, OSC, or DCS sequence starts but never
  reaches its final byte or terminator.
- `no-bare-esc` - an `ESC` byte (0x1B) is followed by something that is not
  a recognized sequence start.
- `no-raw-control-chars` - a C0 control byte other than tab, newline, or
  carriage return shows up outside any escape sequence.
- `no-unpaired-hyperlink` - an OSC 8 hyperlink (`ESC ] 8 ; params ; URI ST`)
  is opened but never closed, closed without ever having been opened, or
  opened again before the previous one was closed.

## Configuration

By default all rules run. To turn individual rules off, add a
`.esc-code-lintrc.json` file in the directory you run the linter from:

```json
{
  "rules": {
    "no-raw-control-chars": false
  }
}
```

Any rule id not mentioned stays enabled; setting one to `true` is allowed
but has no effect since that's already the default. An unknown rule id in
the file is an error, not a silent no-op. Pass `--config <path>` to load a
config file from somewhere other than the current directory:

```sh
node dist/cli.js --config ci/esc-lint-strict.json src/
```

## Library use

`src/rules.ts` exports `lint(source: string): Finding[]`, and `src/scanner.ts`
exports the lower-level `tokenize(source: string): Token[]` if you want to
write your own rules against the token stream.

## Status

Early skeleton. Four rules, text or JSON output, recursive directory
scanning with ignore patterns, and a config file for enabling/disabling
individual rules. No test suite yet. See the roadmap in the project notes
for what's next.
