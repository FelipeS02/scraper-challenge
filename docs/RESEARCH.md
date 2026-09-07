# Site Reconnaissance — TRF5 PJe Public Consultation

Target: `https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/listView.seam`

Every request/response fact below was reproduced with `curl` against the live site on
2026-09-03. Nothing here is inferred from the rendered UI alone; where something is
**not** verified, it says so explicitly.

---

## 1. What the site actually is

A **JSF 1.2 + JBoss Seam + RichFaces (Ajax4jsf)** application. That single fact drives
every design decision in this scraper, because it means:

- There are no REST endpoints and no stable URLs for the result list. The list is
  produced by an **AJAX POST that mutates server-side session state**, then returns an
  HTML fragment.
- Every request depends on a `jsessionid` **and** a `javax.faces.ViewState` token. Lose
  either and the server stops answering with data.
- The DOM element ids are **server-generated** (`j_id162`, `j_id244`, ...) and are not a
  stable contract.

This is why the challenge forbids Puppeteer/Playwright: the interesting part is
reconstructing the JSF conversation by hand, not driving a headless Chrome.

---

## 2. The flow, end to end

### Step 1 — Prime the session

```
GET /pjeconsulta/ConsultaPublica/listView.seam
```

Two things must be harvested from this response:

| What | Where it lives | Observed value |
|---|---|---|
| `jsessionid` | inside the `action` attribute of form `fPP`, not only in the cookie | `...listView.seam;jsessionid=OZZQ...97gxj` |
| `javax.faces.ViewState` | hidden input | `j_id1` |

The `jsessionid` is path-encoded into the form action. Posting to the bare
`listView.seam` URL without it is a different conversation as far as Seam is concerned.

### Step 2 — Search (the AJAX POST)

```
POST /pjeconsulta/ConsultaPublica/listView.seam;jsessionid=<id>
Content-Type: application/x-www-form-urlencoded
```

Body (abridged — every form field must be present, even when empty):

```
AJAXREQUEST=_viewRoot
fPP:numProcesso-inputNumeroProcessoDecoration:numProcesso-inputNumeroProcesso=
fPP:dnp:nomeParte=
fPP:j_id180:nomeAdv=
fPP:j_id189:classeJudicial=
fPP:dpDec:documentoParte=
fPP:Decoration:estadoComboOAB=org.jboss.seam.ui.NoSelectionConverter.noSelectionValue
fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate=01/09/2026
fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate=01/09/2026
fPP=fPP
javax.faces.ViewState=j_id1
fPP:j_id244=fPP:j_id244          <-- the trigger
AJAX:EVENTS_COUNT=1
```

Response is `text/xml` (200) carrying the results panel as an HTML fragment.

**The trigger parameter deserves attention.** The button a human clicks is
`fPP:searchProcessos`, and its `onclick` is `return executarReCaptcha(); ...`. That
function calls `grecaptcha.execute()`; the reCAPTCHA *callback* is what fires the real
a4j submit, and that submit is keyed on a **different** control: `fPP:j_id244`.

Consequence: posting `fPP:j_id244` directly reproduces the search, and the request body
carries **no `g-recaptcha-response` field at all**. The server does not validate a captcha
token. Verified: a clean `curl` session with no captcha interaction returns full results.

### Step 3 — Process detail

Each result row renders as:

```html
<a onclick="openPopUp('Consulta pública',
   '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=<40+ hex>')">
```

`ca` is an opaque per-process token. A plain `GET` on that URL returns the detail page —
**but only inside a primed session** (see the error table below).

> This is the step that looks different from manual browsing. In a browser you click a
> link, a popup window opens, and Seam walks you through a redirect. Over HTTP it is one
> `GET` plus one 302 to follow. The popup is presentation, not protocol.

### Step 4 — Documents

The detail page contains a **list** of documents, not a single one. Each is a link of the
form:

```
/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam
  ?idBin=<n>
  &numeroDocumento=<sha1>
  &nomeArqProcDocBin=<label>
  &idProcessoDocumento=<n>
  &actionMethod=ConsultaPublica/DetalheProcessoConsultaPublica/listView.xhtml
                :processoDocumentoBinHome.setDownloadInstance(row)
```

Following the 302 returns the file directly:

```
content-type: application/pdf
content-disposition: filename="Despacho"
```

Verified on one process (`ca=1278fc7e...`), all four of its documents:

| `idProcessoDocumento` | `idBin` | `nomeArqProcDocBin` | Status | Bytes | Magic |
|---|---|---|---|---|---|
| 12452664 | 12196564 | Despacho | 200 | 19 931 | `%PDF-` |
| 12452668 | 12196568 | Decis%E3o | 200 | 19 970 | `%PDF-` |
| 12452669 | 12196569 | Decis%E3o | 200 | 21 529 | `%PDF-` |
| 12452680 | 12196580 | Decis%E3o | 200 | 22 346 | `%PDF-` |

All four SHA-1 digests differ, so these are four distinct documents, not one file served
four times. A second process (`ca=2cd49f6e...`) exposed two documents (`Acórdão`,
`Despacho`), confirming the count varies per process.

Two traps in that table:

1. **`nomeArqProcDocBin` is percent-encoded ISO-8859-1**, not UTF-8. `%E3` is `ã`
   (`Decisão`), `%F3` is `ó` (`Acórdão`). Decoding it as UTF-8 produces mojibake.
2. **Labels collide.** Three documents in one process are all called `Decisão`. A naming
   scheme built on the label alone silently overwrites files. The stored filename must
   carry the process number and `idProcessoDocumento`.

There is also a whole-process receipt at `reportPDF.seam?idProcessoTrf=<n>`, exposed via
`openPopUp('comprovante', ...)`. Not yet exercised.

### Step 5 — The complete field inventory

The detail page is far richer than the result list, and this is the full set, mapped from a
live page (`ca=b83a8484…`, 122 KB, 8 documents):

