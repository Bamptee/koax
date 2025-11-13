import { IncomingMessage, ServerResponse } from 'http';
import { KoaXRequest } from './request';
import { KoaXResponse } from './response';
import { KoaXContext } from './types';
import { KoaXApplication } from './application';
import { Logger, generateRequestId } from './logger';

/**
 * Context Pool Manager
 * OPTIMIZATION: Reuses context objects to reduce GC pressure
 *
 * Benefits:
 * - Reduces object allocation per request
 * - Decreases garbage collection frequency
 * - Improves throughput under high load
 */
export class ContextPool {
  private pool: Context[] = [];
  private readonly maxSize: number;
  private created: number = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Acquire a context from the pool or create a new one
   */
  acquire(app: KoaXApplication, req: IncomingMessage, res: ServerResponse): Context {
    let ctx = this.pool.pop();

    if (!ctx) {
      ctx = new Context(app, req, res);
      this.created++;
    } else {
      ctx.reset(app, req, res);
    }

    ctx._inUse = true;
    return ctx;
  }

  /**
   * Release a context back to the pool
   * OPTIMIZATION: Clear references to allow garbage collection of request/response
   */
  release(ctx: Context): void {
    if (!ctx._inUse) return;

    ctx._inUse = false;

    // Only keep up to maxSize contexts in pool
    if (this.pool.length < this.maxSize) {
      // Clear state to prevent memory leaks
      ctx.state = {};
      this.pool.push(ctx);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { poolSize: number; created: number; maxSize: number } {
    return {
      poolSize: this.pool.length,
      created: this.created,
      maxSize: this.maxSize
    };
  }
}

/**
 * Context class - encapsulates request and response
 * Compatible with Koa's Context interface
 */
export class Context implements KoaXContext {
  app!: KoaXApplication;
  req!: IncomingMessage;
  res!: ServerResponse;
  request!: KoaXRequest;
  response!: KoaXResponse;
  state: Record<string, any> = {};
  _inUse?: boolean;

  // NEW: Logger and timing
  log!: Logger;
  requestId!: string;
  startTime!: number;

  constructor(app: KoaXApplication, req: IncomingMessage, res: ServerResponse) {
    this.request = new KoaXRequest(req);
    this.response = new KoaXResponse(res);
    this.reset(app, req, res);
  }

  /**
   * Reset context for reuse from pool
   * OPTIMIZATION: Reuse existing objects instead of creating new ones
   */
  reset(app: KoaXApplication, req: IncomingMessage, res: ServerResponse): void {
    this.app = app;
    this.req = req;
    this.res = res;
    this.request.reset(req);
    this.response.reset(res);
    this.state = {};

    // Only initialize logger/timing if enabled (avoid overhead when disabled)
    if ((app as any).logger?.enabled) {
      this.requestId = generateRequestId();
      this.startTime = Date.now();
      this.log = app.logger.child({
        reqId: this.requestId,
        method: req.method,
        url: req.url
      });
    } else {
      // Use empty/noop logger when disabled
      this.requestId = '';
      this.startTime = 0;
      this.log = app.logger; // Use app logger directly (noop if disabled)
    }
  }

  // Delegated properties from request
  get url(): string {
    return this.request.url;
  }

  set url(val: string) {
    this.request.url = val;
  }

  get method(): string {
    return this.request.method;
  }

  set method(val: string) {
    this.request.method = val;
  }

  get path(): string {
    return this.request.path;
  }

  set path(val: string) {
    this.request.path = val;
  }

  get query(): Record<string, string> {
    return this.request.query;
  }

  get headers(): Record<string, string | string[] | undefined> {
    return this.request.headers;
  }

  get originalUrl(): string {
    return this.request.originalUrl;
  }

  get origin(): string {
    return this.request.origin;
  }

  get href(): string {
    return this.request.href;
  }

  get host(): string {
    return this.request.host;
  }

  get hostname(): string {
    return this.request.hostname;
  }

  get fresh(): boolean {
    return this.request.fresh;
  }

  get stale(): boolean {
    return this.request.stale;
  }

  get socket(): any {
    return this.request.socket;
  }

  get secure(): boolean {
    return this.request.secure;
  }

  get ip(): string {
    return this.request.ip;
  }

  get ips(): string[] {
    return this.request.ips;
  }

  // Delegated properties from response
  get status(): number {
    return this.response.status;
  }

  set status(code: number) {
    this.response.status = code;
  }

  get message(): string {
    return this.response.message;
  }

  set message(msg: string) {
    this.response.message = msg;
  }

  get body(): any {
    return this.response.body;
  }

  set body(val: any) {
    this.response.body = val;
  }

  get type(): string {
    return this.response.type;
  }

  set type(val: string) {
    this.response.type = val;
  }

  get length(): number | undefined {
    return this.response.length;
  }

  set length(n: number | undefined) {
    this.response.length = n;
  }

  get lastModified(): Date | undefined {
    return this.response.lastModified;
  }

  set lastModified(val: Date | undefined) {
    this.response.lastModified = val;
  }

  get etag(): string | undefined {
    return this.response.etag;
  }

  set etag(val: string | undefined) {
    this.response.etag = val;
  }

  /**
   * Set response header
   */
  set(field: string, val: string | string[]): void {
    this.response.set(field, val);
  }

  /**
   * Get response header
   */
  get(field: string): string | number | string[] | undefined {
    return this.response.get(field);
  }

  /**
   * Remove response header
   */
  remove(field: string): void {
    this.response.remove(field);
  }

  /**
   * Vary on field (for CORS and caching)
   */
  vary(field: string): void {
    this.response.vary(field);
  }

  /**
   * Redirect to URL (sets Location header and status)
   */
  redirect(url: string, alt?: string): void {
    // Set location
    this.set('Location', url);

    // Set status
    if (!this.status || this.status === 404) {
      this.status = 302;
    }

    // Set body
    if (this.req.headers.accept?.includes('html')) {
      this.type = 'text/html';
      this.body = `<p>Redirecting to <a href="${url}">${url}</a></p>`;
    } else {
      this.type = 'text/plain';
      this.body = `Redirecting to ${url}`;
    }
  }

  /**
   * Set Content-Disposition to "attachment" with optional filename
   */
  attachment(filename?: string): void {
    if (filename) {
      this.set('Content-Disposition', `attachment; filename="${filename}"`);
      // Set type based on extension
      const ext = filename.split('.').pop();
      if (ext === 'json') this.type = 'application/json';
      else if (ext === 'html') this.type = 'text/html';
      else if (ext === 'txt') this.type = 'text/plain';
    } else {
      this.set('Content-Disposition', 'attachment');
    }
  }

  /**
   * Check if the incoming request contains the "Content-Type" header field
   */
  is(...types: string[]): string | false | null {
    const contentType = this.get('content-type');
    if (!contentType) return null;
    const ct = Array.isArray(contentType) ? contentType[0] : String(contentType);

    for (const type of types) {
      if (ct.includes(type)) {
        return type;
      }
    }
    return false;
  }

  /**
   * Check if the given types are acceptable (simplified implementation)
   */
  accepts(...types: string[]): string | false {
    const accept = this.get('accept');
    if (!accept) return types[0] || false;

    const acceptStr = Array.isArray(accept) ? accept[0] : String(accept);

    for (const type of types) {
      if (acceptStr.includes(type) || acceptStr.includes('*/*')) {
        return type;
      }
    }
    return false;
  }

  /**
   * Check if encodings are acceptable
   */
  acceptsEncodings(...encodings: string[]): string | false {
    const accept = this.get('accept-encoding');
    if (!accept) return encodings[0] || false;

    const acceptStr = Array.isArray(accept) ? accept[0] : String(accept);

    for (const encoding of encodings) {
      if (acceptStr.includes(encoding)) {
        return encoding;
      }
    }
    return false;
  }

  /**
   * Check if charsets are acceptable
   */
  acceptsCharsets(...charsets: string[]): string | false {
    const accept = this.get('accept-charset');
    if (!accept) return charsets[0] || false;

    const acceptStr = Array.isArray(accept) ? accept[0] : String(accept);

    for (const charset of charsets) {
      if (acceptStr.includes(charset)) {
        return charset;
      }
    }
    return false;
  }

  /**
   * Check if languages are acceptable
   */
  acceptsLanguages(...languages: string[]): string | false {
    const accept = this.get('accept-language');
    if (!accept) return languages[0] || false;

    const acceptStr = Array.isArray(accept) ? accept[0] : String(accept);

    for (const language of languages) {
      if (acceptStr.includes(language)) {
        return language;
      }
    }
    return false;
  }

  /**
   * Throw an HTTP error
   */
  throw(status: number, message?: string): never {
    const err: any = new Error(message || `HTTP Error ${status}`);
    err.status = status;
    err.expose = true;
    throw err;
  }

  /**
   * Assert a condition, throw if false
   */
  assert(condition: any, status: number, message?: string): asserts condition {
    if (!condition) {
      this.throw(status, message);
    }
  }
}
