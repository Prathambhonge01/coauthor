import { escapeHtml, renderLatexHtml } from './katex.js';

/* ==================== CSV / Data Helpers ==================== */

export function parseCsv(text = '', delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(rows = [], delimiter = ',') {
  return rows
    .map((r) =>
      r
        .map((val) => {
          const s = String(val ?? '');
          return s.includes(delimiter) || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(delimiter)
    )
    .join('\n');
}

export function csvToJson(csvText, delimiter = ',') {
  const rows = parseCsv(csvText, delimiter);
  if (rows.length === 0) return '[]';
  const headers = rows[0].map((h, i) => h.trim() || `col_${i + 1}`);
  const objs = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
  return JSON.stringify(objs, null, 2);
}

export function jsonToCsv(jsonText, delimiter = ',') {
  const data = JSON.parse(jsonText);
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '';
  const keys = [...new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : ['value'])))];
  const rows = [
    keys,
    ...arr.map((item) =>
      keys.map((k) => {
        if (!item || typeof item !== 'object') return item;
        const v = item[k];
        return typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? '';
      })
    ),
  ];
  return toCsv(rows, delimiter);
}

export function csvToMarkdownTable(csvText, delimiter = ',') {
  const rows = parseCsv(csvText, delimiter);
  if (rows.length === 0) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\|/g, '\\|').trim()));
  const head = `| ${norm[0].join(' | ')} |`;
  const sep = `| ${norm[0].map(() => '---').join(' | ')} |`;
  const body = norm.slice(1).map((r) => `| ${r.join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

export function markdownTableToCsv(md = '') {
  const lines = md
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  const rows = [];
  for (const line of lines) {
    if (/^\|[\s:-]+\|$/.test(line.replace(/\|/g, (m, off) => (off === 0 || off === line.length - 1 ? '|' : '')))) {
      if (/^\|(\s*:?-+:?\s*\|)+$/.test(line)) continue;
    }
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.replace(/\\\|/g, '|').trim());
    rows.push(cells);
  }
  return toCsv(rows);
}

export function csvToHtmlTable(csvText, delimiter = ',') {
  const rows = parseCsv(csvText, delimiter);
  if (rows.length === 0) return '<p>(empty table)</p>';
  const cols = Math.max(...rows.map((r) => r.length));
  const head = `<tr>${Array.from({ length: cols }, (_, i) => `<th>${escapeHtml(rows[0][i] || '')}</th>`).join('')}</tr>`;
  const body = rows
    .slice(1)
    .map((r) => `<tr>${Array.from({ length: cols }, (_, i) => `<td>${escapeHtml(r[i] || '')}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table>\n<thead>\n${head}\n</thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
}

export function csvToLatexTabular(csvText, delimiter = ',') {
  const rows = parseCsv(csvText, delimiter);
  if (rows.length === 0) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const spec = 'l'.repeat(cols);
  const esc = (s) => escapeLatex(String(s ?? ''));
  const lines = rows.map((r, idx) => {
    const rowStr = Array.from({ length: cols }, (_, i) => esc(r[i] || '')).join(' & ') + ' \\\\';
    return idx === 0 ? `${rowStr}\n\\hline` : rowStr;
  });
  return `\\begin{tabular}{${spec}}\n\\hline\n${lines.join('\n')}\n\\hline\n\\end{tabular}`;
}

/* ==================== Markdown <-> HTML ==================== */

function inlineMd(text = '') {
  let out = escapeHtml(text);
  // Inline code
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  // Inline math $...$
  const maths = [];
  out = out.replace(/\$([^$\n]+)\$/g, (_m, tex) => {
    const raw = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    maths.push(`<span data-math-inline="${escapeHtml(raw)}">${renderLatexHtml(raw, false)}</span>`);
    return `\u0000MATH${maths.length - 1}\u0000`;
  });
  // Links [label](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  out = out.replace(/\u0000MATH(\d+)\u0000/g, (_m, i) => maths[Number(i)]);
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
  return out;
}

export function markdownToHtml(md = '') {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Display math block $$ ... $$
    if (trimmed.startsWith('$$')) {
      if (trimmed.endsWith('$$') && trimmed.length > 4) {
        const tex = trimmed.slice(2, -2).trim();
        html.push(`<div data-math-block="${escapeHtml(tex)}">${renderLatexHtml(tex, true)}</div>`);
        i++;
        continue;
      }
      const mathLines = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        mathLines.push(lines[i].trim().slice(0, -2));
        i++;
      }
      const tex = mathLines.join('\n').trim();
      html.push(`<div data-math-block="${escapeHtml(tex)}">${renderLatexHtml(tex, true)}</div>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr />');
      i++;
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      html.push(`<h${lvl}>${inlineMd(hMatch[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        q.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote><p>${inlineMd(q.join(' '))}</p></blockquote>`);
      continue;
    }

    // Table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|(\s*:?-+:?\s*\|)+$/.test(lines[i + 1].trim())) {
      const parseRow = (rowLine) =>
        rowLine
          .trim()
          .slice(1, rowLine.trim().endsWith('|') ? -1 : undefined)
          .split('|')
          .map((c) => inlineMd(c.trim()));
      const headers = parseRow(lines[i]);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      html.push(
        `<table><tbody><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>${bodyRows
          .map((r) => `<tr>${headers.map((_, ci) => `<td>${r[ci] || ''}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(`<li><p>${inlineMd(lines[i].trim().replace(/^[-*+]\s+/, ''))}</p></li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li><p>${inlineMd(lines[i].trim().replace(/^\d+\.\s+/, ''))}</p></li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|\$\$|>|[-*+]\s|\d+\.\s|(-{3,}|\*{3,})$)/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${inlineMd(para.join(' '))}</p>`);
  }

  return html.join('\n');
}

function parseHtmlDoc(html = '') {
  const parser = new DOMParser();
  return parser.parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild;
}

function inlineNodeToMd(node) {
  if (node.nodeType === 3) return node.textContent || '';
  if (node.nodeType !== 1) return '';
  const el = node;
  if (el.hasAttribute('data-math-inline')) {
    return `$${el.getAttribute('data-math-inline')}$`;
  }
  const inner = [...el.childNodes].map(inlineNodeToMd).join('');
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return `**${inner}**`;
    case 'EM':
    case 'I':
      return `*${inner}*`;
    case 'S':
    case 'DEL':
      return `~~${inner}~~`;
    case 'U':
      return `<u>${inner}</u>`;
    case 'SUB':
      return `<sub>${inner}</sub>`;
    case 'SUP':
      return `<sup>${inner}</sup>`;
    case 'CODE':
      return `\`${inner}\``;
    case 'A':
      return `[${inner}](${el.getAttribute('href') || '#'})`;
    case 'BR':
      return '  \n';
    default:
      return inner;
  }
}

export function htmlToMarkdown(html = '') {
  const root = parseHtmlDoc(html);
  const blocks = [];

  const walkBlock = (el) => {
    if (el.nodeType === 3) {
      const t = el.textContent.trim();
      if (t) blocks.push(t);
      return;
    }
    if (el.nodeType !== 1) return;
    if (el.hasAttribute('data-math-block')) {
      blocks.push(`$$\n${el.getAttribute('data-math-block')}\n$$`);
      return;
    }
    switch (el.tagName) {
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4': {
        const lvl = Number(el.tagName[1]);
        blocks.push(`${'#'.repeat(lvl)} ${[...el.childNodes].map(inlineNodeToMd).join('').trim()}`);
        break;
      }
      case 'P': {
        const txt = [...el.childNodes].map(inlineNodeToMd).join('').trim();
        if (txt) blocks.push(txt);
        break;
      }
      case 'HR':
        blocks.push('---');
        break;
      case 'PRE':
        blocks.push(`\`\`\`\n${el.textContent || ''}\n\`\`\``);
        break;
      case 'BLOCKQUOTE': {
        const q = [...el.children].map((c) => `> ${[...c.childNodes].map(inlineNodeToMd).join('').trim()}`).join('\n');
        blocks.push(q || `> ${el.textContent.trim()}`);
        break;
      }
      case 'UL':
        blocks.push([...el.children].map((li) => `- ${[...li.childNodes].map(inlineNodeToMd).join('').trim()}`).join('\n'));
        break;
      case 'OL':
        blocks.push(
          [...el.children].map((li, idx) => `${idx + 1}. ${[...li.childNodes].map(inlineNodeToMd).join('').trim()}`).join('\n')
        );
        break;
      case 'TABLE': {
        const rows = [...el.querySelectorAll('tr')].map((tr) =>
          [...tr.children].map((td) => [...td.childNodes].map(inlineNodeToMd).join('').replace(/\|/g, '\\|').trim())
        );
        if (rows.length > 0) {
          const head = `| ${rows[0].join(' | ')} |`;
          const sep = `| ${rows[0].map(() => '---').join(' | ')} |`;
          const rest = rows.slice(1).map((r) => `| ${r.join(' | ')} |`);
          blocks.push([head, sep, ...rest].join('\n'));
        }
        break;
      }
      case 'DIV':
        if (el.hasAttribute('data-callout')) {
          blocks.push(`> **${(el.getAttribute('data-callout') || 'note').toUpperCase()}**: ${el.textContent.trim()}`);
        } else {
          [...el.childNodes].forEach(walkBlock);
        }
        break;
      default:
        blocks.push([...el.childNodes].map(inlineNodeToMd).join('').trim());
    }
  };

  [...root.childNodes].forEach(walkBlock);
  return blocks.filter(Boolean).join('\n\n');
}

/* ==================== LaTeX (.tex) <-> HTML ==================== */

export function escapeLatex(str = '') {
  return String(str)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function inlineNodeToLatex(node) {
  if (node.nodeType === 3) return escapeLatex(node.textContent || '');
  if (node.nodeType !== 1) return '';
  const el = node;
  if (el.hasAttribute('data-math-inline')) {
    return `$${el.getAttribute('data-math-inline')}$`;
  }
  const inner = [...el.childNodes].map(inlineNodeToLatex).join('');
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return `\\textbf{${inner}}`;
    case 'EM':
    case 'I':
      return `\\textit{${inner}}`;
    case 'U':
      return `\\underline{${inner}}`;
    case 'S':
    case 'DEL':
      return `\\sout{${inner}}`;
    case 'SUB':
      return `\\textsubscript{${inner}}`;
    case 'SUP':
      return `\\textsuperscript{${inner}}`;
    case 'CODE':
      return `\\texttt{${inner}}`;
    case 'A':
      return `\\href{${el.getAttribute('href') || '#'}}{${inner}}`;
    case 'BR':
      return ' \\\\\n';
    default:
      return inner;
  }
}

export function htmlToLatex(html = '', title = 'Untitled Document') {
  const root = parseHtmlDoc(html);
  const body = [];

  const walk = (el) => {
    if (el.nodeType === 3) {
      const t = el.textContent.trim();
      if (t) body.push(escapeLatex(t));
      return;
    }
    if (el.nodeType !== 1) return;
    if (el.hasAttribute('data-math-block')) {
      body.push(`\\[\n${el.getAttribute('data-math-block')}\n\\]`);
      return;
    }
    switch (el.tagName) {
      case 'H1':
        body.push(`\\section{${[...el.childNodes].map(inlineNodeToLatex).join('').trim()}}`);
        break;
      case 'H2':
        body.push(`\\subsection{${[...el.childNodes].map(inlineNodeToLatex).join('').trim()}}`);
        break;
      case 'H3':
      case 'H4':
        body.push(`\\subsubsection{${[...el.childNodes].map(inlineNodeToLatex).join('').trim()}}`);
        break;
      case 'P': {
        const txt = [...el.childNodes].map(inlineNodeToLatex).join('').trim();
        if (txt) body.push(txt);
        break;
      }
      case 'HR':
        body.push('\\noindent\\rule{\\textwidth}{0.4pt}');
        break;
      case 'PRE':
        body.push(`\\begin{verbatim}\n${el.textContent || ''}\n\\end{verbatim}`);
        break;
      case 'BLOCKQUOTE':
        body.push(`\\begin{quote}\n${[...el.childNodes].map(inlineNodeToLatex).join('').trim()}\n\\end{quote}`);
        break;
      case 'UL':
        body.push(
          `\\begin{itemize}\n${[...el.children].map((li) => `  \\item ${[...li.childNodes].map(inlineNodeToLatex).join('').trim()}`).join('\n')}\n\\end{itemize}`
        );
        break;
      case 'OL':
        body.push(
          `\\begin{enumerate}\n${[...el.children].map((li) => `  \\item ${[...li.childNodes].map(inlineNodeToLatex).join('').trim()}`).join('\n')}\n\\end{enumerate}`
        );
        break;
      case 'TABLE': {
        const rows = [...el.querySelectorAll('tr')].map((tr) =>
          [...tr.children].map((td) => [...td.childNodes].map(inlineNodeToLatex).join('').trim())
        );
        if (rows.length > 0) {
          const cols = Math.max(...rows.map((r) => r.length));
          const spec = 'l'.repeat(cols);
          const lines = rows.map((r, i) => `${r.join(' & ')} \\\\${i === 0 ? '\n\\hline' : ''}`);
          body.push(`\\begin{tabular}{${spec}}\n\\hline\n${lines.join('\n')}\n\\hline\n\\end{tabular}`);
        }
        break;
      }
      default:
        [...el.childNodes].forEach(walk);
    }
  };

  [...root.childNodes].forEach(walk);

  return `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{hyperref}
\\usepackage[normalem]{ulem}

\\title{${escapeLatex(title)}}
\\date{\\today}

\\begin{document}
\\maketitle

${body.join('\n\n')}

\\end{document}
`;
}

function inlineLatexToHtml(src = '') {
  let out = String(src);
  // Protect inline math $...$
  const maths = [];
  out = out.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_m, tex) => {
    maths.push(`<span data-math-inline="${escapeHtml(tex)}">${renderLatexHtml(tex, false)}</span>`);
    return `\u0000IM${maths.length - 1}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>');
  out = out.replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>');
  out = out.replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>');
  out = out.replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>');
  out = out.replace(/\\sout\{([^{}]*)\}/g, '<s>$1</s>');
  out = out.replace(/\\texttt\{([^{}]*)\}/g, '<code>$1</code>');
  out = out.replace(/\\href\{([^{}]*)\}\{([^{}]*)\}/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');
  out = out.replace(/\\url\{([^{}]*)\}/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  out = out.replace(/\\textsuperscript\{([^{}]*)\}/g, '<sup>$1</sup>');
  out = out.replace(/\\textsubscript\{([^{}]*)\}/g, '<sub>$1</sub>');
  out = out.replace(/\\\\/g, '<br />');
  out = out.replace(/\\([&%$#_{}])/g, '$1');
  out = out.replace(/\\today\b/g, new Date().toLocaleDateString());
  out = out.replace(/---/g, '—').replace(/--/g, '–');
  out = out.replace(/\u0000IM(\d+)\u0000/g, (_m, i) => maths[Number(i)]);
  return out;
}

export function latexToHtml(tex = '') {
  let src = String(tex || '').replace(/\r\n/g, '\n');
  // Strip comments (unescaped %)
  src = src.replace(/(?<!\\)%.*$/gm, '');

  const titleMatch = src.match(/\\title\{([\s\S]*?)\}/);
  const authorMatch = src.match(/\\author\{([\s\S]*?)\}/);
  const dateMatch = src.match(/\\date\{([\s\S]*?)\}/);

  const docStart = src.indexOf('\\begin{document}');
  const docEnd = src.lastIndexOf('\\end{document}');
  let body = docStart !== -1 ? src.slice(docStart + 16, docEnd !== -1 ? docEnd : undefined) : src;

  const blocks = [];
  if (body.includes('\\maketitle') || (titleMatch && docStart === -1)) {
    if (titleMatch) blocks.push(`<h1>${inlineLatexToHtml(titleMatch[1].trim())}</h1>`);
    const meta = [authorMatch?.[1]?.trim(), dateMatch?.[1]?.trim()].filter(Boolean).map(inlineLatexToHtml).join(' · ');
    if (meta) blocks.push(`<p class="tex-meta"><em>${meta}</em></p>`);
    body = body.replace(/\\maketitle/g, '');
  }

  // Extract block environments first using placeholders
  const envs = [];
  const hold = (htmlStr) => {
    envs.push(htmlStr);
    return `\n\n\u0000ENV${envs.length - 1}\u0000\n\n`;
  };

  body = body.replace(/\\begin\{(equation\*?|align\*?|gather\*?)\}([\s\S]*?)\\end\{\1\}/g, (_m, _env, content) =>
    hold(`<div data-math-block="${escapeHtml(content.trim())}">${renderLatexHtml(content.trim(), true)}</div>`)
  );
  body = body.replace(/\\\[([\s\S]*?)\\\]/g, (_m, content) =>
    hold(`<div data-math-block="${escapeHtml(content.trim())}">${renderLatexHtml(content.trim(), true)}</div>`)
  );
  body = body.replace(/\$\$([\s\S]*?)\$\$/g, (_m, content) =>
    hold(`<div data-math-block="${escapeHtml(content.trim())}">${renderLatexHtml(content.trim(), true)}</div>`)
  );
  body = body.replace(/\\begin\{(verbatim|lstlisting)\}([\s\S]*?)\\end\{\1\}/g, (_m, _e, content) =>
    hold(`<pre><code>${escapeHtml(content.replace(/^\n|\n$/g, ''))}</code></pre>`)
  );
  body = body.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_m, content) =>
    hold(`<div data-callout="info"><p><strong>Abstract:</strong> ${inlineLatexToHtml(content.trim())}</p></div>`)
  );
  body = body.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g, (_m, content) =>
    hold(`<blockquote><p>${inlineLatexToHtml(content.trim())}</p></blockquote>`)
  );
  body = body.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (_m, kind, content) => {
    const tag = kind === 'itemize' ? 'ul' : 'ol';
    const items = content
      .split(/\\item\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `<li><p>${inlineLatexToHtml(s)}</p></li>`)
      .join('');
    return hold(`<${tag}>${items}</${tag}>`);
  });
  body = body.replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (_m, content) => {
    const rows = content
      .replace(/\\hline/g, '')
      .split(/\\\\/)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.split('&').map((c) => inlineLatexToHtml(c.trim())));
    if (rows.length === 0) return '';
    return hold(
      `<table><tbody>${rows
        .map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`)
        .join('')}</tbody></table>`
    );
  });

  // Process remaining paragraphs & headings
  const chunks = body.split(/\n{2,}/);
  for (const chunk of chunks) {
    const t = chunk.trim();
    if (!t) continue;
    const envM = t.match(/^\u0000ENV(\d+)\u0000$/);
    if (envM) {
      blocks.push(envs[Number(envM[1])]);
      continue;
    }
    const secM = t.match(/^\\(section|subsection|subsubsection)\*?\{([\s\S]+?)\}$/);
    if (secM) {
      const tag = secM[1] === 'section' ? 'h1' : secM[1] === 'subsection' ? 'h2' : 'h3';
      blocks.push(`<${tag}>${inlineLatexToHtml(secM[2].trim())}</${tag}>`);
      continue;
    }
    if (t.startsWith('\\noindent\\rule')) {
      blocks.push('<hr />');
      continue;
    }
    // Inline section headers mixed with text
    const replaced = t
      .replace(/\\section\*?\{([^{}]+)\}/g, '\n<h1>$1</h1>\n')
      .replace(/\\subsection\*?\{([^{}]+)\}/g, '\n<h2>$1</h2>\n')
      .replace(/\\subsubsection\*?\{([^{}]+)\}/g, '\n<h3>$1</h3>\n');
    if (replaced !== t) {
      replaced
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (/^<h[1-3]>/.test(line)) blocks.push(line);
          else blocks.push(`<p>${inlineLatexToHtml(line)}</p>`);
        });
      continue;
    }
    blocks.push(`<p>${inlineLatexToHtml(t.replace(/\n/g, ' '))}</p>`);
  }

  return blocks
    .join('\n')
    .replace(/\u0000ENV(\d+)\u0000/g, (_m, i) => envs[Number(i)]);
}

