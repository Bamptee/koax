/**
 * KoaX example with the built-in Router
 * Demonstrates using KoaX's Router as an alternative to @koa/router
 */

import KoaXApplication, { Router, serverTransports } from '../src';

// Create application
const app = new KoaXApplication({
  contextPoolSize: 200,
  serverTransport: serverTransports.http(), // ✅ HTTP/1.1 - Pas de limite 4KB, simple et stable
  logger: {
    enabled: true,
    prettyPrint: true,
    name: 'console-app'
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

// Create router (alternative to @koa/router)
const router = new Router();

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
  // Extract parameter from ctx.params
  const id = parseInt(ctx.params?.id || '0');
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
