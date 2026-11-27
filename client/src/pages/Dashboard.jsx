import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, timeAgo } from '../api.js';
import { useAuth } from '../App.jsx';
import { ThemeToggle } from '../theme.jsx';
import { convertFormat } from '../utils/converters.js';
import { DOC_TEMPLATES } from '../utils/templates.js';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all'); // 'all' | 'starred' | 'rich' | 'latex' | 'archived'
  const [folderFilter, setFolderFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'title' | 'role'
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [orgForm, setOrgForm] = useState({ title: '', folder: 'General', tags: '', doc_type: 'rich' });

  useEffect(() => {
    api('/docs').then((r) => setDocs(r.docs)).catch((e) => setError(e.message));
  }, []);

  const folders = useMemo(() => {
    if (!docs) return ['General'];
    return [...new Set(['General', ...docs.map((d) => d.folder || 'General')])].sort();
  }, [docs]);

  const allTags = useMemo(() => {
    if (!docs) return [];
    return [...new Set(docs.flatMap((d) => d.tags || []))].sort();
  }, [docs]);

  const counts = useMemo(() => {
    if (!docs) return { all: 0, starred: 0, rich: 0, latex: 0, archived: 0 };
    const active = docs.filter((d) => !d.archived);
    return {
      all: active.length,
      starred: active.filter((d) => d.starred).length,
      rich: active.filter((d) => (d.doc_type || 'rich') === 'rich').length,
      latex: active.filter((d) => d.doc_type === 'latex').length,
      archived: docs.filter((d) => d.archived).length,
    };
  }, [docs]);

  const visibleDocs = useMemo(() => {
    if (!docs) return [];
    const q = search.trim().toLowerCase();
    return docs
      .filter((d) => {
        if (scope === 'archived') return !!d.archived;
        if (d.archived) return false;
        if (scope === 'starred' && !d.starred) return false;
        if (scope === 'rich' && (d.doc_type || 'rich') !== 'rich') return false;
        if (scope === 'latex' && d.doc_type !== 'latex') return false;
        if (folderFilter && (d.folder || 'General') !== folderFilter) return false;
        if (tagFilter && !(d.tags || []).includes(tagFilter)) return false;
        if (q) {
          const hay = `${d.title} ${d.folder || ''} ${(d.tags || []).join(' ')} ${d.owner_name || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'role') return a.role.localeCompare(b.role);
        if (Boolean(b.starred) !== Boolean(a.starred)) return b.starred ? 1 : -1;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });
  }, [docs, scope, folderFilter, tagFilter, search, sortBy]);

  async function create(opts = {}) {
    try {
      const { doc } = await api('/docs', {
        method: 'POST',
        body: {
          title: opts.title || 'Untitled document',
          folder: opts.folder || folderFilter || 'General',
          tags: opts.tags || [],
          doc_type: opts.docType || (scope === 'latex' ? 'latex' : 'rich'),
        },
      });
      navigate(`/d/${doc.id}`, {
        state: {
          ...(opts.html ? { initialHtml: opts.html } : {}),
          ...(opts.latex ? { initialLatex: opts.latex } : {}),
        },
      });
    } catch (e) {
      setError(e.message);
    }
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const raw = await file.text();
      const parts = file.name.split('.');
      const ext = (parts.length > 1 ? parts.pop() : 'txt').toLowerCase();
      const normExt = ext === 'markdown' ? 'md' : ext === 'htm' ? 'html' : ext;
      const baseTitle = parts.join('.') || 'Imported document';
      if (normExt === 'tex' || normExt === 'latex') {
        await create({ title: file.name, docType: 'latex', folder: 'Research', tags: ['latex', 'imported'], latex: raw });
      } else {
        const html = convertFormat(raw, normExt, 'html-fragment', baseTitle);
        await create({ title: baseTitle, docType: 'rich', tags: ['imported'], html });
      }
    } catch (err) {
      setError(err.message || 'Could not import file.');
    }
  }

  async function patchDoc(doc, body) {
    try {
      const res = await api(`/docs/${doc.id}`, { method: 'PATCH', body });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ...res.doc } : d)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function duplicate(doc) {
    try {
      const { doc: copy } = await api(`/docs/${doc.id}/duplicate`, { method: 'POST' });
      setDocs((prev) => [copy, ...prev]);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(doc) {
    if (!confirm(`Delete “${doc.title}” permanently for everyone? This can’t be undone.`)) return;
    try {
      await api(`/docs/${doc.id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      setError(e.message);
    }
  }

  const openOrganize = (doc) => {
    setEditingDoc(doc);
    setOrgForm({
      title: doc.title,
      folder: doc.folder || 'General',
      tags: (doc.tags || []).join(', '),
      doc_type: doc.doc_type || 'rich',
    });
  };

  const saveOrganize = async (e) => {
    e.preventDefault();
    if (!editingDoc) return;
    const tags = orgForm.tags.split(',').map((s) => s.trim()).filter(Boolean);
    await patchDoc(editingDoc, {
      title: orgForm.title,
      folder: orgForm.folder,
      tags,
      doc_type: orgForm.doc_type,
    });
    setEditingDoc(null);
  };

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand small">Coauthor</span>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="nav-pill on">Library</Link>
          <Link to="/tools" className="nav-pill">Conversion Tools</Link>
          <Link to="/settings" className="nav-pill">Settings</Link>
        </nav>
        <span className="spacer" />
        <ThemeToggle />
        <span className="muted user-chip">{user.name}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>

      <div className="library-shell">
        <aside className="lib-sidebar" aria-label="Library filters">
          <div className="lib-section">
            <h3>Library</h3>
            <button type="button" className={`lib-item ${scope === 'all' && !folderFilter ? 'on' : ''}`} onClick={() => { setScope('all'); setFolderFilter(''); }}>
              <span>All Documents</span><span className="badge">{counts.all}</span>
            </button>
            <button type="button" className={`lib-item ${scope === 'starred' ? 'on' : ''}`} onClick={() => { setScope('starred'); setFolderFilter(''); }}>
              <span>★ Starred</span><span className="badge">{counts.starred}</span>
            </button>
            <button type="button" className={`lib-item ${scope === 'rich' ? 'on' : ''}`} onClick={() => { setScope('rich'); setFolderFilter(''); }}>
              <span>Rich Documents</span><span className="badge">{counts.rich}</span>
            </button>
            <button type="button" className={`lib-item ${scope === 'latex' ? 'on' : ''}`} onClick={() => { setScope('latex'); setFolderFilter(''); }}>
              <span>LaTeX (.tex)</span><span className="badge">{counts.latex}</span>
            </button>
            <button type="button" className={`lib-item ${scope === 'archived' ? 'on' : ''}`} onClick={() => { setScope('archived'); setFolderFilter(''); }}>
              <span>Archived</span><span className="badge">{counts.archived}</span>
            </button>
          </div>

          <div className="lib-section">
            <h3>Folders</h3>
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                className={`lib-item ${folderFilter === f ? 'on' : ''}`}
                onClick={() => { setScope('all'); setFolderFilter(folderFilter === f ? '' : f); }}
              >
                <span>📁 {f}</span>
              </button>
            ))}
          </div>

          {allTags.length > 0 && (
            <div className="lib-section">
              <h3>Tags</h3>
              <div className="tag-cloud">
                {allTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tag-pill ${tagFilter === t ? 'on' : ''}`}
                    onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="lib-main">
          <div className="dash-head">
            <div>
              <h1>{folderFilter ? `Folder: ${folderFilter}` : scope === 'latex' ? 'LaTeX (.tex) Library' : scope === 'starred' ? 'Starred Documents' : scope === 'archived' ? 'Archived Documents' : 'Your Library'}</h1>
              <p className="muted">Organize documents, launch LaTeX papers, or import files from disk.</p>
            </div>
            <div className="dash-actions">
              <input ref={fileRef} type="file" hidden accept=".md,.markdown,.tex,.latex,.html,.htm,.txt,.csv,.tsv,.json" onChange={importFile} />
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import File</button>
              <button type="button" className="btn" onClick={() => setShowTemplates((v) => !v)}>Templates</button>
              <button type="button" className="btn primary" onClick={() => create()}>+ New Document</button>
            </div>
          </div>

          {showTemplates && (
            <section className="template-tray" aria-label="Document templates">
              <div className="drawer-head">
                <h3>Start from a template</h3>
                <button type="button" className="btn ghost" onClick={() => setShowTemplates(false)}>Close</button>
              </div>
              <div className="template-grid">
                {DOC_TEMPLATES.map((tpl) => (
                  <button key={tpl.id} type="button" className="template-card" onClick={() => create(tpl)}>
                    <span className="doc-kind">{tpl.docType === 'latex' ? '.tex' : 'Rich'}</span>
                    <strong>{tpl.name}</strong>
                    <span className="muted">{tpl.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="lib-controls">
            <input
              type="search"
              className="lib-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles, folders, #tags, or owners…"
              aria-label="Search library"
            />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort documents">
              <option value="recent">Sort: Recent</option>
              <option value="title">Sort: Title A–Z</option>
              <option value="role">Sort: Role</option>
            </select>
            <div className="segmented">
              <button type="button" className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')}>List</button>
              <button type="button" className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')}>Grid</button>
            </div>
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          {docs === null && !error && (
            <div className="skeleton-list" aria-label="Loading documents">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          )}

          {docs !== null && visibleDocs.length === 0 && (
            <div className="empty">
              <p>{docs.length === 0 ? 'No documents yet.' : 'No documents match your current filter.'}</p>
              <div className="dialog-actions gap-sm" style={{ justifyContent: 'center', marginTop: '.75rem' }}>
                <button className="btn primary" onClick={() => create()}>New Rich Document</button>
                <button className="btn" onClick={() => create(DOC_TEMPLATES[1])}>New LaTeX (.tex) Paper</button>
              </div>
            </div>
          )}

          {docs !== null && visibleDocs.length > 0 && (
            <ul className={viewMode === 'grid' ? 'doc-grid' : 'doc-list'}>
              {visibleDocs.map((d, idx) => (
                <li key={d.id} style={{ '--i': idx }}>
                  <Link to={`/d/${d.id}`} className="doc-link">
                    <span className="doc-title-row">
                      <span className={`doc-kind ${d.doc_type === 'latex' ? 'tex' : ''}`}>
                        {d.doc_type === 'latex' ? '.tex' : 'Doc'}
                      </span>
                      <strong>{d.title}</strong>
                      <span className="doc-arrow" aria-hidden="true">→</span>
                    </span>
                    <span className="muted">
                      {d.folder || 'General'} · {d.role === 'owner' ? 'Owned by you' : `Shared by ${d.owner_name} · ${d.role}`} · edited {timeAgo(d.updated_at)}
                    </span>
                    {d.tags?.length > 0 && (
                      <span className="doc-tags">
                        {d.tags.map((t) => <span key={t} className="tag-mini">#{t}</span>)}
                      </span>
                    )}
                  </Link>
                  <div className="doc-row-actions">
                    {d.role !== 'viewer' && (
                      <>
                        <button
                          type="button"
                          className={`btn ghost star-btn ${d.starred ? 'is-starred' : ''}`}
                          onClick={() => patchDoc(d, { starred: !d.starred })}
                          title={d.starred ? 'Unstar' : 'Star'}
                        >
                          {d.starred ? '★' : '☆'}
                        </button>
                        <button type="button" className="btn ghost" onClick={() => openOrganize(d)} title="Folder & tags">Organize</button>
                      </>
                    )}
                    <button type="button" className="btn ghost" onClick={() => duplicate(d)} title="Duplicate">Copy</button>
                    {d.role !== 'viewer' && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => patchDoc(d, { archived: !d.archived })}
                      >
                        {d.archived ? 'Restore' : 'Archive'}
                      </button>
                    )}
                    {d.role === 'owner' && (
                      <button type="button" className="btn ghost danger" onClick={() => remove(d)}>Delete</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      {editingDoc && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setEditingDoc(null)}>
          <form className="dialog" onSubmit={saveOrganize} role="dialog" aria-modal="true" aria-labelledby="org-h">
            <h2 id="org-h">Organize Document</h2>
            <label className="field-col">
              Title
              <input value={orgForm.title} onChange={(e) => setOrgForm({ ...orgForm, title: e.target.value })} required />
            </label>
            <label className="field-col">
              Folder / Collection
              <input list="folder-options" value={orgForm.folder} onChange={(e) => setOrgForm({ ...orgForm, folder: e.target.value })} />
              <datalist id="folder-options">
                {folders.map((f) => <option key={f} value={f} />)}
                <option value="Research" />
                <option value="Engineering" />
                <option value="Notes" />
              </datalist>
            </label>
            <label className="field-col">
              Tags (comma separated)
              <input value={orgForm.tags} onChange={(e) => setOrgForm({ ...orgForm, tags: e.target.value })} placeholder="draft, latex, q4" />
            </label>
            <label className="field-col">
              Editor Mode
              <select value={orgForm.doc_type} onChange={(e) => setOrgForm({ ...orgForm, doc_type: e.target.value })}>
                <option value="rich">Rich Text Document</option>
                <option value="latex">LaTeX (.tex) Code Editor</option>
              </select>
            </label>
            <div className="dialog-actions gap-sm">
              <button type="button" className="btn ghost" onClick={() => setEditingDoc(null)}>Cancel</button>
              <button type="submit" className="btn primary">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
