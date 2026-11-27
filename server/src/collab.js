/**
 * Real-time collaboration engine.
 *
 * - One in-memory Room (Y.Doc + awareness) per open document.
 * - Speaks the standard y-websocket protocol (sync + awareness), so any
 *   Yjs-compatible client can connect.
 * - Viewers may receive updates and share cursors but their document edits are dropped.
 * - Updates are debounced into Postgres; the stored state is merged on write,
 *   so several server instances can safely persist the same document (CRDT merge is idempotent).
 * - Optional Redis pub/sub relays updates and presence between server instances.
 */
import crypto from 'node:crypto';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Redis } from 'ioredis';
import { pool, query } from './db.js';
import { config } from './config.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
export const FRAGMENT = 'default'; // TipTap's Collaboration extension uses this field by default
const CHANNEL = 'coauthor:collab';
const INSTANCE_ID = crypto.randomUUID();

const rooms = new Map(); // docId -> Room (loaded)
const loading = new Map(); // docId -> Promise<Room>
let pub = null;
let sub = null;
let heartbeat = null;

class Room {
  constructor(id) {
    this.id = id;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    this.conns = new Map(); // ws -> { userId, readOnly, clientIds:Set }
    this.pins = 0; // in-flight REST operations holding the room open
    this.timer = null;
    this.saveChain = Promise.resolve();
    this.destroyed = false;
  }
}

/* ---------- Redis relay ---------- */

export function initCollab() {
  if (config.redisUrl) {
    pub = new Redis(config.redisUrl, { family: 0 });
    sub = new Redis(config.redisUrl, { family: 0 });
    sub.subscribe(CHANNEL, (err) => {
      if (err) console.error('redis subscribe error', err.message);
    });
    sub.on('message', (_ch, raw) => {
      const msg = JSON.parse(raw);
      if (msg.from === INSTANCE_ID) return;
      const room = rooms.get(msg.docId);
      if (!room) return;
      const data = Buffer.from(msg.data, 'base64');
      if (msg.type === 'update') Y.applyUpdate(room.doc, data, 'redis');
      else awarenessProtocol.applyAwarenessUpdate(room.awareness, data, 'redis');
    });
    pub.on('error', (e) => console.error('redis pub error', e.message));
    sub.on('error', (e) => console.error('redis sub error', e.message));
  }
  heartbeat = setInterval(() => {
    for (const room of rooms.values())
      for (const ws of room.conns.keys()) {
        if (ws.isAlive === false) { ws.terminate(); continue; }
        ws.isAlive = false;
        ws.ping();
      }
  }, 30000);
  heartbeat.unref();
}

export async function checkRedis() {
  if (!pub) return 'disabled';
  await pub.ping();
  return 'ok';
}

export async function shutdownCollab() {
  clearInterval(heartbeat);
  for (const room of [...rooms.values()]) {
    for (const ws of room.conns.keys()) ws.close(1001, 'server shutting down');
    await flush(room);
    destroy(room);
  }
  await Promise.all([pub?.quit(), sub?.quit()]);
}

function relay(type, docId, data) {
  if (!pub) return;
  pub.publish(CHANNEL, JSON.stringify({ from: INSTANCE_ID, type, docId, data: Buffer.from(data).toString('base64') }));
}

/* ---------- Room lifecycle ---------- */

export async function getRoom(docId) {
  const existing = rooms.get(docId);
  if (existing) return existing;
  if (!loading.has(docId)) {
    const p = loadRoom(docId).finally(() => loading.delete(docId));
    loading.set(docId, p);
  }
  return loading.get(docId);
}

