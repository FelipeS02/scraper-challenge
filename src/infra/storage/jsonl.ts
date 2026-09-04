import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only JSONL persistence (design.md D5): one JSON object per line,
 * replayed into memory on load. No SQLite, no WAL/fsync, no mutation of an
 * existing line — every store built on this appends only.
 */
export function appendJsonlLine(filePath: string, record: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
}

export interface JsonlLoadResult<T> {
  readonly records: readonly T[];
  readonly warnings: readonly string[];
}

/**
 * A torn final line (the process was killed mid-write) is dropped with a
 * warning. A malformed line anywhere else is fatal — silent data loss is
 * worse than a hard stop (design.md "Resumability and Idempotency").
 */
export function readJsonlFile<T>(filePath: string): JsonlLoadResult<T> {
  if (!existsSync(filePath)) return { records: [], warnings: [] };

  const raw = readFileSync(filePath, 'utf-8');
  const hasTrailingNewline = raw.endsWith('\n');
  const body = hasTrailingNewline ? raw.slice(0, -1) : raw;
  const lines = body.split('\n').filter((line) => line.length > 0);

  const records: T[] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      const isTornFinalLine = !hasTrailingNewline && index === lines.length - 1;
      if (isTornFinalLine) {
        const warning = `Dropped torn final line in ${filePath}: ${(error as Error).message}`;
        warnings.push(warning);
        console.warn(warning);
        return;
      }
      throw new Error(`Malformed JSONL line ${index + 1} in ${filePath}: ${(error as Error).message}`);
    }
  });

  return { records, warnings };
}
