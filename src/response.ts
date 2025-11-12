import { ServerResponse } from 'http';

/**
 * Response wrapper - provides convenient access to response properties
 * Minimal implementation compatible with Koa's response interface
 */
export class KoaXResponse {
  res: ServerResponse;
  private _body: any;
  private _status: number = 404;
  private _message?: string;
  private _explicitStatus: boolean = false;

  constructor(res: ServerResponse) {
    this.res = res;
  }

  /**
   * Get response status code
   */
  get status(): number {
    return this._status;
  }

  set status(code: number) {
    this._status = code;
    this._explicitStatus = true;
    this.res.statusCode = code;
  }

  /**
   * Get/Set response status message
   */
  get message(): string {
    return this._message || this.res.statusMessage || '';
  }

  set message(msg: string) {
    this._message = msg;
    this.res.statusMessage = msg;
  }

  /**
   * Get/Set response body
   * OPTIMIZATION: Body is stored and sent at the end of middleware chain
   */
  get body(): any {
    return this._body;
  }

  set body(val: any) {
    this._body = val;

    // Auto-set status to 200 if not explicitly set and body is provided
    if (!this._explicitStatus && val != null) {
      this.status = 200;
    }
  }

  /**
   * Set response header
   */
  set(field: string, val: string | string[]): void {
    if (!this.res.headersSent) {
      this.res.setHeader(field, val);
    }
  }

  /**
   * Get response header
   */
  get(field: string): string | number | string[] | undefined {
    return this.res.getHeader(field);
  }

  /**
   * Remove response header
   */
  remove(field: string): void {
    if (!this.res.headersSent) {
      this.res.removeHeader(field);
    }
  }

  /**
   * Set Content-Type header based on type
   */
  set type(type: string) {
    this.set('Content-Type', type);
  }

  get type(): string {
    const type = this.get('Content-Type');
    if (!type) return '';
    return String(type).split(';')[0];
  }

  /**
   * Send the response body
   * OPTIMIZATION: Handles different body types efficiently
   */
  send(): void {
    if (this.res.writableEnded || this.res.headersSent) {
      return;
    }

    const body = this._body;

    // No body
    if (body == null) {
      this.res.end();
      return;
    }

    // Buffer
    if (Buffer.isBuffer(body)) {
      this.set('Content-Length', String(body.length));
      this.res.end(body);
      return;
    }

    // String
    if (typeof body === 'string') {
      const buf = Buffer.from(body);
      this.set('Content-Length', String(buf.length));
      this.res.end(body);
      return;
    }

    // JSON
    const jsonBody = JSON.stringify(body);
    const buf = Buffer.from(jsonBody);
    this.set('Content-Type', 'application/json; charset=utf-8');
    this.set('Content-Length', String(buf.length));
    this.res.end(jsonBody);
  }

  /**
   * Reset internal state - called when context is returned to pool
   * OPTIMIZATION: Avoid creating new objects on each request
   */
  reset(res: ServerResponse): void {
    this.res = res;
    this._body = undefined;
    this._status = 404;
    this._message = undefined;
    this._explicitStatus = false;
  }
}
