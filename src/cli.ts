#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { lint, type Finding } from './rules.js'

interface FileFindings {
  path: string
  findings: Finding[]
}

function main(argv: string[]): number {
  const args = argv.slice(2)
  const jsonOutput = args.includes('--json')
  const paths = args.filter((a) => a !== '--json')

  if (paths.length === 0) {
    process.stderr.write('usage: esc-code-lint [--json] <file> [file...]\n')
    return 2
  }

  let exitCode = 0
  const results: FileFindings[] = []

  for (const path of paths) {
    let source: string
    try {
      source = readFileSync(path, 'utf8')
    } catch (err) {
      process.stderr.write(`${path}: cannot read file (${(err as Error).message})\n`)
      exitCode = 2
      continue
    }

    const findings = lint(source)
    if (findings.length > 0) exitCode = 1

    if (jsonOutput) {
      results.push({ path, findings })
    } else {
      for (const finding of findings) {
        process.stdout.write(`${path}:${finding.line}:${finding.col}: ${finding.message} [${finding.ruleId}]\n`)
      }
    }
  }

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results)}\n`)
  }

  return exitCode
}

process.exit(main(process.argv))