| Section | Component id | Fields |
|---|---|---|
| Header | `processoTrfViewView` | `Número Processo`, `Data da Distribuição`, `Classe Judicial` (name + CNJ code), `Assunto` (repeating, hierarchical, each with CNJ codes), `Jurisdição`, `Órgão Julgador Colegiado`, `Endereço`, `Órgão Julgador`, `Processo referência` |
| Active parties | `processoPartesPoloAtivoResumidoList` | participant name, **CPF**, procedural role (`APELANTE`), status; each with nested lawyers carrying name, **OAB number + state**, **CPF** |
| Passive parties | `processoPartesPoloPassivoResumidoList` | same structure (`APELADO`, …) |
| Other interested | `processoParteOutrosInteressadosResumidoList` | same structure |
| Movements | `processoEvento` / `processoEventoPanel` | procedural event history |
| Documents | `processoDocumentoGridTab` | the document list from Step 4 |

Row shape, transcribed from a live page with the personal data replaced by synthetic
values: `NOME COMPLETO DA PARTE - CPF: 000.000.000-00 (APELANTE)` and
`NOME COMPLETO DO ADVOGADO - OAB PE00000-X - CPF: 000.000.000-00 (ADVOGADO)`.

The real values are deliberately not reproduced here. The page carries CPF numbers and OAB
registrations for private individuals, and this document is committed to the repository —
see §6 for the handling rules that follow from that.

Two consequences follow directly from that inventory:

**This page carries CPF numbers — Brazilian personal tax identifiers.** Not just names:
government identity numbers, for private individuals, for both parties and their lawyers.
That escalates the handling obligation well past "public court data". See §6.

**It also supplies OAB registration numbers**, which resolves an earlier dead end. The OAB
search field was rejected as a partition axis because it needs a registration number known
in advance — but the detail pages *are* that source. A frontier crawl can therefore seed
`numeroOAB` + state (an exact-match pair) as well as full names.

One encoding note visible in the same dump: some accented text arrives mojibake'd
(`Substitui��o`) while the rest decodes. The page is ISO-8859-1 and must be decoded as such
at the byte level — decoding as UTF-8, or letting the HTTP layer guess, corrupts the data.

---

## 3. Pagination on the search response: there is none, and the cap cannot be escaped

**Corrected 2026-09-06 (S5h): this section's title and every finding below are scoped to
the search response specifically, not to every response this site returns.** The original
title read "Pagination: there is none, and the cap cannot be escaped" — a true finding about
the search response, generalized past its own scope. Nobody re-ran the same search against
the *detail* page, which is a different response and does paginate. See "The detail page is
a different response, and it does paginate" at the end of this section. Every finding below
about the search response was never wrong and stands unchanged.

This is the part of the challenge phrased as "discover how pagination works", for the search
results list specifically. The honest answer, for that one response, is that it does not
exist.

When a query matches more than 30 processes the server returns:

```html
<div class="alert alert-danger">
  Sua consulta retornou muitos processos e somente os 30 primeiros serão exibidos.
  Por favor, refine sua pesquisa.
</div>
```

and the footer reads `30 resultados encontrados`, with the `Paginação` container rendered
**empty**. The server caps the result set and discards the rest.

Because "no pagination" is a strong claim, every plausible escape hatch was then tested
against the live site. All of them are closed:

| Hypothesis | Test | Result |
|---|---|---|
| A hidden `rich:datascroller` the UI doesn't render | Searched the search response for `datascroller`, `scroller`, `rows=` | **No such component.** Zero matches |
| Sortable columns → sort asc + desc to get two different pages of 30 | Inspected the three `<th>` elements | `sortDiv` containers are rendered but **inert** — no `onclick`, no `href`. RichFaces emits them structurally whether or not sorting is enabled |
| A time component would slice a day into hours | Same day with `00:00–12:00`, `00:00–23:59`, and a one-minute `23:58–23:59` window | **Time is silently ignored.** All three returned the identical saturated 30. The Seam converter parses `dd/MM/yyyy` and discards the rest. **A day is the finest granularity on this axis** |
| A partial process number acts as a prefix filter | `0800` in both `numProcesso` and `processoReferencia` | **Zero results.** The field is an exact-match lookup, not a prefix filter |
| The documented PJe REST API (`/api/v{n}/...`, with `page`/`size`/`filter`/`order`) | Probed 8 candidate paths on the host | **No API is deployed here.** The `503` responses are an OpenShift router catch-all — a nonsense path like `/esto-no-existe-12345` returns the same page ("The host exists, but doesn't have a matching path"). Only `/pjeconsulta/*` is served. The API standards describe PJe's modern microservices; this instance runs only the legacy JSF app |
| The OAB state `<select>` (27 enumerable values) as a partition axis | Ran the saturated day filtered by PE, CE, AL and SP, then compared result sets by SHA-1 of the sorted `ca` tokens | **The state select alone is ignored.** No-filter and `SP` (outside the 5th Region entirely) returned the *identical* 30 processes — same hash, `b72d0376cf3b`. Adding `numeroOAB=12345` returned 0, so the state only qualifies a specific lawyer registration number, which is exact-match and must be known in advance |

One further constraint discovered while testing: **the POST requires the complete form
field set.** Omitting fields does not mean "no filter" — the search returns zero results.
Every field must be present, even when empty.

### The consequence

A saturated single day is not hypothetical: `03/09/2026` alone returns 30 with the cap
warning. Since a day cannot be subdivided on the date axis and no other lever above works,
**complete coverage of a saturated day is not achievable through this interface.** The
scraper's obligation is therefore to report the gap honestly, never to imply completeness
it cannot deliver.

### The second axis that does work: judicial class

Most remaining fields are exact-match (process number, CPF/CNPJ, OAB registration) or free
text that must be known in advance (party name, lawyer name) — none of them partitions an
unknown result set. **Judicial class is the exception, and it is the one that matters.**

Two properties make it usable where the OAB state was not:

**1. The full catalogue is enumerable in a single request.** The `rich:suggestionbox`
behind the field can be queried directly:

```
POST .../listView.seam;jsessionid=<id>
AJAXREQUEST=fPP:j_id189:sgbClasseJudicial
fPP:j_id189:classeJudicial=<anything>
fPP:j_id189:sgbClasseJudicial=fPP:j_id189:sgbClasseJudicial
fPP=fPP & javax.faces.ViewState=j_id1 & AJAX:EVENTS_COUNT=1
```

