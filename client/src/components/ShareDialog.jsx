import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ShareDialog({ doc, onClose }) {
  const isOwner = doc.role === 'owner';
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (isOwner) api(`/docs/${doc.id}/members`).then((r) => setMembers(r.members)).catch((e) => setError(e.message));
  }, [doc.id, isOwner]);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      const { member } = await api(`/docs/${doc.id}/members`, { method: 'PUT', body: { email, role } });
      setMembers((m) => [...m.filter((x) => x.id !== member.id), member].sort((a, b) => a.name.localeCompare(b.name)));
      setEmail('');
    } catch (err) { setError(err.message); }
  }
  const change = async (m, newRole) => {
    try { await api(`/docs/${doc.id}/members`, { method: 'PUT', body: { email: m.email, role: newRole } }); setMembers((l) => l.map((x) => (x.id === m.id ? { ...x, role: newRole } : x))); }
    catch (err) { setError(err.message); }
  };
  const remove = async (m) => {
    try { await api(`/docs/${doc.id}/members/${m.id}`, { method: 'DELETE' }); setMembers((l) => l.filter((x) => x.id !== m.id)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="share-h">
        <h2 id="share-h">Share “{doc.title}”</h2>
        {!isOwner ? (
          <p>{doc.owner_name} owns this document. You can {doc.role === 'editor' ? 'edit' : 'view'} it. Only the owner can change sharing.</p>
        ) : (
          <>
            <form className="share-form" onSubmit={add}>
              <input type="email" placeholder="Their account email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email address" />
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="btn primary">Add</button>
            </form>
            {error && <p className="error" role="alert">{error}</p>}
            {members.length === 0 ? <p className="muted">Only you can open this document.</p> : (
              <ul className="members">
                {members.map((m) => (
                  <li key={m.id}>
                    <span><strong>{m.name}</strong><br /><span className="muted">{m.email}</span></span>
                    <select value={m.role} onChange={(e) => change(m, e.target.value)} aria-label={`Access for ${m.name}`}>
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    <button className="btn ghost danger" onClick={() => remove(m)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="dialog-actions"><button className="btn" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}
