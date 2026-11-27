import 'express-async-errors';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { migrate, getRole, pool } from './db.js';
import { authRouter, verifyToken } from './auth.js';
import { docsRouter } from './docs.js';
import { initCollab, shutdownCollab, getRoom, attach, checkRedis } from './collab.js';

const WS_PATH = /^\/collab\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  if (config.corsOrigin) {
    const allowed = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
    app.use(
      cors({
        origin: (origin, cb) => {
          if (!origin || allowed.includes('*')) return cb(null, true);
          const ok = allowed.some((pat) =>
            pat.startsWith('*.') ? origin.endsWith(pat.slice(1)) : origin === pat
          );
          cb(ok ? null : new Error('CORS origin not allowed'), ok);
        },
      })
    );
  }
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      const redis = await checkRedis();
      res.json({ ok: true, db: 'ok', redis });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.prod ? 30 : 1000, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/docs', docsRouter);

  app.use((err, _req, res, _next) => {
    if (err.status === 404) return res.status(404).json({ error: 'Document not found.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const match = url.pathname.match(WS_PATH);
      if (!match) return reject(404, 'Not Found');
      let payload;
      try {
        payload = verifyToken(url.searchParams.get('token') || '');
      } catch {
        return reject(401, 'Unauthorized');
      }
      const docId = match[1];
      const role = await getRole(docId, payload.sub);
      if (!role) return reject(403, 'Forbidden');
      let room = await getRoom(docId);
      if (room.destroyed) room = await getRoom(docId);
      wss.handleUpgrade(req, socket, head, (ws) => attach(ws, room, { userId: payload.sub, role }));
    } catch (e) {
      console.error('upgrade failed:', e.message);
      reject(500, 'Internal Server Error');
    }
  });

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  initCollab();
  const server = createServer();
  server.listen(config.port, () => console.log(`Coauthor server listening on :${config.port}`));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const forceExit = setTimeout(() => process.exit(1), 10000);
    forceExit.unref();
    server.closeAllConnections?.();
    server.close();
    await shutdownCollab();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
