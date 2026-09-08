#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { lint, type Finding } from './rules.js'

interface FileFindings {
  path: string
  findings: Finding[]
}

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist']

// Only '*' is special (matched against a path segment's basename, not the
// full path) - enough for "*.min.js" or "*.log" without pulling in a real
// glob library.
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function isIgnored(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name))
}

function walk(dir: string, patterns: RegExp[], out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isIgnored(entry.name, patterns)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, patterns, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
}

// Directory arguments are expanded (recursively, honoring ignore patterns).
// File arguments are always scanned, even if their name would otherwise
// match an ignore pattern - the user asked for that file by name.
function collectFiles(paths: string[], patterns: RegExp[]): string[] {
  const out: string[] = []
  for (const p of paths) {
    let st
    try {
      st = statSync(p)
    } catch {
      out.push(p)
      continue
    }
    if (st.isDirectory()) {
      walk(p, patterns, out)
    } else {
      out.push(p)
    }
  }
  return out
}

function main(argv: string[]): number {
  const args = argv.slice(2)
  let jsonOutput = false
  const rawPaths: string[] = []
  const ignoreGlobs: string[] = [...DEFAULT_IGNORE]

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--json') {
      jsonOutput = true
    } else if (arg === '--ignore') {
      const value = args[++i]
      if (value === undefined) {
        process.stderr.write('--ignore requires a pattern argument\n')
        return 2
      }
      ignoreGlobs.push(value)
    } else if (arg.startsWith('--ignore=')) {
      ignoreGlobs.push(arg.slice('--ignore='.length))
    } else {
      rawPaths.push(arg)
    }
  }

  if (rawPaths.length === 0) {
    process.stderr.write('usage: esc-code-lint [--json] [--ignore <pattern>] <file|dir> [file|dir...]\n')
    return 2
  }

  const ignorePatterns = ignoreGlobs.map(globToRegExp)
  const paths = collectFiles(rawPaths, ignorePatterns)

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
