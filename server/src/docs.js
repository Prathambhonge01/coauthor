import { Router } from 'express';
import { query, getRole } from './db.js';
import { requireAuth } from './auth.js';
import { withRoom, snapshotBytes, restoreInto, versionToText, kickUser, closeRoom, flush } from './collab.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (res) => res.status(404).json({ error: 'Document not found.' });

export const docsRouter = Router();
docsRouter.use(requireAuth);

docsRouter.param('id', (_req, res, next, id) => (UUID_RE.test(id) ? next() : notFound(res)));
docsRouter.param('vid', (_req, res, next, id) => (UUID_RE.test(id) ? next() : notFound(res)));

/** Route guard: caller must hold one of the given roles on :id (404 if no access at all). */
const need = (...roles) => async (req, res, next) => {
  const role = await getRole(req.params.id, req.user.id);
  if (!role) return notFound(res);
  if (!roles.includes(role)) return res.status(403).json({ error: 'You don’t have permission to do that.' });
  req.role = role;
  next();
};
const ANY = ['owner', 'editor', 'viewer'];
const CAN_EDIT = ['owner', 'editor'];

/* ---- documents ---- */

docsRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT d.id, d.title, d.folder, d.tags, d.starred, d.archived, d.doc_type, d.updated_at, u.name AS owner_name,
            CASE WHEN d.owner_id = $1 THEN 'owner' ELSE m.role END AS role
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       LEFT JOIN doc_members m ON m.doc_id = d.id AND m.user_id = $1
      WHERE d.owner_id = $1 OR m.user_id = $1
      ORDER BY d.starred DESC, d.updated_at DESC`,
    [req.user.id]
  );
  res.json({ docs: rows });
});

const cleanFolder = (f) => (typeof f === 'string' && f.trim() ? f.trim().slice(0, 60) : 'General');
const cleanTags = (t) =>
  Array.isArray(t)
    ? [...new Set(t.map((x) => String(x || '').trim().toLowerCase().slice(0, 32)).filter(Boolean))].slice(0, 12)
    : [];
const cleanDocType = (dt) => (dt === 'latex' ? 'latex' : 'rich');

docsRouter.post('/', async (req, res) => {
  const title = (req.body?.title || '').trim().slice(0, 200) || 'Untitled document';
  const folder = cleanFolder(req.body?.folder);
  const tags = cleanTags(req.body?.tags);
  const docType = cleanDocType(req.body?.doc_type);
  const { rows } = await query(
    `INSERT INTO documents (title, owner_id, folder, tags, doc_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, folder, tags, starred, archived, doc_type, updated_at`,
    [title, req.user.id, folder, tags, docType]
  );
  res.status(201).json({ doc: { ...rows[0], role: 'owner' } });
});

docsRouter.get('/:id', need(...ANY), async (req, res) => {
  const { rows } = await query(
    `SELECT d.id, d.title, d.folder, d.tags, d.starred, d.archived, d.doc_type, d.updated_at, u.name AS owner_name
       FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = $1`,
    [req.params.id]
  );
  res.json({ doc: { ...rows[0], role: req.role } });
});

docsRouter.patch('/:id', need(...CAN_EDIT), async (req, res) => {
  const body = req.body || {};
  const updates = [];
  const params = [req.params.id];

  if (body.title !== undefined) {
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'Title can’t be empty.' });
    params.push(title);
    updates.push(`title = $${params.length}`);
  }
  if (body.folder !== undefined) {
    params.push(cleanFolder(body.folder));
    updates.push(`folder = $${params.length}`);
  }
  if (body.tags !== undefined) {
    params.push(cleanTags(body.tags));
    updates.push(`tags = $${params.length}`);
  }
  if (typeof body.starred === 'boolean') {
    params.push(body.starred);
    updates.push(`starred = $${params.length}`);
  }
  if (typeof body.archived === 'boolean') {
    params.push(body.archived);
    updates.push(`archived = $${params.length}`);
  }
  if (body.doc_type !== undefined) {
    params.push(cleanDocType(body.doc_type));
    updates.push(`doc_type = $${params.length}`);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

  updates.push('updated_at = now()');
  const { rows } = await query(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = $1
     RETURNING id, title, folder, tags, starred, archived, doc_type, updated_at`,
    params
  );
  res.json({ ok: true, title: rows[0].title, doc: { ...rows[0], role: req.role } });
});

