# TRF5 adapter fixtures

HTML/XML fixtures shaped like real TRF5 PJe responses (session priming, search AJAX
fragments, error pages, class-suggestion catalogue, detail pages, document viewer
responses), used only against `StubTransport` in `src/adapters/trf5/**/*.test.ts`. Most
are synthetic; a growing subset is a redacted CAPTURE of a real live response, disclosed
and redacted per each file's own header comment — see the "Personal-data checklist"
below. Either way, no fixture is ever loaded against a live host from a test (task 3.14's
rule) — see `stub-transport.ts` and `docs/RESEARCH.md` §6 for the handling rules this
repository follows.

## Personal-data checklist

- [x] No fixture contains a real CPF (Brazilian tax id).
- [x] No fixture contains a real party or lawyer name.
- [x] No fixture contains a real OAB registration number.
- [x] No fixture contains a real `jsessionid`, `ca` token, or process number — every id here
      is a synthetic placeholder invented for these tests.
- [x] No fixture is loaded against a live host — see `stub-transport.ts` and
      `docs/RESEARCH.md` §6 for the handling rules this repository follows.
