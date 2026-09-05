import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AxiosTransport } from './axios-transport.js';

/**
 * Task 9.1: proven against a local stub HTTP server, never the live TRF5 host
 * (per the S5e launch scope and the project's standing "Stubbed-Transport Test
 * Isolation" rule). A real server — rather than a mocked axios adapter — is what
 * lets the 302-not-auto-followed and cookie-jar-persistence behaviors be proven
 * against actual Node HTTP semantics instead of a hand-rolled double of them.
 */

let server: Server;
let baseUrl: string;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const url = req.url ?? '';

  if (url === '/binary') {
    // Non-UTF-8-safe bytes (0x00-0xff), proving the transport never decodes (D2).
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
    return;
  }
  if (url === '/echo') {
    res.writeHead(200, { 'content-type': req.headers['content-type'] ?? 'text/plain' });
    res.end(body);
    return;
  }
  if (url === '/redirect') {
    res.writeHead(302, { location: `${baseUrl}/binary` });
    res.end();
    return;
  }
  if (url === '/throttled') {
    res.writeHead(429, { 'retry-after': '5' });
    res.end();
    return;
  }
  if (url === '/set-cookie') {
    res.writeHead(200, { 'set-cookie': 'sessionId=abc123; Path=/' });
    res.end();
    return;
  }
  if (url === '/needs-cookie') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(req.headers.cookie ?? '');
    return;
  }
  res.writeHead(404);
  res.end();
}

beforeAll(async () => {
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('AxiosTransport — HttpTransport over axios, never the live TRF5 host', () => {
  it('returns response bytes byte-identical, never decoded (design.md D2)', async () => {
    const transport = new AxiosTransport();
    const response = await transport.send({ method: 'GET', url: `${baseUrl}/binary` });
    expect(response.status).toBe(200);
    expect([...response.body]).toEqual(Array.from({ length: 256 }, (_, i) => i));
  });

  it('forwards the request body and content-type header on POST', async () => {
    const transport = new AxiosTransport();
    const response = await transport.send({
      method: 'POST',
      url: `${baseUrl}/echo`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'a=1&b=2',
    });
    expect(new TextDecoder().decode(response.body)).toBe('a=1&b=2');
    expect(response.headers['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('surfaces a 302 with its Location header rather than auto-following it', async () => {
    const transport = new AxiosTransport();
    const response = await transport.send({ method: 'GET', url: `${baseUrl}/redirect` });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${baseUrl}/binary`);
  });

  it('surfaces Retry-After so the existing retry policy can honor it', async () => {
    const transport = new AxiosTransport();
    const response = await transport.send({ method: 'GET', url: `${baseUrl}/throttled` });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('5');
  });

  it('never throws on a non-2xx status — every HTTP status is a normal response', async () => {
    const transport = new AxiosTransport();
    const response = await transport.send({ method: 'GET', url: `${baseUrl}/missing` });
    expect(response.status).toBe(404);
  });

  it('persists a session cookie across requests through the same instance (cookie jar)', async () => {
    const transport = new AxiosTransport();
    await transport.send({ method: 'GET', url: `${baseUrl}/set-cookie` });
    const response = await transport.send({ method: 'GET', url: `${baseUrl}/needs-cookie` });
    expect(new TextDecoder().decode(response.body)).toContain('sessionId=abc123');
  });

  it('does not share cookies between two separate instances', async () => {
    await new AxiosTransport().send({ method: 'GET', url: `${baseUrl}/set-cookie` });
    const isolated = new AxiosTransport();
    const response = await isolated.send({ method: 'GET', url: `${baseUrl}/needs-cookie` });
    expect(new TextDecoder().decode(response.body)).toBe('');
  });

  /**
   * The site emits site-relative URLs in two places the adapter forwards verbatim:
   * the `fPP` form action harvested by `session.ts`, and the `Location` header of
   * the document 302 that `documents.ts` re-sends. Resolving them is a generic HTTP
   * concern, so it belongs here alongside the timeout and cookie jar — the base
   * VALUE carries the site knowledge and the composition root supplies it.
   *
   * `StubTransport` replays fixtures without parsing the URL, so the entire stubbed
   * suite passed while the first live POST threw `TypeError: Invalid URL`.
   */
  it('resolves a site-relative URL against the configured base', async () => {
    const transport = new AxiosTransport({ baseUrl });

    const response = await transport.send({ method: 'POST', url: '/echo', body: 'ok' });

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(response.body)).toBe('ok');
  });

  it('leaves an absolute URL untouched even when a base is configured', async () => {
    const transport = new AxiosTransport({ baseUrl: 'http://127.0.0.1:1/unused' });

    const response = await transport.send({ method: 'GET', url: `${baseUrl}/echo` });

    expect(response.status).toBe(200);
  });
});
