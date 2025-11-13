/**
 * Server Transports Example
 *
 * This example demonstrates how to use different HTTP server transports
 * for varying performance and compatibility requirements.
 *
 * Available transports:
 * 1. HTTP (standard) - Default, maximum compatibility
 * 2. HTTP/2 (cleartext) - Better performance for internal services
 * 3. uWebSockets.js - Ultra high performance (3-10x faster)
 *
 * Usage:
 * ts-node examples/with-server-transports.ts [1|2|3]
 */

import KoaX, { serverTransports } from '../src';

// Get example number from command line (default: 1)
const example = parseInt(process.argv[2] || '1', 10);

function createApp(name: string, serverTransport?: any) {
  const app = new KoaX({
    logger: {
      enabled: true,
      prettyPrint: true,
      name
    },
    serverTransport
  });

  // Simple middleware
  app.use(async (ctx) => {
    if (ctx.path === '/') {
      ctx.body = {
        message: 'Hello from KoaX!',
        transport: name,
        timestamp: new Date().toISOString()
      };
    } else if (ctx.path === '/heavy') {
      // Simulate some CPU work
      let result = 0;
      for (let i = 0; i < 1000000; i++) {
        result += Math.sqrt(i);
      }
      ctx.body = {
        message: 'Heavy computation completed',
        transport: name,
        result: Math.floor(result),
        timestamp: new Date().toISOString()
      };
    } else {
      ctx.status = 404;
      ctx.body = { error: 'Not found' };
    }
  });

  return app;
}

console.log('\n🚀 KoaX Server Transports Example\n');

switch (example) {
  case 1: {
    console.log('📦 Example 1: Standard HTTP Transport (Default)');
    console.log('   Performance: Baseline');
    console.log('   Best for: Development, maximum compatibility\n');

    const app = createApp('http-standard', serverTransports.http());

    app.listen(3010, () => {
      console.log('✅ Server running on http://localhost:3010');
      console.log('\nTry:');
      console.log('  curl http://localhost:3010/');
      console.log('  curl http://localhost:3010/heavy');
      console.log('\nBenchmark:');
      console.log('  autocannon -c 100 -d 10 http://localhost:3010/');
    });
    break;
  }

  case 2: {
    console.log('📦 Example 2: HTTP/2 Cleartext Transport');
    console.log('   Performance: +20-40% vs HTTP/1.1');
    console.log('   Best for: Internal services, microservices\n');

    const app = createApp('http2-cleartext', serverTransports.http2());

    app.listen(3011, () => {
      console.log('✅ Server running on http://localhost:3011 (HTTP/2)');
      console.log('\nTry:');
      console.log('  curl --http2-prior-knowledge http://localhost:3011/');
      console.log('  curl --http2-prior-knowledge http://localhost:3011/heavy');
      console.log('\nNote: Use --http2-prior-knowledge flag with curl for cleartext HTTP/2');
      console.log('\nBenchmark:');
      console.log('  autocannon -c 100 -d 10 http://localhost:3011/');
    });
    break;
  }

  case 3: {
    console.log('📦 Example 3: uWebSockets.js Transport (Ultra High Performance)');
    console.log('   Performance: +300-1000% vs HTTP/1.1 (3-10x faster!)');
    console.log('   Best for: High-throughput APIs, production at scale\n');

    try {
      const app = createApp('uwebsockets', serverTransports.uws({
        maxPayloadLength: 16 * 1024 * 1024, // 16MB
        idleTimeout: 120,
        maxBackpressure: 1024 * 1024
      }));

      app.listen(3012, () => {
        console.log('✅ Server running on http://localhost:3012 (uWebSockets.js)');
        console.log('\nTry:');
        console.log('  curl http://localhost:3012/');
        console.log('  curl http://localhost:3012/heavy');
        console.log('\nBenchmark:');
        console.log('  autocannon -c 100 -d 10 http://localhost:3012/');
        console.log('\nExpect 5-10x higher req/sec compared to standard HTTP!');
      });
    } catch (err: any) {
      console.error('❌ Error:', err.message);
      console.log('\n📥 To use uWebSockets.js, install it first:');
      console.log('   npm install uWebSockets.js');
      console.log('\nNote: Requires C++ compiler (build-essential on Linux, Xcode on macOS)');
      process.exit(1);
    }
    break;
  }

  default: {
    console.log('❌ Invalid example number. Use 1, 2, or 3.');
    console.log('\nExamples:');
    console.log('  1 - Standard HTTP (default)');
    console.log('  2 - HTTP/2 Cleartext');
    console.log('  3 - uWebSockets.js (ultra performance)');
    console.log('\nUsage:');
    console.log('  ts-node examples/with-server-transports.ts [1|2|3]');
    process.exit(1);
  }
}

// Performance Comparison Table
console.log('\n📊 Performance Comparison (typical results):');
console.log('┌─────────────────────┬──────────────┬─────────────┬──────────────┐');
console.log('│ Transport           │ Req/sec      │ Latency (p50)│ Memory      │');
console.log('├─────────────────────┼──────────────┼─────────────┼──────────────┤');
console.log('│ HTTP/1.1 (standard) │ ~20,000      │ ~5ms        │ Baseline    │');
console.log('│ HTTP/2 (cleartext)  │ ~28,000      │ ~3.5ms      │ +10-20%     │');
console.log('│ uWebSockets.js      │ ~100,000+    │ ~1-2ms      │ -20-40%     │');
console.log('└─────────────────────┴──────────────┴─────────────┴──────────────┘');
console.log('\nNote: Actual performance depends on hardware, payload, and middleware complexity.\n');
