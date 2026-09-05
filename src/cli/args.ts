import { DEFAULT_MAX_DOCUMENTS, DEFAULT_MAX_REQUESTS } from '../engine/budget.js';
import type { LogLevel } from '../engine/ports.js';

/**
 * Parses and validates the documented CLI bound flags (core-run-control-and-output,
 * "CLI Bound Enforcement" + "Default Request Ceiling Requiring Override"). Zero
 * dependencies: a hand-rolled `--flag value` / `--flag=value` reader for ~10 flags
 * does not justify a parsing library (design.md, "Declined Abstractions").
 */

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const satisfies readonly LogLevel[];
const LOG_FORMATS = ['console', 'jsonl'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

const DEFAULT_MAX_FACET_VALUES = 20;

export interface ScrapeArgs {
  readonly command: 'scrape';
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly maxDays: number;
  readonly maxFacetValues: number;
  readonly maxItems: number | null;
  readonly maxDocuments: number;
  readonly documentsPerItem: number | null;
  readonly maxRequests: number | null;
  readonly logLevel: LogLevel;
  readonly logFormat: LogFormat;
  readonly dryRun: boolean;
}

export interface RetryFailedArgs {
  readonly command: 'retry-failed';
}

export type ParsedArgs = ScrapeArgs | RetryFailedArgs;

type FlagMap = ReadonlyMap<string, string | true>;

function parseFlags(argv: readonly string[]): FlagMap {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }
  return flags;
}

function requireString(flags: FlagMap, name: string): string {
  const value = flags.get(name);
  if (typeof value !== 'string' || value.length === 0) throw new Error(`--${name} is required`);
  return value;
}

function optionalInt(flags: FlagMap, name: string): number | null {
  const value = flags.get(name);
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`--${name} must be an integer`);
  }
  return parsed;
}

function intWithDefault(flags: FlagMap, name: string, fallback: number): number {
  return optionalInt(flags, name) ?? fallback;
}

/**
 * `--max-requests unbounded` is the only way to disable the request ceiling —
 * never reachable by omission (core-run-control-and-output, "Unbounded run
 * requires explicit opt-in").
 */
function parseMaxRequests(flags: FlagMap): number | null {
  const value = flags.get('max-requests');
  if (value === undefined) return DEFAULT_MAX_REQUESTS;
  if (value === 'unbounded') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error('--max-requests must be an integer or the literal "unbounded"');
  }
  return parsed;
}

function parseLogLevel(flags: FlagMap): LogLevel {
  const value = flags.get('log-level');
  if (value === undefined) return 'info';
  if (typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  throw new Error(`--log-level must be one of ${LOG_LEVELS.join(', ')}`);
}

function parseLogFormat(flags: FlagMap): LogFormat {
  const value = flags.get('log-format');
  if (value === undefined) return 'console';
  if (typeof value === 'string' && (LOG_FORMATS as readonly string[]).includes(value)) {
    return value as LogFormat;
  }
  throw new Error(`--log-format must be one of ${LOG_FORMATS.join(', ')}`);
}

/** Parses `process.argv.slice(2)` into a validated `scrape` or `retry-failed` command. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === 'retry-failed') return { command: 'retry-failed' };
  if (command !== 'scrape') {
    throw new Error(`unknown command '${command ?? ''}' — expected 'scrape' or 'retry-failed'`);
  }

  const flags = parseFlags(rest);
  return {
    command: 'scrape',
    dateFrom: requireString(flags, 'from'),
    dateTo: requireString(flags, 'to'),
    maxDays: intWithDefault(flags, 'max-days', Number.POSITIVE_INFINITY),
    maxFacetValues: intWithDefault(flags, 'max-facet-values', DEFAULT_MAX_FACET_VALUES),
    maxItems: optionalInt(flags, 'max-items'),
    maxDocuments: intWithDefault(flags, 'max-documents', DEFAULT_MAX_DOCUMENTS),
    documentsPerItem: optionalInt(flags, 'documents-per-item'),
    maxRequests: parseMaxRequests(flags),
    logLevel: parseLogLevel(flags),
    logFormat: parseLogFormat(flags),
    dryRun: flags.get('dry-run') === true,
  };
}
