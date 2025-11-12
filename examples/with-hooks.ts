/**
 * KoaX Example with Hooks and Logger
 *
 * Demonstrates:
 * - onRequest hooks for authentication, request logging
 * - onResponse hooks for metrics, response logging
 * - onError hooks for error handling, alerting
 * - ctx.log.info() and ctx.log.error() usage
 * - Automatic request timing
 */

import KoaX from '../src';

const app = new KoaX({
  contextPoolSize: 1000,
  logger: {
    enabled: true,
    level: 'info',
    prettyPrint: true, // Pretty logging for development
    name: 'my-api'
  },
  timing: true // Enable automatic timing (default)
});

// ============================================================================
// HOOKS SYSTEM
// ============================================================================

/**
 * onRequest Hook: Request initialization
 * Runs before any middleware
 */
app.onRequest(async (ctx) => {
  ctx.log.info('Request received');

  // Add request start time to state for custom metrics
  ctx.state.startTime = Date.now();

  // Example: Could add authentication check here
  // if (!ctx.headers.authorization) {
  //   ctx.throw(401, 'Unauthorized');
  // }
});

/**
 * onRequest Hook: Security headers
 */
app.onRequest(async (ctx) => {
  // Add security headers
  ctx.set('X-Frame-Options', 'DENY');
  ctx.set('X-Content-Type-Options', 'nosniff');
});

/**
 * onResponse Hook: Custom metrics
 * Runs after all middleware, before response is sent
 */
app.onResponse(async (ctx) => {
  const duration = Date.now() - ctx.state.startTime;

  // Log metrics
  ctx.log.info('Response prepared', {
    status: ctx.status,
    duration: `${duration}ms`,
    contentLength: ctx.get('Content-Length') || 0
  });

  // Example: Could send metrics to monitoring service
  // metricsService.record({
  //   endpoint: ctx.path,
  //   method: ctx.method,
  //   status: ctx.status,
  //   duration
  // });
});

/**
 * onError Hook: Error logging and monitoring
 */
app.onError(async (error, ctx) => {
  // Log error with full context
  ctx.log.error({
    err: error,
    path: ctx.path,
    method: ctx.method,
    headers: ctx.headers,
    query: ctx.query
  }, 'Request error occurred');

  // Example: Could send alert to monitoring service
  // if (error.status >= 500) {
  //   alertService.send({
  //     message: `Server error on ${ctx.path}`,
  //     error: error.message,
  //     stack: error.stack
  //   });
  // }
});

// ============================================================================
// MIDDLEWARE (Compatible with Koa)
// ============================================================================

/**
 * Middleware: Error handler
 */
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    // Log with context logger
    ctx.log.error(err, 'Error in middleware');

    ctx.status = err.status || 500;
    ctx.body = {
      error: err.message || 'Internal Server Error',
      requestId: ctx.requestId
    };
  }
});

/**
 * Middleware: Request logger (demonstration of ctx.log)
 */
app.use(async (ctx, next) => {
  ctx.log.info('Processing request', {
    userAgent: ctx.headers['user-agent'],
    ip: ctx.req.socket.remoteAddress
  });

  await next();

  ctx.log.info('Request processed', {
    responseTime: `${Date.now() - ctx.startTime}ms`
  });
});

/**
 * Middleware: Routes
 */
app.use(async (ctx) => {
  const { path, method } = ctx;

  // Route: GET /
  if (path === '/' && method === 'GET') {
    ctx.log.info('Serving home page');

    ctx.body = {
      message: 'Welcome to KoaX with Hooks!',
      requestId: ctx.requestId,
      features: [
        'onRequest hooks',
        'onResponse hooks',
        'onError hooks',
        'Structured logging (ctx.log)',
        'Automatic request timing',
        'Koa middleware compatibility'
      ]
    };
    return;
  }

  // Route: GET /hello
  if (path === '/hello' && method === 'GET') {
    const name = ctx.query.name || 'World';

    ctx.log.info('Greeting user', { name });

    ctx.body = {
      message: `Hello, ${name}!`,
      requestId: ctx.requestId,
      timestamp: new Date().toISOString()
    };
    return;
  }

  // Route: GET /stats
  if (path === '/stats' && method === 'GET') {
    ctx.log.debug('Fetching stats'); // Debug level log

    const poolStats = app.getPoolStats();

    ctx.body = {
      poolStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      requestId: ctx.requestId
    };
    return;
  }

  // Route: GET /slow
  // Demonstrates timing logs
  if (path === '/slow' && method === 'GET') {
    ctx.log.info('Starting slow operation');

    // Simulate slow operation
    await new Promise(resolve => setTimeout(resolve, 1000));

    ctx.log.info('Slow operation completed');

    ctx.body = {
      message: 'Slow operation completed',
      duration: `${Date.now() - ctx.startTime}ms`
    };
    return;
  }

  // Route: GET /error
  // Demonstrates error hooks
  if (path === '/error' && method === 'GET') {
    ctx.log.warn('Throwing test error');

    const error: any = new Error('This is a test error');
    error.status = 400;
    error.expose = true;
    throw error;
  }

  // Route: GET /server-error
  // Demonstrates 500 error handling
  if (path === '/server-error' && method === 'GET') {
    throw new Error('Internal server error');
  }

  // Route: POST /data
  if (path === '/data' && method === 'POST') {
    ctx.log.info('Received POST data');

    ctx.body = {
      message: 'Data received',
      requestId: ctx.requestId
    };
    return;
  }

  // 404 Not Found
  ctx.log.debug('Route not found', { path, method });
  ctx.status = 404;
  ctx.body = {
    error: 'Not Found',
    path,
    requestId: ctx.requestId
  };
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = parseInt(process.env.PORT || '3002', 10);

app.listen(PORT, () => {
  app.logger.info(`\n🚀 KoaX server with hooks listening on http://localhost:${PORT}`);
  app.logger.info('\nTry these routes:');
  app.logger.info(`  GET  http://localhost:${PORT}/`);
  app.logger.info(`  GET  http://localhost:${PORT}/hello?name=Alice`);
  app.logger.info(`  GET  http://localhost:${PORT}/stats`);
  app.logger.info(`  GET  http://localhost:${PORT}/slow`);
  app.logger.info(`  GET  http://localhost:${PORT}/error`);
  app.logger.info(`  GET  http://localhost:${PORT}/server-error`);
  app.logger.info(`  POST http://localhost:${PORT}/data\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  app.logger.info('\n\n👋 Shutting down gracefully...');
  const stats = app.getPoolStats();
  app.logger.info('Final pool stats:', stats);
  process.exit(0);
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  app.logger.error({
    reason,
    promise
  }, 'Unhandled Rejection');
});
