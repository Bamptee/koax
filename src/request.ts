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
   * Set query object (for Koa compatibility)
   * Updates the cached query and reconstructs the URL
   */
  set query(obj: Record<string, string>) {
    this._query = obj;

    // Reconstruct URL with new query string
    const parsed = parseUrl(this.url);
    const queryString = Object.keys(obj)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
      .join('&');

    this.url = parsed.pathname + (queryString ? '?' + queryString : '');
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
   * Get original URL (before any rewrites)
   */
  get originalUrl(): string {
    return this.req.url || '/';
  }

  /**
   * Get protocol + host
   */
  get origin(): string {
    return `${this.protocol}://${this.host}`;
  }

  /**
   * Get full URL (protocol + host + url)
   */
  get href(): string {
    return `${this.origin}${this.url}`;
  }

  /**
   * Get protocol (http or https)
   */
  get protocol(): string {
    const proto = (this.req.socket as any)?.encrypted ? 'https' : 'http';
    return proto;
  }

  /**
   * Get host (hostname:port)
   */
  get host(): string {
    const host = this.get('host');
    return (Array.isArray(host) ? host[0] : host) || '';
  }

  /**
   * Get hostname (without port)
   */
  get hostname(): string {
    const host = this.host;
    return host.split(':')[0];
  }

  /**
   * Check if request is secure (https)
   */
  get secure(): boolean {
    return this.protocol === 'https';
  }

  /**
   * Get request socket
   */
  get socket(): any {
    return this.req.socket;
  }

  /**
   * Get client IP address
   */
  get ip(): string {
    return this.req.socket.remoteAddress || '';
  }

  /**
   * Get client IP addresses (when behind proxy)
   */
  get ips(): string[] {
    const forwarded = this.get('x-forwarded-for');
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',').map(ip => ip.trim());
    }
    return [];
  }

  /**
   * Check if response is still fresh (for caching)
   */
  get fresh(): boolean {
    const method = this.method;
    // GET or HEAD only
    if (method !== 'GET' && method !== 'HEAD') return false;

    const s = (this.req.socket as any)?._httpMessage?.statusCode || 200;

    // 2xx or 304 as per rfc2616 14.26
    if ((s >= 200 && s < 300) || s === 304) {
      return true;
    }

    return false;
  }

  /**
   * Check if response is stale (opposite of fresh)
   */
  get stale(): boolean {
    return !this.fresh;
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
