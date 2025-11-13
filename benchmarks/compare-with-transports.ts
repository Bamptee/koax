/**
 * Comprehensive Benchmark: Koa vs KoaX with Server Transports
 *
 * Compares:
 * 1. Koa (standard HTTP/1.1)
 * 2. KoaX (standard HTTP/1.1) - Shows optimization gains
 * 3. KoaX + HTTP/2 - Shows transport improvement
 * 4. KoaX + uWebSockets.js - Shows maximum performance
 *
 * Usage: ts-node benchmarks/compare-with-transports.ts
 */

import autocannon from 'autocannon';
import Koa from 'koa';
import KoaX, { serverTransports } from '../src';

// Benchmark configuration
const DURATION = 10; // seconds
const CONNECTIONS = 100;
const PIPELINING = 10;

interface BenchmarkResult {
  name: string;
  requestsPerSec: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughputMB: number;
  errors: number;
  transport: string;
}

// Create middleware stack (same for all tests)
function addMiddleware(app: any) {
  // Logger middleware
  app.use(async (ctx: any, next: any) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    // Simulate logging work
    const _log = `${ctx.method} ${ctx.url} - ${ms}ms`;
  });

  // Auth simulation middleware
  app.use(async (ctx: any, next: any) => {
    const token = ctx.headers.authorization || 'default';
    ctx.state.userId = token.length; // Simulate auth check
    await next();
  });

  // Business logic middleware
  app.use(async (ctx: any, next: any) => {
    // Simulate some CPU work
    let sum = 0;
    for (let i = 0; i < 100; i++) {
      sum += Math.sqrt(i);
    }
    ctx.state.computed = sum;
    await next();
  });

  // Response middleware
  app.use(async (ctx: any) => {
    ctx.body = {
      message: 'Hello, World!',
      timestamp: Date.now(),
      userId: ctx.state.userId,
      computed: ctx.state.computed,
      path: ctx.path,
      method: ctx.method
    };
  });
}

// Run autocannon benchmark
async function runBenchmark(
  name: string,
  port: number,
  transport: string
): Promise<BenchmarkResult> {
  return new Promise((resolve, reject) => {
    console.log(`\n⏳ Running benchmark for ${name}...`);

    const instance = autocannon({
      url: `http://localhost:${port}`,
      connections: CONNECTIONS,
      pipelining: PIPELINING,
      duration: DURATION,
      timeout: 10,
    }, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      const benchResult: BenchmarkResult = {
        name,
        transport,
        requestsPerSec: result.requests.average,
        latencyP50: (result.latency as any).p50 || result.latency.mean,
        latencyP95: (result.latency as any).p95 || result.latency.mean,
        latencyP99: (result.latency as any).p99 || result.latency.max,
        throughputMB: result.throughput.average / 1024 / 1024,
        errors: result.non2xx + result.timeouts
      };

      resolve(benchResult);
    });

    autocannon.track(instance);
  });
}

// Format number with commas
function formatNumber(num: number): string {
  return Math.round(num).toLocaleString();
}

// Calculate improvement percentage
function calcImprovement(baseline: number, current: number): string {
  const improvement = ((current - baseline) / baseline) * 100;
  const sign = improvement > 0 ? '+' : '';
  return `${sign}${improvement.toFixed(1)}%`;
}

