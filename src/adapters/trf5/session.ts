import * as cheerio from 'cheerio';
import type { HttpTransport } from '../../engine/ports.js';
import { decodeLatin1 } from './decode.js';

/**
 * A primed JSF/Seam conversation state, harvested fresh from a priming response every
 * time — never hardcoded (docs/RESEARCH.md §7.2). `actionUrl` is the form `fPP` action
 * attribute verbatim, already carrying `;jsessionid=…` (docs/RESEARCH.md §2 Step 1).
 */
export interface SessionState {
  /** Null once the client holds the JSESSIONID cookie — see `parsePrimingPage`. */
  readonly jsessionid: string | null;
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

/**
 * The a4j submit call a RichFaces control renders into its `onclick`, e.g.
 * `A4J.AJAX.Submit('fPP',event,{...,'parameters':{'fPP:searchProcessos':'fPP:searchProcessos'}})`.
 * The parameters object never nests, so a non-greedy scan to its closing brace is exact.
 */
const A4J_SUBMIT_PARAMETERS = /A4J\.AJAX\.Submit\([\s\S]*?'parameters'\s*:\s*\{([^}]*)\}/g;
const A4J_PARAMETER_PAIR = /'([^']+)'\s*:\s*'([^']*)'/g;

/**
 * Every action source an a4j submit in `source` names itself by — a `'x':'x'`
 * pair in its `parameters`. A submit carrying `ajaxSingle` is skipped: that marks
 * a partial field refresh (the judicial-class combo renders one) rather than a
 * form submit, and it would search nothing without ever erroring.
 */
function collectSelfReferentialSubmits(source: string): readonly string[] {
  const found: string[] = [];
  for (const submit of source.matchAll(A4J_SUBMIT_PARAMETERS)) {
    const raw = submit[1];
    if (raw === undefined) continue;
    const parameters = new Map<string, string>();
    for (const [, key, value] of raw.matchAll(A4J_PARAMETER_PAIR)) {
      if (key !== undefined && value !== undefined) parameters.set(key, value);
    }
    if (parameters.has('ajaxSingle')) continue;
    for (const [key, value] of parameters) {
      if (key === value) found.push(key);
    }
  }
  return found;
}

function exactlyOne(candidates: readonly string[]): string | null {
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return null;
  if (unique.length > 1) {
    throw new Error(`priming response has ambiguous AJAX trigger controls: ${unique.join(', ')}`);
  }
  return unique[0]!;
}

/**
 * Identifies the action source the search POST must name, structurally rather than
 * by a known id — and, when the form offers both kinds, prefers the submit defined
 * inside a `<script>` component over one wired to an `onclick` attribute.
 *
 * That preference is not a style choice, it is what the live page requires. On TRF5
 * the visible button reads
 * `onclick="return executarReCaptcha();;A4J.AJAX.Submit(...)"` — its A4J call sits
 * AFTER a `return` and is unreachable. A browser goes through `executarReCaptcha()`
 * to `executarPesquisa()`, which the `<script id="fPP:j_id244">` component defines,
 * so `fPP:j_id244` is what actually reaches the server. Measured 2026-09-05:
 * posting `fPP:j_id244` returns 35668 bytes of results; posting the button's
 * `fPP:searchProcessos` returns 2874 bytes that re-render only an empty
 * rich-messages panel, identical for a single day and for a whole month.
 *
 * Two earlier readings of this page were wrong and BOTH failed silently — a fixture
 * that invented a self-referential hidden input, then a scan that only looked at
 * `onclick` and picked the button. Neither raised an error; each searched nothing
 * and reported a complete, empty run. Hence the ambiguity throw below: a structural
 * rule always finds something, so quietly choosing between candidates is the failure
 * mode worth preventing, not the absence of one.
 */
function findSubmitTriggerId($: cheerio.CheerioAPI, form: ReturnType<cheerio.CheerioAPI>): string {
  const fromScripts: string[] = [];
  form.find('script').each((_, el) => {
    fromScripts.push(...collectSelfReferentialSubmits($(el).text()));
  });

  const fromOnclick: string[] = [];
  form.find('[onclick]').each((_, el) => {
    fromOnclick.push(...collectSelfReferentialSubmits($(el).attr('onclick') ?? ''));
  });

  const trigger = exactlyOne(fromScripts) ?? exactlyOne(fromOnclick);
  if (!trigger) throw new Error('priming response missing AJAX trigger control');
  return trigger;
}

export function parsePrimingPage(body: Uint8Array): SessionState {
  const $ = cheerio.load(decodeLatin1(body));
  const form = $('form#fPP, form[name="fPP"]').first();
  if (form.length === 0) throw new Error('priming response missing form fPP');

  const action = form.attr('action');
  if (!action) throw new Error('priming response missing form action');

  // Present only while the container does not yet know the client accepts
  // cookies: verified live on 2026-09-05, a cold request URL-rewrites
  // `;jsessionid=` into the action and the very next request, carrying the
  // JSESSIONID cookie, returns a bare action. Our transport keeps a cookie jar,
  // so absence is the NORMAL case after the first priming — not a failure.
  // The session identity lives in that jar; this field is diagnostic only.
  const jsessionidMatch = /;jsessionid=([^"'?&]+)/.exec(action);

  const viewState = form.find('input[name="javax.faces.ViewState"]').attr('value');
  if (!viewState) throw new Error('priming response missing javax.faces.ViewState');

  const triggerId = findSubmitTriggerId($, form);

  // Data-entry controls only. Buttons are excluded deliberately: `search.ts`
  // resolves each semantic field by substring match over this list, so every
  // non-field name here is one more chance to resolve a search field to a
  // control that is not one.
  const fieldNames: string[] = [];
  form
    .find(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="image"]):not([type="reset"]), select',
    )
    .each((_, el) => {
      const name = $(el).attr('name');
      if (name) fieldNames.push(name);
    });

  return {
    jsessionid: jsessionidMatch?.[1] ?? null,
    viewState,
    fieldNames,
    triggerId,
    actionUrl: action,
  };
}