async function loadRoom(docId) {
  const { rows } = await query('SELECT ydoc FROM documents WHERE id = $1', [docId]);
  if (!rows[0]) throw Object.assign(new Error('Document not found'), { status: 404 });
  const room = new Room(docId);
  if (rows[0].ydoc) Y.applyUpdate(room.doc, new Uint8Array(rows[0].ydoc), 'db');

  room.doc.on('update', (update, origin) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    room.conns.forEach((_c, ws) => send(ws, msg));
    if (origin !== 'redis') relay('update', room.id, update);
    schedulePersist(room);
  });

  room.awareness.on('update', ({ added, updated, removed }, origin) => {
    const conn = room.conns.get(origin);
    if (conn) {
      added.forEach((id) => conn.clientIds.add(id));
      removed.forEach((id) => conn.clientIds.delete(id));
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    const changed = added.concat(updated, removed);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
    const msg = encoding.toUint8Array(enc);
    room.conns.forEach((_c, ws) => send(ws, msg));
    if (origin !== 'redis') relay('awareness', room.id, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
  });

  rooms.set(docId, room);
  return room;
}

function destroy(room) {
  room.destroyed = true;
  rooms.delete(room.id);
  room.awareness.destroy();
  room.doc.destroy();
}

async function maybeRelease(room) {
  if (room.destroyed || room.conns.size > 0 || room.pins > 0) return;
  await flush(room);
  if (room.conns.size === 0 && room.pins === 0 && !room.destroyed) destroy(room);
}

/* ---------- Persistence ---------- */

function schedulePersist(room) {
  if (room.timer || room.destroyed) return;
  room.timer = setTimeout(() => flush(room), config.persistDebounceMs);
}

export function flush(room) {
  clearTimeout(room.timer);
  room.timer = null;
  room.saveChain = room.saveChain.then(() => persist(room)).catch((e) => {
    console.error(`persist failed for ${room.id}:`, e.message);
    schedulePersist(room); // retry later
  });
  return room.saveChain;
}

async function persist(room) {
  if (room.destroyed) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT ydoc FROM documents WHERE id = $1 FOR UPDATE', [room.id]);
    if (!rows[0]) { await client.query('ROLLBACK'); return; }
    // Merge anything another instance already saved, then write the union.
    if (rows[0].ydoc) Y.applyUpdate(room.doc, new Uint8Array(rows[0].ydoc), 'db');
    const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
    await client.query('UPDATE documents SET ydoc = $2, updated_at = now() WHERE id = $1', [room.id, state]);
    await client.query(
      `INSERT INTO doc_versions (doc_id, ydoc, label, auto)
       SELECT $1, $2, 'Autosave', true
        WHERE NOT EXISTS (SELECT 1 FROM doc_versions WHERE doc_id = $1 AND created_at > now() - make_interval(secs => $3))`,
      [room.id, state, config.autoVersionMs / 1000]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* ---------- WebSocket connections ---------- */

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(msg, (err) => err && ws.terminate());
}

export function attach(ws, room, { userId, role }) {
  const conn = { userId, readOnly: role === 'viewer', clientIds: new Set() };
  room.conns.set(ws, conn);
  ws.binaryType = 'arraybuffer';
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => onMessage(room, ws, conn, new Uint8Array(data)));
  ws.on('close', () => {
    room.conns.delete(ws);
    awarenessProtocol.removeAwarenessStates(room.awareness, [...conn.clientIds], null);
    maybeRelease(room);
  });

  // Initial handshake: our state vector, then everyone's presence.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(ws, encoding.toUint8Array(enc));
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const e2 = encoding.createEncoder();
    encoding.writeVarUint(e2, MSG_AWARENESS);
    encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
    send(ws, encoding.toUint8Array(e2));
  }
}

function onMessage(room, ws, conn, message) {
  try {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const syncType = decoding.peekVarUint(decoder);
      // Viewers can ask for the document (step 1) but never write to it.
      if (conn.readOnly && syncType !== syncProtocol.messageYjsSyncStep1) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, enc, room.doc, ws);
      if (encoding.length(enc) > 1) send(ws, encoding.toUint8Array(enc));
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
    }
  } catch (e) {
    console.error('bad collab message:', e.message);
  }
}

/** Disconnect a user's live sessions (used when their access changes). */
export function kickUser(docId, userId) {
  const room = rooms.get(docId);
  if (!room) return;
  for (const [ws, conn] of room.conns) if (conn.userId === userId) ws.close(4403, 'access changed');
}

export function closeRoom(docId) {
  const room = rooms.get(docId);
  if (!room) return;
  for (const ws of room.conns.keys()) ws.close(4404, 'document deleted');
  destroy(room);
}

/* ---------- Helpers for REST routes ---------- */

export async function withRoom(docId, fn) {
  const room = await getRoom(docId);
  room.pins++;
  try {
    return await fn(room);
  } finally {
    room.pins--;
    maybeRelease(room);
  }
}

export const snapshotBytes = (room) => Buffer.from(Y.encodeStateAsUpdate(room.doc));

/**
 * Restore = replace the live content with the version's content as a normal edit.
 * Because it is an ordinary CRDT transaction, it syncs to every connected client
 * and nobody's later edits are lost to a "rewind".
 */
export function restoreInto(room, versionBytes) {
  const old = new Y.Doc();
  Y.applyUpdate(old, new Uint8Array(versionBytes));
  const source = old.getXmlFragment(FRAGMENT);
  room.doc.transact(() => {
    const target = room.doc.getXmlFragment(FRAGMENT);
    target.delete(0, target.length);
    target.insert(0, source.toArray().map((n) => n.clone()));
  }, 'restore');
  old.destroy();
}

export function versionToText(bytes) {
  const d = new Y.Doc();
  Y.applyUpdate(d, new Uint8Array(bytes));
  const text = d
    .getXmlFragment(FRAGMENT)
    .toArray()
    .map((n) => n.toString().replace(/<[^>]+>/g, ''))
    .join('\n');
  d.destroy();
  return text;
}
