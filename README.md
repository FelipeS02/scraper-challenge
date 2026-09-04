# pje-trf5-scraper

HTTP-only scraper for the TRF5 PJe public process-consultation portal (JSF 1.2 + JBoss
Seam + RichFaces), with 429 backoff and PDF downloads.

## Layout

```
src/
  engine/      payload-generic core: ports, backoff, retry policy, rate limiter, pool
  adapters/    site adapters (trf5/ is the only one)
  infra/       driven adapters: HTTP transport, JSONL storage, logging, clock
  cli/         argument parsing, dry-run forecast, run summary
  main.ts      composition root
```

The seam between `engine/` and everything else is enforced by an ESLint
`no-restricted-imports` rule (see `eslint.config.js`), not by convention alone.

## Testing

Test runner: [vitest](https://vitest.dev).

```
pnpm test           # vitest run
pnpm test:watch     # vitest
pnpm test:coverage  # vitest run --coverage
```

**No real personal data.** This repository is public. No fixture, test, comment, or
committed file may contain a real CPF, a real party name, or a real OAB registration
number. Use synthetic values only.
