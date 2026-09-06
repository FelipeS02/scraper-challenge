import { describe, expect, it } from 'vitest';
import { fixtureResponse, StubTransport } from './__fixtures__/stub-transport.js';
import { fetchDetail } from './detail.js';
import { parsePrimingPage } from './session.js';
import { loadFixtureBytes } from './__fixtures__/stub-transport.js';

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
    expect(outcome.value.documentsGrid).toEqual({
      declaredTotal: 12,
      extractedCount: 8,
      skippedCount: 4,
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
    expect(outcome.value.documentsGrid).toEqual({
      declaredTotal: 24,
      extractedCount: 23,
      skippedCount: 1,
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
