'use strict';

const fs = require('node:fs');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { SocksClient } = require('socks');

function readArgument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function decryptPassword(configPath) {
  const command = [
    "$cfg=Get-Content -Raw -LiteralPath $env:FOE_PROXY_CONFIG_PATH | ConvertFrom-Json",
    '$secure=ConvertTo-SecureString $cfg.encryptedPassword',
    '$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
    "try {[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}",
  ].join('; ');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, FOE_PROXY_CONFIG_PATH: configPath },
    },
  );
  if (result.status !== 0) {
    throw new Error(`Cannot decrypt the proxy password: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function loadConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  if (config.type !== 'socks5') throw new Error('Only SOCKS5 proxy is supported');
  if (!config.host || !Number.isInteger(Number(config.port))) {
    throw new Error('Invalid proxy host or port');
  }
  return {
    host: String(config.host),
    port: Number(config.port),
    type: 5,
    userId: String(config.username || ''),
    password: decryptPassword(configPath),
  };
}

async function connectThroughSocks(proxy, host, port) {
  const result = await SocksClient.createConnection({
    command: 'connect',
    proxy,
    destination: { host, port },
    timeout: 30_000,
  });
  return result.socket;
}

function closeWithBadGateway(socket) {
  if (!socket.destroyed) {
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
  }
}

const configPath = readArgument('--config');
const listenPort = Number(readArgument('--listen-port', '19222'));
if (!configPath || !Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  throw new Error('Usage: node proxy-bridge.js --config FILE --listen-port PORT');
}

const proxy = loadConfig(configPath);
const initialConfigMtime = fs.statSync(configPath).mtimeMs;
const server = http.createServer(async (request, response) => {
  try {
    const target = new URL(request.url);
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    const upstream = await connectThroughSocks(proxy, target.hostname, port);
    const headers = { ...request.headers };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    const path = `${target.pathname || '/'}${target.search}`;
    upstream.write(`${request.method} ${path} HTTP/${request.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        upstream.write(`${name}: ${value}\r\n`);
      }
    }
    upstream.write('\r\n');
    request.pipe(upstream);
    upstream.pipe(response.socket);
    upstream.on('error', () => response.socket.destroy());
  } catch {
    response.writeHead(502, { Connection: 'close' });
    response.end('Bad Gateway');
  }
});

server.on('connect', async (request, clientSocket, head) => {
  try {
    const target = new URL(`http://${request.url}`);
    const upstream = await connectThroughSocks(proxy, target.hostname, Number(target.port || 443));
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  } catch {
    closeWithBadGateway(clientSocket);
  }
});

server.on('clientError', (_error, socket) => closeWithBadGateway(socket));
server.listen(listenPort, '127.0.0.1');

// A password change must never leave the old credentials active in memory.
fs.watchFile(configPath, { interval: 1000 }, current => {
  if (current.mtimeMs !== initialConfigMtime) {
    fs.unwatchFile(configPath);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
});
