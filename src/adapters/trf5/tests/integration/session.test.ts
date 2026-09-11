import { describe, expect, it } from 'vitest';
import { fixtureResponse, StubTransport } from '../support/stub-transport.js';
import { parsePrimingPage, primeSession } from '../../session.js';

const PRIMING_URL = 'stub://pjeconsulta/ConsultaPublica/listView.seam';

/** An a4j submit wired through an `onclick` attribute, as a button renders one. */
function a4jButton(id: string, extraParameters = ''): string {
  return `<input id="${id}" name="${id}" type="button" value="Pesquisar"
    onclick="A4J.AJAX.Submit('fPP',event,{'similarityGroupingId':'${id}','actionUrl':'/x;jsessionid=S','parameters':{'${id}':'${id}'${extraParameters}} } );return false;" />`;
}

/** An a4j submit defined in a script component, as the live search trigger is. */
function a4jScript(id: string, extraParameters = ''): string {
  return `<script id="${id}" type="text/javascript">//<![CDATA[
executarPesquisa=function(){A4J.AJAX.Submit('fPP',null,{'similarityGroupingId':'${id}','actionUrl':'/x;jsessionid=S','parameters':{'${id}':'${id}'${extraParameters}} } )};
//]]></script>`;
}

function primingPage(controls: string, action = '/x;jsessionid=STUBSESSIONID0001AAAA'): Uint8Array {
  return Buffer.from(
    `<html><body><form id="fPP" name="fPP" action="${action}">
       <input type="hidden" name="fPP" value="fPP" />
       <input type="hidden" name="javax.faces.ViewState" value="j_id1" />
       ${controls}
     </form></body></html>`,
    'latin1',
  );
}

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
    // Stable across sessions on the real portal — what rotates is asserted above.
    expect(sessionA.triggerId).toBe('fPP:j_id244');
    expect(sessionB.triggerId).toBe('fPP:j_id244');
  });
});

describe('parsePrimingPage — trigger identification is structural, and loud when unsure', () => {
  it('prefers the script-defined submit over an onclick one — the live page has both', () => {
    // Proven live 2026-09-05: posting `fPP:j_id244` (the script component)
    // returns 35668 bytes of results; posting `fPP:searchProcessos` (the button)
    // returns 2874 bytes that update only an empty rich-messages panel and never
    // run the search. The button's A4J call sits after a `return` in its onclick
    // and is unreachable — a browser routes through executarReCaptcha() to
    // executarPesquisa(), which the script defines.
    const body = primingPage(a4jButton('fPP:searchProcessos') + a4jScript('fPP:j_id244'));

    expect(parsePrimingPage(body).triggerId).toBe('fPP:j_id244');
  });

  it('falls back to an onclick submit when the form defines no script one', () => {
    const body = primingPage(a4jButton('fPP:searchProcessos'));

    expect(parsePrimingPage(body).triggerId).toBe('fPP:searchProcessos');
  });

  it('throws when two script-defined submits are indistinguishable', () => {
    const body = primingPage(a4jScript('fPP:j_id244') + a4jScript('fPP:j_id777'));

    expect(() => parsePrimingPage(body)).toThrow(/ambiguous.*j_id244.*j_id777/);
  });

  it('skips an ajaxSingle control even when it comes first in document order', () => {
    // The judicial-class combo on the live page: also a4j, also self-referential,
    // rendered ABOVE the search button. `ajaxSingle` marks it a partial field
    // refresh, not a form submit. Picking it would search nothing, silently.
    const body = primingPage(
      a4jButton(
        'fPP:j_id189:sgbClasseJudicial:j_id199',
        ",'ajaxSingle':'fPP:j_id189:sgbClasseJudicial'",
      ) + a4jButton('fPP:searchProcessos'),
    );

    expect(parsePrimingPage(body).triggerId).toBe('fPP:searchProcessos');
  });

  it('throws naming every candidate when two submit triggers are indistinguishable', () => {
    // Degrading loudly is the whole point: a structural rule always finds
    // SOMETHING, and quietly picking the wrong control is worse than stopping.
    const body = primingPage(a4jButton('fPP:searchProcessos') + a4jButton('fPP:searchOutro'));

    expect(() => parsePrimingPage(body)).toThrow(/ambiguous.*searchProcessos.*searchOutro/);
  });

  it('throws when the form carries no a4j submit trigger at all', () => {
    expect(() =>
      parsePrimingPage(primingPage('<input type="text" name="fPP:dnp:nomeParte" />')),
    ).toThrow(/missing AJAX trigger control/);
  });

  it('primes a session whose form action carries no jsessionid — the cookie case', () => {
    // Verified against the live host on 2026-09-05: the container URL-rewrites
    // `;jsessionid=` into the form action ONLY while it does not yet know the
    // client accepts cookies. GET #1 (cold jar) carries it; GET #2 with the
    // JSESSIONID cookie returns a bare `/pjeconsulta/ConsultaPublica/listView.seam`.
    // Our transport keeps a cookie jar, so EVERY priming after the first hits
    // this branch — which is why the second live run failed here.
    const session = parsePrimingPage(
      primingPage(a4jScript('fPP:j_id244'), '/pjeconsulta/ConsultaPublica/listView.seam'),
    );

    expect(session.jsessionid).toBeNull();
    expect(session.actionUrl).toBe('/pjeconsulta/ConsultaPublica/listView.seam');
    expect(session.viewState).toBe('j_id1');
    expect(session.triggerId).toBe('fPP:j_id244');
  });

  it('still throws when the form action is missing outright', () => {
    const body = Buffer.from(
      `<html><body><form id="fPP" name="fPP">
         <input type="hidden" name="javax.faces.ViewState" value="j_id1" />
         ${a4jButton('fPP:searchProcessos')}
       </form></body></html>`,
      'latin1',
    );

    expect(() => parsePrimingPage(body)).toThrow(/missing form action/);
  });

  it('does not mistake a self-referential hidden input for the trigger', () => {
    // The shape the original fixture invented. It does not exist on the live
    // page, and it must not satisfy the parser if it ever reappears.
    const body = primingPage(
      '<input type="hidden" name="fPP:j_id244" value="fPP:j_id244" />' +
        a4jButton('fPP:searchProcessos'),
    );

    expect(parsePrimingPage(body).triggerId).toBe('fPP:searchProcessos');
  });
});
