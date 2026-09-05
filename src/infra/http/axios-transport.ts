import axios, { type AxiosInstance, type AxiosResponseHeaders } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../engine/ports.js';

/**
 * `axios-cookiejar-support`@5's compiled declarations do not resolve against
 * this axios version's `NodeNext`-conditional type exports: its own
 * README-documented `wrapper(axios.create({ jar }))` snippet fails to
 * typecheck in isolation, reporting `AxiosInstance`/`AxiosStatic` as "two
 * different types... but they are unrelated" — a real upstream packaging
 * gap, not a usage mistake, reproduced and confirmed before writing this
 * workaround (see apply-progress.md). `wrapper` is plain JS (its own
 * `dist/index.js`): it registers one request interceptor reading
 * `config.jar` and mutates the instance it is given in place, so calling it
 * through a minimal structural type and discarding its return value is
 * runtime-equivalent to the documented usage.
 */
type CookieJarWrapper = (target: unknown) => unknown;
interface JarCapable {
  defaults: { jar?: CookieJar };
}

export interface AxiosTransportConfig {
  readonly timeoutMs?: number;
  /** Defaults to a fresh, private jar — a new instance never shares cookies with another. */
  readonly jar?: CookieJar;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeHeaders(headers: AxiosResponseHeaders): Readonly<Record<string, string>> {
  const raw = headers.toJSON() as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') normalized[key.toLowerCase()] = value;
    else if (Array.isArray(value)) normalized[key.toLowerCase()] = value.join(', ');
  }
  return normalized;
}

/**
 * The real `HttpTransport` implementation (S5e task 9.1), over axios +
 * `axios-cookiejar-support`/`tough-cookie` for the TRF5 session cookie.
 * Redirects are never auto-followed (`maxRedirects: 0`): `documents.ts`
 * already follows the one intended 302 itself by inspecting `status`/
 * `headers.location` and issuing a second `send()` — auto-following here
 * would collapse that into a single response and break that contract.
 * Every HTTP status is a normal response, never a thrown error
 * (`validateStatus`), since the adapter's own validity chain and 404/302
 * handling classify the status, not this transport. Returns raw bytes,
 * never decoded text (design.md D2) — `responseType: 'arraybuffer'`.
 */
export class AxiosTransport implements HttpTransport {
  private readonly client: AxiosInstance;

  constructor(config: AxiosTransportConfig = {}) {
    const instance = axios.create({
      timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRedirects: 0,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    (wrapper as CookieJarWrapper)(instance);
    (instance as unknown as JarCapable).defaults.jar = config.jar ?? new CookieJar();
    this.client = instance;
  }

  async send(req: HttpRequest): Promise<HttpResponse> {
    const response = await this.client.request<ArrayBuffer>({
      method: req.method,
      url: req.url,
      // exactOptionalPropertyTypes forbids an explicit `headers: undefined`,
      // so an unheadered request omits the key entirely (same pattern as
      // adapters/trf5/site.ts's optional-facet spread).
      ...(req.headers ? { headers: { ...req.headers } } : {}),
      data: req.body,
    });
    return {
      status: response.status,
      headers: normalizeHeaders(response.headers as AxiosResponseHeaders),
      body: new Uint8Array(response.data),
    };
  }
}
