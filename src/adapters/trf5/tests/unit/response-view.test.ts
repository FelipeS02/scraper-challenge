import { describe, expect, it } from 'vitest';
import { fixtureResponse } from '../support/stub-transport.js';
import { buildResponseView } from '../../schemas/response-view.js';

describe('buildResponseView — detail/parties block detection against a captured page (D8)', () => {
  it('detects the header and parties blocks on a real captured detail page, whose ids carry a server-generated form prefix', () => {
    const view = buildResponseView(fixtureResponse(200, 'text/html', 'detail-page-valid.html'));

    expect(view.hasDetailHeaderBlock).toBe(true);
    expect(view.hasPartiesBlock).toBe(true);
  });

  it('still detects neither block on a captured invalid-token shell (5f.3 must not accept everything)', () => {
    const view = buildResponseView(
      fixtureResponse(200, 'text/html', 'detail-page-invalid-token.html'),
    );

    expect(view.hasDetailHeaderBlock).toBe(false);
    expect(view.hasPartiesBlock).toBe(false);
  });
});

describe('buildResponseView — a 302 redirect landing on errorUnexpected.seam (measured live 2026-09-06)', () => {
  it('sets isErrorRedirect from the Location header when a 302 body is empty', () => {
    const view = buildResponseView({
      status: 302,
      headers: { location: 'https://pjett.trf5.jus.br/pjeconsulta/errorUnexpected.seam?cid=1' },
      body: new Uint8Array(),
    });

    expect(view.isErrorRedirect).toBe(true);
  });

  it('does not set isErrorRedirect for a 302 to an unrelated location', () => {
    const view = buildResponseView({
      status: 302,
      headers: { location: 'https://pjett.trf5.jus.br/pjeconsulta/somewhereElse.seam' },
      body: new Uint8Array(),
    });

    expect(view.isErrorRedirect).toBe(false);
  });

  it('does not set isErrorRedirect for a non-redirect status even if Location happens to be present', () => {
    const view = buildResponseView({
      status: 200,
      headers: { location: 'https://pjett.trf5.jus.br/pjeconsulta/errorUnexpected.seam' },
      body: new Uint8Array(),
    });

    expect(view.isErrorRedirect).toBe(false);
  });
});
