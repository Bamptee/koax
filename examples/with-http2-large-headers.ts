/**
 * Solution pour Headers Volumineux : HTTP/2
 *
 * uWebSockets.js a une limite de ~4KB pour les headers.
 * HTTP/2 n'a pas cette limitation et gère très bien les gros headers.
 */

import KoaX, { serverTransports } from '../src';

console.log('🚀 KoaX avec HTTP/2 - Gère les gros headers\n');

const app = new KoaX({
  // ✅ HTTP/2 au lieu de uWebSockets.js
  serverTransport: serverTransports.http2(),

  logger: {
    enabled: true,
    prettyPrint: true,
    name: 'http2-large-headers'
  }
});

// Middleware pour logger la taille des headers
app.use(async (ctx, next) => {
  const headersStr = JSON.stringify(ctx.headers);
  const headersSize = Buffer.byteLength(headersStr, 'utf8');

  console.log(`📊 Headers size: ${headersSize} bytes`);

  if (headersSize > 4096) {
    console.log('✅ Headers > 4KB - OK avec HTTP/2, aurait échoué avec uWebSockets.js');
  }

  await next();
});

// Route principale
app.use(async (ctx) => {
  const headersStr = JSON.stringify(ctx.headers);
  const headersSize = Buffer.byteLength(headersStr, 'utf8');

  ctx.body = {
    message: 'HTTP/2 gère parfaitement les gros headers!',
    headersSize: `${headersSize} bytes`,
    headerCount: Object.keys(ctx.headers).length,
    headers: ctx.headers,
    transport: 'HTTP/2',
    timestamp: Date.now()
  };
});

const PORT = 3080;

app.listen(PORT, () => {
  console.log(`\n✅ Serveur HTTP/2 démarré sur le port ${PORT}\n`);
  console.log('Test avec curl:');
  console.log(`  curl --http2-prior-knowledge http://localhost:${PORT}/\n`);
  console.log('Test avec headers volumineux:');
  console.log(`  curl --http2-prior-knowledge \\`);
  console.log(`    -H "X-Large-Header-1: $(python3 -c 'print("A"*2000)')" \\`);
  console.log(`    -H "X-Large-Header-2: $(python3 -c 'print("B"*2000)')" \\`);
  console.log(`    http://localhost:${PORT}/\n`);
  console.log('Avantages HTTP/2:');
  console.log('  ✅ Pas de limite stricte sur les headers');
  console.log('  ✅ Compression HPACK des headers');
  console.log('  ✅ +20-40% plus rapide que HTTP/1.1');
  console.log('  ✅ Multiplexing de requêtes\n');
  console.log('Press Ctrl+C to stop\n');
});
