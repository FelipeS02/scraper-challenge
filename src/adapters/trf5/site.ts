import { classifyHttpStatus } from '../../engine/http-status.js';
import { describeFailureReason } from '../../engine/failure-reason.js';
import type {
  DiscoverResult,
  DocumentFetchOutcome,
  HttpTransport,
  SitePort,
  StoredDocument,
} from '../../engine/ports.js';
import type { FetchOutcome, WorkUnit } from '../../engine/types.js';
import { fetchDetail } from './detail.js';
import { fetchDocument as fetchDocumentFile } from './documents.js';
import { extractPartyNames, NameHarvester } from './name-probes.js';
import { summarizeDocumentsGrid, type DocumentRow } from './parsing/detail-page.js';
import { parseResultFragment } from './parsing/result-fragment.js';
import type { TrfPayload } from './schemas/payload.js';
import { buildResponseView } from './schemas/response-view.js';
import { classifyValidity } from './schemas/validity-chain.js';
import { primeSession, type SessionState } from './session.js';
import { search, type SearchCriteria } from './search.js';
import type { TraversalCursor } from './traversal.js';

/**
 * Constants declared by the TRF5 adapter and consumed by core coverage-accounting
 * (trf5-adapter spec, "Declared Result-Page Cap and Item Identity Key").
 */
export const resultPageCap = 30;
export const identityKeyName = 'processNumber';

export function itemId(item: TrfPayload): string {
  return item.processNumber;
}

export function documentId(doc: DocumentRow): string {
  return doc.documentId;
}

export function sourceUrl(item: TrfPayload): string {
  return item.sourceUrl;
}

/** `2026-09-01` (ISO, the engine/traversal-cursor format) -> `01/09/2026` (the search form's format). */
function toBrDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export interface TRF5SiteConfig {
  readonly transport: HttpTransport;
  readonly primingUrl: string;
  /**
   * Shared with `TraversalConfig.harvester` by the composition root
   * (trf5-name-substring-axis task 1.3) — this is where it gets WRITTEN,
   * from every row's parsed parties column. Defaults to a fresh, empty
   * harvester so a caller that never wires one still runs unaffected.
   */
  readonly harvester?: NameHarvester;
  /** Per-row recovery uses the same cap/backoff selected for host defects by composition. */
  readonly rowRetry?: {
    readonly cap: number;
    readonly backoff: (attempt: number) => number;
    readonly sleep: (ms: number) => Promise<void>;
  };
}

const DEFAULT_ROW_RETRY = {
  cap: 2,
  backoff: () => 0,
  sleep: () => Promise.resolve(),
};
const MAX_UNRESOLVED_REASON_LENGTH = 256;

function sanitizeUnresolvedReason(outcome: FetchOutcome<unknown>): string {
  const text = `${outcome.kind}:${describeFailureReason(outcome)}`;
  const printableText = Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');

  return printableText.replace(/\s+/g, ' ').trim().slice(0, MAX_UNRESOLVED_REASON_LENGTH);
}

/**
 * The real `SitePort<TrfPayload, DocumentRow>` implementation, composing every
 * standalone module built through S3/S4a/S4b/S4c: session priming, `search.ts`'s
 * AJAX POST, `parsing/result-fragment.ts`'s row extraction, `detail.ts`'s per-row
 * detail fetch, and `documents.ts`'s document fetch/decode path. Holds the current
 * primed session as internal, mutable state -- invisible to the engine except as
 * the `sessionExpired`/`reprimeAndRetryNow` `FetchOutcome` cycle (design.md D1).
 */
export class TRF5Site implements SitePort<TrfPayload, DocumentRow> {
  readonly resultPageCap = resultPageCap;
  readonly identityKeyName = identityKeyName;

  private session: SessionState | null = null;
  private readonly harvester: NameHarvester;
  private readonly rowRetry: NonNullable<TRF5SiteConfig['rowRetry']>;

  constructor(private readonly config: TRF5SiteConfig) {
    this.harvester = config.harvester ?? new NameHarvester();
    this.rowRetry = config.rowRetry ?? DEFAULT_ROW_RETRY;
  }

  itemId(item: TrfPayload): string {
    return itemId(item);
  }

  documentId(doc: DocumentRow): string {
    return documentId(doc);
  }

  sourceUrl(item: TrfPayload): string {
    return sourceUrl(item);
  }

  private async ensureSession(): Promise<SessionState> {
    this.session ??= await primeSession(this.config.transport, this.config.primingUrl);
    return this.session;
  }

