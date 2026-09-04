import { z } from 'zod';
import type { ResponseView } from './response-view.js';

/**
 * Ordered zod `.safeParse()` chain over a `ResponseView` (design.md D7, trf5-adapter
 * spec "Content-Based Validity Chain") — first match wins. `invalidTokenShell` and
 * `validDetail` are declared but stubbed pending S4 (header/parties-block detection and
 * full payload parsing do not exist yet).
 */
const sessionExpiredSchema = z.object({ isAjaxRedirectToLogin: z.literal(true) });
const unprimedSessionSchema = z.object({
  isErrorUnexpectedPage: z.literal(true),
  hasPersistenceException: z.literal(false),
});
const hostDefectSchema = z.object({
  isErrorUnexpectedPage: z.literal(true),
  hasPersistenceException: z.literal(true),
});

export type ValidityOutcome =
  | { readonly kind: 'sessionExpired' }
  | { readonly kind: 'unprimedSession' }
  | { readonly kind: 'hostDefect' }
  | { readonly kind: 'unclassified' }; // invalidTokenShell/validDetail land in S4

export function classifyValidity(view: ResponseView): ValidityOutcome {
  if (sessionExpiredSchema.safeParse(view).success) return { kind: 'sessionExpired' };
  if (unprimedSessionSchema.safeParse(view).success) return { kind: 'unprimedSession' };
  if (hostDefectSchema.safeParse(view).success) return { kind: 'hostDefect' };
  return { kind: 'unclassified' };
}
