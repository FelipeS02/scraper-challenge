# Core Resilience Policy Specification

## Purpose

Site-agnostic retry taxonomy, composable backoff, and rate limiting. Maps a `FetchOutcome`
to a `RetryDecision` and enforces a global cooldown on rate-limit signals. Every behavior in
this domain is verified against a stubbed `HttpTransport` and a fake `Clock` — never the
live site.

## Requirements

### Requirement: FetchOutcome to RetryDecision Mapping
The policy MUST classify every `FetchOutcome` into exactly one of: `transient`
(429/5xx/timeout), `sessionExpired`, `hostDefect`, or `permanentError` (404), and MUST map
each to a distinct `RetryDecision`.

#### Scenario: Transient outcome schedules backoff
- GIVEN a `FetchOutcome` of `transient` (e.g. HTTP 503)
- WHEN the policy computes a `RetryDecision`
- THEN the decision is "retry after computed backoff delay"

#### Scenario: Session-expired outcome retries immediately
- GIVEN a `FetchOutcome` of `sessionExpired`
- WHEN the policy computes a `RetryDecision`
- THEN the decision is "re-prime session and retry immediately, zero delay"

#### Scenario: Host-defect outcome retries a bounded number of times
- GIVEN a `FetchOutcome` of `hostDefect`
- WHEN the policy computes a `RetryDecision` and the attempt count is below the 1–2 attempt cap
- THEN the decision is "retry"
- AND once the cap is reached, the decision is "record in failure ledger, stop retrying"

#### Scenario: Permanent error never retries
- GIVEN a `FetchOutcome` of `permanentError` (HTTP 404)
- WHEN the policy computes a `RetryDecision`
- THEN the decision is "record in failure ledger, do not retry"

### Requirement: Composable Backoff Strategies
Backoff MUST be composed from independent functions: a base strategy (`fixed`, `linear`, or
`exponential`) decorated by `withJitter(ratio)` and `withCap(maxMs)`.

#### Scenario: Exponential backoff grows per attempt
- GIVEN an exponential strategy with base 1000ms and factor 2
- WHEN computing delays for attempts 1, 2, 3
- THEN the undecorated delays are 1000ms, 2000ms, 4000ms

#### Scenario: Jitter varies delay within the configured ratio
- GIVEN a strategy decorated with `withJitter(0.3)`
- WHEN the delay is computed repeatedly for the same attempt
- THEN each computed delay falls within ±30% of the base delay

### Requirement: Retry-After Precedence
A server-sent `Retry-After` header MUST override the computed backoff delay whenever
present, regardless of any configured strategy.

#### Scenario: Server supplies Retry-After
- GIVEN a stubbed 429 response carrying `Retry-After: 5`
- WHEN the policy determines the wait duration
- THEN the wait duration is exactly 5 seconds, ignoring the computed exponential value

### Requirement: Mandatory Backoff Cap
`withCap(maxMs)` MUST be applied to every backoff strategy in use; an uncapped strategy
MUST NOT be composable in the production policy configuration.

#### Scenario: Delay never exceeds the cap
- GIVEN an exponential strategy capped at 60000ms
- WHEN computing the delay for attempt 12
- THEN the returned delay does not exceed 60000ms

### Requirement: Global 429 Cooldown
A 429 response MUST trip a global cooldown pausing all workers, not a per-task delay,
because the rate limit is assumed per-IP.

#### Scenario: One worker's 429 pauses all workers
- GIVEN a pool with concurrency 3 and a stubbed transport
- WHEN worker A receives a 429
- THEN workers B and C also pause for the cooldown duration before issuing further requests
- AND the failed unit returns to the work queue rather than being marked permanently failed

### Requirement: Stubbed-Transport Test Isolation
Every 429, backoff, and session-recovery scenario MUST be exercised against a stubbed
`HttpTransport` and a fake `Clock`, never against the live target host.

#### Scenario: Backoff test uses fake time
- GIVEN a test asserting a 4-second exponential delay
- WHEN the test runs
- THEN it uses `vi.useFakeTimers()` (or equivalent) and completes without real elapsed time
