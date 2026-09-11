import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../support/stub-transport.js';
import { extractDocumentViewerPdfContract } from '../../parsing/document-viewer.js';

/**
 * Every expectation is read from a real captured, redacted response
 * (`__fixtures__/document-viewer-born-digital.html`'s own header comment
 * records what was captured and what was redacted) — never invented markup
 * (design.md D14, task 5j.2).
 */
describe('extractDocumentViewerPdfContract — harvests the Gerar PDF submit contract (design.md D14)', () => {
  it('harvests the form action, hidden fields, download param, ca and idProcDocBin from the real captured viewer page', () => {
    const contract = extractDocumentViewerPdfContract(
      loadFixtureBytes('document-viewer-born-digital.html'),
    );

    expect(contract).not.toBeNull();
    expect(contract?.actionUrl).toBe(
      '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/documentoSemLoginHTML.seam',
    );
    expect(contract?.downloadParam).toBe('j_id42:downloadPDF');
    expect(contract?.idProcDocBin).toBe('6799939');
    // The ca token is redacted in the fixture but must still round-trip
    // byte-identical from whatever the page actually renders — never
    // reused from the viewer URL's own ca (a different request already used).
    expect(contract?.ca.length).toBeGreaterThan(0);
    expect(contract?.hiddenFields.get('j_id42')).toBe('j_id42');
    expect(contract?.hiddenFields.get('javax.faces.ViewState')).toBe('j_id3');
  });

  it('returns null when the page has no Gerar PDF command link at all', () => {
    const contract = extractDocumentViewerPdfContract(loadFixtureBytes('detail-page-valid.html'));
    expect(contract).toBeNull();
  });

  it('matches the Gerar PDF anchor and its form by id SUFFIX, never a hardcoded "j_id42" literal (S5f/S5h rule)', () => {
    // JSF renders a server-generated prefix; a real page could just as well
    // render "z_id99:downloadPDF" bound to form "z_id99". This minimal,
    // hand-built snippet proves the SELECTOR mechanism generically -- it
    // makes no claim about TRF5's real markup shape, which the fixture-based
    // tests above already prove byte-for-byte.
    const html = `<html><body>
      <a id="prefix99:downloadPDF" href="#" onclick="jsfcljs(document.getElementById('prefix99'),{'prefix99:downloadPDF':'prefix99:downloadPDF','ca':'abc123','idProcDocBin':'999'},'')">Gerar PDF</a>
      <form id="prefix99" method="post" action="/some/action.seam">
        <input type="hidden" name="prefix99" value="prefix99" />
        <input type="hidden" name="javax.faces.ViewState" value="j_id9" />
      </form>
    </body></html>`;
    const contract = extractDocumentViewerPdfContract(new TextEncoder().encode(html));

    expect(contract).toEqual({
      actionUrl: '/some/action.seam',
      hiddenFields: new Map([
        ['prefix99', 'prefix99'],
        ['javax.faces.ViewState', 'j_id9'],
      ]),
      downloadParam: 'prefix99:downloadPDF',
      ca: 'abc123',
      idProcDocBin: '999',
    });
  });
});
