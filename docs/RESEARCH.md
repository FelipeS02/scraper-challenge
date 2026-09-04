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

## 3. Pagination: there is none, and the cap cannot be escaped

This is the part of the challenge phrased as "discover how pagination works". The honest
answer is that it does not exist.

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

- How much of a saturated day the 132-class partition actually recovers in practice. The
  mechanism is proven; the yield is not measured.
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
