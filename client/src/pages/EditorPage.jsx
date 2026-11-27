import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { api, colorFor, getToken, wsBase } from '../api.js';
import { useAuth } from '../App.jsx';
import { ThemeToggle } from '../theme.jsx';
import { useSettings } from '../settings.jsx';
import {
  Callout,
  Highlight,
  LinkMark,
  MathBlock,
  MathInline,
  Subscript,
  Superscript,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TextAlign,
  TextColor,
  Underline,
} from '../extensions/editorTools.jsx';
import { htmlToLatex, latexToHtml } from '../utils/converters.js';
import { ensureKatex } from '../utils/katex.js';
import Toolbar from '../components/Toolbar.jsx';
import LatexEditor from '../components/LatexEditor.jsx';
import Presence from '../components/Presence.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import ExportImportDialog from '../components/ExportImportDialog.jsx';
import FindReplaceBar from '../components/FindReplaceBar.jsx';

const STATUS_LABEL = {
  connected: 'Saved & live',
  connecting: 'Connecting…',
  disconnected: 'Offline — syncs on reconnect',
};

export default function EditorPage() {
  const { id } = useParams();
  const location = useLocation();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [collab, setCollab] = useState(null);
  const [status, setStatus] = useState('connecting');

  const loadMeta = useCallback(
    () =>
      api(`/docs/${id}`)
        .then((r) => {
          setMeta(r.doc);
          setError('');
        })
        .catch((e) =>
          setError(
            e.status === 404
              ? 'This document doesn’t exist, or you no longer have access to it.'
              : e.message
          )
        ),
    [id]
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsBase(), id, ydoc, { params: { token: getToken() } });
    const onStatus = ({ status }) => {
      setStatus(status);
      if (status !== 'connecting') loadMeta();
    };
    provider.on('status', onStatus);
    setCollab({ ydoc, provider });
    return () => {
      provider.destroy();
      ydoc.destroy();
      setCollab(null);
    };
  }, [id, loadMeta]);

  if (error) {
    return (
      <div className="page">
        <main className="dash">
          <p className="error" role="alert">{error}</p>
          <Link className="btn" to="/">Back to your documents</Link>
        </main>
      </div>
    );
  }
  if (!meta || !collab) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <span className="brand small">Coauthor</span>
          <div className="shimmer-bar" aria-hidden="true" />
          <p className="muted">Opening document…</p>
        </div>
      </div>
    );
  }
  return <Workspace meta={meta} setMeta={setMeta} collab={collab} status={status} seedState={location.state} />;
}

function extractHeadings(editor) {
  if (!editor) return [];
  const items = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text) items.push({ level: node.attrs.level, text, pos });
    }
  });
  return items;
}

function extractLatexHeadings(tex = '') {
  const items = [];
  for (const line of tex.split('\n')) {
    const m = line.match(/\\(section|subsection|subsubsection)\*?\{([^{}]+)\}/);
    if (m) {
      const level = m[1] === 'section' ? 1 : m[1] === 'subsection' ? 2 : 3;
      items.push({ level, text: m[2].trim() });
    }
  }
  return items;
}

