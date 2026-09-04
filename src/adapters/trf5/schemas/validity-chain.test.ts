import { describe, expect, it } from 'vitest';
import { fixtureResponse } from '../__fixtures__/stub-transport.js';
import { buildResponseView, type ResponseView } from './response-view.js';
import { classifyValidity } from './validity-chain.js';

/** A response satisfying every schema at once — proves priority, not just correctness. */
const overlappingView: ResponseView = {
  status: 200,
  contentType: 'text/xml',
  bodyText: '',
  isAjaxRedirectToLogin: true,
  isErrorUnexpectedPage: true,
  hasPersistenceException: true,
};

describe('classifyValidity — ordered chain, first match wins (trf5-adapter spec)', () => {
  it('matches sessionExpired for an Ajax-Response redirect to login.seam (case 3)', () => {
    const view = buildResponseView(fixtureResponse(200, 'text/xml', 'session-expired.xml'));
    expect(classifyValidity(view)).toEqual({ kind: 'sessionExpired' });
  });

  it('matches unprimedSession for an errorUnexpected.seam page without PersistenceException (case 2)', () => {
    const view = buildResponseView(fixtureResponse(200, 'text/html', 'unprimed-session.html'));
    expect(classifyValidity(view)).toEqual({ kind: 'unprimedSession' });
  });

  it('matches hostDefect for an errorUnexpected.seam page carrying a PersistenceException (case 5)', () => {
    const view = buildResponseView(fixtureResponse(200, 'text/html', 'host-defect.html'));
    expect(classifyValidity(view)).toEqual({ kind: 'hostDefect' });
  });

  it('picks sessionExpired first when a view satisfies every schema at once (order contract)', () => {
    expect(classifyValidity(overlappingView)).toEqual({ kind: 'sessionExpired' });
  });

  it('falls through to hostDefect once sessionExpired no longer matches (order contract)', () => {
    expect(classifyValidity({ ...overlappingView, isAjaxRedirectToLogin: false })).toEqual({
      kind: 'hostDefect',
    });
  });

  it('does not classify an unrecognized response as any of the first three branches', () => {
    const view = buildResponseView(fixtureResponse(200, 'text/xml', 'search-ok.xml'));
    expect(classifyValidity(view)).toEqual({ kind: 'unclassified' }); // invalidTokenShell/validDetail land in S4
  });
});
