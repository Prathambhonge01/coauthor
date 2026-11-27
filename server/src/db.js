import pg from 'pg';
import { config } from './config.js';

const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  /sslmode=require|\.render\.com/i.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      name text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL DEFAULT 'Untitled',
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ydoc bytea,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS doc_members (
      doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('editor', 'viewer')),
      PRIMARY KEY (doc_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS doc_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ydoc bytea NOT NULL,
      label text,
      auto boolean NOT NULL DEFAULT false,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS doc_versions_doc_idx ON doc_versions (doc_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS doc_members_user_idx ON doc_members (user_id);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'General';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'rich';
  `);
}

/** Effective role of a user on a document: 'owner' | 'editor' | 'viewer' | null */
export async function getRole(docId, userId) {
  const { rows } = await query(
    `SELECT CASE WHEN d.owner_id = $2 THEN 'owner' ELSE m.role END AS role
       FROM documents d
       LEFT JOIN doc_members m ON m.doc_id = d.id AND m.user_id = $2
      WHERE d.id = $1`,
    [docId, userId]
  );
  return rows[0]?.role ?? null;
}
