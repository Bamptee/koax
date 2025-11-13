/**
 * Fair Benchmark: KoaX vs Koa (BUILT VERSIONS)
 *
 * Uses compiled JavaScript to avoid TypeScript overhead
 * Gives real production performance numbers
 */

const { performance } = require('node:perf_hooks');
const Koa = require('koa');
const { KoaXApplication } = require('../dist/index');

// Test configuration
const WARMUP_REQUESTS = 1000;
const TEST_REQUESTS = 10000;
const CONCURRENT_REQUESTS = 100;

/**
 * Simulate a simple HTTP request without network overhead
 */
async function simulateRequest(handler, path = '/') {
  const start = performance.now();

  // Mock request/response objects
  const mockReq = {
    url: path,
    method: 'GET',
    headers: {
      'user-agent': 'benchmark',
      'accept': 'application/json',
      'host': 'localhost:3000'
    },
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    socket: {
      remoteAddress: '127.0.0.1',
      encrypted: false
    }
  };

  const mockRes = {
    statusCode: 200,
    statusMessage: '',
    headers: {},
    headersSent: false,
    writableEnded: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    getHeader(key) {
      return this.headers[key];
    },
    removeHeader(key) {
      delete this.headers[key];
    },
    end(body) {
      this.writableEnded = true;
      if (this._finishCallback) {
        setImmediate(this._finishCallback);
      }
    },
    write(chunk) {},
    on(event, callback) {
      if (event === 'finish') {
        this._finishCallback = callback;
      }
      return this;
    },
    once(event, callback) {
      return this.on(event, callback);
    }
  };

  // Execute handler
  await new Promise((resolve) => {
    handler(mockReq, mockRes);
    setImmediate(() => {
      resolve();
    });
  });

  return performance.now() - start;
}

/**
 * Run benchmark for a framework
 */
async function runBenchmark(name, createApp, requests) {
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
  const latencies = [];
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
 * Create Koa test app (baseline)
 */
function createKoaApp() {
  const app = new Koa();

  // Logger middleware
  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
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
 * Create KoaX test app - BASIC
 */
function createKoaXBasicApp() {
  const app = new KoaXApplication({
    contextPoolSize: 1000,
    logger: {
      enabled: false
    },
    timing: false
  });

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    const _log = `${ctx.method} ${ctx.url} - ${ms}ms`;
  });

  app.use(async (ctx, next) => {
    await next();
  });

  app.use(async (ctx) => {
    ctx.body = { message: 'Hello, World!', timestamp: Date.now() };
  });

  return app;
}

/**
 * Create KoaX test app - FULL
 */
function createKoaXFullApp() {
  const app = new KoaXApplication({
    contextPoolSize: 1000,
    logger: {
      enabled: true,
      level: 'info',
      prettyPrint: false
    },
    timing: true
  });

  app.onRequest(async (ctx) => {
    // Hook work
  });

  app.onResponse(async (ctx) => {
    // Hook work
  });

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    const _log = `${ctx.method} ${ctx.url} - ${ms}ms`;
  });

  app.use(async (ctx, next) => {
    await next();
  });

  app.use(async (ctx) => {
    ctx.body = { message: 'Hello, World!', timestamp: Date.now() };
  });

  return app;
}

/**
 * Format results table
 */
