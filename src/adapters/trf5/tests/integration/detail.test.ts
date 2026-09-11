import { describe, expect, it } from 'vitest';
import { fixtureResponse, StubTransport } from '../support/stub-transport.js';
import { fetchDetail } from '../../detail.js';
import { parsePrimingPage } from '../../session.js';
import { loadFixtureBytes } from '../support/stub-transport.js';

const PRIMING_URL = 'stub://pjeconsulta/ConsultaPublica/listView.seam';

describe('fetchDetail — Detail Fetch Session Requirement (trf5-adapter spec)', () => {
  it('primes a session first when none is provided, then fetches the detail page', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, null, 'stub-ca-token-0001');

    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0]?.method).toBe('GET');
    expect(transport.requests[0]?.url).toBe(PRIMING_URL);
    expect(transport.requests[1]?.url).toContain('ca=stub-ca-token-0001');
    expect(outcome.kind).toBe('ok');
  });

  it('does not re-prime when a session is already provided', async () => {
    const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, session, 'stub-ca-token-0001');

    expect(transport.requests).toHaveLength(1);
    expect(outcome.kind).toBe('ok');
  });
});

describe('fetchDetail — 429 precedence over content classification (S5g, core-resilience-policy)', () => {
  it('classifies a stubbed 429 detail response as transient before the validity chain runs', async () => {
    const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
    const transport = new StubTransport([
      { status: 429, headers: { 'retry-after': '2' }, body: new Uint8Array() },
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, session, 'stub-ca-token-0001');

    // Without the transport-boundary check, a 429's empty body has no detail
    // header/parties block and lands on `invalidTokenShell` — a permanent
    // failure masking what is actually a retryable rate-limit signal.
    expect(outcome).toEqual({ kind: 'transient', status: 429, retryAfterMs: 2000 });
  });
});

describe('fetchDetail — documents-grid pagination (S5h tasks 5h.6/5h.7/5h.8, design.md D13)', () => {
  it('a single-page grid issues zero extra requests (detail-page-valid.html has no scroller at all)', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, null, 'stub-ca-token-0001');

    expect(outcome.kind).toBe('ok');
    // Exactly the priming GET plus the one detail GET -- no pager POST.
    expect(transport.requests).toHaveLength(2);
    if (outcome.kind !== 'ok') return;
    // extractedCount/skippedCount split by fetchStatus, not documentKind
    // (task 5i.13); nothing has been fetched yet at this stage (fetchDetail
    // only parses), so every one of the 12 rows reads 'skipped' here — the
    // real fetch outcome is written back later by
    // TRF5Site.withDocumentOutcome (task 5i.1/5i.2).
    expect(outcome.value.documentsGrid).toEqual({
      declaredTotal: 12,
      extractedCount: 0,
      skippedCount: 12,
      reportedGap: 0,
    });
  });

  it('follows the real harvested pager contract to fetch page 2 and merges its rows, reconciling to the declared total of 24', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'detail-page-paginated-documents.html'),
      fixtureResponse(200, 'text/xml', 'detail-page-paginated-documents-page2.xml', {
        'content-type': 'text/xml;charset=UTF-8',
      }),
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, null, 'stub-ca-token-0002');

    expect(outcome.kind).toBe('ok');
    expect(transport.requests).toHaveLength(3);
    if (outcome.kind !== 'ok') return;
    // 14 legacy (page 1) + 9 legacy (page 2) = 23; 1 born-digital (page 1).
    expect(outcome.value.documents).toHaveLength(24);
    // Same fetchStatus-based split as above (task 5i.13) — 24 rows read, all
    // still 'skipped' at this pre-fetch stage.
    expect(outcome.value.documentsGrid).toEqual({
      declaredTotal: 24,
      extractedCount: 0,
      skippedCount: 24,
      reportedGap: 0,
    });

    // The pager POST is charged and shaped exactly per the harvested contract
    // -- never a guessed parameter name.
    const pagerRequest = transport.requests[2]!;
    expect(pagerRequest.method).toBe('POST');
    const body = String(pagerRequest.body);
    expect(body).toContain('AJAXREQUEST=j_id146%3Aj_id653');
    expect(body).toContain('j_id146%3Aj_id653%3Aj_id654=2');
    expect(body).toContain('j_id146%3Aj_id653%3Aj_id655=j_id146%3Aj_id653%3Aj_id655');
  });
});

describe('fetchDetail — a detail page reached via a 302-to-errorUnexpected.seam redirect (measured live 2026-09-06)', () => {
  it('classifies it as hostDefect exactly like the directly-rendered 200 version, never unclassified/hostDefect-by-fallback', async () => {
    const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
    const transport = new StubTransport([
      {
        status: 302,
        headers: {
          location: 'https://pjett.trf5.jus.br/pjeconsulta/errorUnexpected.seam?cid=104706',
        },
        body: new Uint8Array(),
      },
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, session, 'stub-ca-token-0001');

    expect(outcome).toEqual({
      kind: 'hostDefect',
      reason: 'errorUnexpected.seam with PersistenceException',
    });
  });

  it('a 302 to an unrelated location is NOT swallowed into hostDefect by the new branch', async () => {
    const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
    const transport = new StubTransport([
      {
        status: 302,
        headers: { location: 'https://pjett.trf5.jus.br/pjeconsulta/somewhereElse.seam' },
        body: new Uint8Array(),
      },
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, session, 'stub-ca-token-0001');

    // Still classified via the pre-existing 'unclassified' -> hostDefect
    // fallback (detail.ts's own mapping) — behavior unchanged for a redirect
    // this specific branch does not recognize.
    expect(outcome).toEqual({ kind: 'hostDefect', reason: 'unrecognized detail response' });
  });
});

describe('fetchDetail — site-agnostic failure vocabulary (design.md D12)', () => {
  it('reports an invalid-token shell as permanentError:invalidReference with the site detail preserved, never a site-specific reason literal', async () => {
    const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'detail-page-invalid-token.html'),
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, session, 'stub-ca-token-0001');

    expect(outcome).toEqual({
      kind: 'permanentError',
      reason: 'invalidReference',
      detail: 'invalidTokenShell',
    });
  });

  it('reports a schema-mismatched valid-looking page as permanentError:schemaMismatch with detail null', async () => {
    const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'detail-page-schema-mismatch.html'),
    ]);

    const outcome = await fetchDetail(transport, PRIMING_URL, session, 'stub-ca-token-0001');

    expect(outcome).toEqual({ kind: 'permanentError', reason: 'schemaMismatch', detail: null });
  });
});