/* ==================== Plain Text & Standalone HTML ==================== */

export function htmlToText(html = '') {
  const root = parseHtmlDoc(html);
  const lines = [];
  const walk = (el) => {
    if (el.nodeType === 3) {
      const t = el.textContent.trim();
      if (t) lines.push(t);
      return;
    }
    if (el.nodeType !== 1) return;
    if (el.hasAttribute('data-math-block')) {
      lines.push(el.getAttribute('data-math-block'));
      return;
    }
    if (['H1', 'H2', 'H3', 'H4', 'P', 'PRE', 'BLOCKQUOTE'].includes(el.tagName)) {
      const t = el.textContent.trim();
      if (t) lines.push(t);
      return;
    }
    if (el.tagName === 'LI') {
      lines.push(`• ${el.textContent.trim()}`);
      return;
    }
    if (el.tagName === 'TR') {
      lines.push([...el.children].map((c) => c.textContent.trim()).join('\t'));
      return;
    }
    [...el.childNodes].forEach(walk);
  };
  [...root.childNodes].forEach(walk);
  return lines.join('\n\n');
}

export function textToHtml(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

export function extractTableCsvFromHtml(html = '') {
  const root = parseHtmlDoc(html);
  const tables = [...root.querySelectorAll('table')];
  if (tables.length > 0) {
    const rows = [...tables[0].querySelectorAll('tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim())
    );
    return toCsv(rows);
  }
  const lines = htmlToText(html)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return toCsv([['line', 'content'], ...lines.map((l, idx) => [String(idx + 1), l])]);
}

export function wrapStandaloneHtml(bodyHtml = '', title = 'Coauthor Document') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: Georgia, serif; max-width: 740px; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.7; color: #16181d; background: #fff; }
    @media (prefers-color-scheme: dark) { body { color: #f3f4f6; background: #111318; } pre, code { background: #1e212a; } th, td { border-color: #2f333f; } }
    h1, h2, h3, h4 { font-family: system-ui, sans-serif; line-height: 1.25; }
    pre { background: #181a20; color: #f1f3f6; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    code { background: #f1f3f6; padding: .15em .35em; border-radius: 4px; font-size: .9em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #1f6f5c; margin-left: 0; padding-left: 1rem; opacity: .85; font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 1.2rem 0; }
    th, td { border: 1px solid #d4d7df; padding: .5rem .7rem; text-align: left; }
    th { font-weight: 600; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/* ==================== Unified Conversion Dispatcher ==================== */

export function convertFormat(content, fromFmt, toFmt, title = 'Converted Document') {
  const from = String(fromFmt || 'md').toLowerCase();
  const to = String(toFmt || 'html').toLowerCase();
  const src = String(content || '');

  if (from === to) return src;

  // Direct tabular paths
  if ((from === 'csv' || from === 'tsv') && ['json', 'md', 'html', 'tex', 'csv', 'tsv'].includes(to)) {
    const delim = from === 'tsv' ? '\t' : ',';
    if (to === 'json') return csvToJson(src, delim);
    if (to === 'md') return csvToMarkdownTable(src, delim);
    if (to === 'html') return csvToHtmlTable(src, delim);
    if (to === 'tex') return csvToLatexTabular(src, delim);
    if (to === 'csv') return toCsv(parseCsv(src, delim), ',');
    if (to === 'tsv') return toCsv(parseCsv(src, delim), '\t');
  }
  if (from === 'json' && (to === 'csv' || to === 'tsv')) {
    return jsonToCsv(src, to === 'tsv' ? '\t' : ',');
  }

  // Step 1: Normalize to intermediate HTML
  let html = '';
  if (from === 'html') {
    const m = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    html = m ? m[1] : src;
  } else if (from === 'md') {
    html = markdownToHtml(src);
  } else if (from === 'tex') {
    html = latexToHtml(src);
  } else if (from === 'txt') {
    html = textToHtml(src);
  } else if (from === 'json') {
    const parsed = JSON.parse(src);
    if (Array.isArray(parsed)) {
      html = csvToHtmlTable(jsonToCsv(src));
    } else {
      html = `<pre><code>${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>`;
    }
  } else {
    html = textToHtml(src);
  }

  // Step 2: Emit target format
  if (to === 'html') return wrapStandaloneHtml(html, title);
  if (to === 'html-fragment') return html;
  if (to === 'md') return htmlToMarkdown(html);
  if (to === 'tex') return htmlToLatex(html, title);
  if (to === 'txt') return htmlToText(html);
  if (to === 'csv') return extractTableCsvFromHtml(html);
  if (to === 'json') return JSON.stringify({ title, html, markdown: htmlToMarkdown(html), text: htmlToText(html) }, null, 2);
  return html;
}

export function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
