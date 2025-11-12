/**
 * KoaX example with a simple router
 * Demonstrates building a router middleware compatible with KoaX/Koa
 */

import KoaXApplication from '../src';
import { KoaXContext, Middleware } from '../src/types';

/**
 * Simple router implementation
 * Compatible with KoaX and Koa
 */
class SimpleRouter {
  private routeMap: Map<string, Map<string, Middleware>> = new Map();

  /**
   * Register a GET route
   */
  get(path: string, handler: Middleware): this {
    return this.register('GET', path, handler);
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: Middleware): this {
    return this.register('POST', path, handler);
  }

  /**
   * Register a PUT route
   */
  put(path: string, handler: Middleware): this {
    return this.register('PUT', path, handler);
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, handler: Middleware): this {
    return this.register('DELETE', path, handler);
  }

  /**
   * Register a route for any method
   */
  private register(method: string, path: string, handler: Middleware): this {
    if (!this.routeMap.has(method)) {
      this.routeMap.set(method, new Map());
    }
    this.routeMap.get(method)!.set(path, handler);
    return this;
  }

  /**
   * Return middleware function
   */
  routes(): Middleware {
    return async (ctx: KoaXContext, next: () => Promise<void>) => {
      const methodRoutes = this.routeMap.get(ctx.method);

      if (!methodRoutes) {
        return next();
      }

      const handler = methodRoutes.get(ctx.path);

      if (!handler) {
        return next();
      }

      // Execute the route handler
      await handler(ctx, next);
    };
  }
}

// Create application
const app = new KoaXApplication({
  contextPoolSize: 200,
  logger: {
    enabled: true,
    prettyPrint: true,
    name: 'console-app'
    // No transport specified = uses ConsoleTransport by default
  },
});

// Logger middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.path} - ${ctx.status} - ${ms}ms`);
});

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.message };
    app.emit('error', err, ctx);
  }
});

// Create router
const router = new SimpleRouter();

// Define routes
router.get('/', async (ctx) => {
  ctx.body = {
    name: 'KoaX API',
    version: '1.0.0',
    endpoints: [
      'GET /',
      'GET /users',
      'GET /users/:id',
      'POST /users',
      'GET /health'
    ]
  };
});

router.get('/health', async (ctx) => {
  // Sleep for 50ms to simulate some processing
  ctx.body = {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    poolStats: app.getPoolStats()
  };
});

// Simulated user database
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' }
];

router.get('/users', async (ctx) => {
  ctx.body = { users, count: users.length };
});

router.get('/users/:id', async (ctx) => {
  // Simple parameter extraction
  const id = parseInt(ctx.path.split('/')[2]);
  const user = users.find(u => u.id === id);

  if (!user) {
    ctx.status = 404;
    ctx.body = { error: 'User not found' };
    return;
  }

  ctx.body = { user };
});

router.post('/users', async (ctx) => {
  // Note: In production, use a body parser middleware
  const newUser = {
    id: users.length + 1,
    name: 'New User',
    email: 'new@example.com'
  };

  users.push(newUser);
  ctx.status = 201;
  ctx.body = { user: newUser };
});

// Register router middleware
app.use(router.routes());

// 404 handler (runs if no route matched)
app.use(async (ctx) => {
  ctx.status = 404;
  ctx.body = { error: 'Not Found', path: ctx.path };
});

// Start server
const PORT = parseInt(process.env.PORT || '3006');

app.listen(PORT, () => {
  console.log(`\n🚀 KoaX API server listening on http://localhost:${PORT}`);
  console.log('\nAvailable routes:');
  console.log(`  GET    http://localhost:${PORT}/`);
  console.log(`  GET    http://localhost:${PORT}/health`);
  console.log(`  GET    http://localhost:${PORT}/users`);
  console.log(`  GET    http://localhost:${PORT}/users/1`);
  console.log(`  POST   http://localhost:${PORT}/users\n`);
});

// Error logging
app.on('error', (err, ctx) => {
  console.error('Server error:', err);
});