// Print comprehensive results table
function printResults(results: BenchmarkResult[]) {
  console.log('\n\n📊 COMPREHENSIVE BENCHMARK RESULTS\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════');

  const baseline = results[0]; // Koa is the baseline

  console.log('┌───────────────────────────┬──────────────┬────────────┬──────────────┬─────────────┐');
  console.log('│ Configuration             │ Req/sec      │ P50 (ms)   │ P99 (ms)     │ Throughput  │');
  console.log('├───────────────────────────┼──────────────┼────────────┼──────────────┼─────────────┤');

  results.forEach((result) => {
    const reqImprovement = result === baseline ? '' : calcImprovement(baseline.requestsPerSec, result.requestsPerSec);
    const latImprovement = result === baseline ? '' : calcImprovement(baseline.latencyP50, result.latencyP50);

    // Main row
    console.log(
      `│ ${result.name.padEnd(25)} │ ${formatNumber(result.requestsPerSec).padStart(12)} │ ` +
      `${result.latencyP50.toFixed(2).padStart(10)} │ ` +
      `${result.latencyP99.toFixed(2).padStart(12)} │ ` +
      `${result.throughputMB.toFixed(2).padStart(9)} MB │`
    );

    // Improvement row
    if (reqImprovement) {
      console.log(
        `│ ${('(' + result.transport + ')').padEnd(25)} │ ${reqImprovement.padStart(12)} │ ` +
        `${latImprovement.padStart(10)} │              │             │`
      );
    } else {
      console.log(
        `│ ${('(' + result.transport + ')').padEnd(25)} │              │            │              │             │`
      );
    }
  });

  console.log('└───────────────────────────┴──────────────┴────────────┴──────────────┴─────────────┘');

  // Winners section
  const fastestReq = results.reduce((prev, current) =>
    current.requestsPerSec > prev.requestsPerSec ? current : prev
  );
  const lowestLatency = results.reduce((prev, current) =>
    current.latencyP50 < prev.latencyP50 ? current : prev
  );

  console.log('\n🏆 WINNERS:');
  console.log(`   Highest Throughput: ${fastestReq.name}`);
  console.log(`   ${formatNumber(fastestReq.requestsPerSec)} req/sec`);
  console.log(`   ${calcImprovement(baseline.requestsPerSec, fastestReq.requestsPerSec)} vs Koa`);
  console.log('');
  console.log(`   Lowest Latency: ${lowestLatency.name}`);
  console.log(`   ${lowestLatency.latencyP50.toFixed(2)}ms (p50)`);
  console.log(`   ${calcImprovement(baseline.latencyP50, lowestLatency.latencyP50)} vs Koa`);

  // Performance gains breakdown
  console.log('\n📈 PERFORMANCE GAINS BREAKDOWN:');
  console.log('');

  if (results.length >= 2) {
    const koa = results[0];
    const koaxHttp = results[1];

    console.log('  Step 1: Koa → KoaX (same HTTP/1.1 transport)');
    console.log(`    Optimization gains: ${calcImprovement(koa.requestsPerSec, koaxHttp.requestsPerSec)}`);
    console.log('    Source: Context pooling, property caching, iterative dispatch');
  }

  if (results.length >= 3) {
    const koaxHttp = results[1];
    const koaxHttp2 = results[2];

    console.log('');
    console.log('  Step 2: KoaX HTTP/1.1 → KoaX HTTP/2');
    console.log(`    Transport gains: ${calcImprovement(koaxHttp.requestsPerSec, koaxHttp2.requestsPerSec)}`);
    console.log('    Source: HTTP/2 multiplexing, header compression');
  }

  if (results.length >= 4) {
    const koaxHttp = results[1];
    const koaxUws = results[3];

    console.log('');
    console.log('  Step 3: KoaX HTTP/1.1 → KoaX uWebSockets.js');
    console.log(`    Transport gains: ${calcImprovement(koaxHttp.requestsPerSec, koaxUws.requestsPerSec)}`);
    console.log('    Source: Native C++ implementation, zero-copy buffers');
  }

  if (results.length >= 4) {
    const koa = results[0];
    const koaxUws = results[3];

    console.log('');
    console.log('  🚀 TOTAL IMPROVEMENT: Koa → KoaX + uWebSockets.js');
    console.log(`    Combined gains: ${calcImprovement(koa.requestsPerSec, koaxUws.requestsPerSec)}`);
    console.log(`    That's ${(koaxUws.requestsPerSec / koa.requestsPerSec).toFixed(1)}x faster!`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════\n');
}

// Print configuration summary
function printConfig() {
  console.log('\n🚀 Comprehensive Koa vs KoaX Benchmark with Server Transports\n');
  console.log('Configuration:');
  console.log(`  Duration: ${DURATION}s`);
  console.log(`  Connections: ${CONNECTIONS}`);
  console.log(`  Pipelining: ${PIPELINING}`);
  console.log('');
  console.log('Middleware stack (same for all):');
  console.log('  1. Logger (timing)');
  console.log('  2. Auth simulation');
  console.log('  3. Business logic (CPU work)');
  console.log('  4. JSON response');
}

// Main benchmark function
async function main() {
  printConfig();

  const results: BenchmarkResult[] = [];
  const servers: any[] = [];

  try {
    // 1. Koa (HTTP/1.1 Baseline)
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('1️⃣  Koa (Standard HTTP/1.1) - BASELINE');
    console.log('─────────────────────────────────────────────────────────────');

    const koaApp = new Koa();
    addMiddleware(koaApp);
    const koaServer = koaApp.listen(3030);
    servers.push(koaServer);

    await new Promise(resolve => setTimeout(resolve, 1000));
    const koaResult = await runBenchmark('Koa (Standard)', 3030, 'HTTP/1.1');
    results.push(koaResult);

    // 2. KoaX (HTTP/1.1 - Shows optimization gains)
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('2️⃣  KoaX (Standard HTTP/1.1)');
    console.log('    Shows: Context pooling + caching optimizations');
    console.log('─────────────────────────────────────────────────────────────');

    const koaxHttpApp = new KoaX({
      contextPoolSize: 200,
      logger: { enabled: false },
      timing: false,
      // Default transport is HTTP/1.1
    });
    addMiddleware(koaxHttpApp);
    const koaxHttpServer = koaxHttpApp.listen(3031);
    servers.push(koaxHttpServer);

    await new Promise(resolve => setTimeout(resolve, 1000));
    const koaxHttpResult = await runBenchmark('KoaX (HTTP/1.1)', 3031, 'HTTP/1.1');
    results.push(koaxHttpResult);

    // 3. KoaX + HTTP/2
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('3️⃣  KoaX + HTTP/2');
    console.log('    Shows: KoaX optimizations + HTTP/2 transport');
    console.log('─────────────────────────────────────────────────────────────');

    const koaxHttp2App = new KoaX({
      contextPoolSize: 200,
      logger: { enabled: false },
      timing: false,
      serverTransport: serverTransports.http2()
    });
    addMiddleware(koaxHttp2App);
    const koaxHttp2Server = koaxHttp2App.listen(3032);
    servers.push(koaxHttp2Server);

    await new Promise(resolve => setTimeout(resolve, 1000));
    const koaxHttp2Result = await runBenchmark('KoaX + HTTP/2', 3032, 'HTTP/2 cleartext');
    results.push(koaxHttp2Result);

    // 4. KoaX + uWebSockets.js (if available)
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('4️⃣  KoaX + uWebSockets.js');
    console.log('    Shows: KoaX optimizations + ultra-fast transport');
    console.log('─────────────────────────────────────────────────────────────');

    try {
      const koaxUwsApp = new KoaX({
        contextPoolSize: 200,
        logger: { enabled: false },
        timing: false,
        serverTransport: serverTransports.uws({
          maxPayloadLength: 16 * 1024 * 1024,
          idleTimeout: 120,
          maxBackpressure: 1024 * 1024
        })
      });
      addMiddleware(koaxUwsApp);
      const koaxUwsServer = koaxUwsApp.listen(3033);
      servers.push(koaxUwsServer);

      await new Promise(resolve => setTimeout(resolve, 1000));
      const koaxUwsResult = await runBenchmark('KoaX + uWebSockets.js', 3033, 'uWebSockets.js');
      results.push(koaxUwsResult);
    } catch (err: any) {
      console.log('⚠️  uWebSockets.js not available (install with: npm install uWebSockets.js)');
      console.log('    Skipping this benchmark...');
    }

    // Print comprehensive results
    printResults(results);

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:\n');
    console.log('  Development:');
    console.log('    → Use Koa or KoaX with default HTTP/1.1');
    console.log('    → Easy debugging, fast restart');
    console.log('');
    console.log('  Internal APIs / Microservices:');
    console.log('    → Use KoaX + HTTP/2');
    console.log('    → Good balance of performance and compatibility');
    console.log('');
    console.log('  High-Performance Production:');
    console.log('    → Use KoaX + uWebSockets.js');
    console.log('    → Maximum throughput, lowest latency');
    console.log('    → Best for high-traffic REST/JSON APIs');
    console.log('');
    console.log('  Public APIs (with browsers):');
    console.log('    → Use KoaX + HTTP/2 Secure (with TLS)');
    console.log('    → Or KoaX + HTTP/2 Fallback for compatibility');
    console.log('');

  } catch (err) {
    console.error('Error running benchmarks:', err);
  } finally {
    // Clean up servers
    console.log('🧹 Cleaning up servers...');
    for (const server of servers) {
      try {
        if (server && typeof server.close === 'function') {
          server.close();
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    // Give time for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    process.exit(0);
  }
}

// Run benchmarks
main().catch(console.error);
