import { z } from 'zod';
import type { ResponseView } from './response-view.js';

/**
 * Ordered zod `.safeParse()` chain over a `ResponseView` (design.md D7, trf5-adapter
 * spec "Content-Based Validity Chain") — first match wins: sessionExpired >
 * unprimedSession > hostDefect > invalidTokenShell > validData. `invalidTokenShell`
 * matches by absence of the detail header/parties block, never by document absence or
 * byte size (design.md D8). Both schemas require `isHtmlPage` so a `text/xml` search
 * fragment — which also lacks a detail block — never matches either.
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
const invalidTokenShellSchema = z.object({
  status: z.literal(200),
  isHtmlPage: z.literal(true),
  hasDetailHeaderBlock: z.literal(false),
  hasPartiesBlock: z.literal(false),
});
const validDataSchema = z.object({
  status: z.literal(200),
  isHtmlPage: z.literal(true),
  hasDetailHeaderBlock: z.literal(true),
  hasPartiesBlock: z.literal(true),
});

export type ValidityOutcome =
  | { readonly kind: 'sessionExpired' }
  | { readonly kind: 'unprimedSession' }
  | { readonly kind: 'hostDefect' }
  | { readonly kind: 'invalidTokenShell' }
  | { readonly kind: 'validData' }
  | { readonly kind: 'unclassified' };

export function classifyValidity(view: ResponseView): ValidityOutcome {
  if (sessionExpiredSchema.safeParse(view).success) return { kind: 'sessionExpired' };
  if (unprimedSessionSchema.safeParse(view).success) return { kind: 'unprimedSession' };
  if (hostDefectSchema.safeParse(view).success) return { kind: 'hostDefect' };
  if (invalidTokenShellSchema.safeParse(view).success) return { kind: 'invalidTokenShell' };
  if (validDataSchema.safeParse(view).success) return { kind: 'validData' };
  return { kind: 'unclassified' };
}
