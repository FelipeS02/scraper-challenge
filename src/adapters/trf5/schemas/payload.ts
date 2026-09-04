import { z } from 'zod';
import type { DetailPage } from '../parsing/detail-page.js';

/**
 * The full judicial-record payload contract (trf5-adapter spec, "Judicial Record
 * Payload Contract"). This is the final validation gate for a detail fetch: the fast
 * `validData` classification in `validity-chain.ts` only checks header/parties-block
 * presence (D7); this schema is what actually proves the extracted structure is
 * complete before the item is ever written. Property names are English camelCase
 * throughout — the source page's own Portuguese field names never reach here
 * (core-run-control-and-output spec, "English camelCase Property Naming").
 */
const labeledCodeSchema = z.object({ cnjCode: z.string().nullable(), label: z.string() });

const lawyerSchema = z.object({
  name: z.string(),
  oabNumber: z.string().nullable(),
  oabState: z.string().nullable(),
  cpf: z.string().nullable(),
});

const partySchema = z.object({
  name: z.string(),
  cpf: z.string().nullable(),
  role: z.string(),
  status: z.string().nullable(),
  lawyers: z.array(lawyerSchema),
});

const movementSchema = z.object({
  sequence: z.number(),
  occurredAt: z.string().nullable(),
  rawDate: z.string().nullable(),
  description: z.string(),
  cnjCode: z.string().nullable(),
  rawCells: z.array(z.string()),
});

const documentSchema = z.object({
  documentId: z.string().min(1),
  binId: z.string(),
  documentHash: z.string().nullable(),
  label: z.string(),
  downloadUrl: z.string().min(1),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  byteLength: z.number().nullable(),
  fetchStatus: z.enum(['fetched', 'skipped', 'failed']),
});

export const payloadSchema = z.object({
  processNumber: z.string().min(1),
  filingDate: z.string().nullable(),
  caseClass: labeledCodeSchema,
  subjects: z.array(labeledCodeSchema),
  jurisdiction: z.string().nullable(),
  judgingBody: z.object({
    name: z.string().nullable(),
    collegiateBody: z.string().nullable(),
    address: z.string().nullable(),
  }),
  referenceProcessNumber: z.string().nullable(),
  parties: z.object({
    active: z.array(partySchema),
    passive: z.array(partySchema),
    others: z.array(partySchema),
  }),
  movements: z.array(movementSchema),
  documents: z.array(documentSchema),
  // Not part of the spec's documented top-level list — internal plumbing so
  // `SitePort.sourceUrl(item)` can be derived from the item itself (see site.ts).
  sourceUrl: z.string().min(1),
});

export type TrfPayload = z.infer<typeof payloadSchema>;

/** Assembles and validates the final payload; `null` on schema mismatch. */
export function assembleTrfPayload(detail: DetailPage, sourceUrl: string): TrfPayload | null {
  const result = payloadSchema.safeParse({ ...detail, sourceUrl });
  return result.success ? result.data : null;
}
