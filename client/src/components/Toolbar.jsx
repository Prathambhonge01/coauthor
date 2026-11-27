import { useState } from 'react';

const HIGHLIGHTS = [
  { label: 'Yellow', color: '#fef08a' },
  { label: 'Mint', color: '#bbf7d0' },
  { label: 'Sky', color: '#bae6fd' },
  { label: 'Rose', color: '#fecdd3' },
  { label: 'Lavender', color: '#e9d5ff' },
];

const TEXT_COLORS = [
  { label: 'Default', color: '' },
  { label: 'Slate', color: '#475569' },
  { label: 'Emerald', color: '#15803d' },
  { label: 'Cobalt', color: '#1d4ed8' },
  { label: 'Crimson', color: '#b91c1c' },
  { label: 'Amber', color: '#b45309' },
  { label: 'Violet', color: '#7e22ce' },
];

const SYMBOLS = ['∑', '∫', '∂', '√', 'π', '∞', '≈', '≠', '≤', '≥', '→', '⇒', '∀', '∃', '∈', '±', '×', '÷', '—', '…', '§', '©'];

export default function Toolbar({ editor, onFindToggle }) {
  const [menu, setMenu] = useState(null); // 'color' | 'highlight' | 'symbols' | 'link' | null
  const [linkUrl, setLinkUrl] = useState('');

  if (!editor) return null;

  const Btn = ({ label, title, active, run, disabled }) => (
    <button
      type="button"
      className={`tb ${active ? 'on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );

  const c = () => editor.chain().focus();

  const currentHeading = [1, 2, 3, 4].find((l) => editor.isActive('heading', { level: l })) || 0;
  const inTable = editor.isActive('table');

  const applyLink = (e) => {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) {
      c().unsetLink().run();
    } else {
      const normalized = /^https?:\/\/|^\//i.test(url) ? url : `https://${url}`;
      c().setLink({ href: normalized }).run();
    }
    setMenu(null);
    setLinkUrl('');
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Document formatting">
      <Btn label="↶" title="Undo (Ctrl+Z)" run={() => c().undo().run()} />
      <Btn label="↷" title="Redo (Ctrl+Y)" run={() => c().redo().run()} />
      <span className="sep" />

      <select
        className="tb-select"
        aria-label="Block style"
        value={currentHeading}
        onChange={(e) => {
          const lvl = Number(e.target.value);
          if (lvl === 0) c().setParagraph().run();
          else c().toggleHeading({ level: lvl }).run();
        }}
      >
        <option value={0}>Paragraph</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
        <option value={4}>Heading 4</option>
      </select>
      <span className="sep" />

      <Btn label={<b>B</b>} title="Bold (Ctrl+B)" active={editor.isActive('bold')} run={() => c().toggleBold().run()} />
      <Btn label={<i>I</i>} title="Italic (Ctrl+I)" active={editor.isActive('italic')} run={() => c().toggleItalic().run()} />
      <Btn label={<u>U</u>} title="Underline (Ctrl+U)" active={editor.isActive('underline')} run={() => c().toggleUnderline().run()} />
      <Btn label={<s>S</s>} title="Strikethrough" active={editor.isActive('strike')} run={() => c().toggleStrike().run()} />
      <Btn label="x₂" title="Subscript" active={editor.isActive('subscript')} run={() => c().toggleSubscript().run()} />
      <Btn label="x²" title="Superscript" active={editor.isActive('superscript')} run={() => c().toggleSuperscript().run()} />
      <Btn label="</>" title="Inline code" active={editor.isActive('code')} run={() => c().toggleCode().run()} />

      <div className="tb-pop-wrap">
        <Btn
          label={<span className="swatch-btn">A<i style={{ background: editor.getAttributes('textColor').color || 'currentColor' }} /></span>}
          title="Text color"
          active={menu === 'color'}
          run={() => setMenu(menu === 'color' ? null : 'color')}
        />
        {menu === 'color' && (
          <div className="tb-popover" onMouseDown={(e) => e.preventDefault()}>
            {TEXT_COLORS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="swatch-chip"
                title={item.label}
                onClick={() => {
                  if (!item.color) c().unsetTextColor().run();
                  else c().setTextColor(item.color).run();
                  setMenu(null);
                }}
              >
                <span className="swatch-dot" style={{ background: item.color || 'var(--ink)' }} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tb-pop-wrap">
        <Btn
          label={<span className="hl-badge">ab</span>}
          title="Highlight"
          active={editor.isActive('highlight') || menu === 'highlight'}
          run={() => setMenu(menu === 'highlight' ? null : 'highlight')}
        />
        {menu === 'highlight' && (
          <div className="tb-popover" onMouseDown={(e) => e.preventDefault()}>
            {HIGHLIGHTS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="swatch-chip"
                onClick={() => {
                  c().toggleHighlight({ color: item.color }).run();
                  setMenu(null);
                }}
              >
                <span className="swatch-dot" style={{ background: item.color }} />
                <span>{item.label}</span>
              </button>
            ))}
            <button type="button" className="swatch-chip" onClick={() => { c().unsetHighlight().run(); setMenu(null); }}>
              <span className="swatch-dot" style={{ background: 'transparent', border: '1px dashed var(--muted)' }} />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>

      <Btn label="⌫" title="Clear formatting" run={() => c().unsetAllMarks().clearNodes().run()} />
      <span className="sep" />

      <Btn label="≡L" title="Align left" active={editor.isActive({ textAlign: 'left' })} run={() => c().setTextAlign('left').run()} />
      <Btn label="≡C" title="Align center" active={editor.isActive({ textAlign: 'center' })} run={() => c().setTextAlign('center').run()} />
      <Btn label="≡R" title="Align right" active={editor.isActive({ textAlign: 'right' })} run={() => c().setTextAlign('right').run()} />
      <Btn label="≡J" title="Justify" active={editor.isActive({ textAlign: 'justify' })} run={() => c().setTextAlign('justify').run()} />
      <span className="sep" />

      <Btn label="• List" title="Bulleted list" active={editor.isActive('bulletList')} run={() => c().toggleBulletList().run()} />
      <Btn label="1. List" title="Numbered list" active={editor.isActive('orderedList')} run={() => c().toggleOrderedList().run()} />
      <Btn label="❝" title="Quote" active={editor.isActive('blockquote')} run={() => c().toggleBlockquote().run()} />
      <Btn label="ⓘ" title="Callout note" active={editor.isActive('callout')} run={() => c().toggleCallout('info').run()} />
      <Btn label="{ }" title="Code block" active={editor.isActive('codeBlock')} run={() => c().toggleCodeBlock().run()} />
      <Btn label="―" title="Horizontal divider" run={() => c().setHorizontalRule().run()} />
      <span className="sep" />

      <div className="tb-pop-wrap">
        <Btn
          label="🔗"
          title="Insert or edit link"
          active={editor.isActive('link') || menu === 'link'}
          run={() => {
            setLinkUrl(editor.getAttributes('link').href || '');
            setMenu(menu === 'link' ? null : 'link');
          }}
        />
        {menu === 'link' && (
          <form className="tb-popover link-pop" onSubmit={applyLink}>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              aria-label="Link URL"
              autoFocus
            />
            <button type="submit" className="btn primary">Set</button>
            {editor.isActive('link') && (
              <button type="button" className="btn ghost danger" onClick={() => { c().unsetLink().run(); setMenu(null); }}>
                Remove
              </button>
            )}
          </form>
        )}
      </div>

      <Btn label="⊞ Table" title="Insert 3×3 table" active={inTable} run={() => c().insertTable({ rows: 3, cols: 3 }).run()} />
      {inTable && (
        <>
          <Btn label="+Row" title="Add table row" run={() => c().addTableRow().run()} />
          <Btn label="×Tbl" title="Delete table" run={() => c().deleteTable().run()} />
        </>
      )}
      <span className="sep" />

      <Btn label="$x$" title="Insert inline LaTeX math" run={() => c().insertMathInline('x^2 + y^2 = r^2').run()} />
      <Btn label="∑ Block" title="Insert LaTeX equation block" run={() => c().insertMathBlock('\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}').run()} />

      <div className="tb-pop-wrap">
        <Btn label="Ω" title="Special characters & math symbols" active={menu === 'symbols'} run={() => setMenu(menu === 'symbols' ? null : 'symbols')} />
        {menu === 'symbols' && (
          <div className="tb-popover symbol-grid" onMouseDown={(e) => e.preventDefault()}>
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                className="tb"
                onClick={() => {
                  c().insertContent(sym).run();
                  setMenu(null);
                }}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {onFindToggle && (
        <>
          <span className="spacer" />
          <Btn label="🔍 Find" title="Find & replace (Ctrl+F)" run={onFindToggle} />
        </>
      )}
    </div>
  );
}
