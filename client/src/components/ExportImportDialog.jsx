import { useEffect, useState } from 'react';
import {
  convertFormat,
  downloadFile,
  htmlToLatex,
  htmlToMarkdown,
  htmlToText,
  latexToHtml,
  markdownToHtml,
  wrapStandaloneHtml,
} from '../utils/converters.js';

const EXPORT_FORMATS = [
  { id: 'md', label: 'Markdown (.md)', mime: 'text/markdown;charset=utf-8' },
  { id: 'tex', label: 'LaTeX (.tex)', mime: 'application/x-tex;charset=utf-8' },
  { id: 'html', label: 'HTML (.html)', mime: 'text/html;charset=utf-8' },
  { id: 'txt', label: 'Plain Text (.txt)', mime: 'text/plain;charset=utf-8' },
  { id: 'csv', label: 'CSV Table (.csv)', mime: 'text/csv;charset=utf-8' },
  { id: 'json', label: 'JSON Bundle (.json)', mime: 'application/json;charset=utf-8' },
];

export default function ExportImportDialog({ title, docType, getHtml, getLatex, onImportHtml, onImportLatex, canEdit, onClose }) {
  const [tab, setTab] = useState('export');
  const [format, setFormat] = useState(docType === 'latex' ? 'tex' : 'md');
  const [preview, setPreview] = useState('');
  const [importMode, setImportMode] = useState('replace');
  const [pasteText, setPasteText] = useState('');
  const [pasteFmt, setPasteFmt] = useState('md');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (docType === 'latex') {
      const tex = getLatex();
      if (format === 'tex') setPreview(tex);
      else setPreview(convertFormat(tex, 'tex', format, title));
    } else {
      const html = getHtml();
      if (format === 'md') setPreview(htmlToMarkdown(html));
      else if (format === 'tex') setPreview(htmlToLatex(html, title));
      else if (format === 'html') setPreview(wrapStandaloneHtml(html, title));
      else if (format === 'txt') setPreview(htmlToText(html));
      else setPreview(convertFormat(html, 'html', format, title));
    }
  }, [format, docType, getHtml, getLatex, title]);

  const safeSlug = (title || 'document').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'document';

  const handleDownload = () => {
    const meta = EXPORT_FORMATS.find((f) => f.id === format);
    downloadFile(`${safeSlug}.${format}`, preview, meta?.mime);
    setStatus(`Downloaded ${safeSlug}.${format}`);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    setStatus('Copied converted output to clipboard.');
  };

  const applyImport = (raw, ext) => {
    if (docType === 'latex' && onImportLatex) {
      const texOut = ext === 'tex' ? raw : convertFormat(raw, ext, 'tex', title);
      onImportLatex(texOut, importMode);
      setStatus(`Imported .${ext} into LaTeX editor.`);
      return;
    }
    let html = '';
    if (ext === 'md') html = markdownToHtml(raw);
    else if (ext === 'tex') html = latexToHtml(raw);
    else if (ext === 'html' || ext === 'htm') html = convertFormat(raw, 'html', 'html-fragment', title);
    else html = convertFormat(raw, ext, 'html-fragment', title);
    onImportHtml(html, importMode);
    setStatus(`Imported .${ext} content into document.`);
  };

  const onFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || 'txt').toLowerCase();
    const content = await file.text();
    applyImport(content, ext === 'markdown' ? 'md' : ext);
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="conv-title">
        <div className="drawer-head">
          <h2 id="conv-title">File Conversion &amp; Export</h2>
          <div className="segmented">
            <button type="button" className={tab === 'export' ? 'on' : ''} onClick={() => setTab('export')}>Export</button>
            {canEdit && <button type="button" className={tab === 'import' ? 'on' : ''} onClick={() => setTab('import')}>Import</button>}
          </div>
        </div>

        {tab === 'export' ? (
          <>
            <div className="format-pills">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`btn ${format === f.id ? 'primary' : ''}`}
                  onClick={() => setFormat(f.id)}
                >
                  {f.label}
                </button>
              ))}
              <button type="button" className="btn" onClick={() => { onClose(); setTimeout(() => window.print(), 120); }}>
                Print / Save PDF
              </button>
            </div>
            <pre className="conv-preview">{preview || '(empty document)'}</pre>
            {status && <p className="ok" role="status">{status}</p>}
            <div className="dialog-actions gap-sm">
              <button type="button" className="btn" onClick={handleCopy}>Copy</button>
              <button type="button" className="btn primary" onClick={handleDownload}>Download .{format}</button>
              <button type="button" className="btn ghost" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="import-row">
              <label className="file-drop">
                <input type="file" accept=".md,.markdown,.tex,.latex,.html,.htm,.txt,.csv,.tsv,.json" onChange={onFilePick} />
                <span>Choose file (.md, .tex, .html, .txt, .csv, .json)</span>
              </label>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)} aria-label="Import mode">
                <option value="replace">Replace document</option>
                <option value="append">Append to end</option>
              </select>
            </div>
            <div className="paste-import">
              <div className="drawer-head">
                <span className="muted">Or paste source to convert &amp; insert</span>
                <select value={pasteFmt} onChange={(e) => setPasteFmt(e.target.value)} aria-label="Source format">
                  <option value="md">Markdown</option>
                  <option value="tex">LaTeX (.tex)</option>
                  <option value="html">HTML</option>
                  <option value="csv">CSV</option>
                  <option value="txt">Plain Text</option>
                </select>
              </div>
              <textarea
                rows={7}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste Markdown, LaTeX, HTML, CSV, or plain text here..."
              />
            </div>
            {status && <p className="ok" role="status">{status}</p>}
            <div className="dialog-actions gap-sm">
              <button
                type="button"
                className="btn primary"
                disabled={!pasteText.trim()}
                onClick={() => applyImport(pasteText, pasteFmt)}
              >
                Convert &amp; Insert
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