function printResults(results) {
  console.log('\n' + '='.repeat(80));
  console.log('FAIR BENCHMARK RESULTS (BUILT VERSIONS)');
  console.log('='.repeat(80) + '\n');

  const fastest = results.reduce((min, r) =>
    r.requestsPerSecond > min.requestsPerSecond ? r : min
  );

  for (const result of results) {
    const speedup = ((result.requestsPerSecond / fastest.requestsPerSecond) * 100).toFixed(1);
    const isFastest = result === fastest;

    console.log(`${result.name}:`);
    console.log(`  Requests/sec:  ${result.requestsPerSecond.toFixed(2)} ${isFastest ? '⚡ FASTEST' : `(${speedup}% of fastest)`}`);
    console.log(`  Avg latency:   ${result.avgLatency.toFixed(3)} ms`);
    console.log(`  Min latency:   ${result.minLatency.toFixed(3)} ms`);
    console.log(`  Max latency:   ${result.maxLatency.toFixed(3)} ms`);
    console.log(`  P50 latency:   ${result.p50.toFixed(3)} ms`);
    console.log(`  P95 latency:   ${result.p95.toFixed(3)} ms`);
    console.log(`  P99 latency:   ${result.p99.toFixed(3)} ms`);
    console.log(`  Total time:    ${result.totalTime.toFixed(2)} ms`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('PERFORMANCE COMPARISON');
  console.log('='.repeat(80) + '\n');

  if (results.length >= 2) {
    const koa = results.find(r => r.name === 'Koa') || results[0];
    const koaxBasic = results.find(r => r.name === 'KoaX Basic');
    const koaxFull = results.find(r => r.name === 'KoaX Full');

    if (koaxBasic) {
      const improvement = ((koaxBasic.requestsPerSecond / koa.requestsPerSecond - 1) * 100);
      const latencyImprovement = ((koa.avgLatency / koaxBasic.avgLatency - 1) * 100);

      console.log('📊 KoaX Basic (core optimizations only):');
      console.log(`   Throughput: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}% ${improvement >= 0 ? '✅ FASTER' : '❌ SLOWER'} than Koa`);
      console.log(`   Latency:    ${latencyImprovement >= 0 ? '+' : ''}${latencyImprovement.toFixed(1)}% ${latencyImprovement >= 0 ? '✅ BETTER' : '❌ WORSE'} than Koa`);
      console.log('   Features:   Context pooling, Iterative dispatch');
      console.log('');
    }

    if (koaxFull) {
      const improvement = ((koaxFull.requestsPerSecond / koa.requestsPerSecond - 1) * 100);
      const latencyImprovement = ((koa.avgLatency / koaxFull.avgLatency - 1) * 100);
      const overhead = ((koaxBasic.requestsPerSecond / koaxFull.requestsPerSecond - 1) * 100);

      console.log('📊 KoaX Full (all features):');
      console.log(`   Throughput: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}% ${improvement >= 0 ? '✅ FASTER' : '❌ SLOWER'} than Koa`);
      console.log(`   Latency:    ${latencyImprovement >= 0 ? '+' : ''}${latencyImprovement.toFixed(1)}% ${latencyImprovement >= 0 ? '✅ BETTER' : '❌ WORSE'} than Koa`);
      console.log(`   Overhead:   ${overhead.toFixed(1)}% compared to KoaX Basic`);
      console.log('   Features:   Logger, Timing, Hooks, Request ID, Child logger');
      console.log('');
    }

    console.log('💡 Key insights:');
    console.log('   • These are PRODUCTION numbers (compiled JavaScript, no TypeScript overhead)');
    console.log('   • Core optimizations (context pooling, iterative dispatch) show raw performance');
    console.log('   • Additional features add overhead but provide observability');
    console.log('   • Disable logger/timing in production if max performance is needed');
    console.log('');
  }
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('\n🏁 Fair Benchmark: Koa vs KoaX (BUILT VERSIONS)\n');
  console.log(`Configuration:`);
  console.log(`  Requests:      ${TEST_REQUESTS}`);
  console.log(`  Concurrency:   ${CONCURRENT_REQUESTS}`);
  console.log(`  Warmup:        ${WARMUP_REQUESTS}`);
  console.log(`  Runtime:       Node.js ${process.version}`);
  console.log(`  Using:         Compiled JavaScript (dist/)`);

  const results = [];

  // Run Koa benchmark (baseline)
  const koaResult = await runBenchmark('Koa', createKoaApp, TEST_REQUESTS);
  results.push(koaResult);

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run KoaX Basic benchmark
  const koaxBasicResult = await runBenchmark('KoaX Basic', createKoaXBasicApp, TEST_REQUESTS);
  results.push(koaxBasicResult);

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run KoaX Full benchmark
  const koaxFullResult = await runBenchmark('KoaX Full', createKoaXFullApp, TEST_REQUESTS);
  results.push(koaxFullResult);

  // Print results
  printResults(results);
}

// Run benchmark
main().catch(console.error);
