/**
 * Benchmark: KoaX vs Koa
 *
 * Compares performance between standard Koa and KoaX
 * Tests throughput, latency, and resource usage
 */

import { performance } from 'node:perf_hooks';
import Koa from 'koa';
import KoaXApplication from '../src';

// Test configuration
const WARMUP_REQUESTS = 1000;
const TEST_REQUESTS = 10000;
const CONCURRENT_REQUESTS = 100;

/**
 * Simulate a simple HTTP request without network overhead
 */
async function simulateRequest(
  handler: (req: any, res: any) => void,
  path: string = '/'
): Promise<number> {
  const start = performance.now();

  // Mock request/response objects
  const mockReq = {
    url: path,
    method: 'GET',
    headers: {
      'user-agent': 'benchmark',
      'accept': 'application/json'
    },
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1
  };

  const mockRes = {
    statusCode: 200,
    statusMessage: '',
    headers: {} as any,
    headersSent: false,
    writableEnded: false,
    setHeader(key: string, value: any) {
      this.headers[key] = value;
    },
    getHeader(key: string) {
      return this.headers[key];
    },
    removeHeader(key: string) {
      delete this.headers[key];
    },
    end(body?: any) {
      this.writableEnded = true;
    },
    write(chunk: any) {},
    on(event: string, callback: Function) {}
  };

  // Execute handler
  await new Promise<void>((resolve) => {
    handler(mockReq, mockRes);
    // Simulate response completion
    setImmediate(() => {
      resolve();
    });
  });

  return performance.now() - start;
}

/**
 * Run benchmark for a framework
 */
