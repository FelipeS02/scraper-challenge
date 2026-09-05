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
