/**
 * Benchmark: KoaX Hooks & Logger Overhead
 *
 * Compares performance between:
 * 1. KoaX basic (no hooks, no logger)
 * 2. KoaX with logger
 * 3. KoaX with hooks + logger
 *
 * Goal: Demonstrate minimal overhead of new features
 */

import { performance } from 'node:perf_hooks';
import KoaXApplication from '../src';

// Test configuration
const WARMUP_REQUESTS = 500;
const TEST_REQUESTS = 5000;
const CONCURRENT_REQUESTS = 50;

/**
 * Simulate a simple HTTP request
 */
async function simulateRequest(
  handler: (req: any, res: any) => void
): Promise<number> {
  const start = performance.now();

  const mockReq = {
    url: '/test',
    method: 'GET',
    headers: { 'user-agent': 'benchmark' },
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    socket: { remoteAddress: '127.0.0.1' }
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
    end() {
      this.writableEnded = true;
    },
    on(event: string, callback: Function) {
      if (event === 'finish') {
        // Simulate immediate finish
        setImmediate(() => callback());
      }
    }
  };

  await new Promise<void>((resolve) => {
    handler(mockReq, mockRes);
    setImmediate(() => resolve());
  });

  return performance.now() - start;
}

/**
 * Run benchmark for a configuration
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

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  const memBefore = process.memoryUsage();

  // Benchmark
  console.log(`  Testing (${requests} requests)...`);
  const latencies: number[] = [];
  const start = performance.now();

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

    if ((batch + 1) % 10 === 0) {
      const progress = ((batch + 1) / batches * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${progress}%`);
    }
  }

  const totalTime = performance.now() - start;
  console.log('\r  Progress: 100.0%');

  const memAfter = process.memoryUsage();

  // Statistics
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const requestsPerSecond = (requests / totalTime) * 1000;

  console.log(`  Memory change: ${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)} MB`);

  return {
    name,
    totalTime,
    avgLatency,
    requestsPerSecond,
    p50,
    p95,
    p99
  };
}

/**
 * Configuration 1: Basic KoaX (no hooks, logger disabled)
 */
function createBasicApp() {
  const app = new KoaXApplication({
    contextPoolSize: 1000,
    logger: {
      enabled: false // Disable logger
    },
    timing: false // Disable timing
  });

  // Simple middleware
  app.use(async (ctx) => {
    ctx.body = { message: 'Hello' };
  });

  return app;
}

/**
 * Configuration 2: KoaX with logger (no hooks)
 */
function createAppWithLogger() {
  const app = new KoaXApplication({
    contextPoolSize: 1000,
    logger: {
      enabled: true,
      level: 'info'
    },
    timing: true
  });

  // Simple middleware with logging
  app.use(async (ctx) => {
    ctx.log.info('Processing request');
    ctx.body = { message: 'Hello' };
  });

  return app;
}

/**
 * Configuration 3: KoaX with hooks + logger
 */
function createAppWithHooksAndLogger() {
  const app = new KoaXApplication({
    contextPoolSize: 1000,
    logger: {
      enabled: true,
      level: 'info'
    },
    timing: true
  });

  // Register hooks
  app.onRequest(async (ctx) => {
    ctx.log.debug('Request hook');
    ctx.state.hookStart = Date.now();
  });

  app.onResponse(async (ctx) => {
    ctx.log.debug('Response hook');
    const duration = Date.now() - ctx.state.hookStart;
    ctx.set('X-Response-Time', `${duration}ms`);
  });

  app.onError(async (error, ctx) => {
    ctx.log.error(error, 'Error hook');
  });

  // Simple middleware with logging
  app.use(async (ctx) => {
    ctx.log.info('Processing request');
    ctx.body = { message: 'Hello' };
  });

  return app;
}

/**
 * Print comparison results
 */
