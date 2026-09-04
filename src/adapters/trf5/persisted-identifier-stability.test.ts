import { describe, expect, it } from 'vitest';
import type { CheckpointRecord } from '../../engine/ports.js';
import { loadFixtureBytes, StubTransport } from './__fixtures__/stub-transport.js';
import { buildDocumentPath } from './documents.js';
import { parsePrimingPage } from './session.js';
import { TRF5Traversal } from './traversal.js';

/**
 * Confirms "Persisted Identifier Stability" (core-run-control-and-output spec,
 * new in this slice): a derived document path, a TraversalCursor, and a
 * CheckpointRecord never carry a `ca` token, a `jsessionid`, or a ViewState —
 * every persisted identifier here resolves in a later session with no token
 * replay. Uses a real harvested session (S3's `parsePrimingPage`) so the
 * forbidden values are the actual jsessionid/ViewState this run produced, not
 * a guessed literal.
 */
describe('Persisted Identifier Stability (core-run-control-and-output spec)', () => {
  const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));

  function assertNoSessionScopedValue(label: string, value: unknown): void {
    const serialized = JSON.stringify(value);
    expect(serialized, `${label} leaks the harvested jsessionid`).not.toContain(session.jsessionid);
    expect(serialized, `${label} leaks the harvested ViewState`).not.toContain(session.viewState);
    expect(serialized, `${label} carries a 'ca' query token`).not.toMatch(/[?&]ca=/i);
  }

  it('a derived document path carries no ca/jsessionid/ViewState value', () => {
    const path = buildDocumentPath('0123456-78.2026.4.05.8100', '12452668', 'Decisão');
    assertNoSessionScopedValue('document path', path);
  });

  it('a TraversalCursor carries no ca/jsessionid/ViewState value', async () => {
    const traversal = new TRF5Traversal({ transport: new StubTransport([]), session });
    const [seeded] = await traversal.seed({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-01',
      maxFacetValues: 1,
    });

    assertNoSessionScopedValue('TraversalCursor', seeded?.cursor);
  });

  it('a CheckpointRecord carries no ca/jsessionid/ViewState value', () => {
    const record: CheckpointRecord = {
      unitKey: '2026-01-01..2026-01-01',
      windowKey: '2026-01-01..2026-01-01',
      cursor: { dateFrom: '2026-01-01', dateTo: '2026-01-01' },
      state: 'complete',
      observedAt: '2026-01-01T00:00:00.000Z',
    };

    assertNoSessionScopedValue('CheckpointRecord', record);
  });
});
