/**
 * Optimized CORS middleware for KoaX
 *
 * Zero-dependency CORS implementation with performance optimizations:
 * - Pre-computed header values
 * - Minimal string allocations
 * - Direct header setting (bypassing ctx.set() overhead)
 * - Efficient OPTIONS handling
 */

import { KoaXContext } from './types';

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /**
   * Access-Control-Allow-Origin header value
   * - String: Fixed origin (e.g., 'https://example.com')
   * - Function: Dynamic origin based on request
   * - Default: '*' (all origins)
   */
  origin?: string | ((ctx: KoaXContext) => string | Promise<string>);

  /**
   * Access-Control-Allow-Methods header value
   * Default: 'GET,HEAD,PUT,POST,DELETE,PATCH'
   */
  allowMethods?: string | string[];

  /**
   * Access-Control-Allow-Headers header value
   * Headers that can be used in the actual request
   */
  allowHeaders?: string | string[];

  /**
   * Access-Control-Expose-Headers header value
   * Headers that the client can access
   */
  exposeHeaders?: string | string[];

  /**
   * Access-Control-Allow-Credentials header
   * Allow cookies and authentication
   * Default: false
   */
  credentials?: boolean | ((ctx: KoaXContext) => boolean);

  /**
   * Access-Control-Max-Age header value (in seconds)
   * How long preflight results can be cached
   */
  maxAge?: number | string;

  /**
   * Keep CORS headers on error responses
   * Default: true
   */
  keepHeadersOnError?: boolean;

  /**
   * Add security headers for SharedArrayBuffer support
   * Adds: Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy
   * Default: false
   */
  secureContext?: boolean;

  /**
   * Handle Private Network Access
   * Responds to Access-Control-Request-Private-Network preflight
   * Default: false
   */
  privateNetworkAccess?: boolean;
}

/**
 * Pre-computed CORS handler for maximum performance
 */
class CorsHandler {
  private originValue: string | ((ctx: KoaXContext) => string | Promise<string>);
  private allowMethodsValue: string;
  private allowHeadersValue?: string;
  private exposeHeadersValue?: string;
  private credentialsValue: boolean | ((ctx: KoaXContext) => boolean);
  private maxAgeValue?: string;
  private keepHeadersOnError: boolean;
  private secureContext: boolean;
  private privateNetworkAccess: boolean;

  constructor(options: CorsOptions = {}) {
    // Pre-compute and normalize all values
    this.originValue = options.origin ?? '*';

    this.allowMethodsValue = Array.isArray(options.allowMethods)
      ? options.allowMethods.join(',')
      : options.allowMethods ?? 'GET,HEAD,PUT,POST,DELETE,PATCH';

    this.allowHeadersValue = options.allowHeaders
      ? (Array.isArray(options.allowHeaders) ? options.allowHeaders.join(',') : options.allowHeaders)
      : undefined;

    this.exposeHeadersValue = options.exposeHeaders
      ? (Array.isArray(options.exposeHeaders) ? options.exposeHeaders.join(',') : options.exposeHeaders)
      : undefined;

    this.credentialsValue = options.credentials ?? false;
    this.maxAgeValue = options.maxAge ? String(options.maxAge) : undefined;
    this.keepHeadersOnError = options.keepHeadersOnError ?? true;
    this.secureContext = options.secureContext ?? false;
    this.privateNetworkAccess = options.privateNetworkAccess ?? false;
  }

  /**
   * Get the origin value for this request
   */
  private async getOrigin(ctx: KoaXContext): Promise<string> {
    if (typeof this.originValue === 'function') {
      return await this.originValue(ctx);
    }
    return this.originValue;
  }

  /**
   * Get credentials setting for this request
   */
  private getCredentials(ctx: KoaXContext): boolean {
    if (typeof this.credentialsValue === 'function') {
      return this.credentialsValue(ctx);
    }
    return this.credentialsValue;
  }

