// Loads the optional rule-enable/disable config so the CLI can turn off
// individual rules without touching source. Kept separate from rules.ts so
// rules.ts stays usable as a plain library with no filesystem access.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Rule } from './rules.js'

export const CONFIG_FILENAME = '.esc-code-lintrc.json'

export interface Config {
  rules: Record<string, boolean>
}

const EMPTY_CONFIG: Config = { rules: {} }

// Parses and validates a config file's shape. Errors thrown here are meant
// to be printed straight to the user, not surfaced as a stack trace.
function parseConfig(raw: string, path: string): Config {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${path}: invalid JSON (${(err as Error).message})`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`${path}: expected a JSON object`)
  }
  const rulesField = (data as Record<string, unknown>).rules
  if (rulesField === undefined) return { rules: {} }
  if (typeof rulesField !== 'object' || rulesField === null || Array.isArray(rulesField)) {
    throw new Error(`${path}: "rules" must be an object mapping rule id to true/false`)
  }
  const parsedRules: Record<string, boolean> = {}
  for (const [ruleId, value] of Object.entries(rulesField as Record<string, unknown>)) {
    if (typeof value !== 'boolean') {
      throw new Error(`${path}: rule "${ruleId}" must be set to true or false, got ${JSON.stringify(value)}`)
    }
    parsedRules[ruleId] = value
  }
  return { rules: parsedRules }
}

// Loads config from an explicit --config path, or from .esc-code-lintrc.json
// in `cwd` if present. Returns an all-rules-enabled config when neither
// applies - the config file is opt-in, not required.
export function loadConfig(explicitPath: string | undefined, cwd: string): Config {
  const path = explicitPath ?? join(cwd, CONFIG_FILENAME)
  if (explicitPath === undefined && !existsSync(path)) return EMPTY_CONFIG
  return parseConfig(readFileSync(path, 'utf8'), path)
}

// Filters a rule list down to the ones this config leaves enabled. Checks
// every rule id mentioned in the config against the known rule set first -
// a typo'd rule id should fail loudly rather than silently do nothing.
export function applyConfig(allRules: Rule[], config: Config): Rule[] {
  const knownIds = new Set(allRules.map((r) => r.id))
  for (const ruleId of Object.keys(config.rules)) {
    if (!knownIds.has(ruleId)) {
      throw new Error(`unknown rule "${ruleId}" in config (known rules: ${[...knownIds].join(', ')})`)
    }
  }
  return allRules.filter((r) => config.rules[r.id] !== false)
}
