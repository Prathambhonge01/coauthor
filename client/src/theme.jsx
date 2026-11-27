import { createContext, useContext, useEffect, useState } from 'react';

const THEME_KEY = 'coauthor.theme';
const ORDER = ['auto', 'light', 'dark'];
const LABELS = {
  auto: 'Auto (Browser)',
  light: 'Light',
  dark: 'Dark',
};

const ThemeContext = createContext({
  preference: 'auto',
  resolvedTheme: 'light',
  setPreference: () => {},
  cycleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getSystemDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return ORDER.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = preference === 'auto' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePref = preference;
    root.style.colorScheme = resolvedTheme;
    try {
      if (preference === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, preference);
    } catch {}
  }, [preference, resolvedTheme]);

  const setPreference = (next) => {
    if (ORDER.includes(next)) setPreferenceState(next);
  };

  const cycleTheme = () => {
    setPreferenceState((cur) => ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]);
  };

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className = '' }) {
  const { preference, resolvedTheme, cycleTheme } = useTheme();
  const label = `Theme: ${LABELS[preference]}${preference === 'auto' ? ` · ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}` : ''}. Click to switch.`;

  return (
    <button
      type="button"
      className={`btn ghost theme-toggle ${className}`.trim()}
      onClick={cycleTheme}
      title={label}
      aria-label={label}
      data-pref={preference}
    >
      <span className="theme-icon" aria-hidden="true">
        {preference === 'auto' ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2.5" />
            <path d="M8 21h8M12 17v4" />
            <path d="M12 7a3 3 0 0 0 0 6V7z" fill="currentColor" stroke="none" />
          </svg>
        ) : resolvedTheme === 'dark' ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        )}
      </span>
      <span className="theme-label">{LABELS[preference].split(' ')[0]}</span>
    </button>
  );
}