It returns **132 classes with their CNJ codes** (`AÇÃO CIVIL COLETIVA`, `AÇÃO PENAL -
PROCEDIMENTO ORDINÁRIO` / 283, … `TUTELA CAUTELAR ANTECEDENTE`). The `minChars: 3`
filtering is client-side only: the server ignores the typed prefix and returns the whole
catalogue, so one request enumerates every value. No prefix brute-forcing is needed.

**2. It genuinely filters, and every process has one.** On the saturated day `03/09/2026`:

| Filter | Results | Saturated | Set hash |
|---|---|---|---|
| none (control) | 30 | yes | `87402dd14bb1` |
| `APELAÇÃO CÍVEL` | 30 | yes | `ccaa4f07c73d` |
| `HABEAS CORPUS CRIMINAL` | 0 | no | *(empty)* |

The **different** set hash is the proof — contrast the OAB state test above, where the hash
was identical to the control and the filter was therefore being ignored. Judicial class is
also mandatory on every process, unlike a lawyer registration, so partitioning by it does
not systematically exclude a subpopulation.

### The consequence, corrected

The traversal is therefore **two-dimensional: date window × judicial class**, raising the
theoretical ceiling from 30 per day to 132 × 30. That is not unlimited — `APELAÇÃO CÍVEL`
alone still saturates on a single day — but it shrinks the unreachable set enormously
instead of accepting it.

A gap remains only where one class on one day still exceeds 30, and that residue is what
gets reported. The scraper still never claims completeness it cannot demonstrate; it just
has far less to apologise for.

One further observation from these runs: the control's set hash changed between two
searches minutes apart (`b72d0376cf3b` → `87402dd14bb1`). **The data is live and moving.**
A window marked complete is complete *as observed at that time*, which is exactly why the
checkpoint records an observation timestamp rather than an absolute claim.

### Measured partition yield

The yield of each partition axis was measured end to end against the live site on
`03/09/2026` (a saturated day). All counts are unique `ca` tokens after deduplication.

| Strategy | Requests | Unique processes |
|---|---|---|
| Base (no filter, capped) | 1 | 30 |
| Date × judicial class (union of all 132 classes) | ~132 | 128 |
| Date × class × name-substring (on the residual saturated classes) | +~50 | 191 |

Two findings shape the design of the third axis:

- **The class axis already does most of the work.** Only 19 of 132 classes had any results
  that day, and only **2 still saturated at 30** (`APELAÇÃO CÍVEL`, `AGRAVO DE INSTRUMENTO`).
  The date × class sweep is not broken — the name axis only has to attack that residue.
- **A third axis exists and it works: `nomeParte` / `nomeAdv` are literal, case-insensitive
  SUBSTRING filters** (not prefix, not token-AND; verified: a mid-name fragment matches, a
  real-token-wrong-order string returns 0), requiring at least two space-separated tokens.
  They compose with both the date window and the class filter. On the two residual saturated
  classes a name-substring sweep fully desaturated them (0 of 28 probes still hit 30):
  `APELAÇÃO CÍVEL` 30 → 85, `AGRAVO DE INSTRUMENTO` 30 → 38.

**Static dictionary vs adaptive extension.** Two ways to choose the substring probes were
compared on the dense cell `APELAÇÃO CÍVEL`. A fixed dictionary of common PT-BR surname
bigrams reached 85 unique in 29 requests. An adaptive strategy — probes ranked by frequency
across the party names already visible in the returned rows, stopped on yield decay — reached
**95 unique in 22 requests** (−24% requests, +12% coverage), because it spends requests on
the fragments that actually dominate that cell (institutional litigants: INSS, CEF, conselhos,
municípios) instead of a blind surname list. The result rows carry the party names, so the
filter's own output seeds the next probe. This is heuristic coverage, not provable
completeness — the honest-gap reporting stands; the residue simply shrinks.

The result rows themselves already carry the parties column
(`<PARTE A> e outros (N) X <PARTE B>`), which is what makes the adaptive seed possible with
no extra detail-page fetch.

### Bounded live acceptance attempt (2026-09-06): blocked before any A/B could run

**This does not replace the `2026-09-03` measurements above** — those numbers stand as the
record of what the class axis alone recovers on that day. This is a separate, later
acceptance attempt for the shipped `trf5-name-substring-axis` implementation, and it never
reached the point of producing a comparable number.

The plan was a controlled same-day A/B — run the identical date twice against a fresh
`output/` each time, `--max-name-probes 0` (class-only baseline) then `--max-name-probes 30`
(axis on) — rather than trusting the `2026-09-03`/`128` constant against an unrelated date,
since that number only ever meant anything for that specific day.

**Every attempt failed before either half of the A/B could run**, on the SAME cause across
four different dates:

| Date tried | Result |
|---|---|
| `2026-09-03` (1st attempt, before a classification fix) | `discover()` failed: one row's detail page returned a 302 to `errorUnexpected.seam`, classified as `unclassified` (a real gap, since fixed) |
| `2026-09-03` (2nd attempt, after the fix) | `discover()` still failed: the SAME row now correctly classifies as `hostDefect` ("errorUnexpected.seam with PersistenceException"), but the fix was never meant to make a permanently-broken row succeed — it only makes the failure honest |
| `2026-09-01`, `2026-09-02`, `2026-09-04` (bounded 3-candidate retry, ordinary weekdays, no Brazilian holiday) | Each failed identically: at least one process among that day's unfaceted 30-row result set returns `errorUnexpected.seam with PersistenceException` on every retry |

