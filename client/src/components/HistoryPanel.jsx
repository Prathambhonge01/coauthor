import { useCallback, useEffect, useState } from 'react';
import { api, timeAgo } from '../api.js';

export default function HistoryPanel({ docId, canEdit, onClose }) {
  const [versions, setVersions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => api(`/docs/${docId}/versions`).then((r) => setVersions(r.versions)).catch((e) => setError(e.message)), [docId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function open(v) {
    setSelected(v); setPreview('Loading…'); setMsg('');
    try { setPreview((await api(`/docs/${docId}/versions/${v.id}/preview`)).text || '(empty document)'); }
    catch (e) { setPreview(''); setError(e.message); }
  }
  async function save(e) {
    e.preventDefault();
    try { await api(`/docs/${docId}/versions`, { method: 'POST', body: { label } }); setLabel(''); setMsg('Version saved.'); load(); }
    catch (err) { setError(err.message); }
  }
  async function restore() {
    if (!confirm('Restore this version? Everyone in the document will see it. Your current text is kept in history as “Before restore”.')) return;
    try { await api(`/docs/${docId}/versions/${selected.id}/restore`, { method: 'POST' }); setMsg('Version restored.'); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <aside className="drawer" aria-label="Version history">
      <div className="drawer-head"><h2>Version history</h2><button className="btn ghost" onClick={onClose}>Close</button></div>
      {canEdit && (
        <form className="share-form" onSubmit={save}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this version (optional)" maxLength={120} aria-label="Version name" />
          <button className="btn">Save version</button>
        </form>
      )}
      {msg && <p className="ok" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {versions?.length === 0 && <p className="muted">No versions yet. Autosaves appear here as you write.</p>}
      <ul className="versions">
        {versions?.map((v) => (
          <li key={v.id}>
            <button className={selected?.id === v.id ? 'on' : ''} onClick={() => open(v)}>
              <strong>{v.label}</strong>
              <span className="muted">{timeAgo(v.created_at)}{v.author ? ` · ${v.author}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="preview">
          <h3>Preview</h3>
          <pre>{preview}</pre>
          {canEdit && <button className="btn primary" onClick={restore}>Restore this version</button>}
        </div>
      )}
    </aside>
  );
}