  async discover(
    unit: WorkUnit<unknown>,
  ): Promise<FetchOutcome<DiscoverResult<TrfPayload, DocumentRow>>> {
    const cursor = unit.cursor as TraversalCursor;
    const session = await this.ensureSession();

    const criteria: SearchCriteria = {
      // exactOptionalPropertyTypes forbids writing an explicit `undefined`
      // onto an optional field, so a null facetValue omits the key entirely.
      ...(unit.facetValue !== null ? { classeJudicial: unit.facetValue } : {}),
      // Present only for a frontier seed search (core-frontier-crawl, "Seed
      // Harvesting and Prioritization") — the same exact-match documentoParte
      // field the Complete Search Form Field Set already declares (S3), never
      // a new field this run adds to the request.
      ...(cursor.seedCpf !== undefined ? { documentoParte: cursor.seedCpf } : {}),
      // Present only at partition level 3 (trf5-adapter spec, "Discover
      // applies the cursor's name probe to nomeParte") — the traversal's own
      // name-substring probe, never a new field this run invents.
      ...(cursor.nameProbe !== undefined ? { nomeParte: cursor.nameProbe } : {}),
      dataAutuacaoInicio: toBrDate(cursor.dateFrom),
      dataAutuacaoFim: toBrDate(cursor.dateTo),
    };
    const { session: nextSession, response } = await search(
      this.config.transport,
      this.config.primingUrl,
      session,
      criteria,
    );
    this.session = nextSession;

    // Transport-boundary precedence (design.md "Validity chain", case 6): a
    // 429/5xx status is protocol truth, checked before any site-content
    // classification — never a replacement for it (S5g). Without this check
    // a 429's empty body parses as a genuine zero-row result, never as the
    // rate-limit signal it actually is.
    const statusOutcome = classifyHttpStatus(response.status, response.headers);
    if (statusOutcome) return statusOutcome;

    // The search response's own content-based classification (design.md D7):
    // a session-expiry or host-fault landing page never reaches row parsing.
    // A successful result fragment (with rows, or genuinely empty) matches
    // none of these schemas -- `text/xml` never satisfies their `isHtmlPage`
    // gate -- so it falls through to row parsing below (D12).
    const searchOutcome = classifyValidity(buildResponseView(response));
    switch (searchOutcome.kind) {
      case 'sessionExpired':
      case 'unprimedSession':
        return { kind: 'sessionExpired' };
      case 'hostDefect':
        return { kind: 'hostDefect', reason: 'errorUnexpected.seam with PersistenceException' };
      case 'invalidTokenShell':
      case 'validData':
      case 'unclassified':
        break; // proceed to row parsing
    }

    const fragment = parseResultFragment(response.body);

    // Adaptive name-probe extension (trf5-adapter spec, "Adaptive Name-Probe
    // Extension"): reads only the already-parsed parties column, no request
    // of its own. Runs before the per-row detail loop below so a caller that
    // only cares about coverage (e.g. --max-documents 0) still harvests.
    for (const row of fragment.rows) {
      this.harvester.observe(extractPartyNames(row.parties));
    }

    const items: TrfPayload[] = [];
    const unresolved: { itemId: string; reason: string }[] = [];
    const documentsByItemId = new Map<string, readonly DocumentRow[]>();

    for (const row of fragment.rows) {
      let attempt = 0;
      let detailOutcome: FetchOutcome<TrfPayload>;
      for (;;) {
        detailOutcome = await fetchDetail(
          this.config.transport,
          this.config.primingUrl,
          this.session,
          row.ca,
        );
        if (detailOutcome.kind === 'ok') break;
        if (detailOutcome.kind !== 'hostDefect' && detailOutcome.kind !== 'permanentError') {
          return detailOutcome;
        }
        if (attempt >= this.rowRetry.cap) {
          unresolved.push({
            itemId: row.processNumber,
            reason: sanitizeUnresolvedReason(detailOutcome),
          });
          break;
        }
        attempt += 1;
        await this.rowRetry.sleep(this.rowRetry.backoff(attempt));
      }
      if (detailOutcome.kind !== 'ok') continue;
      const payload = detailOutcome.value;
      items.push(payload);
      // Every document reaches the engine's fetch loop (design.md D14, S5j):
      // `documents.ts`'s `fetchDocument` dispatches on `documentKind`, so a
      // born-digital row now has a real fetch path (the two-step viewer-
      // then-PDF flow) exactly like a legacy row's 302-follow.
      documentsByItemId.set(payload.processNumber, payload.documents);
    }

    return {
      kind: 'ok',
      value: {
        items,
        documentsByItemId,
        count: fragment.count,
        ...(unresolved.length ? { unresolved } : {}),
      },
    };
  }

  fetchDocument(item: TrfPayload, doc: DocumentRow): Promise<FetchOutcome<StoredDocument>> {
    return fetchDocumentFile(this.config.transport, item.processNumber, doc);
  }

  /**
   * Writes the engine-observed fetch outcome back onto the matching document
   * entry, keyed by `documentId` (task 5i.1/5i.2). `documentsGrid` is
   * recomputed from the updated `documents` array in the same step (task
   * 5i.13) — `summarizeDocumentsGrid` now splits by `fetchStatus`, so this is
   * the one place a document's real outcome and the grid's own summary of it
   * can never drift apart. `declaredTotal` is carried over verbatim: it is
   * the grid's own footer count, never re-derived from a fetch outcome.
   */
  withDocumentOutcome(
    item: TrfPayload,
    doc: DocumentRow,
    outcome: DocumentFetchOutcome,
  ): TrfPayload {
    const documents = item.documents.map((row) =>
      row.documentId === doc.documentId
        ? {
            ...row,
            fetchStatus: outcome.fetchStatus,
            byteLength: outcome.byteLength,
            fileName: outcome.fileName,
            contentType: outcome.contentType,
          }
        : row,
    );
    return {
      ...item,
      documents,
      documentsGrid: summarizeDocumentsGrid(documents, item.documentsGrid.declaredTotal),
    };
  }

  /**
   * Re-primes and stores fresh session state, never replaying the caller's
   * request -- the engine's retry loop is what re-issues `discover()` or
   * `fetchDocument()` afterward (`engine/scraper.ts`'s `reprimeAndRetryNow`
   * handling).
   */
  async reprimeSession(): Promise<void> {
    this.session = await primeSession(this.config.transport, this.config.primingUrl);
  }
}