docsRouter.post('/:id/duplicate', need(...ANY), async (req, res) => {
  const bytes = await withRoom(req.params.id, async (room) => {
    await flush(room);
    return snapshotBytes(room);
  });
  const { rows: srcRows } = await query(
    'SELECT title, folder, tags, doc_type FROM documents WHERE id = $1',
    [req.params.id]
  );
  const src = srcRows[0];
  if (!src) return notFound(res);
  const copyTitle = `${src.title} (Copy)`.slice(0, 200);
  const { rows } = await query(
    `INSERT INTO documents (title, owner_id, ydoc, folder, tags, doc_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, folder, tags, starred, archived, doc_type, updated_at`,
    [copyTitle, req.user.id, bytes, src.folder, src.tags, src.doc_type]
  );
  res.status(201).json({ doc: { ...rows[0], owner_name: req.user.name, role: 'owner' } });
});

docsRouter.delete('/:id', need('owner'), async (req, res) => {
  await query('DELETE FROM documents WHERE id = $1', [req.params.id]);
  closeRoom(req.params.id);
  res.status(204).end();
});

/* ---- sharing ---- */

docsRouter.get('/:id/members', need('owner'), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, m.role FROM doc_members m JOIN users u ON u.id = m.user_id
      WHERE m.doc_id = $1 ORDER BY u.name`,
    [req.params.id]
  );
  res.json({ members: rows });
});

docsRouter.put('/:id/members', need('owner'), async (req, res) => {
  const { email, role } = req.body || {};
  if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Choose editor or viewer.' });
  const { rows } = await query('SELECT id, name, email FROM users WHERE email = lower($1)', [email || '']);
  const target = rows[0];
  if (!target) return res.status(404).json({ error: 'No account uses that email yet.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You already own this document.' });
  await query(
    `INSERT INTO doc_members (doc_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (doc_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [req.params.id, target.id, role]
  );
  kickUser(req.params.id, target.id); // they reconnect immediately with the new role
  res.json({ member: { ...target, role } });
});

docsRouter.delete('/:id/members/:userId', need('owner'), async (req, res) => {
  if (!UUID_RE.test(req.params.userId)) return notFound(res);
  await query('DELETE FROM doc_members WHERE doc_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
  kickUser(req.params.id, req.params.userId);
  res.status(204).end();
});

/* ---- version history ---- */

docsRouter.get('/:id/versions', need(...ANY), async (req, res) => {
  const { rows } = await query(
    `SELECT v.id, v.label, v.auto, v.created_at, u.name AS author
       FROM doc_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.doc_id = $1 ORDER BY v.created_at DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({ versions: rows });
});

docsRouter.post('/:id/versions', need(...CAN_EDIT), async (req, res) => {
  const label = (req.body?.label || '').trim().slice(0, 120) || 'Saved version';
  const bytes = await withRoom(req.params.id, async (room) => {
    await flush(room);
    return snapshotBytes(room);
  });
  const { rows } = await query(
    'INSERT INTO doc_versions (doc_id, ydoc, label, created_by) VALUES ($1, $2, $3, $4) RETURNING id, label, auto, created_at',
    [req.params.id, bytes, label, req.user.id]
  );
  res.status(201).json({ version: { ...rows[0], author: req.user.name } });
});

const loadVersion = async (docId, vid) =>
  (await query('SELECT ydoc FROM doc_versions WHERE id = $1 AND doc_id = $2', [vid, docId])).rows[0];

docsRouter.get('/:id/versions/:vid/preview', need(...ANY), async (req, res) => {
  const v = await loadVersion(req.params.id, req.params.vid);
  if (!v) return res.status(404).json({ error: 'Version not found.' });
  res.json({ text: versionToText(v.ydoc) });
});

docsRouter.post('/:id/versions/:vid/restore', need(...CAN_EDIT), async (req, res) => {
  const v = await loadVersion(req.params.id, req.params.vid);
  if (!v) return res.status(404).json({ error: 'Version not found.' });
  await withRoom(req.params.id, async (room) => {
    // Keep a safety copy so a restore can itself be undone.
    await query('INSERT INTO doc_versions (doc_id, ydoc, label, auto, created_by) VALUES ($1, $2, $3, true, $4)', [
      req.params.id, snapshotBytes(room), 'Before restore', req.user.id,
    ]);
    restoreInto(room, v.ydoc);
    await flush(room);
  });
  res.json({ ok: true });
});
