// Two separate server processes + Redis: edits and presence must cross instances.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as Y from 'yjs';
import WS from 'ws';
import { WebsocketProvider } from 'y-websocket';

const DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/coauthor_test';
const REDIS = process.env.REDIS_URL || 'redis://localhost:6379';
const PORTS = [4101, 4102];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(40); } return false; };

const procs = PORTS.map((port) =>
  spawn('node', ['src/index.js'], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: DB, REDIS_URL: REDIS, PERSIST_DEBOUNCE_MS: '100' },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
);
after(() => procs.forEach((p) => p.kill()));

async function waitHealthy(port) {
  assert.ok(await until(async () => { try { return (await fetch(`http://localhost:${port}/health`)).ok; } catch { return false; } }, 15000), `instance ${port} up`);
}
const api = async (port, path, { method = 'GET', token, body } = {}) => {
  const r = await fetch(`http://localhost:${port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return r.json();
};
const connect = (port, id, token) => {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(`ws://localhost:${port}/collab`, id, ydoc, { params: { token }, WebSocketPolyfill: WS, disableBc: true });
  return { ydoc, provider, frag: ydoc.getXmlFragment('default') };
};
const para = (c, s) => { const p = new Y.XmlElement('paragraph'); p.insert(0, [new Y.XmlText(s)]); c.frag.insert(c.frag.length, [p]); };
const plain = (c) => c.frag.toString().replace(/<[^>]+>/g, '');

test('edits and presence cross server instances via Redis; persistence merges', async () => {
  for (const p of PORTS) await waitHealthy(p);
  const tag = Date.now().toString(36);
  const reg = (n) => api(PORTS[0], '/api/auth/register', { method: 'POST', body: { name: n, email: `${n}.${tag}@scale.dev`, password: 'password123' } });
  const a = await reg('sa'), b = await reg('sb');
  const { doc } = await api(PORTS[0], '/api/docs', { method: 'POST', token: a.token, body: { title: 'Scale' } });
  await api(PORTS[0], `/api/docs/${doc.id}/members`, { method: 'PUT', token: a.token, body: { email: b.user.email, role: 'editor' } });

  const ca = connect(PORTS[0], doc.id, a.token);
  const cb = connect(PORTS[1], doc.id, b.token);
  assert.ok(await until(() => ca.provider.synced && cb.provider.synced));

  para(ca, 'from instance A');
  para(cb, 'from instance B');
  assert.ok(await until(() => plain(ca).includes('instance B') && plain(cb).includes('instance A')), 'cross-instance convergence');
  assert.equal(plain(ca), plain(cb));

  ca.provider.awareness.setLocalStateField('user', { name: 'SA' });
  assert.ok(await until(() => [...cb.provider.awareness.getStates().values()].some((s) => s.user?.name === 'SA')), 'cross-instance presence');

  // Both instances persist; a late joiner on either instance must see the merged document.
  await sleep(600);
  ca.provider.destroy(); cb.provider.destroy();
  await sleep(600);
  const late = connect(PORTS[1], doc.id, a.token);
  assert.ok(await until(() => plain(late).includes('instance A') && plain(late).includes('instance B')), `merged state persisted, got "${plain(late)}"`);
  late.provider.destroy();
});
