import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';

/**
 * Request wrapper - provides convenient access to request properties
 * Minimal implementation compatible with Koa's request interface
 */
export class KoaXRequest {
  req: IncomingMessage;
  private _url?: string;
  private _path?: string;
  private _query?: Record<string, string>;

  constructor(req: IncomingMessage) {
    this.req = req;
  }

  /**
   * Get request URL
   */
  get url(): string {
    return this.req.url || '/';
  }

  set url(val: string) {
    this.req.url = val;
    // Reset cached values
    this._url = undefined;
    this._path = undefined;
    this._query = undefined;
  }

  /**
   * Get request method
   */
  get method(): string {
    return this.req.method || 'GET';
  }

  set method(val: string) {
    this.req.method = val;
  }

  /**
   * Get parsed path (without query string)
   * Cached for performance
   */
  get path(): string {
    if (this._path !== undefined) return this._path;
    const parsed = parseUrl(this.url);
    this._path = parsed.pathname || '/';
    return this._path;
  }

  set path(val: string) {
    const parsed = parseUrl(this.url);
    parsed.pathname = val;
    this.url = parsed.path || '/';
  }

  /**
   * Get parsed query string as object
   * Simple implementation - for production use a proper query parser
   * Cached for performance
   */
  get query(): Record<string, string> {
    if (this._query !== undefined) return this._query;

    const parsed = parseUrl(this.url, true);
    this._query = {};

    if (parsed.query) {
      for (const [key, value] of Object.entries(parsed.query)) {
        if (typeof value === 'string') {
          this._query[key] = value;
        } else if (Array.isArray(value)) {
          this._query[key] = value[0] || '';
        }
      }
    }

    return this._query;
  }

  /**
   * Get request headers
   */
  get headers(): Record<string, string | string[] | undefined> {
    return this.req.headers;
  }

  /**
   * Get specific header value
   */
  get(field: string): string | string[] | undefined {
    return this.req.headers[field.toLowerCase()];
  }

  /**
   * Reset internal cache - called when context is returned to pool
   * OPTIMIZATION: Avoid creating new objects on each request
   */
  reset(req: IncomingMessage): void {
    this.req = req;
    this._url = undefined;
    this._path = undefined;
    this._query = undefined;
  }
}
