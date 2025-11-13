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
 * - Nested routers support
 * - allowedMethods() for OPTIONS/405/501
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
 * app.use(router.allowedMethods());
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
 * Middleware with router property (for nested routers)
 */
interface RouterMiddleware extends Middleware {
  router?: Router;
}

/**
 * Router class
 *
 * Provides routing functionality for KoaX/Koa applications
 */
export class Router {
  public routeList: Route[] = [];
  private methods: string[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

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
   * @returns Middleware function with router property (for nested routers)
   *
   * @example
   * ```typescript
   * app.use(router.routes());
   * ```
   */
  routes(): RouterMiddleware {
    const router = this;

    const middleware: RouterMiddleware = async (ctx: KoaXContext, next: () => Promise<void>) => {
      // Reset params to avoid pollution from previous requests (context pooling)
      ctx.params = undefined;

      // Set router reference on context (for @koa/router compatibility)
      ctx.router = router;

      // Initialize matched array if not present
      if (!ctx.matched) {
        ctx.matched = [];
      }

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

        // Set matched route on context
        ctx._matchedRoute = route.pattern;

        // Extract parameters
        // IMPORTANT: Always create a new object to avoid polluting pooled contexts
        if (route.paramNames.length > 0) {
          ctx.params = {};
          route.paramNames.forEach((name, index) => {
            ctx.params![name] = match[index + 1];
          });
        }

        // Copy params to ctx.request.params for @koa/router compatibility
        if (ctx.request) {
          (ctx.request as any).params = ctx.params;
        }

        // Execute the route handler
        await route.handler(ctx, next);
        return;
      }

      // No route matched, pass to next middleware
      return next();
    };

    // Add router property to middleware (for nested router detection)
    middleware.router = this;

    return middleware;
  }

  /**
   * Use middleware with optional path prefix
   * Supports nested routers for modular routing
   *
   * @param path - Optional path prefix
   * @param middleware - Middleware function or Router
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * // Use router as nested router
   * const apiRouter = new Router();
   * apiRouter.get('/users', handler);
   * router.use('/api', apiRouter.routes());
   *
   * // Use regular middleware
   * router.use('/admin', authMiddleware);
   * ```
   */
  use(path: string | Middleware, middleware?: Middleware): this {
    let prefix = '';
    let handler: Middleware;

    // Handle overloads: use(middleware) or use(path, middleware)
    if (typeof path === 'function') {
      handler = path;
    } else {
      prefix = path;
      if (!middleware) {
        throw new Error('Middleware is required when path is provided');
      }
      handler = middleware;
    }

    // Check if handler is a router middleware (has .router property)
    const routerMiddleware = handler as RouterMiddleware;
    if (routerMiddleware.router) {
      // Nested router: merge routes from child router into this router
      const childRouter = routerMiddleware.router as any;

      // Support both KoaX Router (routeList) and @koa/router (stack)
      if (childRouter.routeList) {
        // KoaX Router
        for (const route of childRouter.routeList) {
          const newPath = prefix ? prefix + route.pattern : route.pattern;
          this.register(route.method, newPath, route.handler);
        }
      } else if (childRouter.stack) {
        // @koa/router - just pass through the middleware as-is
        // We can't merge @koa/router routes because the structure is too different
        // Instead, register the entire middleware
        this.methods.forEach(method => {
          const wildcardPath = prefix ? prefix + '(.*)' : '(.*)';
          this.register(method, wildcardPath, handler);
        });
      }
    } else {
      // Regular middleware: register as wildcard route
      const wildcardPath = prefix ? prefix + '(.*)' : '(.*)';
      // Register for all HTTP methods
      this.methods.forEach(method => {
        this.register(method, wildcardPath, handler);
      });
    }

    return this;
  }

  /**
   * Returns middleware for handling OPTIONS requests and method errors
   * Responds with Allow header for OPTIONS, 405 for wrong method, 501 for not implemented
   *
   * @param options - Optional configuration
   * @returns Middleware function
   *
   * @example
   * ```typescript
   * app.use(router.routes());
   * app.use(router.allowedMethods());
   * ```
   */
  allowedMethods(options: { throw?: boolean } = {}): Middleware {
    const router = this;

    return async (ctx: KoaXContext, next: () => Promise<void>) => {
      await next();

      // Only handle if status is 404 or falsy (no response set)
      // Unlike @koa/router, we don't require ctx.matched since routes() always sets it
      if (ctx.status && ctx.status !== 404) {
        return;
      }

      // Find which methods are allowed for this path
      const allowedMethods = new Set<string>();
      for (const route of router.routeList) {
        if (ctx.path.match(route.regex)) {
          allowedMethods.add(route.method);
        }
      }

      const allowed = Array.from(allowedMethods);

      // No routes match this path - let 404 handler deal with it
      if (allowed.length === 0) {
        return;
      }

      // Handle OPTIONS request
      if (ctx.method === 'OPTIONS') {
        ctx.status = 200;
        ctx.set('Allow', allowed.join(', '));
        ctx.body = '';
        return;
      }

      // Check if method is implemented
      if (!router.methods.includes(ctx.method)) {
        if (options.throw) {
          ctx.throw(501, `Method ${ctx.method} not implemented`);
        } else {
          ctx.status = 501;
          ctx.set('Allow', allowed.join(', '));
        }
        return;
      }

      // Check if method is allowed for this route
      if (!allowed.includes(ctx.method)) {
        if (options.throw) {
          ctx.throw(405, `Method ${ctx.method} not allowed`);
        } else {
          ctx.status = 405;
          ctx.set('Allow', allowed.join(', '));
        }
        return;
      }
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
