/**
 * Simple Router for KoaX
 *
 * Lightweight, zero-dependency router compatible with KoaX and Koa
 * Alternative to @koa/router with better performance
 *
 * Features:
 * - Path parameters (e.g., /users/:id)
 * - Regex-based matching
 * - Middleware composition
 * - GET, POST, PUT, DELETE, PATCH methods
 * - No external dependencies
 *
 * @example
 * ```typescript
 * import KoaX, { Router } from '@bamptee/koax';
 *
 * const app = new KoaX();
 * const router = new Router();
 *
 * router.get('/users/:id', async (ctx) => {
 *   ctx.body = { userId: ctx.params.id };
 * });
 *
 * app.use(router.routes());
 * ```
 */

import { KoaXContext, Middleware } from './types';

/**
 * Route definition
 */
interface Route {
  method: string;
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: Middleware;
}

/**
 * Router class
 *
 * Provides routing functionality for KoaX/Koa applications
 */
export class Router {
  private routeList: Route[] = [];

  /**
   * Register a GET route
   *
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * router.get('/users/:id', async (ctx) => {
   *   ctx.body = { id: ctx.params.id };
   * });
   * ```
   */
  get(path: string, handler: Middleware): this {
    return this.register('GET', path, handler);
  }

  /**
   * Register a POST route
   *
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * router.post('/users', async (ctx) => {
   *   ctx.body = { created: true };
   * });
   * ```
   */
  post(path: string, handler: Middleware): this {
    return this.register('POST', path, handler);
  }

  /**
   * Register a PUT route
   *
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * router.put('/users/:id', async (ctx) => {
   *   ctx.body = { updated: true };
   * });
   * ```
   */
  put(path: string, handler: Middleware): this {
    return this.register('PUT', path, handler);
  }

  /**
   * Register a DELETE route
   *
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * router.delete('/users/:id', async (ctx) => {
   *   ctx.body = { deleted: true };
   * });
   * ```
   */
  delete(path: string, handler: Middleware): this {
    return this.register('DELETE', path, handler);
  }

  /**
   * Register a PATCH route
   *
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * router.patch('/users/:id', async (ctx) => {
   *   ctx.body = { patched: true };
   * });
   * ```
   */
  patch(path: string, handler: Middleware): this {
    return this.register('PATCH', path, handler);
  }

  /**
   * Register a route for all HTTP methods
   *
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * router.all('/health', async (ctx) => {
   *   ctx.body = { status: 'ok' };
   * });
   * ```
   */
  all(path: string, handler: Middleware): this {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    methods.forEach(method => this.register(method, path, handler));
    return this;
  }

  /**
   * Convert route pattern to regex and extract param names
   *
   * Converts /users/:id to /users/([^/]+) and extracts ["id"]
   *
   * @param path - Route path pattern
   * @returns Regex and parameter names
   *
   * @private
   */
  private pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    // Convert /users/:id to /users/([^/]+) and capture param name
    const regexPattern = path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    // Exact match with start and end anchors
    const regex = new RegExp(`^${regexPattern}$`);

    return { regex, paramNames };
  }

  /**
   * Register a route for any HTTP method
   *
   * @param method - HTTP method
   * @param path - Route path (supports :param syntax)
   * @param handler - Route handler function
   * @returns this for chaining
   *
   * @private
   */
  private register(method: string, path: string, handler: Middleware): this {
    const { regex, paramNames } = this.pathToRegex(path);

    this.routeList.push({
      method: method.toUpperCase(),
      pattern: path,
      regex,
      paramNames,
      handler
    });

    return this;
  }

  /**
   * Return middleware function for use with KoaX/Koa
   *
   * @returns Middleware function
   *
   * @example
   * ```typescript
   * app.use(router.routes());
   * ```
   */
  routes(): Middleware {
    return async (ctx: KoaXContext, next: () => Promise<void>) => {
      // Reset params to avoid pollution from previous requests (context pooling)
      ctx.params = undefined;

      // Try to match the request against registered routes
      for (const route of this.routeList) {
        // Check method
        if (route.method !== ctx.method) {
          continue;
        }

        // Check path pattern
        const match = ctx.path.match(route.regex);

        if (!match) {
          continue;
        }

        // Extract parameters
        // IMPORTANT: Always create a new object to avoid polluting pooled contexts
        if (route.paramNames.length > 0) {
          ctx.params = {};
          route.paramNames.forEach((name, index) => {
            ctx.params![name] = match[index + 1];
          });
        }

        // Execute the route handler
        await route.handler(ctx, next);
        return;
      }

      // No route matched, pass to next middleware
      return next();
    };
  }

  /**
   * Get all registered routes (for debugging/introspection)
   *
   * @returns Array of route information
   *
   * @example
   * ```typescript
   * const routes = router.getRoutes();
   * routes.forEach(r => {
   *   console.log(`${r.method} ${r.pattern}`);
   * });
   * ```
   */
  getRoutes(): Array<{ method: string; pattern: string }> {
    return this.routeList.map(r => ({
      method: r.method,
      pattern: r.pattern
    }));
  }

  /**
   * Prefix all routes with a given path
   *
   * @param prefix - Path prefix (e.g., '/api/v1')
   * @returns New router with prefixed routes
   *
   * @example
   * ```typescript
   * const apiRouter = router.prefix('/api/v1');
   * // /users becomes /api/v1/users
   * ```
   */
  prefix(prefix: string): Router {
    const newRouter = new Router();

    // Normalize prefix (remove trailing slash)
    const normalizedPrefix = prefix.replace(/\/$/, '');

    for (const route of this.routeList) {
      const newPath = normalizedPrefix + route.pattern;
      newRouter.register(route.method, newPath, route.handler);
    }

    return newRouter;
  }
}

/**
 * Create a new router instance
 *
 * @returns New Router instance
 *
 * @example
 * ```typescript
 * const router = createRouter();
 * router.get('/hello', async (ctx) => {
 *   ctx.body = 'Hello!';
 * });
 * ```
 */
export function createRouter(): Router {
  return new Router();
}