**The finding**: `TRF5Site.discover()` fails its ENTIRE result set on a single row's
detail-fetch failure (`site.ts`'s own comment: "a single row's detail-fetch failure fails the
whole discover() call rather than silently dropping the row"). Hitting this on **every one of
four dates tried** — not one unlucky process on one unlucky day — indicates this is not a rare
edge case for the scraper's current operating conditions; it is a live, present blocker for
*any* full day-level sweep with detail fetching enabled, independent of the name-substring
axis this change adds. The class axis (`APELAÇÃO CÍVEL`/`AGRAVO DE INSTRUMENTO` etc.) itself
never gets exercised on any of these dates today, because the very first, unfaceted
`discover()` call never completes.

**Root cause, isolated (2026-09-06, decisive, read-only diagnostics — throwaway scripts, not
committed):** two competing hypotheses produced the identical symptom above and had to be told
apart directly, not inferred from the aggregate pattern:
- **H1 — scattered broken records.** The corpus itself contains individual processes whose
  detail page unconditionally raises a Hibernate `PersistenceException` server-side; any
  30-row page that happens to include one fails, regardless of what the client does.
- **H2 — a client-side Seam conversation bug.** The scraper's OWN detail-fetch sequence
  poisons the JBoss Seam conversation (the `cid` in `errorUnexpected.seam?cid=<n>` is a Seam
  conversation id), so the Nth detail fetch of a session dies regardless of which process it
  names.

**Test A (decisive): fetch the known-failing row as the FIRST request of a brand-new session.**
A completely fresh `AxiosTransport` (new cookie jar, new priming GET, new `jsessionid`, new
ViewState) searched `03/09/2026`, then fetched row index 1
(`0001647-83.2005.4.05.8308`) as its very FIRST detail request — before row 0, before
anything else that could poison a conversation:

```
status=302 location=https://pjett.trf5.jus.br/pjeconsulta/errorUnexpected.seam?cid=109060
```

It failed identically, with the same `PersistenceException` shape, as the FIRST request of a
session that had never made a prior detail fetch. **This directly falsifies H2**: there was no
earlier conversation for this request to inherit or poison. The fault travels with the
process, not with request order or session state.

**Test B: cross-date first-failure index, sequential row order, fresh session per date.**

| Date | First-failing index | Process number | `cid` |
|---|---|---|---|
| `2026-09-03` | 1 | `0001647-83.2005.4.05.8308` | `107039` |
| `2026-09-02` | 1 | `0820320-27.2019.4.05.8300` | `107049` |

Read in isolation this table's "same low index, different process numbers" shape is the
pattern that would suggest H2 — but Test A already ran the direct causal experiment and
falsified H2's required mechanism for exactly the `2026-09-03` row this table also names: it
fails with zero prior requests in its session, so it cannot be an artifact of request order.
**H1 stands: these are two genuinely different, individually broken records, one per date**,
and Test B's own `cid` values (`107039`, `107049`, and Test A's separate `109060` — all
close in magnitude despite being three unrelated sessions run seconds apart) confirm `cid` is
a server-global, per-request Seam conversation counter, not a session-scoped value our
client could corrupt. The observation that failure has consistently landed near index 1
across the dates sampled so far is a real, currently unexplained pattern in the corpus itself
(possibly related to result ordering correlating with record age or filing batch) — but it is
a property of the SITE's data, not of the scraper's session handling, and is not investigated
further here (out of scope for this diagnostic round).

