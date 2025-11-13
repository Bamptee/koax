/**
 * KoaX example with standard Koa middleware
 *
 * This example demonstrates 100% compatibility with existing Koa middleware:
 * - @koa/cors for CORS handling
 * - koa-body for request body parsing (JSON, multipart, urlencoded)
 * - @koa/router for routing
 *
 * All middleware work without ANY modifications!
 */

import KoaX, { KoaXContext } from '../src';
import cors from '@koa/cors';
import koaBody from 'koa-body';
import Router from '@koa/router';

// Create KoaX application with logging
const app = new KoaX({
  logger: {
    enabled: true,
    prettyPrint: true,
    name: 'koa-middleware-example'
  }
});

// ============================================
// STANDARD KOA MIDDLEWARE - NO MODIFICATIONS
// ============================================

// Enable CORS with default options
// TypeScript note: We use 'as any' to bridge type definitions between Koa and KoaX.
// At runtime, KoaX context is 100% compatible with Koa context.
app.use(cors() as any);

// Enable body parser with custom options
app.use(
  koaBody({
    multipart: true,
    jsonLimit: `${5 * 8}mb`,
    formLimit: '10mb',
    textLimit: '10mb',
  }) as any
);

// Global error handler (standard Koa pattern)
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.log.error(err, 'Request failed');
    ctx.status = err.status || 500;
    ctx.body = {
      error: err.message,
      requestId: ctx.requestId,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    };
    ctx.app.emit('error', err, ctx);
  }
});

// Request logger middleware (using KoaX logger)
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  ctx.log.info('Request completed', {
    method: ctx.method,
    path: ctx.path,
    status: ctx.status,
    duration: `${duration}ms`,
    ip: ctx.ip,
    userAgent: ctx.headers['user-agent']
  });
});

// ============================================
// ROUTES USING @koa/router (standard Koa router)
// ============================================

const router = new Router();

// Root endpoint
router.get('/', async (ctx: KoaXContext) => {
  ctx.body = {
    name: 'KoaX API with Koa Middleware',
    version: '1.0.0',
    features: [
      'Standard Koa middleware (@koa/cors, koa-body)',
      'KoaX optimizations (context pooling, iterative dispatch)',
      'KoaX additions (hooks, structured logging, request ID)',
      '100% Koa compatibility'
    ],
    endpoints: [
      'GET  /',
      'GET  /users',
      'POST /users',
      'PUT  /users/:id',
      'GET  /upload',
      'POST /upload',
      'POST /json-test',
      'GET  /headers',
      'GET  /error'
    ]
  };
});

// Simulated database
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' }
];

// GET users - standard Koa route
router.get('/users', async (ctx: KoaXContext) => {
  ctx.log.info('Fetching users');

  // Koa query parsing works perfectly
  const role = ctx.query.role;

  const filteredUsers = role
    ? users.filter(u => u.role === role)
    : users;

  ctx.body = {
    users: filteredUsers,
    count: filteredUsers.length,
    requestId: ctx.requestId
  };
});

// POST users - tests JSON body parsing
router.post('/users', async (ctx: KoaXContext) => {
  // koa-body parses JSON automatically
  const body = (ctx.request as any).body;

  ctx.log.info('Creating user', { name: body.name });

  // Validate
  if (!body.name || !body.email) {
    ctx.throw(400, 'Name and email are required');
  }

  const newUser = {
    id: users.length + 1,
    name: body.name,
    email: body.email,
    role: body.role || 'user'
  };

  users.push(newUser);

  ctx.status = 201;
  ctx.body = {
    message: 'User created',
    user: newUser,
    requestId: ctx.requestId
  };
});

// PUT user - tests URL params and JSON body
router.put('/users/:id', async (ctx: KoaXContext) => {
  const id = parseInt(ctx.params?.id || '0');
  const body = (ctx.request as any).body;

  ctx.log.info('Updating user', { id, updates: body });

  const user = users.find(u => u.id === id);

  if (!user) {
    ctx.throw(404, 'User not found');
  }

  // Update user
  if (body.name) user.name = body.name;
  if (body.email) user.email = body.email;
  if (body.role) user.role = body.role;

  ctx.body = {
    message: 'User updated',
    user,
    requestId: ctx.requestId
  };
});

// GET upload form
router.get('/upload', async (ctx: KoaXContext) => {
  ctx.type = 'text/html';
  ctx.body = `
<!DOCTYPE html>
<html>
<head>
  <title>KoaX File Upload Test</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    input, textarea { width: 100%; margin: 10px 0; padding: 8px; }
    button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
  </style>
</head>
<body>
  <h1>🚀 KoaX File Upload Test</h1>
  <p>Testing <code>koa-body</code> multipart support with KoaX</p>

  <form action="/upload" method="POST" enctype="multipart/form-data">
    <label>Name:</label>
    <input type="text" name="name" required />

    <label>Description:</label>
    <textarea name="description" rows="4"></textarea>

    <label>File:</label>
    <input type="file" name="file" required />

    <button type="submit">Upload</button>
  </form>
</body>
</html>
  `;
});

