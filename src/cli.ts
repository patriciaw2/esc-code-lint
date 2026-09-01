#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { lint } from './rules.js'

function main(argv: string[]): number {
  const paths = argv.slice(2)
  if (paths.length === 0) {
    process.stderr.write('usage: esc-code-lint <file> [file...]\n')
    return 2
  }

  let exitCode = 0

  for (const path of paths) {
    let source: string
    try {
      source = readFileSync(path, 'utf8')
    } catch (err) {
      process.stderr.write(`${path}: cannot read file (${(err as Error).message})\n`)
      exitCode = 2
      continue
    }

    for (const finding of lint(source)) {
      process.stdout.write(`${path}:${finding.line}:${finding.col}: ${finding.message} [${finding.ruleId}]\n`)
      exitCode = 1
    }
  }

  return exitCode
}

process.exit(main(process.argv))
