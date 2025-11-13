/**
 * Benchmark: With @koa/router
 *
 * Tests performance with a real-world router setup
 */

import { performance } from 'node:perf_hooks';
import Koa from 'koa';
import Router from '@koa/router';
import KoaXApplication from '../src';

const TEST_REQUESTS = 10000;
const CONCURRENT_REQUESTS = 100;

/**
 * Simulate HTTP request
 */
async function simulateRequest(
  handler: (req: any, res: any) => void,
  path: string = '/',
  method: string = 'GET'
): Promise<number> {
  const start = performance.now();

  const mockReq: any = {
    url: path,
    method,
    headers: {
      'user-agent': 'benchmark',
      'accept': 'application/json',
      'host': 'localhost:3000'
    },
    socket: {
      remoteAddress: '127.0.0.1',
      encrypted: false
    }
  };

  const mockRes: any = {
    statusCode: 200,
    headers: {} as any,
    headersSent: false,
    writableEnded: false,
    setHeader(key: string, value: any) { this.headers[key] = value; },
    getHeader(key: string) { return this.headers[key]; },
    removeHeader(key: string) { delete this.headers[key]; },
    end(body?: any) {
      this.writableEnded = true;
      if (this._finishCallback) setImmediate(this._finishCallback);
    },
    write(chunk: any) {},
    on(event: string, callback: Function) {
      if (event === 'finish') this._finishCallback = callback;
      return this;
    },
    once(event: string, callback: Function) { return this.on(event, callback); }
  };

  await new Promise<void>((resolve) => {
    handler(mockReq, mockRes);
    setImmediate(() => resolve());
  });

  return performance.now() - start;
}

/**
 * Run benchmark
 */
async function runBenchmark(name: string, createApp: () => any): Promise<any> {
  const app = createApp();
  const handler = app.callback();

  console.log(`\n${name}:`);

  // Warmup
  for (let i = 0; i < 100; i++) {
    await simulateRequest(handler, '/users');
  }

  if (global.gc) global.gc();

  // Benchmark
  const latencies: number[] = [];
  const start = performance.now();

  const batchSize = CONCURRENT_REQUESTS;
  const batches = Math.ceil(TEST_REQUESTS / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchPromises = [];
    const batchCount = Math.min(batchSize, TEST_REQUESTS - batch * batchSize);

    for (let i = 0; i < batchCount; i++) {
      // Mix of routes
      const routes = ['/users', '/users/123', '/posts'];
      const route = routes[i % routes.length];
      batchPromises.push(simulateRequest(handler, route));
    }

    const batchLatencies = await Promise.all(batchPromises);
    latencies.push(...batchLatencies);
  }

  const totalTime = performance.now() - start;

  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const requestsPerSecond = (TEST_REQUESTS / totalTime) * 1000;

  console.log(`  Requests/sec: ${requestsPerSecond.toFixed(2)}`);
  console.log(`  Avg latency:  ${avgLatency.toFixed(3)} ms`);
  console.log(`  P50 latency:  ${p50.toFixed(3)} ms`);
  console.log(`  P95 latency:  ${p95.toFixed(3)} ms`);
  console.log(`  P99 latency:  ${p99.toFixed(3)} ms`);

  return { name, requestsPerSecond, avgLatency };
}

/**
 * Koa + Router
 */
function createKoaWithRouter() {
  const app = new Koa();
  const router = new Router();

  router.get('/users', async (ctx) => {
    ctx.body = { users: [{ id: 1, name: 'Alice' }] };
  });

  router.get('/users/:id', async (ctx) => {
    ctx.body = { user: { id: ctx.params.id, name: 'Alice' } };
  });

  router.get('/posts', async (ctx) => {
    ctx.body = { posts: [] };
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}

/**
 * KoaX + Router (no features)
 */
function createKoaXWithRouter() {
  const app = new KoaXApplication({
    contextPoolSize: 1000,
    logger: { enabled: false },
    timing: false
  });

  const router = new Router();

  router.get('/users', async (ctx: any) => {
    ctx.body = { users: [{ id: 1, name: 'Alice' }] };
  });

  router.get('/users/:id', async (ctx: any) => {
    ctx.body = { user: { id: ctx.params?.id, name: 'Alice' } };
  });

  router.get('/posts', async (ctx: any) => {
    ctx.body = { posts: [] };
  });

  app.use(router.routes() as any);
  app.use(router.allowedMethods() as any);

  return app;
}

/**
 * Main
 */
async function main() {
  console.log('\n🏁 Benchmark: With @koa/router');
  console.log(`  Requests: ${TEST_REQUESTS}`);
  console.log(`  Concurrency: ${CONCURRENT_REQUESTS}`);

  const results = [];

  results.push(await runBenchmark('Koa + Router', createKoaWithRouter));
  await new Promise(resolve => setTimeout(resolve, 500));

  results.push(await runBenchmark('KoaX + Router', createKoaXWithRouter));

  console.log('\n' + '='.repeat(60));
  const [koa, koax] = results;
  const diff = ((koax.requestsPerSecond / koa.requestsPerSecond - 1) * 100);
  console.log(`KoaX is ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% ${diff >= 0 ? 'FASTER' : 'SLOWER'} than Koa`);
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