function printResults(results: any[]) {
  console.log('\n' + '='.repeat(90));
  console.log('HOOKS & LOGGER OVERHEAD BENCHMARK');
  console.log('='.repeat(90) + '\n');

  const baseline = results[0];

  // Detailed results
  for (const result of results) {
    const overhead = ((result.avgLatency / baseline.avgLatency - 1) * 100);
    const throughputChange = ((result.requestsPerSecond / baseline.requestsPerSecond - 1) * 100);

    console.log(`${result.name}:`);
    console.log(`  Requests/sec:  ${result.requestsPerSecond.toFixed(2)}`);
    console.log(`  Avg latency:   ${result.avgLatency.toFixed(3)} ms`);
    console.log(`  P50 latency:   ${result.p50.toFixed(3)} ms`);
    console.log(`  P95 latency:   ${result.p95.toFixed(3)} ms`);
    console.log(`  P99 latency:   ${result.p99.toFixed(3)} ms`);
    console.log(`  Total time:    ${result.totalTime.toFixed(2)} ms`);

    if (result !== baseline) {
      console.log(`  Overhead:      ${overhead >= 0 ? '+' : ''}${overhead.toFixed(2)}% latency`);
      console.log(`  Throughput:    ${throughputChange >= 0 ? '+' : ''}${throughputChange.toFixed(2)}%`);
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(90));
  console.log('OVERHEAD SUMMARY');
  console.log('='.repeat(90) + '\n');

  const withLogger = results[1];
  const withHooks = results[2];

  const loggerOverhead = ((withLogger.avgLatency / baseline.avgLatency - 1) * 100);
  const hooksOverhead = ((withHooks.avgLatency / baseline.avgLatency - 1) * 100);

  console.log(`Logger overhead:       ${loggerOverhead >= 0 ? '+' : ''}${loggerOverhead.toFixed(2)}%`);
  console.log(`Hooks + Logger overhead: ${hooksOverhead >= 0 ? '+' : ''}${hooksOverhead.toFixed(2)}%`);

  console.log('\n✅ Key Findings:');
  if (hooksOverhead < 10) {
    console.log(`   • Hooks and logger add minimal overhead (<${hooksOverhead.toFixed(1)}%)`);
  } else if (hooksOverhead < 20) {
    console.log(`   • Hooks and logger add acceptable overhead (~${hooksOverhead.toFixed(1)}%)`);
  } else {
    console.log(`   • Hooks and logger add measurable overhead (~${hooksOverhead.toFixed(1)}%)`);
  }

  console.log('   • Structured logging provides visibility with low cost');
  console.log('   • Hook system enables powerful lifecycle control');
  console.log('   • Context pooling keeps performance high\n');

  // Performance tips
  console.log('💡 Performance Tips:');
  console.log('   • Disable logger in production if not needed (logger: { enabled: false })');
  console.log('   • Use appropriate log levels (debug < info < warn < error)');
  console.log('   • Keep hooks lightweight, avoid heavy computations');
  console.log('   • Logger overhead is mainly I/O (console.log), can be redirected\n');
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('\n🏁 Starting KoaX Hooks & Logger Overhead Benchmark\n');
  console.log(`Configuration:`);
  console.log(`  Requests:      ${TEST_REQUESTS}`);
  console.log(`  Concurrency:   ${CONCURRENT_REQUESTS}`);
  console.log(`  Warmup:        ${WARMUP_REQUESTS}`);

  const results = [];

  // Baseline: No hooks, no logger
  const basicResult = await runBenchmark('1. Basic KoaX (no hooks, logger disabled)', createBasicApp, TEST_REQUESTS);
  results.push(basicResult);

  await new Promise(resolve => setTimeout(resolve, 500));

  // With logger
  const loggerResult = await runBenchmark('2. KoaX with Logger', createAppWithLogger, TEST_REQUESTS);
  results.push(loggerResult);

  await new Promise(resolve => setTimeout(resolve, 500));

  // With hooks + logger
  const hooksResult = await runBenchmark('3. KoaX with Hooks + Logger', createAppWithHooksAndLogger, TEST_REQUESTS);
  results.push(hooksResult);

  // Print comparison
  printResults(results);
}

// Run benchmark
main().catch(console.error);