**Correction to the earlier reading in this subsection**: the initial framing above ("at least
one process... on every date tried... indicates a live blocker") was written before this
causal isolation and left the cause ambiguous between H1 and H2. It is now confirmed as H1 —
individually broken source records, not a scraper-side session/conversation defect — so no
correction is needed to the recommended fix (a `discover()` partial-row-tolerance change is
still the right target), only to the certainty of the diagnosis, which is now direct rather
than inferred.

**Consequence for this change**: the name-substring partition level (`split()`'s L3/L4
cascade, `NameHarvester`, `nomeParte` mapping) is fully implemented and unit-tested — see
`apply-progress.md` — but could not be exercised end-to-end live in this apply batch. A
`discover()` partial-row-tolerance fix (skip/record a permanently broken row and continue with
the rest of that page) is a separate, larger `trf5-adapter`/`core-scraping-engine` change,
explicitly out of scope for this attempt.

So a complete sweep is not a pagination problem, it is a **partitioning** problem. The only
usable lever is the filing-date range (`dataAutuacaoInicio` / `dataAutuacaoFim`):

```
scan(from, to):
    results = search(from, to)
    if len(results) < 30:        # window fully observed
        yield results
    else if from == to:          # single day still saturated -> cannot split further
        yield results + saturation warning
    else:
        mid = midpoint(from, to)
        scan(from, mid); scan(mid+1, to)
```

The `from == to` branch matters: a single day can hold more than 30 filings, and no
further subdivision is possible on this axis. That case must be recorded as a known
coverage gap rather than silently treated as complete. Secondary axes (judicial class,
OAB state) exist if it ever needs to be narrowed further.

### The detail page is a different response, and it does paginate

Measured 2026-09-06, against a real process (`0800293-46.2016.4.05.8100`, 24 documents) that
a live-scraped run had already shown extracting only 14 rows from page 1. The documents grid
on the *detail* page — never searched by the check above, which only ever looked at the
search response — carries its own footer, its own row count, and its own pagination widget.

**Two different pagination widgets exist on the same detail page, not one.** The two
parties-list tables each render a `rich:datascroller`
(`new Richfaces.Datascroller('<tableId>:<footerFormId>:<scrollerId>', ...)`) in their
`<tfoot>`, `display: none` because each fits on one page — present in every detail-page
fixture this repository already carries. **The documents grid uses a different widget
entirely: a `rich:inputNumberSlider`** (`new Richfaces.Slider('<sliderId>', {'minValue':
'1', 'maxValue':'<pageCount>', ...})`), declared in its own `<form>` sibling to the grid's
table, not nested inside it. Design decision D13, written before this measurement, assumed
every scroller on the page shared the Datascroller shape; that assumption was an inference
from the parties-list markup, never re-verified against an actually-paginated grid until
this capture corrected it.

The slider's `onchange` handler embeds its own `A4J.AJAX.Submit(<formId>, event, {...})`
call as a JS string literal (its quotes arrive backslash-escaped in the raw markup, since it
nests inside the slider constructor's own single-quoted config — a different escaping shape
than the parties-list scrollers' plain `<script>`-body submits). Requesting page N means
POSTing the pager's own `<form>`'s complete hidden-field set (harvested verbatim, never
hand-picked) with the slider's own value field set to N and the submit's self-referential
trigger parameter added — the same "harvest, don't guess" discipline this document already
applies to the search trigger (§2 Step 2) and the class-suggestion box (below).

The grid's own footer (`<span class="pull-right text-muted">N resultados
encontrados</span>`, the table's immediate next sibling) reports the true total regardless
of how many pages have been read — 24 on both page 1 and page 2 of this capture — so a
shortfall between rows read and total declared is always measurable, never inferred.

**The consequence.** A scraper that reads only page 1 of the documents grid silently drops
every document past the page-size boundary — exactly the defect a live run exposed. Every
grid on the detail page (parties, movements, documents) can in principle paginate; only the
documents grid's pagination is fixed here (S5h), because it is the one a live process was
observed to actually need. Whether the parties/movements grids ever exceed one page in
practice is unmeasured.

---

## 4. Alternative access paths, and why scraping remains the answer

Before accepting the JSF form as the only route, the official PJe/CNJ documentation was
reviewed and every documented programmatic interface was probed against this host.

| Path | Documented as | Verified on `pjett.trf5.jus.br` | Verdict |
|---|---|---|---|
| **MNI 2.2.2** (`IntercomunicacaoService`) | CNJ-mandated SOAP interoperability standard | **Live.** `/pjeconsulta/intercomunicacao?wsdl` and `/pje/intercomunicacao?wsdl` both return `200 text/xml` (34 638 B), namespace `http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/`, six operations: `consultarProcesso`, `consultarAvisosPendentes`, `consultarTeorComunicacao`, `consultarAlteracao`, `confirmarRecebimento`, `entregarManifestacaoProcessual` | **Requires credentials.** `consultarProcesso` takes `idConsultante`/`senhaConsultante` issued through tribunal accreditation (*Termo de Adesão*). An anonymous call returns `200` with `<sucesso>false</sucesso>` / "Falha no login. Acesso não Autorizado!" — the service works and the gate is real, not a misconfiguration |
| **DataJud** (CNJ national database) | Elasticsearch proxy at `api-publica.datajud.cnj.jus.br`, index `api_publica_trf5` | Reachable, returns real TRF5 records | **Different data, different host.** Carries case metadata and full movement history with no 30-cap, but the schema has **no `partes` and no documents**. It also mirrors TRF5 *production*, not this test instance |
| **PDPJ-Br services** | Centrally hosted at CNJ, all `Bearer`-token gated via `sso.cloud.pje.jus.br` | Not applicable — not tribunal-hosted | **Requires credentials**, and no PDPJ service performs public process consultation |
| **PJe REST** (`/<module>/api/v{n}/...`) | Path convention documented; no endpoint designated public | Probed 12 candidate paths across both contexts — all `404` or `503` | **Not deployed here** |

**DataJud was also tested as a completeness oracle, and rejected.** Two process numbers
scraped from `pjett` were queried against `api_publica_trf5`:
`0003006-47.2023.4.05.8305` returned 2 hits with full class data, while
`0801110-38.2024.4.05.8001` returned **0**. The datasets overlap partially and the
discrepancy is unexplained — the test instance is not a clean mirror of production. DataJud
is therefore usable as a weak corroborating signal but **cannot certify coverage**; treating
it as ground truth would manufacture false confidence.

Two corrections to earlier assumptions came out of this review:

- **The host serves two contexts, not one.** `/pje/*` is deployed alongside `/pjeconsulta/*`;
  `GET /pje/` returns a 125-byte meta-refresh to `login.seam`, and unknown paths under it
  return a branded PJe `404`, not the OpenShift `503`. The "503 means not deployed"
  heuristic still holds everywhere outside those two contexts.
- The consulta-pública 30-result cap has **no documentary backing** anywhere in CNJ or PJe
  material. It remains a purely empirical finding.

**Conclusion.** MNI is the interface that would make this trivial, and it is genuinely
present — but it is gated behind tribunal accreditation, which is an institutional process,
not a technical obstacle to route around. DataJud is real and useful, but it holds neither
party names nor documents and does not cover this instance. The legacy JSF form is
therefore the only route to the data this scraper needs, which is what the challenge asks
for anyway.

## 5. Error catalog

The single most important operational finding:

> **This site answers `200 OK` for almost every failure.** Status-code-based error
> handling will report success while collecting nothing.

Every row below was reproduced.

| # | Scenario | HTTP | How it actually manifests | Handling |
|---|---|---|---|---|
| 1 | Invalid/forged `ca` token | **200** | 28 KB page shell, zero document links (a valid detail page is ~84 KB with N links) | Detect by absence of the document table; skip and log |
| 2 | Valid `ca`, **no primed session** | **200** | 302 chain ending at `errorUnexpected.seam?cid=N` | Re-prime session, retry once |
| 3 | Expired/invalid `ViewState` | **200** | `text/xml`, 293 bytes: `<meta name="Ajax-Response" content="redirect">` + `Location: /pjeconsulta/login.seam` | **This is the site's real 401.** Re-prime and replay |
| 4 | Nonexistent `idProcessoDocumento` | **404** | `text/html` error page | The one case with an honest status code. Log as permanent, do not retry |
| 5 | Server-side data fault | **200** | 302 to `errorUnexpected.seam`, body carries `javax.persistence.PersistenceException: could not execute batch` raised from `dtInclusaoDocumentoPublico.xhtml` | Host-side defect, not ours. Bounded retry, then record as failed and continue |
| 6 | Rate limiting | **429** | Declared by the challenge brief; see caveat below | Exponential backoff, honour `Retry-After` when present |

### On case 5

Two of six sampled processes failed this way. The stack trace is a Hibernate batch failure
inside the court's own view — `pjett` is the *training/test* environment. The scraper must
treat a fraction of processes as permanently unreachable and keep going. Retrying forever
would just burn the rate-limit budget on records the server cannot render.

### On case 6 — honest caveat

**A 429 was not reproduced during this reconnaissance.** A bounded probe of 12 requests at
concurrency 6 against the PDF endpoint returned `200` every time, ~1.1 s each, with no
`Retry-After` and no rate-limit headers. The probe was deliberately stopped there rather
than escalated: hammering a court server to force a rate limit is not acceptable
reconnaissance.

The challenge brief states 429s occur on PDF downloads, so the retry path is built and
must be **exercised against a fake/stubbed transport in tests** rather than against the
live site. Two unknowns remain until one is observed in the wild:

- whether the response carries `Retry-After` (design honours it if present, falls back to
  computed backoff if absent);
- whether the limit is per-session or per-IP (a per-IP limit means rotating sessions does
  not help, so the design assumes per-IP and throttles globally).

### Retry policy

| Class | Examples | Action |
|---|---|---|
| Transient, backoff | 429, 502/503/504, socket timeouts | Exponential backoff with jitter, `Retry-After` wins when present, capped attempts |
| Session-recoverable | Cases 2 and 3 | Re-prime session, replay once, then demote to failed |
| Permanent | 404, malformed `ca` | No retry, record and move on |
| Host defect | Case 5 | One or two attempts, then record and move on |

Anything that exhausts its attempts is written to a failure ledger with enough identity
(`ca`, `idProcessoDocumento`, date window) to be replayed later without re-scraping
everything.

---

## 6. Handling obligation: this is personal data

The detail pages carry **names, procedural roles and CPF numbers** — Brazilian personal tax
identifiers — for private individuals, plus OAB registrations and CPFs for their lawyers.
Resolução nº 121 of the CNJ makes this information publicly consultable, and the portal
already withholds cases under *segredo de justiça*. But "publicly consultable, one case at a
time" and "bulk-collected into a dataset" are different acts with different consequences,
and the second one is what a scraper performs.

The rules this repository follows:

1. **Scraped output is never committed.** `.gitignore` excludes `output/`, `data/`, `pdfs/`
   and `logs/`. The repository ships the code; the data stays on the machine that ran it.
2. **No sample or fixture may contain a real CPF, a real party name, or a real document.**
   Test fixtures are synthetic or redacted.
3. **Nothing is republished.** The scraper writes to local disk. It has no upload path, and
   it should not grow one.
4. The default run is bounded (`--max-pdfs`), which also limits how much personal data a
   demonstration run accumulates in the first place.

None of this is legal advice, and it does not make the collection lawful by itself — it is
the minimum a technically competent implementation owes the people in the records.

## 7. Consequences for the implementation

1. **Detect failure by content, not status.** Every response passes a validity predicate
   before it is treated as data.
2. **Never hardcode `j_id*` ids.** Parse the form on every run: field names, the trigger
   control, the action URL and the ViewState. They drift between renders and releases.
3. **Session lifecycle is a first-class concern**, not an HTTP detail. Priming, detecting
   the `login.seam` redirect, and re-priming belong in one place.
4. **Traversal is two-dimensional — date window × judicial class** — and the residue that
   still saturates must be reported, not hidden. The 132-class catalogue is fetched once
   per run from the suggestion endpoint, never hardcoded.
5. **Filenames must be derived from stable ids**, with the label decoded from
   ISO-8859-1 — never from the label alone.
6. **Throttle globally and assume per-IP limits.** Politeness delay between requests,
   modest concurrency ceiling.

## 8. Not yet verified

- ~~How much of a saturated day the 132-class partition actually recovers in practice.~~
  **Measured 2026-09-04 (see §3, "Measured partition yield").** On `03/09/2026` the class
  axis lifts a saturated day from 30 to 128, leaving 2 residual saturated classes; a
  name-substring sub-partition then lifts those to 191 total.
- Whether a process can carry more than one judicial class (which would mean the class
  partition double-counts rather than partitions). Deduplication by process number makes
  this harmless either way, but it is worth confirming.
- `reportPDF.seam?idProcessoTrf=<n>` (whole-process receipt) has not been exercised.
- The `processoEvento` movement history was located but its row structure is not yet
  mapped field by field; everything else in §2 Step 5 is.
- Live 429 semantics, as discussed above.
- Whether `ca` tokens remain valid across sessions or expire with the conversation.

---

*Method note: the exact a4j POST body was recovered from a Jam recording of a manual
browsing session, which made the full field set visible without guesswork. Everything
after that was reproduced independently with `curl`.*

---

## 9. Reconciliation — what the first live runs actually returned (2026-09-05)

S5e wired a real transport and a real composition root for the first time. Every live
run since has driven out a defect in a module this document, or an earlier slice, had
already marked "verified" or "complete" — because a fixture built to match this
document's prose is not the same thing as a fixture built from a captured response.
This section corrects every prose claim the live traffic actually contradicted.
Nothing below is guesswork: each row was reproduced by running the production adapter
code (never a hand-written script) against the live host and inspecting the raw bytes.

### 9.1 The search trigger is a `<script>` component, not a hidden-input `onclick`

§2 Step 2 names `fPP:j_id244` as "the trigger" but describes it only as "a different
control", which reads like a hidden input. It is not: the visible button's own
`onclick` is unreachable (`return executarReCaptcha();;A4J.AJAX.Submit(...)` — the
`A4J.AJAX.Submit` call sits after a `return` and never runs), and the control that
actually fires the search is defined inside a `<script id="fPP:j_id244">` element, not
an attribute on any visible control. A structural scan has to look inside `<script>`
bodies for a self-referential `A4J.AJAX.Submit(...,{'parameters':{'x':'x'}})` call and
prefer it over any `onclick`-based candidate — scanning `onclick` attributes alone
finds the button and silently searches nothing (fixed in `c3d17a5`; see
`session.ts`'s `findSubmitTriggerId`).

### 9.2 The zero-result footer has no number at all

§3 shows the saturated footer as `"30 resultados encontrados"`, which is accurate. It
does not show the OTHER end of that scale: a genuinely empty result set renders the
identical table structure with an **empty** `<tbody>` and a footer reading
`"resultados encontrados"` — no `"0"`, no number of any kind. Treating an absent
number as a parse failure, or assuming a leading digit is always present, both break
on this case (fixed in `135d2e6`).

### 9.3 The detail page is label-keyed, not id-keyed, and every id carries a server-generated prefix

§2 Step 5's component-id table (`processoTrfViewView`, `processoPartesPoloAtivoResumidoList`,
…) is accurate as a list of **ids that exist on the page** — but every one of them
carries a server-generated form prefix (e.g. `j_id146:processoTrfViewView`, never a
bare `processoTrfViewView`), confirming §1's own warning that ids are not a stable
contract. Two consequences follow that this document did not previously spell out:

- **A selector must match the suffix (`[id$=":name"]`), never assume a bare id.**
- **The header's own container cannot be selected as an element at all.** It renders
  as `<form id="j_id146:processoTrfViewView">` nested inside an already-open RichFaces
  tab `<form>`. HTML forbids nested `<form>` elements, and the HTML parsing algorithm
  silently drops a nested `<form>` START tag rather than erroring — so no DOM element
  ever carries that id once the page is parsed, even though the id string is still
  present in the raw markup. Detection of "is this a detail page" has to work on the
  raw text (a regex/substring test), and field extraction cannot scope to "inside the
  header container" at all.

Inside that (non-existent-as-an-element) header, individual fields are **not**
separately-id'd spans (`#numeroProcesso`, `#dataDistribuicao`, …, as an earlier
invented fixture assumed). Every field is a `.propertyView` block —
`.name label` carries the visible Portuguese label text, `.value` carries the value —
and extraction has to walk every `.propertyView` on the page and key off that label
text. Two fields ("Órgão Julgador Colegiado" + "Endereço", and "Órgão Julgador") share
a *blank*-labeled `.propertyView` each, with the real sub-label carried by a `<b>` tag
inside the value instead of `.name label`.

### 9.4 "Assunto" is a flat, sometimes-truncated string — not a nested list

§2 Step 5 lists "Assunto (repeating, hierarchical, each with CNJ codes)" without
showing the markup. The real markup is **one flat string**, hierarchy levels joined by
`" - "`, each with its own trailing `(code)` — never a nested `<ul>`. On at least one
observed process, the site itself truncates the last segment with no closing `")"` at
all (`"...Reforma Agrária (10124"`, no `)`) — a genuine site-side rendering limit, not
a capture artifact. A parser that requires a closing paren silently drops that last
subject's code.

### 9.5 Parties are a flat table; a lawyer is a following sibling row, not a nested list

§2 Step 5 describes lawyers as "nested" under a party, and an earlier invented fixture
modeled that as `<ul class="advogados"><li>`. The real markup has no such nesting: a
party and every lawyer under it are **sibling `<tr>` rows** in the same table body. The
only structural signal distinguishing them is a `<span class="text-bold">` wrapping a
party's line, versus an explicit-but-empty `<span class="">` wrapping a lawyer's line
that directly follows it — a lawyer row belongs to the party row immediately above it.

One data shape the row-parsing regex does not cover: a **CNPJ-identified party** (a
legal entity, e.g. a federal agency) renders as `"NAME - CNPJ: xx.xxx.xxx/xxxx-xx
(ROLE)"`. The existing `CPF:`-only pattern does not match it; the party is still
recorded (whole line as name, `cpf: null`, `role: 'UNKNOWN'`), never dropped, but its
CNPJ is not captured into a dedicated field. Disclosed, not fixed in S5f — no
requirement currently asks for a CNPJ-carrying schema.

### 9.6 Movements are one cell, not two — "date - description" as a single string

§2 Step 5 names `processoEvento` as the movements table but does not show its row
shape. The real row is `tr.rich-table-row` (no `.evento` class anywhere on the page),
one cell holding `"dd/mm/yyyy hh:mm:ss - description"` as a single string, and a second
(usually empty) "Documento" cell. §8's "row structure not yet mapped" is now resolved
for the date/description split; the CNJ code per movement remains unmapped exactly as
§8 already flagged.

### 9.7 The documents grid mixes two unrelated delivery mechanisms

§2 Step 4's document scheme (`?idBin=&numeroDocumento=&nomeArqProcDocBin=&idProcessoDocumento=`,
a 302 straight to a PDF) is confirmed accurate — it is still present on live pages and
is what this scraper fetches. What §2 Step 4 does not mention, because it was not yet
observed: the same documents grid also renders **"born-digital" documents** through a
completely different link, `documentoSemLoginHTML.seam?ca=<hash>&idProcessoDoc=<id>`,
distinguishable by an `<i class="fa fa-external-link">` icon versus the PDF row's
`<i class="fa fa-file-pdf-o">`, and by having `href="#"` (the real target lives only
inside the `onclick`'s `openPopUp(...)` call). Fetching that URL returns **200
`text/html`** — an in-browser rendered document view, complete with an
electronic-signature block.

**Corrected S5j (design.md D14): this view is not a dead end.** Reading it in a
browser (2026-09-06) showed it renders its own `Gerar PDF` command link, whose
`onclick` calls JSF's `jsfcljs` client-side helper to submit a form carrying `ca` plus
a second id, `idProcDocBin` — **not** the `idProcessoDoc` the viewer URL itself
carries. Neither id derives from the other, and `idProcDocBin` appears nowhere on the
detail page (verified against a fixture holding four born-digital rows: zero
occurrences). S5h through S5i (and this file, before this correction) all asserted
this view has "no PDF at all" — a claim reproduced in four places
(`docs/RESEARCH.md`, `parsing/detail-page.ts`'s comment, the `detail-page-valid.html`
fixture header, and design.md's own D14) and never re-tested until now. Retrieval is
a two-step flow: GET the viewer, harvest its own submit contract, then POST it
(`src/adapters/trf5/parsing/document-viewer.ts`, `documents.ts`).

**Measured, live (2026-09-06)**: the POST returns `200 application/pdf` in a single
request, with no redirect. Verified end to end by `pnpm scrape` against process
`0005643-82.2001.4.05.8000`, which wrote all four of its born-digital documents —
3444, 3435, 7181 and 5908 bytes, every one a structurally complete `%PDF-1.4` file.

**A withdrawn finding, kept because the mistake is instructive.** This section
previously recorded a "genuine host-side defect in the training environment's
PDF-generation path", based on a 302 to `errorUnexpected.seam` carrying a
`java.lang.NullPointerException` inside
`br.jus.cnj.pje.view.VisualizarExpedienteAction.imprimirPdf()`, reproduced across
three documents in two processes and unaffected by seven request-shape variants
(`cid` propagation, `idProcessoDoc` in the body, an AJAX "idView" priming submit,
`Referer`/`Origin` headers). **That conclusion was wrong.** The fault was in the
throwaway diagnostic script: it took the viewer URL from a regex over raw HTML and
never decoded `&amp;`, so the viewer GET sent a parameter named `amp;idProcessoDoc`
and the Seam conversation never received `idProcessoDoc` — leaving the
conversation-scoped bean that `imprimirPdf()` dereferences unpopulated. Decoding that
one entity turns the same POST into a PDF. The seven variants never varied the axis
that mattered, so their 100% failure rate measured one shared harness bug, not a host
fault. Production was never affected: `parsing/detail-page.ts` reads the row's
`onclick` through cheerio, which decodes entities. The captured error response is kept
as `__fixtures__/document-viewer-gerar-pdf-host-defect.html` — it is a genuine
`errorUnexpected.seam` page and proves the failure branch this adapter must reject.

A process whose documents are *entirely* born-digital (`0008256-27.2005.4.05.8100` is
one candidate) was previously recorded as yielding zero persisted documents. That is
also withdrawn: born-digital documents are fetchable, so such a process should now
yield its full set. Whether the production court server behaves identically
is unverified and out of scope (RESEARCH §6/§9.11's standing rule: this scraper never
probes a live judicial portal beyond what a bounded, disclosed acceptance run needs).

### 9.8 `pdfs/` was reserved since S1, never wired until S5f

The `.gitignore` entry and README both documented a top-level `pdfs/` output directory
since the very first slice. The actual document sink wired in `main.ts` (S5e) pointed
at `output/documents/` instead — a drift no test caught, because no test exercised a
real document fetch end to end through the composition root before S5f. Fixed in S5f:
`RunDeps` now carries an explicit `pdfsDir`, defaulting to `pdfs/` in the real CLI
entry point.

### 9.9 Saturation-driven subdivision (`split()`) is unproven against real data, and its own class-catalogue fetch looks unreliable live

§3's judicial-class partition (the "second axis") was designed and unit-tested against
`StubTransport`, but S5c never had a live saturated day to subdivide until S5f's
acceptance run. Result: `unit.saturated` fired correctly (resultCount 30, cap 30), but
the follow-up `split()` call returned `null` (no children), so the cell finished
`truncated` rather than `subdivided` — the *reporting* is honest (a coverage gap is
recorded, not hidden), but the subdivision mechanism itself did not fire.

A read-only reproduction (same call shape: prime → prime → search 30 rows → 30 detail
fetches → classes-catalogue POST, all sharing the one cookie-jar session) got a `200
text/xml` response for the classes catalogue, but with only a handful of `<li>`
elements — far short of the documented ~132-entry catalogue — rather than a
recognizable `login.seam` session-expiry redirect. `classes.ts`'s `parseClassCatalogue`
has no content-based validity check at all (unlike every other TRF5 response schema in
this codebase, which all run through `classifyValidity`): it blindly scans the whole
document for `<li>` elements with no scope to the suggestion box's own container, so it
cannot tell "the real catalogue" apart from a handful of unrelated `<li>` elements
elsewhere on whatever page it actually received. The exact live count (a clean `0`) and
the reproduction's count (a nonzero handful) do not match, so the precise mechanism is
not fully pinned down — but the reproduction confirms the catalogue fetch is fragile
under a real, already-aged run session, which is enough to explain an unreliable
`bounded.length`. **Recorded, not fixed** — task 5f.9's explicit instruction, and
consistent with the standing rule that a live discovery is disclosed before it is
chased.

### 9.10 Budget's request count is a logical-operation count, not an HTTP call count

Not a markup discovery, but worth recording alongside the others: `--max-requests`
counts one `recordRequest()` per `discover()` call and one per document fetch — never
the number of actual HTTP round trips either makes internally. `TRF5Site.discover()`
alone can issue 1 search POST + up to 30 detail GETs for a single "request" as the
budget counts it. `--max-requests 12` therefore does not bound the live acceptance
run's actual HTTP traffic to 12 — it bounds the number of *work units and document
fetches* the engine attempts. Observed directly on the acceptance run below; not a new
defect, just a reconciliation of what the flag actually measures.

### 9.11 The 429 mechanism was unreachable in production until S5g — never a live observation, now stub-proven end to end

Not a markup discovery — a defect in this codebase, found by the full-change verify
report and closed by S5g. `FetchOutcome.transient` (the union member the whole
resilience policy is built around) had exactly zero production construction sites:
`retry-policy.ts` and `scraper.ts` both correctly handled it, `rate-limiter.test.ts`
correctly proved `RateLimiter` in isolation, and every test still passed, because
nothing ever built the value those correct consumers were waiting for. A 429 on any of
the three TRF5 request paths (search, detail, document fetch) fell through to
content-based classification instead — on the document path it became a generic
`hostDefect` (bounded per-worker retry only); on search and detail it was worse, since
neither path read `status` at all, so an empty 429 body could even misclassify as a
valid empty result. `engine/http-status.ts` (`classifyHttpStatus`) now runs first on
all three paths, before any content or validity-chain classification.

**Still true, and unchanged by this slice**: as of 2026-09-05, **a 429 has never once
been observed from this host** — not during S1's reconnaissance (§5, "On case 6"), and
not across every live run since, including S5f's full acceptance run against the real
portal. The whole mechanism — classification, the global cooldown, `Retry-After`
precedence, and the failed unit returning to the queue rather than the failure ledger —
is proven exclusively against a stubbed `HttpTransport` and `vi.useFakeTimers()`
(`engine/http-status.test.ts`, the three adapter-level 429-precedence tests in
`site.test.ts`/`detail.test.ts`/`documents.test.ts`, and
`adapters/trf5/global-cooldown.test.ts`'s end-to-end drive through the real `TRF5Site`).
This is not a gap — `core-resilience-policy`'s own "Stubbed-Transport Test Isolation"
requirement mandates exactly this, precisely because provoking a real 429 against a
court's production server is not acceptable reconnaissance (§5, "On case 6").

"Retry-After Precedence" is satisfied for **delta-seconds form only**
(`Retry-After: 5` -> `5000`ms). An HTTP-date value, a negative value, a non-numeric
value, or an absent header all resolve to `null`, deferring to the existing
`retryAfterMs ?? config.backoff(attempt)` fallback already correct in both consumers.
This is a deliberate, disclosed narrowing (S5g task 5g.3): HTTP-date parsing needs the
engine's injected `Clock` to resolve "now" against, and no response ever observed
against this host — real or reconstructed — has carried a `Retry-After` header in any
form. Left as an explicit follow-up, not silently unsupported.
