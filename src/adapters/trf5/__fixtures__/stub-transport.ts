import { readFileSync } from 'node:fs';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../../engine/ports.js';

const FIXTURES_DIR = new URL('.', import.meta.url);

/** Loads a fixture file's raw bytes — never decoded here (design.md D2). */
export function loadFixtureBytes(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(fileName, FIXTURES_DIR)));
}

export function fixtureResponse(
  status: number,
  contentType: string,
  fileName: string,
  headers: Readonly<Record<string, string>> = {},
): HttpResponse {
  return {
    status,
    headers: { 'content-type': contentType, ...headers },
    body: loadFixtureBytes(fileName),
  };
}

/**
 * Scripted, in-order response queue. Every S3 adapter test drives this instead of a live
 * host (task 3.14) — asserted directly by never constructing this with a live-host URL.
 */
export class StubTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private cursor = 0;

  constructor(private readonly responses: readonly HttpResponse[]) {}

  send(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    const response = this.responses[this.cursor];
    if (!response) {
      throw new Error(
        `StubTransport: no scripted response for call #${this.cursor + 1} (${req.method} ${req.url})`,
      );
    }
    this.cursor += 1;
    return Promise.resolve(response);
  }
}