  /**
   * Set CORS headers on response
   * Optimized: Direct header manipulation
   */
  private async setCorsHeaders(ctx: KoaXContext): Promise<void> {
    let origin = await this.getOrigin(ctx);
    const credentials = this.getCredentials(ctx);

    // Handle credentials with wildcard origin
    // When credentials is true and origin is '*', use request origin instead
    if (credentials && origin === '*') {
      origin = ctx.get('origin') as string || '*';
    }

    // Set origin header (always required)
    ctx.res.setHeader('Access-Control-Allow-Origin', origin);

    // Set credentials header
    if (credentials) {
      ctx.res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Set Vary header (important for caching)
    // If origin is dynamic, cache needs to vary by Origin
    if (origin !== '*') {
      ctx.vary('Origin');
    }

    // Expose headers (for non-preflight requests)
    if (this.exposeHeadersValue) {
      ctx.res.setHeader('Access-Control-Expose-Headers', this.exposeHeadersValue);
    }

    // Secure context headers
    if (this.secureContext) {
      ctx.res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      ctx.res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
  }

  /**
   * Handle preflight OPTIONS request
   */
  private async handlePreflight(ctx: KoaXContext): Promise<void> {
    // Set all CORS headers
    await this.setCorsHeaders(ctx);

    // Preflight-specific headers
    ctx.res.setHeader('Access-Control-Allow-Methods', this.allowMethodsValue);

    // Allow headers: use requested headers or configured headers
    if (this.allowHeadersValue) {
      ctx.res.setHeader('Access-Control-Allow-Headers', this.allowHeadersValue);
    } else {
      // Mirror the requested headers
      const requestHeaders = ctx.get('access-control-request-headers');
      if (requestHeaders) {
        ctx.res.setHeader('Access-Control-Allow-Headers', requestHeaders as string);
      }
    }

    // Max age
    if (this.maxAgeValue) {
      ctx.res.setHeader('Access-Control-Max-Age', this.maxAgeValue);
    }

    // Private network access
    if (this.privateNetworkAccess) {
      const requestPrivateNetwork = ctx.get('access-control-request-private-network');
      if (requestPrivateNetwork) {
        ctx.res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
    }

    // Respond with 204 No Content
    ctx.status = 204;
    ctx.body = '';
  }

  /**
   * Main CORS middleware handler
   */
  async handle(ctx: KoaXContext, next: () => Promise<void>): Promise<void> {
    // Check if this is a preflight request
    const isPreflight = ctx.method === 'OPTIONS' && ctx.get('access-control-request-method');

    if (isPreflight) {
      // Handle preflight - don't call next()
      await this.handlePreflight(ctx);
      return;
    }

    // For regular requests, set CORS headers and continue
    await this.setCorsHeaders(ctx);

    // Keep headers on error if configured
    if (this.keepHeadersOnError) {
      try {
        await next();
      } catch (err) {
        // Re-set CORS headers before re-throwing
        await this.setCorsHeaders(ctx);
        throw err;
      }
    } else {
      await next();
    }
  }
}

/**
 * Create optimized CORS middleware
 *
 * @param options - CORS configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // Simple usage (allow all origins)
 * const app = new KoaX({ cors: true });
 *
 * // With configuration
 * const app = new KoaX({
 *   cors: {
 *     origin: 'https://example.com',
 *     credentials: true,
 *     allowMethods: ['GET', 'POST', 'PUT'],
 *     exposeHeaders: ['X-Request-ID']
 *   }
 * });
 *
 * // Dynamic origin
 * const app = new KoaX({
 *   cors: {
 *     origin: (ctx) => {
 *       const origin = ctx.get('origin');
 *       if (allowedOrigins.includes(origin)) {
 *         return origin;
 *       }
 *       return 'https://default.com';
 *     }
 *   }
 * });
 * ```
 */
export function createCorsMiddleware(options: CorsOptions = {}) {
  const handler = new CorsHandler(options);
  return (ctx: KoaXContext, next: () => Promise<void>) => handler.handle(ctx, next);
}
