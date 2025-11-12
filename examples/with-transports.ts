/**
 * KoaX Example with Custom Transports
 *
 * Demonstrates:
 * - Console transport (default)
 * - File transport (write logs to file)
 * - HTTP transport (send logs to external service)
 * - Multi transport (write to multiple destinations)
 * - Custom transport (custom log handling)
 * - Filtered transport (filter logs by criteria)
 */

import KoaX, { transports } from '../src';
import { join } from 'path';

// ============================================================================
// EXAMPLE 1: Console Transport (Default)
// ============================================================================

function example1_consoleTransport() {
  console.log('\n=== Example 1: Console Transport (Default) ===\n');

  const app = new KoaX({
    logger: {
      enabled: true,
      prettyPrint: true,
      name: 'console-app'
      // No transport specified = uses ConsoleTransport by default
    }
  });

  app.use(async (ctx) => {
    ctx.log.info('Processing with console transport');
    ctx.body = { message: 'Logged to console' };
  });

  return app;
}

// ============================================================================
// EXAMPLE 2: File Transport
// ============================================================================

function example2_fileTransport() {
  console.log('\n=== Example 2: File Transport ===\n');

  const app = new KoaX({
    logger: {
      enabled: true,
      name: 'file-app',
      transport: transports.file(
        join(__dirname, '../logs/app.log'),
        {
          bufferSize: 10,      // Flush after 10 entries
          flushIntervalMs: 1000 // Or every second
        }
      )
    }
  });

  app.use(async (ctx) => {
    ctx.log.info('Processing with file transport');
    ctx.body = { message: 'Logged to file: logs/app.log' };
  });

  console.log('✅ Logs will be written to: logs/app.log');
  return app;
}

// ============================================================================
// EXAMPLE 3: HTTP Transport
// ============================================================================

function example3_httpTransport() {
  console.log('\n=== Example 3: HTTP Transport ===\n');

  const app = new KoaX({
    logger: {
      enabled: true,
      name: 'http-app',
      transport: transports.http(
        'https://logs.example.com/api/logs',
        {
          headers: {
            'Authorization': 'Bearer YOUR_TOKEN',
            'Content-Type': 'application/json'
          },
          bufferSize: 20,      // Batch 20 logs
          flushIntervalMs: 5000 // Send every 5 seconds
        }
      )
    }
  });

  app.use(async (ctx) => {
    ctx.log.info('Processing with HTTP transport');
    ctx.body = { message: 'Logged to HTTP endpoint' };
  });

  console.log('✅ Logs will be sent to external HTTP service');
  return app;
}

// ============================================================================
// EXAMPLE 4: Multi Transport
// ============================================================================

function example4_multiTransport() {
  console.log('\n=== Example 4: Multi Transport (Console + File) ===\n');

  const app = new KoaX({
    logger: {
      enabled: true,
      name: 'multi-app',
      prettyPrint: true,
      transport: transports.multi(
        // Write to console with pretty print
        transports.console({ prettyPrint: true }),
        // AND write to file as JSON
        transports.file(join(__dirname, '../logs/multi.log'))
      )
    }
  });

  app.use(async (ctx) => {
    ctx.log.info('Processing with multi transport');
    ctx.body = { message: 'Logged to both console and file' };
  });

  console.log('✅ Logs will go to both console and file');
  return app;
}

// ============================================================================
// EXAMPLE 5: Custom Transport
// ============================================================================

function example5_customTransport() {
  console.log('\n=== Example 5: Custom Transport (Function) ===\n');

  // Custom log handler
  const customHandler = (entry: any) => {
    // Example: Send to monitoring service, database, etc.
    if (entry.level >= 50) { // Error or fatal
      console.error('🚨 ALERT:', entry.msg, entry);
      // Could send to PagerDuty, Slack, etc.
    } else {
      console.log('📝 Log:', entry.msg);
    }
  };

  const app = new KoaX({
    logger: {
      enabled: true,
      name: 'custom-app',
      transport: transports.custom(customHandler)
    }
  });

  app.use(async (ctx) => {
    ctx.log.info('Processing with custom transport');
    if (ctx.path === '/error') {
      ctx.log.error('Test error for custom handler');
    }
    ctx.body = { message: 'Using custom log handler' };
  });

  console.log('✅ Using custom function for log handling');
  return app;
}

