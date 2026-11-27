export const DOC_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Clean neutral sheet ready for live collaboration.',
    docType: 'rich',
    folder: 'General',
    tags: [],
    title: 'Untitled document',
    html: '',
  },
  {
    id: 'latex-paper',
    name: 'LaTeX Academic Paper (.tex)',
    description: 'Split-pane .tex editor with live KaTeX math preview.',
    docType: 'latex',
    folder: 'Research',
    tags: ['latex', 'paper'],
    title: 'Research Paper.tex',
    latex: `\\documentclass[11pt]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{hyperref}

\\title{Collaborative Document Synthesis}
\\author{Coauthor Studio}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
We present a real-time collaborative authoring environment combining conflict-free replicated data types (CRDTs) with live mathematical typesetting.
\\end{abstract}

\\section{Introduction}
Real-time editing allows multiple authors to contribute concurrently. Consider the quadratic objective:
\\begin{equation}
J(\\theta) = \\frac{1}{2N} \\sum_{i=1}^{N} \\| y_i - f_\\theta(x_i) \\|_2^2 + \\lambda \\|\\theta\\|_2^2
\\end{equation}

\\section{Methodology}
Key properties of our sync layer include:
\\begin{itemize}
  \\item \\textbf{Commutativity}: Updates arrive in any order and converge identically.
  \\item \\textbf{Persistence}: State merges transactionally in PostgreSQL.
  \\item \\textbf{Live Presence}: Cursor states propagate with low latency over Redis.
\\end{itemize}

\\subsection{Convergence Bounds}
For any two replicas $A$ and $B$ receiving update set $U$, the merged state satisfies $S_A = S_B$ with $\\mathcal{O}(|U|)$ overhead.

\\begin{tabular}{lll}
Metric & Value & Notes \\\\
\\hline
Sync Latency & 12 ms & Intra-region WebSocket \\\\
Convergence & 100\\% & CRDT Yjs guarantee \\\\
\\end{tabular}

\\end{document}
`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Structured agenda, attendees, table, and action items.',
    docType: 'rich',
    folder: 'Notes',
    tags: ['meeting', 'notes'],
    title: 'Weekly Sync — Meeting Notes',
    html: `<h1>Weekly Sync</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()} · <strong>Facilitator:</strong> Team</p>
<div data-callout="info"><p><strong>Goal:</strong> Align on priorities, unblock open items, and assign clear owners.</p></div>
<h2>Agenda</h2>
<ol><li><p>Review last week’s milestones</p></li><li><p>Discuss blockers &amp; technical risks</p></li><li><p>Confirm next sprint deliverables</p></li></ol>
<h2>Action Items</h2>
<table><tbody>
<tr><th>Owner</th><th>Task</th><th>Status</th></tr>
<tr><td>Design</td><td>Finalize neutral theme tokens</td><td>Done</td></tr>
<tr><td>Engineering</td><td>Verify WebSocket scaling</td><td>In progress</td></tr>
</tbody></table>`,
  },
  {
    id: 'tech-spec',
    name: 'Technical Design Spec',
    description: 'Architecture overview, trade-offs, and rollout checklist.',
    docType: 'rich',
    folder: 'Engineering',
    tags: ['spec', 'architecture'],
    title: 'Technical Design Specification',
    html: `<h1>Technical Design Specification</h1>
<p><em>Status: Draft · Author: Engineering</em></p>
<h2>1. Context &amp; Problem</h2>
<p>Summarize the problem statement, user impact, and key constraints.</p>
<h2>2. Proposed Architecture</h2>
<p>Describe data flow, storage schemas, and API contracts.</p>
<pre><code>Client (React + TipTap) &lt;--WS--&gt; Node Sync Tier &lt;--&gt; Postgres / Redis</code></pre>
<h2>3. Non-Functional Requirements</h2>
<ul><li><p>Latency target: p95 &lt; 100 ms</p></li><li><p>Graceful degradation when offline</p></li></ul>`,
  },
  {
    id: 'math-cheatsheet',
    name: 'LaTeX Formula Sheet (.tex)',
    description: 'Calculus, linear algebra, and probability equations.',
    docType: 'latex',
    folder: 'Research',
    tags: ['latex', 'math'],
    title: 'Formula Sheet.tex',
    latex: `\\documentclass{article}
\\usepackage{amsmath,amssymb}

\\title{Mathematics Reference Sheet}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Calculus}
Taylor expansion around $x_0$:
$$f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(x_0)}{n!} (x - x_0)^n$$

Gaussian integral:
$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$

\\section{Linear Algebra}
Singular Value Decomposition of $A \\in \\mathbb{R}^{m \\times n}$:
$$A = U \\Sigma V^T$$

\\section{Probability}
Bayes' Theorem:
$$P(A \\mid B) = \\frac{P(B \\mid A) P(A)}{P(B)}$$

\\end{document}
`,
  },
];
