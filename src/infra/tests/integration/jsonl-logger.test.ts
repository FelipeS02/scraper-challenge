import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LogEvent } from '../../../engine/ports.js';
import { JsonlLogger } from '../../logging/jsonl-logger.js';

describe('JsonlLogger', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-jsonl-logger-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends one valid JSON object per line to logs/run-<runId>.jsonl, UTF-8 explicit', () => {
    const logger = new JsonlLogger('run-42', dir);
    const event: LogEvent = {
      level: 'info',
      event: 'unit.started',
      fields: { unitKey: '2026-01-01', label: 'Petição inicial' }, // non-ASCII field value
    };

    logger.log(event);
    logger.log({ level: 'warn', event: 'document.failed', fields: { itemId: 'item-1' } });

    const filePath = join(dir, 'run-run-42.jsonl');
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trimEnd().split('\n');

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toEqual(event);
    expect(JSON.parse(lines[1] ?? '')).toEqual({
      level: 'warn',
      event: 'document.failed',
      fields: { itemId: 'item-1' },
    });
    // Non-ASCII survives the round trip on Windows — no mojibake from an implicit encoding.
    expect((JSON.parse(lines[0] ?? '') as LogEvent).fields.label).toBe('Petição inicial');
  });

  it('emits nothing when the event level is below the configured threshold', () => {
    const logger = new JsonlLogger('run-1', dir, 'warn');
    logger.log({ level: 'info', event: 'unit.started', fields: {} });

    const filePath = join(dir, 'run-run-1.jsonl');
    expect(existsSync(filePath)).toBe(false);
  });
});
