import { useEffect, useMemo, useRef, useState } from 'react';
import { latexToHtml } from '../utils/converters.js';
import { ensureKatex } from '../utils/katex.js';
import { useSettings } from '../settings.jsx';

const SNIPPETS = [
  { label: 'Section', code: '\\section{Section Title}\n' },
  { label: 'Subsec', code: '\\subsection{Subsection}\n' },
  { label: 'Bold', wrap: ['\\textbf{', '}'] },
  { label: 'Italic', wrap: ['\\textit{', '}'] },
  { label: 'Inline $', wrap: ['$', '$'] },
  { label: 'Equation', code: '\\begin{equation}\n  E = mc^2\n\\end{equation}\n' },
  { label: 'Frac', code: '\\frac{a}{b}' },
  { label: 'Sum', code: '\\sum_{i=1}^{n} x_i' },
  { label: 'Int', code: '\\int_{a}^{b} f(x)\\,dx' },
  { label: 'Matrix', code: '\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}' },
  { label: 'List', code: '\\begin{itemize}\n  \\item First item\n  \\item Second item\n\\end{itemize}\n' },
  { label: 'Table', code: '\\begin{tabular}{lll}\nCol 1 & Col 2 & Col 3 \\\\\n\\hline\nA & B & C \\\\\n\\end{tabular}\n' },
];

const PAIRS = { '{': '}', '[': ']', '(': ')', '$': '$' };

function applyMinimalDiff(ytext, next) {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  ytext.doc.transact(() => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  }, 'local-latex');
}

export default function LatexEditor({ ydoc, canEdit, value, setValue, onFindToggle }) {
  const { settings } = useSettings();
  const [pane, setPane] = useState('split'); // 'split' | 'code' | 'preview'
  const [katexReady, setKatexReady] = useState(() => typeof window !== 'undefined' && !!window.katex);
  const taRef = useRef(null);
  const gutterRef = useRef(null);

  useEffect(() => {
    ensureKatex().then((k) => k && setKatexReady(true));
  }, []);

  useEffect(() => {
    const ytext = ydoc.getText('latex');
    const sync = () => setValue(ytext.toString());
    sync();
    ytext.observe(sync);
    return () => ytext.unobserve(sync);
  }, [ydoc, setValue]);

  const updateTex = (next) => {
    const ytext = ydoc.getText('latex');
    applyMinimalDiff(ytext, next);
  };

  const insertSnippet = (item) => {
    if (!canEdit || !taRef.current) return;
    const ta = taRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    let inserted = item.code || '';
    let caretOffset = inserted.length;
    if (item.wrap) {
      inserted = `${item.wrap[0]}${selected || 'text'}${item.wrap[1]}`;
      caretOffset = selected ? inserted.length : item.wrap[0].length + 4;
    }
    const next = value.slice(0, start) + inserted + value.slice(end);
    updateTex(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + caretOffset, start + caretOffset);
    });
  };

  const onKeyDown = (e) => {
    if (!canEdit) return;
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && onFindToggle) {
      e.preventDefault();
      onFindToggle();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertSnippet({ wrap: ['\\textbf{', '}'] });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertSnippet({ wrap: ['\\textit{', '}'] });
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = ' '.repeat(Number(settings.latexTabSize) || 2);
      const next = value.slice(0, start) + spaces + value.slice(end);
      updateTex(next);
      requestAnimationFrame(() => ta.setSelectionRange(start + spaces.length, start + spaces.length));
      return;
    }
    if (settings.latexAutoClose && PAIRS[e.key] && start === end) {
      const close = PAIRS[e.key];
      e.preventDefault();
      const next = value.slice(0, start) + e.key + close + value.slice(end);
      updateTex(next);
      requestAnimationFrame(() => ta.setSelectionRange(start + 1, start + 1));
    }
  };

  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const previewHtml = useMemo(() => latexToHtml(value), [value, katexReady]);

  return (
    <div className="latex-workspace">
      <div className="toolbar latex-toolbar" role="toolbar" aria-label="LaTeX tools">
        {canEdit &&
          SNIPPETS.map((s) => (
            <button
              key={s.label}
              type="button"
              className="tb"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet(s)}
            >
              {s.label}
            </button>
          ))}
        <span className="spacer" />
        <div className="segmented">
          <button type="button" className={pane === 'code' ? 'on' : ''} onClick={() => setPane('code')}>.tex Code</button>
          <button type="button" className={pane === 'split' ? 'on' : ''} onClick={() => setPane('split')}>Split</button>
          <button type="button" className={pane === 'preview' ? 'on' : ''} onClick={() => setPane('preview')}>Preview</button>
        </div>
        {onFindToggle && (
          <button type="button" className="tb" onClick={onFindToggle} title="Find & replace (Ctrl+F)">🔍 Find</button>
        )}
      </div>

      <div className={`latex-panes mode-${pane}`}>
        {pane !== 'preview' && (
          <div className="latex-code-pane">
            <div className="latex-gutter" ref={gutterRef} aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={taRef}
              className={`latex-textarea ${settings.latexWordWrap ? 'wrap' : 'nowrap'}`}
              value={value}
              readOnly={!canEdit}
              spellCheck={false}
              onChange={(e) => updateTex(e.target.value)}
              onKeyDown={onKeyDown}
              onScroll={(e) => {
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              placeholder="Write LaTeX (.tex) source here… e.g. \section{Intro} and $E=mc^2$"
              aria-label="LaTeX source editor"
            />
          </div>
        )}

        {pane !== 'code' && (
          <div className="latex-preview-pane">
            <article className="sheet latex-rendered" dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="muted">LaTeX preview appears here as you type…</p>' }} />
          </div>
        )}
      </div>
    </div>
  );
}
