import { describe, expect, it } from 'vitest';
import { fixtureResponse } from '../__fixtures__/stub-transport.js';
import { buildResponseView } from './response-view.js';

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
