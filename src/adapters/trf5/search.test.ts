import { describe, expect, it } from 'vitest';
import { fixtureResponse, StubTransport } from './__fixtures__/stub-transport.js';
import {
  buildSearchRequestBody,
  search,
  validateSearchCriteria,
  type SearchCriteria,
} from './search.js';
import { parsePrimingPage, primeSession, type SessionState } from './session.js';
import { loadFixtureBytes } from './__fixtures__/stub-transport.js';

const PRIMING_URL = 'stub://pjeconsulta/ConsultaPublica/listView.seam';

const criteria: SearchCriteria = {
  dataAutuacaoInicio: '01/09/2026',
  dataAutuacaoFim: '01/09/2026',
};

const primedSession: SessionState = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));

describe('search — expired ViewState triggers re-prime and a single replay', () => {
  it('re-primes and replays once on an Ajax-Response redirect to login.seam, never treating it as data', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // initial priming
      fixtureResponse(200, 'text/xml', 'session-expired.xml'), // first search attempt: expired
      fixtureResponse(200, 'text/html', 'priming-page-2.html'), // re-prime
      fixtureResponse(200, 'text/xml', 'search-ok.xml'), // replay: succeeds
    ]);

    const session = await primeSession(transport, PRIMING_URL);
    const result = await search(transport, PRIMING_URL, session, criteria);

    expect(transport.requests).toHaveLength(4);
    expect(result.session.jsessionid).toBe('STUBSESSIONID0002BBBB'); // re-primed session, not the original
    expect(result.response.status).toBe(200);
    const replayedBody = new TextDecoder('latin1').decode(result.response.body);
    expect(replayedBody).toContain('resultadoPanel'); // the replay's real data, not the redirect
  });
});

describe('buildSearchRequestBody — the complete documented field set', () => {
  it('includes every documented field, populated ones with real values and the rest empty', () => {
    const body = buildSearchRequestBody(primedSession, {
      numProcesso: '0123456-78.2026.4.05.8100',
      classeJudicial: 'APELACAO CIVEL',
      dataAutuacaoInicio: '01/09/2026',
      dataAutuacaoFim: '01/09/2026',
    });
    const params = new URLSearchParams(body);

    expect(
      params.get('fPP:numProcesso-inputNumeroProcessoDecoration:numProcesso-inputNumeroProcesso'),
    ).toBe('0123456-78.2026.4.05.8100');
    expect(params.get('fPP:j_id189:classeJudicial')).toBe('APELACAO CIVEL');
    expect(params.get('fPP:dnp:nomeParte')).toBe(''); // documented but unset -> empty string, not omitted
    expect(params.get('fPP:j_id180:nomeAdv')).toBe('');
    expect(params.get('fPP:dpDec:documentoParte')).toBe('');
    expect(params.get('fPP:Decoration:estadoComboOAB')).toBe('');
    expect(params.get('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate')).toBe('01/09/2026');
    expect(params.get('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate')).toBe('01/09/2026');
    expect(params.get(primedSession.triggerId)).toBe(primedSession.triggerId);
    expect(params.get('javax.faces.ViewState')).toBe('j_id1');
  });

  it('rejects a request built without dataAutuacaoInicio/dataAutuacaoFim before sending', () => {
    const missingRange: SearchCriteria = { dataAutuacaoInicio: '', dataAutuacaoFim: '' };
    expect(() => validateSearchCriteria(missingRange)).toThrow(/dataAutuacaoInicio/);
    expect(() => buildSearchRequestBody(primedSession, missingRange)).toThrow(/dataAutuacaoInicio/);
  });
});
