import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import WS from 'ws';
import { WebsocketProvider } from 'y-websocket';

process.env.DATABASE_URL ||= 'postgres://postgres:postgres@localhost:5432/coauthor_test';
process.env.PERSIST_DEBOUNCE_MS = '100';
process.env.REDIS_URL ||= process.env.TEST_REDIS_URL || '';

const { createServer } = await import('../src/index.js');
const { migrate, pool } = await import('../src/db.js');
const { initCollab, shutdownCollab } = await import('../src/collab.js');

let server, base, wsBase;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(30); }
  return false;
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const uniq = Date.now().toString(36);
async function signup(name) {
  const r = await api('/api/auth/register', { method: 'POST', body: { name, email: `${name}.${uniq}@test.dev`, password: 'password123' } });
  assert.equal(r.status, 201);
  return { ...r.body.user, token: r.body.token };
}

function connect(docId, token, url = wsBase) {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(`${url}/collab`, docId, ydoc, {
    params: { token }, WebSocketPolyfill: WS, disableBc: true,
  });
  return { ydoc, provider, text: ydoc.getXmlFragment('default') };
}
const addParagraph = (c, s) => {
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText(s)]);
  c.text.insert(c.text.length, [p]);
};
const plain = (c) => c.text.toString().replace(/<[^>]+>/g, '');

before(async () => {
  await migrate();
  initCollab();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  base = `http://localhost:${port}`;
  wsBase = `ws://localhost:${port}`;
});
after(async () => {
  server.closeAllConnections?.();
  server.close();
  await shutdownCollab();
  await pool.end();
});

test('auth: rejects bad input and unauthenticated access', async () => {
  assert.equal((await api('/api/docs')).status, 401);
  const bad = await api('/api/auth/register', { method: 'POST', body: { name: 'x', email: 'nope', password: 'short' } });
  assert.equal(bad.status, 400);
  const u = await signup('dup');
  const again = await api('/api/auth/register', { method: 'POST', body: { name: 'dup', email: `dup.${uniq}@test.dev`, password: 'password123' } });
  assert.equal(again.status, 409);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: u.email, password: 'wrongpass' } });
  assert.equal(login.status, 401);
});

test('permissions: owner shares, strangers are blocked', async () => {
  const owner = await signup('owner1');
  const stranger = await signup('stranger1');
  const { body } = await api('/api/docs', { method: 'POST', token: owner.token, body: { title: 'Plan' } });
  const id = body.doc.id;
  assert.equal((await api(`/api/docs/${id}`, { token: stranger.token })).status, 404);
  assert.equal((await api(`/api/docs/${id}/members`, { method: 'PUT', token: stranger.token, body: { email: stranger.email, role: 'editor' } })).status, 404);
  const share = await api(`/api/docs/${id}/members`, { method: 'PUT', token: owner.token, body: { email: stranger.email, role: 'viewer' } });
  assert.equal(share.status, 200);
  const view = await api(`/api/docs/${id}`, { token: stranger.token });
  assert.equal(view.body.doc.role, 'viewer');
  assert.equal((await api(`/api/docs/${id}`, { method: 'PATCH', token: stranger.token, body: { title: 'Hax' } })).status, 403);
  assert.equal((await api(`/api/docs/${id}`, { method: 'DELETE', token: stranger.token })).status, 403);
});

