import { useEffect, useRef, useState } from 'react';
import { Extension, Mark, Node, mergeAttributes, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { renderLatexInto } from '../utils/katex.js';

export const Underline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [{ tag: 'u' }, { style: 'text-decoration', consuming: false, getAttrs: (v) => (String(v).includes('underline') ? {} : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      toggleUnderline: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-u': () => this.editor.commands.toggleUnderline() };
  },
});

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() {
    return [{ tag: 'sub' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      toggleSubscript: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
});

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() {
    return [{ tag: 'sup' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      toggleSuperscript: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
});

export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: '#fef08a',
        parseHTML: (el) => el.getAttribute('data-color') || el.style.backgroundColor || '#fef08a',
        renderHTML: (attrs) => ({
          'data-color': attrs.color,
          style: `background-color: ${attrs.color}; color: #16181d; border-radius: 3px; padding: 0 2px;`,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setHighlight: (attrs) => ({ commands }) => commands.setMark(this.name, attrs),
      toggleHighlight: (attrs) => ({ commands }) => commands.toggleMark(this.name, attrs),
      unsetHighlight: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

export const TextColor = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => el.style.color || null,
        renderHTML: (attrs) => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[style*="color"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setTextColor: (color) => ({ commands }) => commands.setMark(this.name, { color }),
      unsetTextColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

export const LinkMark = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return {
      href: { default: null },
      target: { default: '_blank' },
      rel: { default: 'noopener noreferrer' },
    };
  },
  parseHTML() {
    return [{ tag: 'a[href]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setLink: (attrs) => ({ commands }) => commands.setMark(this.name, attrs),
      unsetLink: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

export const TextAlign = Extension.create({
  name: 'textAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: 'left',
            parseHTML: (el) => el.style.textAlign || 'left',
            renderHTML: (attrs) => (attrs.textAlign && attrs.textAlign !== 'left' ? { style: `text-align: ${attrs.textAlign}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setTextAlign: (align) => ({ commands }) =>
        ['paragraph', 'heading'].every((t) => commands.updateAttributes(t, { textAlign: align })),
    };
  },
});

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-callout') || 'info',
        renderHTML: (attrs) => ({ 'data-callout': attrs.tone, class: `doc-callout tone-${attrs.tone}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setCallout: (tone = 'info') => ({ commands }) => commands.wrapIn(this.name, { tone }),
      toggleCallout: (tone = 'info') => ({ commands }) => commands.toggleWrap(this.name, { tone }),
    };
  },
});

export const Table = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  tableRole: 'table',
  isolating: true,
  parseHTML() {
    return [{ tag: 'table' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes, { class: 'doc-table' }), ['tbody', 0]];
  },
  addCommands() {
    return {
      insertTable:
        ({ rows = 3, cols = 3 } = {}) =>
        ({ commands }) => {
          const makeCell = (type, text = '') => ({
            type,
            content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
          });
          const tableRows = Array.from({ length: rows }, (_r, rIdx) => ({
            type: 'tableRow',
            content: Array.from({ length: cols }, (_c, cIdx) =>
              makeCell(rIdx === 0 ? 'tableHeader' : 'tableCell', rIdx === 0 ? `Header ${cIdx + 1}` : '')
            ),
          }));
          return commands.insertContent({ type: 'table', content: tableRows });
        },
      addTableRow:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'table') {
              const tableNode = $from.node(d);
              const tablePos = $from.before(d);
              const lastRow = tableNode.lastChild;
              const colCount = lastRow ? lastRow.childCount : 3;
              const cellType = state.schema.nodes.tableCell;
              const rowType = state.schema.nodes.tableRow;
              const cells = Array.from({ length: colCount }, () => cellType.createAndFill());
              const newRow = rowType.create(null, cells);
              if (dispatch) {
                dispatch(state.tr.insert(tablePos + tableNode.nodeSize - 1, newRow));
              }
              return true;
            }
          }
          return false;
        },
      deleteTable:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'table') {
              const pos = $from.before(d);
              if (dispatch) {
                dispatch(state.tr.delete(pos, pos + $from.node(d).nodeSize));
              }
              return true;
            }
          }
          return false;
        },
    };
  },
});

export const TableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)+',
  tableRole: 'row',
  parseHTML() {
    return [{ tag: 'tr' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0];
  },
});

export const TableHeader = Node.create({
  name: 'tableHeader',
  content: 'block+',
  tableRole: 'header_cell',
  isolating: true,
  parseHTML() {
    return [{ tag: 'th' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(HTMLAttributes), 0];
  },
});

export const TableCell = Node.create({
  name: 'tableCell',
  content: 'block+',
  tableRole: 'cell',
  isolating: true,
  parseHTML() {
    return [{ tag: 'td' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(HTMLAttributes), 0];
  },
});

/* ---------- Interactive KaTeX Math Nodes ---------- */

function MathNodeView({ node, updateAttributes, editor, displayMode }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.attrs.latex || '');
  const renderRef = useRef(null);

  useEffect(() => {
    setDraft(node.attrs.latex || '');
  }, [node.attrs.latex]);

  useEffect(() => {
    renderLatexInto(renderRef.current, node.attrs.latex || '', displayMode);
  }, [node.attrs.latex, displayMode, editing]);

  const commit = () => {
    updateAttributes({ latex: draft });
    setEditing(false);
  };

  return (
    <NodeViewWrapper as={displayMode ? 'div' : 'span'} className={displayMode ? 'math-block-node' : 'math-inline-node'}>
      {editing && editor.isEditable ? (
        <span className="math-edit-pop" onMouseDown={(e) => e.stopPropagation()}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (!displayMode || e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setDraft(node.attrs.latex || '');
                setEditing(false);
              }
            }}
            placeholder="e.g. \frac{a}{b} + \sqrt{x}"
            autoFocus
            aria-label="LaTeX expression"
          />
          <button type="button" className="btn primary" onClick={commit}>Apply</button>
        </span>
      ) : (
        <span
          ref={renderRef}
          className="math-rendered"
          title={editor.isEditable ? 'Click to edit LaTeX' : node.attrs.latex}
          onClick={() => editor.isEditable && setEditing(true)}
        />
      )}
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      latex: {
        default: 'x^2 + y^2 = r^2',
        parseHTML: (el) => el.getAttribute('data-math-inline') || el.textContent || '',
        renderHTML: (attrs) => ({ 'data-math-inline': attrs.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), `$${HTMLAttributes['data-math-inline'] || ''}$`];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => <MathNodeView {...props} displayMode={false} />);
  },
  addCommands() {
    return {
      insertMathInline: (latex = 'E = mc^2') => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      latex: {
        default: '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
        parseHTML: (el) => el.getAttribute('data-math-block') || el.textContent || '',
        renderHTML: (attrs) => ({ 'data-math-block': attrs.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-math-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), `$$\n${HTMLAttributes['data-math-block'] || ''}\n$$`];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => <MathNodeView {...props} displayMode={true} />);
  },
  addCommands() {
    return {
      insertMathBlock: (latex = '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}') => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});
