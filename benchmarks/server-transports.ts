/**
 * Server Transports Benchmark
 *
 * Compares performance of different server transports:
 * - HTTP/1.1 (standard Node.js)
 * - HTTP/2 (cleartext)
 * - uWebSockets.js (if installed)
 *
 * Usage: ts-node benchmarks/server-transports.ts
 */

import autocannon from 'autocannon';
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
}

// Create a simple app with minimal middleware
function createBenchmarkApp(name: string, serverTransport?: any) {
  const app = new KoaX({
    logger: { enabled: false }, // Disable logging for accurate benchmarks
    serverTransport
  });

  // Simple JSON response middleware
  app.use(async (ctx) => {
    ctx.body = {
      message: 'Hello World',
      timestamp: Date.now(),
      path: ctx.path
    };
  });

  return app;
}

// Run autocannon benchmark
async function runBenchmark(name: string, port: number): Promise<BenchmarkResult> {
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
        requestsPerSec: result.requests.average,
        latencyP50: result.latency.p50,
        latencyP95: result.latency.p95,
        latencyP99: result.latency.p99,
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

// Print results table
function printResults(results: BenchmarkResult[]) {
  console.log('\n\n📊 BENCHMARK RESULTS\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  const baseline = results[0];

  console.log('┌────────────────────┬──────────────┬────────────┬──────────────┬─────────────┐');
  console.log('│ Transport          │ Req/sec      │ P50 (ms)   │ P95 (ms)     │ Throughput  │');
  console.log('├────────────────────┼──────────────┼────────────┼──────────────┼─────────────┤');

  results.forEach((result) => {
    const reqImprovement = result === baseline ? '' : ` (${calcImprovement(baseline.requestsPerSec, result.requestsPerSec)})`;
    const latImprovement = result === baseline ? '' : ` (${calcImprovement(baseline.latencyP50, result.latencyP50)})`;

    console.log(
      `│ ${result.name.padEnd(18)} │ ${formatNumber(result.requestsPerSec).padStart(12)} │ ` +
      `${result.latencyP50.toFixed(2).padStart(10)} │ ` +
      `${result.latencyP95.toFixed(2).padStart(12)} │ ` +
      `${result.throughputMB.toFixed(2).padStart(9)} MB │`
    );

    if (reqImprovement) {
      console.log(
        `│                    │ ${reqImprovement.padStart(12)} │ ` +
        `${latImprovement.padStart(10)} │              │             │`
      );
    }
  });

  console.log('└────────────────────┴──────────────┴────────────┴──────────────┴─────────────┘');

  // Summary
  const best = results.reduce((prev, current) =>
    current.requestsPerSec > prev.requestsPerSec ? current : prev
  );

  console.log('\n🏆 WINNER: ' + best.name);
  console.log(`   ${formatNumber(best.requestsPerSec)} req/sec`);
  console.log(`   ${best.latencyP50.toFixed(2)}ms latency (p50)`);

  const improvement = ((best.requestsPerSec - baseline.requestsPerSec) / baseline.requestsPerSec) * 100;
  console.log(`   ${improvement.toFixed(1)}% faster than baseline\n`);

  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
}

// Main benchmark function
async function main() {
  console.log('🚀 KoaX Server Transports Benchmark\n');
  console.log(`Configuration:`);
  console.log(`  Duration: ${DURATION}s`);
  console.log(`  Connections: ${CONNECTIONS}`);
  console.log(`  Pipelining: ${PIPELINING}`);

  const results: BenchmarkResult[] = [];
  const servers: any[] = [];

  try {
    // 1. HTTP/1.1 (Baseline)
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('1️⃣  Testing HTTP/1.1 (Standard Node.js)');
    console.log('─────────────────────────────────────────────────────────────');

    const httpApp = createBenchmarkApp('HTTP/1.1', serverTransports.http());
    const httpServer = httpApp.listen(3020);
    servers.push(httpServer);

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for server to start
    const httpResult = await runBenchmark('HTTP/1.1 (Standard)', 3020);
    results.push(httpResult);

    // 2. HTTP/2 Cleartext
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('2️⃣  Testing HTTP/2 Cleartext');
    console.log('─────────────────────────────────────────────────────────────');

    const http2App = createBenchmarkApp('HTTP/2', serverTransports.http2());
    const http2Server = http2App.listen(3021);
    servers.push(http2Server);

    await new Promise(resolve => setTimeout(resolve, 1000));
    const http2Result = await runBenchmark('HTTP/2 (Cleartext)', 3021);
    results.push(http2Result);

    // 3. uWebSockets.js (if available)
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('3️⃣  Testing uWebSockets.js');
    console.log('─────────────────────────────────────────────────────────────');

    try {
      const uwsApp = createBenchmarkApp('uWebSockets.js', serverTransports.uws({
        maxPayloadLength: 16 * 1024 * 1024,
        idleTimeout: 120,
        maxBackpressure: 1024 * 1024
      }));
      const uwsServer = uwsApp.listen(3022);
      servers.push(uwsServer);

      await new Promise(resolve => setTimeout(resolve, 1000));
      const uwsResult = await runBenchmark('uWebSockets.js', 3022);
      results.push(uwsResult);
    } catch (err: any) {
      console.log('⚠️  uWebSockets.js not available (install with: npm install uWebSockets.js)');
    }

    // Print results
    printResults(results);

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
