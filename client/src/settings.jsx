import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const STORAGE_KEY = 'coauthor.settings';

export const DEFAULT_SETTINGS = {
  fontFamily: 'doc',       // 'doc' | 'ui' | 'mono' | 'system'
  fontSize: 18,            // 15 - 22 px
  lineHeight: 1.72,        // 1.5 - 2.0
  pageWidth: '52rem',      // '44rem' | '52rem' | '64rem' | '100%'
  accent: 'emerald',       // 'emerald' | 'neutral' | 'cobalt' | 'amber'
  density: 'comfortable',  // 'comfortable' | 'compact'
  spellcheck: true,
  showOutline: false,
  showStats: true,
  latexTabSize: 2,
  latexWordWrap: true,
  latexAutoClose: true,
};

const ACCENT_MAP = {
  emerald: { light: '#1f6f5c', lightSoft: '#e6f2ed', dark: '#4cc29e', darkSoft: 'rgba(76, 194, 158, 0.14)' },
  neutral: { light: '#353945', lightSoft: '#eceef2', dark: '#d4d8e2', darkSoft: 'rgba(212, 216, 226, 0.14)' },
  cobalt: { light: '#2563eb', lightSoft: '#e8effe', dark: '#60a5fa', darkSoft: 'rgba(96, 165, 250, 0.16)' },
  amber: { light: '#b45309', lightSoft: '#fef3c7', dark: '#fbbf24', darkSoft: 'rgba(251, 191, 36, 0.16)' },
};

const FONT_MAP = {
  doc: "'Newsreader', Georgia, 'Times New Roman', serif",
  ui: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  system: "Georgia, 'Times New Roman', serif",
};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  resetSettings: async () => {},
});

export const useSettings = () => useContext(SettingsContext);

function readCached() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ user, onUserUpdated, children }) {
  const [settings, setSettings] = useState(() => ({ ...readCached(), ...(user?.settings || {}) }));

  useEffect(() => {
    if (user?.settings) {
      setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...user.settings }));
    }
  }, [user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    const root = document.documentElement;
    root.dataset.density = settings.density || 'comfortable';
    root.dataset.accent = settings.accent || 'emerald';
    root.style.setProperty('--editor-font', FONT_MAP[settings.fontFamily] || FONT_MAP.doc);
    root.style.setProperty('--editor-size', `${Number(settings.fontSize) || 18}px`);
    root.style.setProperty('--editor-lh', String(settings.lineHeight || 1.72));
    root.style.setProperty('--sheet-width', settings.pageWidth || '52rem');

    const acc = ACCENT_MAP[settings.accent] || ACCENT_MAP.emerald;
    const isDark = root.dataset.theme === 'dark';
    root.style.setProperty('--accent', isDark ? acc.dark : acc.light);
    root.style.setProperty('--accent-soft', isDark ? acc.darkSoft : acc.lightSoft);
  }, [settings]);

  // Re-apply accent shade when theme toggles
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const root = document.documentElement;
      const acc = ACCENT_MAP[settings.accent] || ACCENT_MAP.emerald;
      const isDark = root.dataset.theme === 'dark';
      root.style.setProperty('--accent', isDark ? acc.dark : acc.light);
      root.style.setProperty('--accent-soft', isDark ? acc.darkSoft : acc.lightSoft);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [settings.accent]);

  const updateSettings = async (patch, name) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (user) {
      const res = await api('/auth/settings', {
        method: 'PATCH',
        body: { ...(name ? { name } : {}), settings: next },
      });
      if (res?.user && onUserUpdated) onUserUpdated(res.user);
    }
  };

  const resetSettings = () => updateSettings(DEFAULT_SETTINGS);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
