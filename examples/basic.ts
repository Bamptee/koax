/**
 * Basic KoaX usage example
 * Demonstrates compatibility with Koa middleware patterns
 */

import KoaXApplication from '../src';

const app = new KoaXApplication({
  contextPoolSize: 100 // Pool size for context reuse
});

// Middleware 1: Logger
// Logs request timing using the onion model
app.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`--> ${ctx.method} ${ctx.url}`);

  await next(); // Pass control to next middleware

  const ms = Date.now() - start;
  console.log(`<-- ${ctx.method} ${ctx.url} ${ctx.status} - ${ms}ms`);
});

// Middleware 2: Error handler
// Catches errors from downstream middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.status = err.status || 500;
    ctx.body = {
      error: err.message || 'Internal Server Error'
    };
    console.error('Error:', err);
  }
});

// Middleware 3: CORS headers
// Adds CORS headers to all responses
app.use(async (ctx, next) => {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Content-Type');

  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }

  await next();
});

// Simple router middleware
app.use(async (ctx) => {
  const { path, method } = ctx;

  // Route: GET /
  if (path === '/' && method === 'GET') {
    ctx.body = {
      message: 'Welcome to KoaX!',
      features: [
        'Context pooling for reduced GC pressure',
        'Iterative middleware execution',
        'Fully Koa-compatible',
        'High performance'
      ]
    };
    return;
  }

  // Route: GET /hello
  if (path === '/hello' && method === 'GET') {
    const name = ctx.query.name || 'World';
    ctx.body = { message: `Hello, ${name}!` };
    return;
  }

  // Route: GET /stats
  if (path === '/stats' && method === 'GET') {
    const stats = app.getPoolStats();
    ctx.body = {
      poolStats: stats,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    return;
  }

  // Route: POST /echo
  if (path === '/echo' && method === 'POST') {
    // Note: In production, you'd use a body parser middleware
    ctx.body = { echo: 'Request received', path, method };
    return;
  }

  // Route: GET /error
  if (path === '/error' && method === 'GET') {
    throw new Error('Test error');
  }

  // 404 Not Found
  ctx.status = 404;
  ctx.body = { error: 'Not Found' };
});

// Start server
const PORT =parseInt(process.env.PORT || '3006', 10);

app.listen(PORT, () => {
  console.log(`\n🚀 KoaX server listening on http://localhost:${PORT}`);
  console.log('\nTry these routes:');
  console.log(`  GET  http://localhost:${PORT}/`);
  console.log(`  GET  http://localhost:${PORT}/hello?name=Alice`);
  console.log(`  GET  http://localhost:${PORT}/stats`);
  console.log(`  GET  http://localhost:${PORT}/error`);
  console.log(`  POST http://localhost:${PORT}/echo\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  const stats = app.getPoolStats();
  console.log('Final pool stats:', stats);
  process.exit(0);
});
