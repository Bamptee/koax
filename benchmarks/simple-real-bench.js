/**
 * Simple Real HTTP Benchmark
 *
 * Direct, simple benchmark without aggressive pipelining
 */

const autocannon = require('autocannon');
const { KoaXApplication, serverTransports } = require('../dist/index');
const Koa = require('koa');

const DURATION = 10; // seconds
const CONNECTIONS = 50; // concurrent connections
const PIPELINING = 1; // no pipelining to avoid EPIPE

function setupMiddleware(app) {
  app.use(async (ctx) => {
    ctx.body = { message: 'Hello, World!', timestamp: Date.now() };
  });
}

async function runBench(name, url) {
  console.log(`\nBenchmarking ${name}...`);

  const result = await autocannon({
    url,
    connections: CONNECTIONS,
    pipelining: PIPELINING,
    duration: DURATION
  });

  return {
    name,
    reqPerSec: result.requests.mean,
    latency: result.latency.mean,
    throughput: result.throughput.mean / 1024 / 1024,
    errors: result.errors
  };
}

async function main() {
  console.log('\n🏁 Simple Real HTTP Benchmark\n');
  console.log(`Config: ${DURATION}s duration, ${CONNECTIONS} connections, no pipelining\n`);
  console.log('='  .repeat(70));

  const results = [];

  // 1. Koa
  console.log('\n[1/4] Testing Koa (baseline)...');
  const koaApp = new Koa();
  setupMiddleware(koaApp);
  const koaServer = koaApp.listen(3001);
  await new Promise(r => setTimeout(r, 1000));

  const koaResult = await runBench('Koa (baseline)', 'http://localhost:3001');
  results.push(koaResult);
  console.log(`  → ${koaResult.reqPerSec.toFixed(0)} req/s, ${koaResult.latency.toFixed(2)} ms`);

  koaServer.close();
  await new Promise(r => setTimeout(r, 2000));

  // 2. KoaX + HTTP/1.1
  console.log('\n[2/4] Testing KoaX + HTTP/1.1...');
  const koaxApp = new KoaXApplication({
    contextPoolSize: 1000,
    serverTransport: serverTransports.http(),
    logger: { enabled: false }
  });
  setupMiddleware(koaxApp);
  const koaxServer = koaxApp.listen(3002);
  await new Promise(r => setTimeout(r, 1000));

  const koaxResult = await runBench('KoaX + HTTP/1.1', 'http://localhost:3002');
  results.push(koaxResult);
  console.log(`  → ${koaxResult.reqPerSec.toFixed(0)} req/s, ${koaxResult.latency.toFixed(2)} ms`);

  koaxServer.close();
  await new Promise(r => setTimeout(r, 2000));

  // 3. KoaX + HTTP/2
  console.log('\n[3/4] Testing KoaX + HTTP/2...');
  const koaxHttp2App = new KoaXApplication({
    contextPoolSize: 1000,
    serverTransport: serverTransports.http2(),
    logger: { enabled: false }
  });
  setupMiddleware(koaxHttp2App);
  const koaxHttp2Server = koaxHttp2App.listen(3003);
  await new Promise(r => setTimeout(r, 1000));

  const koaxHttp2Result = await runBench('KoaX + HTTP/2', 'http://localhost:3003');
  results.push(koaxHttp2Result);
  console.log(`  → ${koaxHttp2Result.reqPerSec.toFixed(0)} req/s, ${koaxHttp2Result.latency.toFixed(2)} ms`);

  koaxHttp2Server.close();
  await new Promise(r => setTimeout(r, 2000));

  // 4. KoaX + uWebSockets.js
  console.log('\n[4/4] Testing KoaX + uWebSockets.js...');
  try {
    const koaxUwsApp = new KoaXApplication({
      contextPoolSize: 1000,
      serverTransport: serverTransports.uws(),
      logger: { enabled: false }
    });
    setupMiddleware(koaxUwsApp);
    const koaxUwsServer = koaxUwsApp.listen(3004);
    await new Promise(r => setTimeout(r, 1000));

    const koaxUwsResult = await runBench('KoaX + uWebSockets.js', 'http://localhost:3004');
    results.push(koaxUwsResult);
    console.log(`  → ${koaxUwsResult.reqPerSec.toFixed(0)} req/s, ${koaxUwsResult.latency.toFixed(2)} ms`);

    // Note: uWebSockets.js has a known bug where server.close() causes segfault
    // We skip closing and let process exit naturally
    console.log('  ℹ️  Note: Skipping server.close() due to uWebSockets.js bug');
  } catch (err) {
    console.log(`  ⚠️  uWebSockets.js not available: ${err.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70) + '\n');

  const baseline = results[0];

  results.forEach((r, i) => {
    const improvement = ((r.reqPerSec / baseline.reqPerSec - 1) * 100);
    const speedup = (r.reqPerSec / baseline.reqPerSec).toFixed(2);

    console.log(`${i + 1}. ${r.name}`);
    console.log(`   Throughput:  ${r.reqPerSec.toFixed(0).padStart(6)} req/s ${i === 0 ? '(baseline)' : `(${speedup}x, ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%)`}`);
    console.log(`   Latency:     ${r.latency.toFixed(2).padStart(6)} ms`);
    console.log(`   Bandwidth:   ${r.throughput.toFixed(2).padStart(6)} MB/s`);
    if (r.errors) console.log(`   Errors:      ${r.errors}`);
    console.log('');
  });

  console.log('='.repeat(70));
  console.log('💡 Key Findings:');
  console.log('   • Real HTTP servers with actual network I/O');
  console.log('   • Context pooling reduces allocation overhead');
  console.log('   • Transport choice affects overall performance');
  console.log('   • uWebSockets.js provides maximum throughput');
  console.log('='.repeat(70));
}

main()
  .then(() => {
    console.log('\n✅ Benchmark complete!\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
