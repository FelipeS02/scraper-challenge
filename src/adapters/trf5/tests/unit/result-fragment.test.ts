import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../support/stub-transport.js';
import { parseResultFragment } from '../../parsing/result-fragment.js';

describe('parseResultFragment — Declared Result-Page Cap and Item Identity Key (trf5-adapter spec)', () => {
  it('extracts one row per result with its process number and opaque ca token, in document order', () => {
    const fragment = parseResultFragment(loadFixtureBytes('search-ok.xml'));

    expect(fragment.rows).toEqual([
      {
        processNumber: '0000001-11.2024.4.05.8000',
        ca: 'stubca0000000000000000000000000000000001',
        parties: 'PARTE SINTETICA UM X PARTE SINTETICA DOIS',
      },
      {
        processNumber: '0000002-22.2024.4.05.8000',
        ca: 'stubca0000000000000000000000000000000002',
        parties: 'PARTE SINTETICA TRES X PARTE SINTETICA QUATRO',
      },
      {
        processNumber: '0000003-33.2024.4.05.8000',
        ca: 'stubca0000000000000000000000000000000003',
        parties: 'PARTE SINTETICA CINCO X PARTE SINTETICA SEIS',
      },
    ]);
  });

  it('reports the observed row count so the engine can compare it against resultPageCap', () => {
    const fragment = parseResultFragment(loadFixtureBytes('search-ok.xml'));

    expect(fragment.count).toBe(3);
    expect(fragment.count).toBe(fragment.rows.length);
  });

  it('yields an empty list rather than throwing for a zero-row fragment', () => {
    const fragment = parseResultFragment(loadFixtureBytes('search-ok-empty.xml'));

    expect(fragment.rows).toEqual([]);
    expect(fragment.count).toBe(0);
  });
});

describe('parseResultFragment — party-name extraction (trf5-adapter spec, "Adaptive Name-Probe Extension")', () => {
  /** Mirrors search-ok.xml's real row shape (see its own header comment): the parties
   * text is a trailing text node in the row's second cell, after the anchor that wraps
   * the process-number `<b class="btn-block">`. */
  function rowXml(partiesText: string): Uint8Array {
    const xml =
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
      '<html><body><div id="fPP:processosGridPanel"><table class="rich-table">' +
      '<tbody id="fPP:processosTable:tb">' +
      '<tr class="rich-table-row">' +
      '<td class="rich-table-cell"><a onclick="openPopUp(\'x\',\'?ca=stubca0000000000000000000000000000000009\')"></a></td>' +
      '<td class="rich-table-cell">APELACAO ' +
      "<a onclick=\"openPopUp('x','?ca=stubca0000000000000000000000000000000009')\">" +
      '<b class="btn-block">Ap 0000009-99.2024.4.05.8000 - Assunto</b></a>' +
      ` ${partiesText}</td>` +
      '<td class="rich-table-cell">mov (01/01/2026 00:00:00)</td>' +
      '</tr>' +
      '</tbody></table></div></body></html>';
    return new TextEncoder().encode(xml);
  }

  it('extracts the raw parties text, carrying both party names when one side lists "e outros (N)"', () => {
    const fragment = parseResultFragment(
      rowXml('INSTITUTO NACIONAL DE SEGURO SOCIAL e outros (2) X MARIA DA SILVA'),
    );

    expect(fragment.rows).toHaveLength(1);
    expect(fragment.rows[0]?.parties).toBe(
      'INSTITUTO NACIONAL DE SEGURO SOCIAL e outros (2) X MARIA DA SILVA',
    );
  });

  it('extracts a plain two-party parties text with no "e outros" suffix', () => {
    const fragment = parseResultFragment(rowXml('PARTE UM X PARTE DOIS'));

    expect(fragment.rows[0]?.parties).toBe('PARTE UM X PARTE DOIS');
  });
});
