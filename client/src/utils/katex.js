let loadPromise = null;

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const KATEX_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function ensureKatex() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.katex) return Promise.resolve(window.katex);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    if (!document.querySelector(`link[href="${KATEX_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = KATEX_CSS;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = KATEX_JS;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.katex || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function renderLatexHtml(tex = '', displayMode = false) {
  const clean = String(tex || '').trim();
  if (!clean) return '<span class="tex-empty">empty equation</span>';
  if (typeof window !== 'undefined' && window.katex) {
    try {
      return window.katex.renderToString(clean, {
        displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return `<code class="tex-fallback">${escapeHtml(clean)}</code>`;
    }
  }
  return `<code class="tex-fallback">${escapeHtml(clean)}</code>`;
}

export async function renderLatexInto(el, tex = '', displayMode = false) {
  if (!el) return;
  el.innerHTML = renderLatexHtml(tex, displayMode);
  const k = await ensureKatex();
  if (k && el.isConnected) {
    el.innerHTML = renderLatexHtml(tex, displayMode);
  }
}
