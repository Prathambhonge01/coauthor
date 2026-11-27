import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const signToken = (user) =>
  jwt.sign({ sub: user.id, name: user.name }, config.jwtSecret, { expiresIn: '7d' });

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

/** Express middleware: requires a valid Bearer token, sets req.user = { id, name } */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, name: payload.name };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, settings: u.settings || {} });

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Enter your name.' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, lower($2), $3) RETURNING id, name, email',
      [name.trim(), email, hash]
    );
    res.status(201).json({ user: publicUser(rows[0]), token: signToken(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw e;
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await query('SELECT * FROM users WHERE email = lower($1)', [email || '']);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password || '', user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ user: publicUser(user), token: signToken(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id, name, email, settings FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: publicUser(rows[0]) });
});

authRouter.patch('/settings', requireAuth, async (req, res) => {
  const { name, settings } = req.body || {};
  const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null;
  const cleanSettings = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const { rows } = await query(
    `UPDATE users
        SET name = COALESCE($2, name),
            settings = COALESCE(settings, '{}'::jsonb) || $3::jsonb
      WHERE id = $1
      RETURNING id, name, email, settings`,
    [req.user.id, cleanName, JSON.stringify(cleanSettings)]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: publicUser(rows[0]) });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(currentPassword || '', user.password_hash)))
    return res.status(401).json({ error: 'Current password is incorrect.' });
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, hash]);
  res.json({ ok: true });
});