// ============================================================================
// EXAMPLE 6: Filtered Transport
// ============================================================================

function example6_filteredTransport() {
  console.log('\n=== Example 6: Filtered Transport (Errors Only) ===\n');

  const app = new KoaX({
    logger: {
      enabled: true,
      name: 'filtered-app',
      prettyPrint: true,
      transport: transports.multi(
        // Console: all logs
        transports.console({ prettyPrint: true }),
        // File: errors only
        transports.filter(
          transports.file(join(__dirname, '../logs/errors.log')),
          (entry) => entry.level >= 50 // Only error and fatal
        )
      )
    }
  });

  app.use(async (ctx) => {
    ctx.log.info('Info log - goes to console only');
    ctx.log.warn('Warning log - goes to console only');

    if (ctx.path === '/error') {
      ctx.log.error('Error log - goes to both console AND file');
    }

    ctx.body = { message: 'Errors logged separately' };
  });

  console.log('✅ Info logs to console, errors to both console and file');
  return app;
}

// ============================================================================
// EXAMPLE 7: Production Setup
// ============================================================================

function example7_productionSetup() {
  console.log('\n=== Example 7: Production Setup ===\n');

  const isProduction = process.env.NODE_ENV === 'production';

  const app = new KoaX({
    logger: {
      enabled: true,
      level: isProduction ? 'info' : 'debug',
      prettyPrint: !isProduction,
      name: 'prod-app',
      transport: isProduction
        ? // Production: JSON to file + errors to monitoring
          transports.multi(
            transports.file(join(__dirname, '../logs/production.log')),
            transports.filter(
              transports.http('https://monitoring.example.com/api/errors', {
                headers: { 'Authorization': 'Bearer TOKEN' }
              }),
              (entry) => entry.level >= 50 // Only errors to monitoring
            )
          )
        : // Development: Pretty print to console
          transports.console({ prettyPrint: true })
    }
  });

  app.onRequest(async (ctx) => {
    ctx.log.info('Request received');
  });

  app.onResponse(async (ctx) => {
    ctx.log.info('Response sent', {
      status: ctx.status,
      duration: `${Date.now() - ctx.startTime}ms`
    });
  });

  app.onError(async (error, ctx) => {
    ctx.log.error(error, 'Request failed');
  });

  app.use(async (ctx) => {
    if (ctx.path === '/') {
      ctx.body = { message: 'Production-ready logging setup' };
    } else if (ctx.path === '/error') {
      throw new Error('Test production error');
    } else {
      ctx.status = 404;
      ctx.body = { error: 'Not Found' };
    }
  });

  console.log(`✅ Production setup (env: ${isProduction ? 'production' : 'development'})`);
  return app;
}

// ============================================================================
// MAIN: Run selected example
// ============================================================================

const examples = {
  '1': example1_consoleTransport,
  '2': example2_fileTransport,
  '3': example3_httpTransport,
  '4': example4_multiTransport,
  '5': example5_customTransport,
  '6': example6_filteredTransport,
  '7': example7_productionSetup
};

const exampleNum = process.argv[2] || '1';
const createApp = examples[exampleNum as keyof typeof examples];

if (!createApp) {
  console.error('Invalid example number. Use 1-7');
  console.log('\nAvailable examples:');
  console.log('  1 - Console Transport (default)');
  console.log('  2 - File Transport');
  console.log('  3 - HTTP Transport');
  console.log('  4 - Multi Transport (console + file)');
  console.log('  5 - Custom Transport');
  console.log('  6 - Filtered Transport (errors to file)');
  console.log('  7 - Production Setup\n');
  console.log('Usage: ts-node examples/with-transports.ts [1-7]');
  process.exit(1);
}

const app = createApp();

const PORT = parseInt(process.env.PORT || '3003', 10);

app.listen(PORT, () => {
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`);
  console.log('\nTry these routes:');
  console.log(`  GET  http://localhost:${PORT}/`);
  console.log(`  GET  http://localhost:${PORT}/error`);
  console.log('\nPress Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  process.exit(0);
});