function Workspace({ meta, setMeta, collab, status, seedState }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const canEdit = meta.role !== 'viewer';
  const [panel, setPanel] = useState(null); // 'share' | 'history' | 'convert' | null
  const [title, setTitle] = useState(meta.title);
  const [titleError, setTitleError] = useState('');
  const [docType, setDocType] = useState(meta.doc_type || 'rich');
  const [latexValue, setLatexValue] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [showOutline, setShowOutline] = useState(!!settings.showOutline);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [stats, setStats] = useState({ words: 0, chars: 0, sentences: 0, mins: 1 });
  const [outline, setOutline] = useState([]);
  const seededRef = useRef(false);

  useEffect(() => {
    ensureKatex();
  }, []);

  useEffect(() => {
    setTitle(meta.title);
    setDocType(meta.doc_type || 'rich');
  }, [meta.id, meta.title, meta.doc_type]);

  const editor = useEditor(
    {
      editable: canEdit,
      editorProps: {
        attributes: {
          spellcheck: settings.spellcheck ? 'true' : 'false',
        },
      },
      extensions: [
        StarterKit.configure({ history: false }),
        Placeholder.configure({ placeholder: 'Start writing, or click $x$ / ⊞ Table in the toolbar…' }),
        Underline,
        Subscript,
        Superscript,
        Highlight,
        TextColor,
        LinkMark,
        TextAlign,
        Callout,
        Table,
        TableRow,
        TableHeader,
        TableCell,
        MathInline,
        MathBlock,
        Collaboration.configure({ document: collab.ydoc }),
        CollaborationCursor.configure({
          provider: collab.provider,
          user: { id: user.id, name: user.name, color: colorFor(user.id) },
        }),
      ],
    },
    [collab]
  );

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // Seed initial imported/template content once when synced on a fresh document
  useEffect(() => {
    if (!seedState || seededRef.current || !canEdit) return;
    const applySeed = () => {
      if (seededRef.current) return;
      if (seedState.initialLatex) {
        const ytext = collab.ydoc.getText('latex');
        if (ytext.length === 0) ytext.insert(0, seedState.initialLatex);
        seededRef.current = true;
      } else if (seedState.initialHtml && editor) {
        if (editor.isEmpty) editor.commands.setContent(seedState.initialHtml);
        seededRef.current = true;
      }
    };
    if (collab.provider.synced) applySeed();
    const onSynced = (isSynced) => isSynced && applySeed();
    collab.provider.on('synced', onSynced);
    return () => collab.provider.off('synced', onSynced);
  }, [collab, editor, seedState, canEdit]);

  // Live stats & outline updates
  useEffect(() => {
    if (docType === 'latex') {
      const plain = latexValue.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, ' ').replace(/[{}%$]/g, ' ');
      const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
      const chars = latexValue.length;
      const sentences = plain.split(/[.!?]+/).filter((s) => s.trim()).length;
      setStats({ words, chars, sentences, mins: Math.max(1, Math.ceil(words / 200)) });
      setOutline(extractLatexHeadings(latexValue));
      return;
    }
    if (!editor) return;
    const updateMeta = () => {
      const text = editor.getText() || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
      setStats({ words, chars, sentences, mins: Math.max(1, Math.ceil(words / 200)) });
      setOutline(extractHeadings(editor));
    };
    updateMeta();
    editor.on('update', updateMeta);
    return () => editor.off('update', updateMeta);
  }, [editor, docType, latexValue]);

  // Global keyboard shortcut: Ctrl/Cmd+F for Find & Replace, Esc to exit Focus Mode
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFind((v) => !v);
      } else if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  async function saveTitle() {
    const next = title.trim();
    if (!canEdit || !next || next === meta.title) return setTitle(meta.title);
    try {
      await api(`/docs/${meta.id}`, { method: 'PATCH', body: { title: next } });
      setMeta({ ...meta, title: next });
      setTitleError('');
    } catch (e) {
      setTitleError(e.message);
    }
  }

  async function toggleStar() {
    if (!canEdit) return;
    try {
      const next = !meta.starred;
      await api(`/docs/${meta.id}`, { method: 'PATCH', body: { starred: next } });
      setMeta({ ...meta, starred: next });
    } catch (e) {
      setTitleError(e.message);
    }
  }

  async function switchDocMode(nextMode) {
    if (nextMode === docType) return;
    if (nextMode === 'latex' && editor) {
      const ytext = collab.ydoc.getText('latex');
      if (ytext.length === 0 && !editor.isEmpty) {
        ytext.insert(0, htmlToLatex(editor.getHTML(), title));
      }
    } else if (nextMode === 'rich' && editor) {
      if (editor.isEmpty && latexValue.trim()) {
        editor.commands.setContent(latexToHtml(latexValue));
      }
    }
    setDocType(nextMode);
    if (canEdit) {
      api(`/docs/${meta.id}`, { method: 'PATCH', body: { doc_type: nextMode } })
        .then(() => setMeta((m) => ({ ...m, doc_type: nextMode })))
        .catch(() => {});
    }
  }

  const handleImportHtml = (html, mode) => {
    if (!editor) return;
    if (mode === 'replace') editor.commands.setContent(html);
    else editor.chain().focus('end').insertContent(html).run();
  };

  const handleImportLatex = (tex, mode) => {
    const ytext = collab.ydoc.getText('latex');
    collab.ydoc.transact(() => {
      if (mode === 'replace') {
        ytext.delete(0, ytext.length);
        ytext.insert(0, tex);
      } else {
        ytext.insert(ytext.length, `\n\n${tex}`);
      }
    }, 'local-latex');
  };

  const getHtml = useCallback(() => editor?.getHTML() || '', [editor]);
  const getLatex = useCallback(() => collab.ydoc.getText('latex').toString(), [collab]);

  const jumpToHeading = (item) => {
    if (docType === 'rich' && editor && typeof item.pos === 'number') {
      editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run();
    }
  };

  return (
    <div className={`page editor-page ${focusMode ? 'is-focus' : ''}`}>
      {!focusMode && (
        <header className="topbar">
          <Link to="/" className="brand small" aria-label="Back to documents">Coauthor</Link>
          <input
            className="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            readOnly={!canEdit}
            aria-label="Document title"
          />
          {canEdit && (
            <button
              type="button"
              className={`btn ghost star-btn ${meta.starred ? 'is-starred' : ''}`}
              onClick={toggleStar}
              title={meta.starred ? 'Remove from Starred' : 'Star document'}
              aria-label="Star document"
            >
              {meta.starred ? '★' : '☆'}
            </button>
          )}
          <span className={`status ${status}`} role="status">{STATUS_LABEL[status]}</span>
          <span className="spacer" />

          <div className="segmented mode-switch" role="group" aria-label="Editor mode">
            <button type="button" className={docType === 'rich' ? 'on' : ''} onClick={() => switchDocMode('rich')}>
              Rich Text
            </button>
            <button type="button" className={docType === 'latex' ? 'on' : ''} onClick={() => switchDocMode('latex')}>
              LaTeX .tex
            </button>
          </div>

          <Presence provider={collab.provider} selfId={user.id} />
          <ThemeToggle />
          <button type="button" className="btn ghost" onClick={() => setShowOutline((v) => !v)} title="Document outline">
            Outline
          </button>
          <button type="button" className="btn" onClick={() => setPanel('convert')}>
            Convert / Export
          </button>
          <button type="button" className="btn" onClick={() => setPanel(panel === 'history' ? null : 'history')}>
            History
          </button>
          <button type="button" className="btn primary" onClick={() => setPanel('share')}>
            Share
          </button>
        </header>
      )}

      {focusMode && (
        <button type="button" className="btn focus-exit" onClick={() => setFocusMode(false)}>
          Exit Focus (Esc)
        </button>
      )}

      {titleError && <p className="error banner" role="alert">{titleError}</p>}
      {!canEdit && <p className="banner">You have view-only access to this document.</p>}

      {!focusMode && docType === 'rich' && canEdit && (
        <Toolbar editor={editor} onFindToggle={() => setShowFind((v) => !v)} />
      )}

      {showFind && (
        <FindReplaceBar
          editor={editor}
          latexValue={docType === 'latex' ? latexValue : null}
          onLatexReplace={(next) => handleImportLatex(next, 'replace')}
          canEdit={canEdit}
          onClose={() => setShowFind(false)}
        />
      )}

      <div className="editor-body">
        {showOutline && !focusMode && (
          <aside className="outline-pane" aria-label="Document outline">
            <div className="drawer-head">
              <h3>Outline</h3>
              <button type="button" className="btn ghost" onClick={() => setShowOutline(false)}>✕</button>
            </div>
            {outline.length === 0 ? (
              <p className="muted">Add headings (H1–H4 or \section) to build an outline.</p>
            ) : (
              <ul className="outline-list">
                {outline.map((item, idx) => (
                  <li key={`${item.text}-${idx}`} style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
                    <button type="button" onClick={() => jumpToHeading(item)}>{item.text}</button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {docType === 'latex' ? (
          <LatexEditor
            ydoc={collab.ydoc}
            canEdit={canEdit}
            value={latexValue}
            setValue={setLatexValue}
            onFindToggle={() => setShowFind((v) => !v)}
          />
        ) : (
          <main className="desk">
            <article className="sheet" style={{ transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined, transformOrigin: 'top center' }}>
              <EditorContent editor={editor} />
            </article>
          </main>
        )}
      </div>

      {settings.showStats && !focusMode && (
        <footer className="statusbar">
          <span>{stats.words} words · {stats.chars} chars · {stats.sentences} sentences · ~{stats.mins} min read</span>
          <span className="spacer" />
          <label className="zoom-ctl">
            <span className="muted">Zoom {zoom}%</span>
            <input type="range" min="80" max="150" step="5" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
          </label>
          <button type="button" className="btn ghost" onClick={() => window.print()} title="Print or Save as PDF">Print / PDF</button>
          <button type="button" className="btn ghost" onClick={() => setFocusMode(true)} title="Distraction-free writing">Focus</button>
          <Link to="/settings" className="btn ghost" title="Editor & workspace settings">Settings</Link>
        </footer>
      )}

      {panel === 'share' && <ShareDialog doc={meta} onClose={() => setPanel(null)} />}
      {panel === 'history' && <HistoryPanel docId={meta.id} canEdit={canEdit} onClose={() => setPanel(null)} />}
      {panel === 'convert' && (
        <ExportImportDialog
          title={title}
          docType={docType}
          getHtml={getHtml}
          getLatex={getLatex}
          onImportHtml={handleImportHtml}
          onImportLatex={handleImportLatex}
          canEdit={canEdit}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
