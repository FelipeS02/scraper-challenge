import * as cheerio from 'cheerio';
import type { HttpTransport } from '../../engine/ports.js';
import { decodeLatin1 } from './decode.js';

/**
 * A primed JSF/Seam conversation state, harvested fresh from a priming response every
 * time — never hardcoded (docs/RESEARCH.md §7.2). `actionUrl` is the form `fPP` action
 * attribute verbatim, already carrying `;jsessionid=…` (docs/RESEARCH.md §2 Step 1).
 */
export interface SessionState {
  readonly jsessionid: string;
  readonly viewState: string;
  readonly fieldNames: readonly string[];
  readonly triggerId: string;
  readonly actionUrl: string;
}

export async function primeSession(
  transport: HttpTransport,
  primingUrl: string,
): Promise<SessionState> {
  const response = await transport.send({ method: 'GET', url: primingUrl });
  return parsePrimingPage(response.body);
}

export function parsePrimingPage(body: Uint8Array): SessionState {
  const $ = cheerio.load(decodeLatin1(body));
  const form = $('form#fPP, form[name="fPP"]').first();
  if (form.length === 0) throw new Error('priming response missing form fPP');

  const action = form.attr('action');
  const jsessionidMatch = action ? /;jsessionid=([^"'?&]+)/.exec(action) : null;
  if (!action || !jsessionidMatch)
    throw new Error('priming response missing jsessionid in form action');

  const viewState = form.find('input[name="javax.faces.ViewState"]').attr('value');
  if (!viewState) throw new Error('priming response missing javax.faces.ViewState');

  const formId = form.attr('id') ?? form.attr('name') ?? '';
  let triggerId: string | null = null;
  form.find('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    if (!name || name === 'javax.faces.ViewState' || name === formId) return;
    if (name === value) triggerId = name; // self-referential a4j trigger marker
  });
  if (!triggerId) throw new Error('priming response missing AJAX trigger control');

  const fieldNames: string[] = [];
  form.find('input:not([type="hidden"]), select').each((_, el) => {
    const name = $(el).attr('name');
    if (name) fieldNames.push(name);
  });

  return {
    jsessionid: jsessionidMatch[1]!,
    viewState,
    fieldNames,
    triggerId,
    actionUrl: action,
  };
}
