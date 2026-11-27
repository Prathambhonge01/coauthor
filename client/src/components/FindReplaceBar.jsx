import { useEffect, useMemo, useState } from 'react';

function findMatchesInEditor(editor, query, matchCase) {
  if (!editor || !query) return [];
  const matches = [];
  const needle = matchCase ? query : query.toLowerCase();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = matchCase ? node.text : node.text.toLowerCase();
    let idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + query.length });
      idx += Math.max(1, query.length);
    }
  });
  return matches;
}

export default function FindReplaceBar({ editor, latexValue, onLatexReplace, onClose, canEdit }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);

  const isLatex = latexValue !== undefined && latexValue !== null;

  const matches = useMemo(() => {
    if (!query) return [];
    if (isLatex) {
      const hay = matchCase ? latexValue : latexValue.toLowerCase();
      const needle = matchCase ? query : query.toLowerCase();
      const res = [];
      let idx = 0;
      while ((idx = hay.indexOf(needle, idx)) !== -1) {
        res.push({ from: idx, to: idx + query.length });
        idx += Math.max(1, query.length);
      }
      return res;
    }
    return findMatchesInEditor(editor, query, matchCase);
  }, [editor, latexValue, isLatex, query, matchCase]);

  useEffect(() => {
    setIndex(0);
  }, [query, matchCase]);

  const jump = (nextIdx) => {
    if (matches.length === 0) return;
    const wrapped = ((nextIdx % matches.length) + matches.length) % matches.length;
    setIndex(wrapped);
    const m = matches[wrapped];
    if (!isLatex && editor) {
      editor.chain().focus().setTextSelection(m).scrollIntoView().run();
    }
  };

  const replaceOne = () => {
    if (!canEdit || matches.length === 0) return;
    const m = matches[index % matches.length];
    if (isLatex && onLatexReplace) {
      const next = latexValue.slice(0, m.from) + replacement + latexValue.slice(m.to);
      onLatexReplace(next);
    } else if (editor) {
      editor.chain().focus().insertContentAt(m, replacement).run();
    }
  };

  const replaceAll = () => {
    if (!canEdit || matches.length === 0) return;
    if (isLatex && onLatexReplace) {
      const flags = matchCase ? 'g' : 'gi';
      const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      onLatexReplace(latexValue.replace(new RegExp(esc, flags), replacement));
    } else if (editor) {
      const tr = editor.state.tr;
      for (let i = matches.length - 1; i >= 0; i--) {
        tr.insertText(replacement, matches[i].from, matches[i].to);
      }
      editor.view.dispatch(tr);
    }
  };

  return (
    <div className="find-bar" role="region" aria-label="Find and replace">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') jump(index + (e.shiftKey ? -1 : 1));
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Find in document…"
        autoFocus
        aria-label="Find"
      />
      {canEdit && (
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replace with…"
          aria-label="Replace"
        />
      )}
      <button
        type="button"
        className={`btn ghost ${matchCase ? 'is-active' : ''}`}
        onClick={() => setMatchCase((v) => !v)}
        title="Match case"
      >
        Aa
      </button>
      <span className="muted find-count">
        {matches.length === 0 ? '0 matches' : `${(index % matches.length) + 1} / ${matches.length}`}
      </span>
      <button type="button" className="btn ghost" onClick={() => jump(index - 1)} disabled={matches.length === 0} title="Previous">↑</button>
      <button type="button" className="btn ghost" onClick={() => jump(index + 1)} disabled={matches.length === 0} title="Next">↓</button>
      {canEdit && (
        <>
          <button type="button" className="btn" onClick={replaceOne} disabled={matches.length === 0}>Replace</button>
          <button type="button" className="btn" onClick={replaceAll} disabled={matches.length === 0}>All</button>
        </>
      )}
      <button type="button" className="btn ghost" onClick={onClose} aria-label="Close find bar">✕</button>
    </div>
  );
}
