# TRF5 adapter fixtures

Synthetic HTML/XML captures shaped like real TRF5 PJe responses (session priming, search
AJAX fragments, error pages, class-suggestion catalogue), used only against `StubTransport`
in `src/adapters/trf5/**/*.test.ts`. None of these files is a raw capture from the live
site.

## Personal-data checklist

- [x] No fixture contains a real CPF (Brazilian tax id).
- [x] No fixture contains a real party or lawyer name.
- [x] No fixture contains a real OAB registration number.
- [x] No fixture contains a real `jsessionid`, `ca` token, or process number — every id here
      is a synthetic placeholder invented for these tests.
- [x] No fixture is loaded against a live host — see `stub-transport.ts` and
      `docs/RESEARCH.md` §6 for the handling rules this repository follows.