test('realtime: two editors converge, state persists, viewer cannot write', async () => {
  const a = await signup('alice');
  const b = await signup('bob');
  const v = await signup('vic');
  const outsider = await signup('eve');
  const id = (await api('/api/docs', { method: 'POST', token: a.token, body: {} })).body.doc.id;
  await api(`/api/docs/${id}/members`, { method: 'PUT', token: a.token, body: { email: b.email, role: 'editor' } });
  await api(`/api/docs/${id}/members`, { method: 'PUT', token: a.token, body: { email: v.email, role: 'viewer' } });

  const ca = connect(id, a.token), cb = connect(id, b.token), cv = connect(id, v.token);
  assert.ok(await until(() => ca.provider.synced && cb.provider.synced && cv.provider.synced), 'all clients synced');

  addParagraph(ca, 'Hello from Alice');
  addParagraph(cb, 'Hello from Bob');
  assert.ok(await until(() => plain(ca).includes('Bob') && plain(cb).includes('Alice') && plain(cv).includes('Alice') && plain(cv).includes('Bob')), 'editors converge and viewer receives');
  assert.equal(plain(ca), plain(cb));

  // viewer edit stays local and never reaches others or the database
  addParagraph(cv, 'VIEWER SNEAKY EDIT');
  await sleep(500);
  assert.ok(!plain(ca).includes('SNEAKY'), 'viewer edit must not propagate');

  // awareness (presence)
  ca.provider.awareness.setLocalStateField('user', { name: 'Alice', color: '#f00' });
  assert.ok(await until(() => [...cb.provider.awareness.getStates().values()].some((s) => s.user?.name === 'Alice')), 'presence propagates');

  // persistence: a fresh client after everyone leaves still sees the content
  await sleep(400);
  [ca, cb, cv].forEach((c) => { c.provider.destroy(); c.ydoc.destroy(); });
  await sleep(500);
  const cb2 = connect(id, b.token);
  assert.ok(await until(() => plain(cb2).includes('Alice') && plain(cb2).includes('Bob')), 'content persisted');
  assert.ok(!plain(cb2).includes('SNEAKY'));
  cb2.provider.destroy();

  // outsider cannot even open a socket
  const co = connect(id, outsider.token);
  await sleep(700);
  assert.equal(co.provider.wsconnected, false);
  co.provider.destroy();
});

test('version history: snapshot, edit, restore reverts content for live clients', async () => {
  const a = await signup('hist');
  const id = (await api('/api/docs', { method: 'POST', token: a.token, body: {} })).body.doc.id;
  const c = connect(id, a.token);
  assert.ok(await until(() => c.provider.synced));
  addParagraph(c, 'Draft one');
  await sleep(300);
  const snap = await api(`/api/docs/${id}/versions`, { method: 'POST', token: a.token, body: { label: 'v1' } });
  assert.equal(snap.status, 201);
  addParagraph(c, 'Draft two');
  await sleep(300);
  assert.ok(plain(c).includes('Draft two'));

  const preview = await api(`/api/docs/${id}/versions/${snap.body.version.id}/preview`, { token: a.token });
  assert.ok(preview.body.text.includes('Draft one') && !preview.body.text.includes('Draft two'));

  const restore = await api(`/api/docs/${id}/versions/${snap.body.version.id}/restore`, { method: 'POST', token: a.token });
  assert.equal(restore.status, 200);
  assert.ok(await until(() => plain(c) === 'Draft one'), `live client reverted, got "${plain(c)}"`);
  const list = await api(`/api/docs/${id}/versions`, { token: a.token });
  assert.ok(list.body.versions.some((x) => x.label === 'Before restore'), 'safety copy exists');
  c.provider.destroy();
});

test('revoking access disconnects the user', async () => {
  const o = await signup('own2'), m = await signup('mem2');
  const id = (await api('/api/docs', { method: 'POST', token: o.token, body: {} })).body.doc.id;
  await api(`/api/docs/${id}/members`, { method: 'PUT', token: o.token, body: { email: m.email, role: 'editor' } });
  const cm = connect(id, m.token);
  assert.ok(await until(() => cm.provider.synced));
  await api(`/api/docs/${id}/members/${m.id}`, { method: 'DELETE', token: o.token });
  assert.ok(await until(() => !cm.provider.wsconnected), 'kicked');
  await sleep(1500); // provider retries and must be refused
  assert.equal(cm.provider.wsconnected, false);
  cm.provider.destroy();
});
