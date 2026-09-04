import { describe, expect, it } from 'vitest';
import { fixtureResponse, StubTransport } from './__fixtures__/stub-transport.js';
import { primeSession } from './session.js';

const PRIMING_URL = 'stub://pjeconsulta/ConsultaPublica/listView.seam';

describe('primeSession — harvests fields from actual response content', () => {
  it('extracts jsessionid, ViewState, field names, and trigger id from a priming response', async () => {
    const transport = new StubTransport([fixtureResponse(200, 'text/html', 'priming-page-1.html')]);

    const session = await primeSession(transport, PRIMING_URL);

    expect(session.jsessionid).toBe('STUBSESSIONID0001AAAA');
    expect(session.viewState).toBe('j_id1');
    expect(session.triggerId).toBe('fPP:j_id244');
    expect(session.actionUrl).toBe(
      '/pjeconsulta/ConsultaPublica/listView.seam;jsessionid=STUBSESSIONID0001AAAA',
    );
    expect([...session.fieldNames].sort()).toEqual(
      [
        'fPP:numProcesso-inputNumeroProcessoDecoration:numProcesso-inputNumeroProcesso',
        'fPP:dnp:nomeParte',
        'fPP:j_id180:nomeAdv',
        'fPP:j_id189:classeJudicial',
        'fPP:dpDec:documentoParte',
        'fPP:Decoration:estadoComboOAB',
        'fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate',
        'fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate',
      ].sort(),
    );
  });

  it('uses each run own harvested values — never a value from a prior run', async () => {
    const transportA = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
    ]);
    const transportB = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-2.html'),
    ]);

    const sessionA = await primeSession(transportA, PRIMING_URL);
    const sessionB = await primeSession(transportB, PRIMING_URL);

    expect(sessionA.jsessionid).toBe('STUBSESSIONID0001AAAA');
    expect(sessionB.jsessionid).toBe('STUBSESSIONID0002BBBB');
    expect(sessionA.viewState).toBe('j_id1');
    expect(sessionB.viewState).toBe('j_id7');
    expect(sessionA.triggerId).toBe('fPP:j_id244');
    expect(sessionB.triggerId).toBe('fPP:j_id311');
  });
});