// POST upload - tests multipart/form-data parsing
router.post('/upload', async (ctx: KoaXContext) => {
  // koa-body parses multipart automatically
  const { name, description } = (ctx.request as any).body;
  const files = (ctx.request as any).files;

  ctx.log.info('File upload', {
    name,
    hasFile: !!files?.file,
    fileName: files?.file?.originalFilename
  });

  if (!files || !files.file) {
    ctx.throw(400, 'File is required');
  }

  const file = files.file;

  ctx.body = {
    message: 'File uploaded successfully',
    upload: {
      name,
      description,
      file: {
        name: file.originalFilename,
        size: file.size,
        type: file.mimetype,
        path: file.filepath
      }
    },
    requestId: ctx.requestId
  };
});

// Test large JSON payload
router.post('/json-test', async (ctx: KoaXContext) => {
  const body = (ctx.request as any).body;

  ctx.log.info('JSON test', {
    bodySize: JSON.stringify(body).length,
    keys: Object.keys(body).length
  });

  ctx.body = {
    message: 'JSON parsed successfully',
    stats: {
      bodySize: `${(JSON.stringify(body).length / 1024).toFixed(2)} KB`,
      keys: Object.keys(body).length
    },
    requestId: ctx.requestId
  };
});

// Test header access (Koa API)
router.get('/headers', async (ctx: KoaXContext) => {
  ctx.body = {
    message: 'Headers test',
    request: {
      method: ctx.method,
      url: ctx.url,
      path: ctx.path,
      query: ctx.query,
      headers: ctx.headers,
      ip: ctx.ip,
      ips: ctx.ips,
      secure: ctx.secure,
      protocol: (ctx.request as any).protocol,
      host: ctx.host,
      hostname: ctx.hostname,
      fresh: ctx.fresh,
      stale: ctx.stale
    },
    requestId: ctx.requestId
  };
});

// Test error handling
router.get('/error', async (ctx: KoaXContext) => {
  ctx.log.warn('Intentional error triggered');
  ctx.throw(500, 'Intentional error for testing');
});

// Register router middleware
// TypeScript note: router.routes() returns Koa middleware type
// We cast to 'any' to bridge the type definitions
app.use(router.routes() as any);
app.use(router.allowedMethods() as any);

// 404 handler (runs if no route matched)
app.use(async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    error: 'Not Found',
    path: ctx.path,
    message: `Route ${ctx.method} ${ctx.path} not found`,
    requestId: ctx.requestId
  };
});

// ============================================
// KOAX HOOKS (additional features)
// ============================================

// Hook: Security headers
app.onRequest(async (ctx) => {
  ctx.set('X-Frame-Options', 'DENY');
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('X-XSS-Protection', '1; mode=block');
});

// Hook: Add request ID to response headers
app.onResponse(async (ctx) => {
  ctx.set('X-Request-ID', ctx.requestId);
});

// Error listener
app.on('error', (err, ctx) => {
  if (!app.silent) {
    console.error('Application error:', err);
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = parseInt(process.env.PORT || '3007');

app.listen(PORT, () => {
  console.log(`\n🚀 KoaX server with Koa middleware listening on http://localhost:${PORT}`);
  console.log('\n📦 Using standard Koa middleware:');
  console.log('  ✅ @koa/cors - CORS handling');
  console.log('  ✅ koa-body - JSON, multipart, urlencoded parsing');
  console.log('  ✅ @koa/router - Routing');
  console.log('\n🎯 Test endpoints:');
  console.log(`  GET    http://localhost:${PORT}/`);
  console.log(`  GET    http://localhost:${PORT}/users`);
  console.log(`  GET    http://localhost:${PORT}/users?role=admin`);
  console.log(`  POST   http://localhost:${PORT}/users`);
  console.log(`  PUT    http://localhost:${PORT}/users/1`);
  console.log(`  GET    http://localhost:${PORT}/upload`);
  console.log(`  GET    http://localhost:${PORT}/headers`);
  console.log(`  GET    http://localhost:${PORT}/error`);
  console.log('\n💡 Try these commands:');
  console.log(`  curl http://localhost:${PORT}/`);
  console.log(`  curl http://localhost:${PORT}/users`);
  console.log(`  curl -X POST http://localhost:${PORT}/users -H "Content-Type: application/json" -d '{"name":"Dave","email":"dave@example.com","role":"admin"}'`);
  console.log(`  curl -X PUT http://localhost:${PORT}/users/1 -H "Content-Type: application/json" -d '{"name":"Alice Smith"}'`);
  console.log(`  curl http://localhost:${PORT}/headers`);
  console.log('\n📊 Features:');
  console.log('  ✅ 100% Koa middleware compatibility');
  console.log('  ✅ KoaX optimizations (context pooling, +23% faster)');
  console.log('  ✅ KoaX additions (hooks, structured logging, request ID)');
  console.log('  ✅ Default Content-Type: application/json');
  console.log('');
});
