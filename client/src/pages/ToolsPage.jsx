import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { ThemeToggle } from '../theme.jsx';
import { convertFormat, downloadFile } from '../utils/converters.js';
import { ensureKatex, renderLatexHtml } from '../utils/katex.js';

const FORMATS = [
  { id: 'md', label: 'Markdown (.md)' },
  { id: 'tex', label: 'LaTeX (.tex)' },
  { id: 'html', label: 'HTML (.html)' },
  { id: 'txt', label: 'Plain Text (.txt)' },
  { id: 'csv', label: 'CSV (.csv)' },
  { id: 'tsv', label: 'TSV (.tsv)' },
  { id: 'json', label: 'JSON (.json)' },
];

const SAMPLE_INPUT = `# Project Launch Brief

We aim to keep sync latency under $15\\text{ ms}$ while preserving deterministic convergence.

- **Real-time CRDT**: Conflict-free edits
- **LaTeX Support**: Live KaTeX rendering

| Region | Latency | Status |
| --- | --- | --- |
| us-east | 11 ms | Healthy |
| eu-west | 18 ms | Healthy |
`;

export default function ToolsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('convert'); // 'convert' | 'latex' | 'text'
  const [fromFmt, setFromFmt] = useState('md');
  const [toFmt, setToFmt] = useState('tex');
  const [source, setSource] = useState(SAMPLE_INPUT);
  const [docTitle, setDocTitle] = useState('Converted Document');
  const [status, setStatus] = useState('');

  // LaTeX formula playground
  const [formula, setFormula] = useState('\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}, \\qquad \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}');
  const [katexReady, setKatexReady] = useState(false);

  // Text / Dev utility
  const [utilText, setUtilText] = useState('Coauthor Studio\nReal-time LaTeX\nCoauthor Studio\nFile Conversion');

  useEffect(() => {
    ensureKatex().then((k) => k && setKatexReady(true));
  }, []);

  const converted = useMemo(() => {
    try {
      return { ok: true, value: convertFormat(source, fromFmt, toFmt, docTitle) };
    } catch (e) {
      return { ok: false, value: e.message || 'Conversion failed.' };
    }
  }, [source, fromFmt, toFmt, docTitle]);

  const formulaHtml = useMemo(() => renderLatexHtml(formula, true), [formula, katexReady]);

  const utilStats = useMemo(() => {
    const chars = utilText.length;
    const words = utilText.trim() ? utilText.trim().split(/\s+/).length : 0;
    const lines = utilText ? utilText.split('\n').length : 0;
    const bytes = new TextEncoder().encode(utilText).length;
    return { chars, words, lines, bytes };
  }, [utilText]);

  const onFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parts = file.name.split('.');
    const ext = (parts.length > 1 ? parts.pop() : 'txt').toLowerCase();
    const mapped = ext === 'markdown' ? 'md' : ext === 'htm' ? 'html' : ext === 'latex' ? 'tex' : ext;
    if (FORMATS.some((f) => f.id === mapped)) setFromFmt(mapped);
    setDocTitle(parts.join('.') || 'Converted Document');
    setSource(await file.text());
    setStatus(`Loaded ${file.name}`);
  };

  const openInEditor = async () => {
    try {
      const isTex = toFmt === 'tex';
      const { doc } = await api('/docs', {
        method: 'POST',
        body: {
          title: isTex ? `${docTitle}.tex` : docTitle,
          doc_type: isTex ? 'latex' : 'rich',
          tags: ['converted'],
        },
      });
      if (isTex) {
        navigate(`/d/${doc.id}`, { state: { initialLatex: converted.value } });
      } else {
        const html = convertFormat(source, fromFmt, 'html-fragment', docTitle);
        navigate(`/d/${doc.id}`, { state: { initialHtml: html } });
      }
    } catch (e) {
      setStatus(e.message);
    }
  };

  const runUtil = (fn) => {
    try {
      setUtilText(fn(utilText));
      setStatus('');
    } catch (e) {
      setStatus(e.message);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand small">Coauthor</Link>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="nav-pill">Library</Link>
          <Link to="/tools" className="nav-pill on">Conversion Tools</Link>
          <Link to="/settings" className="nav-pill">Settings</Link>
        </nav>
        <span className="spacer" />
        <ThemeToggle />
        <span className="muted user-chip">{user.name}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>

      <main className="tools-shell">
        <div className="dash-head">
          <div>
            <h1>Conversion &amp; Authoring Tools</h1>
            <p className="muted">Convert documents &amp; tables across Markdown, LaTeX (.tex), HTML, CSV, and JSON.</p>
          </div>
          <div className="segmented">
            <button type="button" className={tab === 'convert' ? 'on' : ''} onClick={() => setTab('convert')}>File Converter</button>
            <button type="button" className={tab === 'latex' ? 'on' : ''} onClick={() => setTab('latex')}>LaTeX Formula Lab</button>
            <button type="button" className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>Text &amp; Data Utils</button>
          </div>
        </div>

        {tab === 'convert' && (
          <section className="tools-card">
            <div className="conv-bar">
              <label className="file-drop compact">
                <input type="file" accept=".md,.markdown,.tex,.latex,.html,.htm,.txt,.csv,.tsv,.json" onChange={onFileUpload} />
                <span>Upload file…</span>
              </label>
              <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Output title" aria-label="Document title" />
              <select value={fromFmt} onChange={(e) => setFromFmt(e.target.value)} aria-label="Source format">
                {FORMATS.map((f) => <option key={f.id} value={f.id}>From: {f.label}</option>)}
              </select>
              <button type="button" className="btn ghost" onClick={() => { setFromFmt(toFmt); setToFmt(fromFmt); if (converted.ok) setSource(converted.value); }} title="Swap formats">
                ⇄
              </button>
              <select value={toFmt} onChange={(e) => setToFmt(e.target.value)} aria-label="Target format">
                {FORMATS.map((f) => <option key={f.id} value={f.id}>To: {f.label}</option>)}
              </select>
            </div>

            <div className="tools-split">
              <div className="tools-pane">
                <div className="drawer-head">
                  <strong>Input ({fromFmt.toUpperCase()})</strong>
                  <button type="button" className="btn ghost" onClick={() => setSource('')}>Clear</button>
                </div>
                <textarea rows={16} value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} />
              </div>

              <div className="tools-pane">
                <div className="drawer-head">
                  <strong>Output ({toFmt.toUpperCase()})</strong>
                  <div className="gap-sm" style={{ display: 'flex' }}>
                    <button type="button" className="btn ghost" onClick={() => { navigator.clipboard.writeText(converted.value); setStatus('Copied!'); }}>Copy</button>
                    <button type="button" className="btn" onClick={() => downloadFile(`${docTitle.toLowerCase().replace(/\s+/g, '-')}.${toFmt}`, converted.value)}>Download</button>
                    <button type="button" className="btn primary" onClick={openInEditor}>Open in Editor</button>
                  </div>
                </div>
                <textarea rows={16} value={converted.value} readOnly className={!converted.ok ? 'is-err' : ''} />
              </div>
            </div>
            {status && <p className="ok" role="status">{status}</p>}
          </section>
        )}

        {tab === 'latex' && (
          <section className="tools-card">
            <div className="format-pills">
              <button type="button" className="btn" onClick={() => setFormula('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')}>Quadratic</button>
              <button type="button" className="btn" onClick={() => setFormula('\\mathcal{L}\\{f(t)\\} = \\int_0^\\infty f(t)e^{-st}\\,dt')}>Laplace</button>
              <button type="button" className="btn" onClick={() => setFormula('A = \\begin{pmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{pmatrix}')}>Matrix</button>
              <button type="button" className="btn" onClick={() => setFormula('P(A\\mid B) = \\frac{P(B\\mid A)P(A)}{P(B)}')}>Bayes</button>
              <button type="button" className="btn" onClick={() => setFormula('e^{i\\pi} + 1 = 0')}>Euler</button>
            </div>
            <div className="tools-split">
              <div className="tools-pane">
                <strong>LaTeX Equation Source</strong>
                <textarea rows={8} value={formula} onChange={(e) => setFormula(e.target.value)} spellCheck={false} />
                <div className="dialog-actions gap-sm">
                  <button type="button" className="btn" onClick={() => { navigator.clipboard.writeText(`$$${formula}$$`); setStatus('Copied $$...$$'); }}>Copy Block</button>
                  <button type="button" className="btn primary" onClick={() => { navigator.clipboard.writeText(formulaHtml); setStatus('Copied KaTeX HTML'); }}>Copy HTML</button>
                </div>
              </div>
              <div className="tools-pane">
                <strong>Live Typeset Preview</strong>
                <div className="formula-stage" dangerouslySetInnerHTML={{ __html: formulaHtml }} />
              </div>
            </div>
            {status && <p className="ok" role="status">{status}</p>}
          </section>
        )}

        {tab === 'text' && (
          <section className="tools-card">
            <div className="format-pills">
              <button type="button" className="btn" onClick={() => runUtil((t) => JSON.stringify(JSON.parse(t), null, 2))}>Format JSON</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => JSON.stringify(JSON.parse(t)))}>Minify JSON</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => btoa(unescape(encodeURIComponent(t))))}>Base64 Encode</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => decodeURIComponent(escape(atob(t.trim()))))}>Base64 Decode</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => encodeURIComponent(t))}>URL Encode</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => decodeURIComponent(t))}>URL Decode</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'))}>Sort Lines</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => [...new Set(t.split('\n'))].join('\n'))}>Deduplicate</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}>Slugify</button>
              <button type="button" className="btn" onClick={() => runUtil((t) => t.replace(/\b\w/g, (c) => c.toUpperCase()))}>Title Case</button>
            </div>
            <textarea rows={12} value={utilText} onChange={(e) => setUtilText(e.target.value)} spellCheck={false} />
            <div className="drawer-head">
              <span className="muted">{utilStats.words} words · {utilStats.chars} chars · {utilStats.lines} lines · {utilStats.bytes} bytes</span>
              {status && <span className="error">{status}</span>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
