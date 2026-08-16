/**
 * Restaurant Billing – Local Print Bridge Server
 * ------------------------------------------------
 * Run this ONCE on the laptop that is connected to the same network as the printers.
 *   node server.js
 *
 * All Android tablets/phones on the same Wi-Fi/LAN can reach this server
 * at the laptop's LAN IP (shown on startup) on port 7878.
 *
 * API:
 *   GET  /ping               → { ok: true, ip: "192.168.1.50" }
 *   POST /print              → { ip, port, data (base64 ESC/POS), encoding }
 */

const http = require('http');
const net  = require('net');
const os   = require('os');

const BRIDGE_PORT = 7878;

// ─── Detect LAN IP ────────────────────────────────────────────────────────────

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendToPrinter(ip, port, rawBuffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(6000);
    socket.connect(port, ip, () => {
      socket.write(rawBuffer, () => {
        socket.destroy();
        resolve();
      });
    });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timeout')); });
    socket.on('error',   (err) => reject(err));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type',
  });
  res.end(body);
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const lanIp = getLanIp();

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/ping') {
    return jsonResponse(res, 200, { ok: true, version: '1.0', ip: lanIp });
  }

  if (req.method === 'POST' && req.url === '/print') {
    try {
      const raw  = await readBody(req);
      const body = JSON.parse(raw);
      const { ip, port = 9100, data, encoding = 'base64' } = body;

      if (!ip)   return jsonResponse(res, 400, { ok: false, error: 'Missing printer IP' });
      if (!data) return jsonResponse(res, 400, { ok: false, error: 'Missing print data'  });

      const buf = encoding === 'base64'
        ? Buffer.from(data, 'base64')
        : Buffer.from(data, 'binary');

      await sendToPrinter(ip, port, buf);
      console.log(`✅  Printed ${buf.length} bytes → ${ip}:${port}`);
      return jsonResponse(res, 200, { ok: true });

    } catch (err) {
      console.error('❌  Print error:', err.message);
      return jsonResponse(res, 500, { ok: false, error: err.message });
    }
  }

  jsonResponse(res, 404, { ok: false, error: 'Not found' });
});

// Bind on ALL interfaces (0.0.0.0) so Android devices on LAN can reach this server
server.listen(BRIDGE_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Restaurant Billing – Print Bridge Server           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Local :  http://localhost:${BRIDGE_PORT}                         ║`);
  console.log(`║  LAN   :  http://${lanIp}:${BRIDGE_PORT}  ← Enter this in Settings ║`);
  console.log('║                                                            ║');
  console.log('║  Settings → Printing → Bridge Server IP                   ║');
  console.log('║  Keep this window OPEN while billing.                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});