async function runBenchmark(
  name: string,
  createApp: () => any,
  requests: number
): Promise<{
  name: string;
  totalTime: number;
  avgLatency: number;
  requestsPerSecond: number;
  minLatency: number;
  maxLatency: number;
  p50: number;
  p95: number;
  p99: number;
}> {
  const app = createApp();
  const handler = app.callback();

  console.log(`\nRunning ${name} benchmark...`);

  // Warmup
  console.log(`  Warming up (${WARMUP_REQUESTS} requests)...`);
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await simulateRequest(handler);
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const memBefore = process.memoryUsage();

  // Benchmark
  console.log(`  Testing (${requests} requests)...`);
  const latencies: number[] = [];
  const start = performance.now();

  // Run requests in batches for concurrency
  const batchSize = CONCURRENT_REQUESTS;
  const batches = Math.ceil(requests / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchPromises = [];
    const batchCount = Math.min(batchSize, requests - batch * batchSize);

    for (let i = 0; i < batchCount; i++) {
      batchPromises.push(simulateRequest(handler));
    }

    const batchLatencies = await Promise.all(batchPromises);
    latencies.push(...batchLatencies);

    // Progress indicator
    if ((batch + 1) % 10 === 0) {
      const progress = ((batch + 1) / batches * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${progress}%`);
    }
  }

  const totalTime = performance.now() - start;
  console.log('\r  Progress: 100.0%');

  const memAfter = process.memoryUsage();

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const minLatency = latencies[0];
  const maxLatency = latencies[latencies.length - 1];
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const requestsPerSecond = (requests / totalTime) * 1000;

  // Get pool stats if available (KoaX)
  if (typeof app.getPoolStats === 'function') {
    const poolStats = app.getPoolStats();
    console.log(`  Pool stats:`, poolStats);
  }

  console.log(`  Memory change:`, {
    heapUsed: `${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)} MB`,
    external: `${((memAfter.external - memBefore.external) / 1024 / 1024).toFixed(2)} MB`
  });

  return {
    name,
    totalTime,
    avgLatency,
    requestsPerSecond,
    minLatency,
    maxLatency,
    p50,
    p95,
    p99
  };
}

/**
 * Create Koa test app
 */
function createKoaApp() {
  const app = new Koa();

  // Logger middleware
  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    // Simulate logging work
    const _log = `${ctx.method} ${ctx.url} - ${ms}ms`;
  });

  // Business logic middleware
  app.use(async (ctx, next) => {
    await next();
  });

  // Response middleware
  app.use(async (ctx) => {
    ctx.body = { message: 'Hello, World!', timestamp: Date.now() };
  });

  return app;
}

/**
 * Create KoaX test app
 */
function createKoaXApp() {
  const app = new KoaXApplication({
    contextPoolSize: 1000
  });

  // Logger middleware
  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    // Simulate logging work
    const _log = `${ctx.method} ${ctx.url} - ${ms}ms`;
  });

  // Business logic middleware
  app.use(async (ctx, next) => {
    await next();
  });

  // Response middleware
  app.use(async (ctx) => {
    ctx.body = { message: 'Hello, World!', timestamp: Date.now() };
  });

  return app;
}

/**
 * Format results table
 */
function printResults(results: any[]) {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80) + '\n');

  // Find the fastest
  const fastest = results.reduce((min, r) =>
    r.requestsPerSecond > min.requestsPerSecond ? r : min
  );

  for (const result of results) {
    const speedup = ((result.requestsPerSecond / fastest.requestsPerSecond) * 100).toFixed(1);
    const isFastest = result === fastest;

    console.log(`${result.name}:`);
    console.log(`  Requests/sec:  ${result.requestsPerSecond.toFixed(2)} ${isFastest ? '⚡' : `(${speedup}%)`}`);
    console.log(`  Avg latency:   ${result.avgLatency.toFixed(3)} ms`);
    console.log(`  Min latency:   ${result.minLatency.toFixed(3)} ms`);
    console.log(`  Max latency:   ${result.maxLatency.toFixed(3)} ms`);
    console.log(`  P50 latency:   ${result.p50.toFixed(3)} ms`);
    console.log(`  P95 latency:   ${result.p95.toFixed(3)} ms`);
    console.log(`  P99 latency:   ${result.p99.toFixed(3)} ms`);
    console.log(`  Total time:    ${result.totalTime.toFixed(2)} ms`);
    console.log('');
  }

  // Performance comparison
  console.log('='.repeat(80));
  console.log('PERFORMANCE COMPARISON');
  console.log('='.repeat(80) + '\n');

  if (results.length === 2) {
    const [koa, koax] = results;
    const improvement = ((koax.requestsPerSecond / koa.requestsPerSecond - 1) * 100);
    const latencyImprovement = ((koa.avgLatency / koax.avgLatency - 1) * 100);

    console.log(`KoaX is ${improvement >= 0 ? improvement.toFixed(1) : Math.abs(improvement).toFixed(1)}% ${improvement >= 0 ? 'FASTER' : 'SLOWER'} than Koa`);
    console.log(`KoaX latency is ${latencyImprovement >= 0 ? latencyImprovement.toFixed(1) : Math.abs(latencyImprovement).toFixed(1)}% ${latencyImprovement >= 0 ? 'BETTER' : 'WORSE'} than Koa\n`);

    console.log('Key optimizations in KoaX:');
    console.log('  ✓ Context pooling reduces GC pressure');
    console.log('  ✓ Optimized request/response with property caching');
    console.log('  ✓ Simpler middleware dispatch');
    console.log('  ✓ Reduced object allocations per request\n');
  }
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('\n🏁 Starting Koa vs KoaX Benchmark\n');
  console.log(`Configuration:`);
  console.log(`  Requests:      ${TEST_REQUESTS}`);
  console.log(`  Concurrency:   ${CONCURRENT_REQUESTS}`);
  console.log(`  Warmup:        ${WARMUP_REQUESTS}`);

  const results = [];

  // Run Koa benchmark
  const koaResult = await runBenchmark('Koa', createKoaApp, TEST_REQUESTS);
  results.push(koaResult);

  // Wait a bit between benchmarks
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run KoaX benchmark
  const koaxResult = await runBenchmark('KoaX', createKoaXApp, TEST_REQUESTS);
  results.push(koaxResult);

  // Print results
  printResults(results);
}

// Run benchmark
main().catch(console.error);
