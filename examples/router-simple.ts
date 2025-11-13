/**
 * Simple Router Example
 *
 * Demonstrates basic usage of KoaX Router
 * Alternative to @koa/router with zero dependencies
 */

import KoaX, { Router } from '../src';

const app = new KoaX();
const router = new Router();

// Define routes
router.get('/', async (ctx) => {
  ctx.body = {
    message: 'Welcome to KoaX Router!',
    docs: '/api/docs',
    users: '/api/users'
  };
});

router.get('/api/users', async (ctx) => {
  ctx.body = {
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  };
});

router.get('/api/users/:id', async (ctx) => {
  const id = parseInt(ctx.params?.id || '0');

  // Simple validation
  if (isNaN(id)) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid user ID' };
    return;
  }

  // Simulated database lookup
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
  ];

  const user = users.find(u => u.id === id);

  if (!user) {
    ctx.status = 404;
    ctx.body = { error: 'User not found' };
    return;
  }

  ctx.body = { user };
});

router.post('/api/users', async (ctx) => {
  ctx.status = 201;
  ctx.body = {
    message: 'User created',
    id: 3
  };
});

router.delete('/api/users/:id', async (ctx) => {
  ctx.status = 204; // No content
});

// Use router middleware
app.use(router.routes());

// 404 handler
app.use(async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    error: 'Not Found',
    path: ctx.path
  };
});

// Start server
const PORT = 3007;

app.listen(PORT, () => {
  console.log(`\n🚀 KoaX Router example listening on http://localhost:${PORT}\n`);
  console.log('Try:');
  console.log(`  curl http://localhost:${PORT}/`);
  console.log(`  curl http://localhost:${PORT}/api/users`);
  console.log(`  curl http://localhost:${PORT}/api/users/1`);
  console.log(`  curl -X POST http://localhost:${PORT}/api/users`);
  console.log(`  curl -X DELETE http://localhost:${PORT}/api/users/1\n`);
});
