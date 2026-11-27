import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { ThemeToggle, useTheme } from '../theme.jsx';
import { useSettings } from '../settings.jsx';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const { settings, updateSettings, resetSettings } = useSettings();

  const [displayName, setDisplayName] = useState(user.name || '');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async (patch, name) => {
    setError('');
    setMsg('');
    try {
      await updateSettings(patch, name);
      setMsg('Settings saved.');
    } catch (e) {
      setError(e.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/auth/password', { method: 'POST', body: pwForm });
      setPwForm({ currentPassword: '', newPassword: '' });
      setMsg('Password updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand small">Coauthor</Link>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="nav-pill">Library</Link>
          <Link to="/tools" className="nav-pill">Conversion Tools</Link>
          <Link to="/settings" className="nav-pill on">Settings</Link>
        </nav>
        <span className="spacer" />
        <ThemeToggle />
        <span className="muted user-chip">{user.name}</span>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>

      <main className="settings-shell">
        <div className="dash-head">
          <div>
            <h1>Workspace Settings</h1>
            <p className="muted">Preferences sync automatically to your account across devices.</p>
          </div>
          <button type="button" className="btn" onClick={() => resetSettings().then(() => setMsg('Reset to defaults.'))}>
            Reset Defaults
          </button>
        </div>

        {msg && <p className="ok banner" role="status">{msg}</p>}
        {error && <p className="error banner" role="alert">{error}</p>}

        <div className="settings-grid">
          <section className="settings-card">
            <h2>Appearance &amp; Theme</h2>
            <label className="setting-row">
              <span>Color Mode</span>
              <select value={preference} onChange={(e) => setPreference(e.target.value)}>
                <option value="auto">Automatic (Browser setting)</option>
                <option value="light">Light (Neutral White)</option>
                <option value="dark">Dark (Obsidian)</option>
              </select>
            </label>
            <label className="setting-row">
              <span>Accent Tone</span>
              <select value={settings.accent} onChange={(e) => save({ accent: e.target.value })}>
                <option value="emerald">Editorial Emerald</option>
                <option value="neutral">Neutral Graphite</option>
                <option value="cobalt">Classic Cobalt</option>
                <option value="amber">Warm Amber</option>
              </select>
            </label>
            <label className="setting-row">
              <span>Interface Density</span>
              <select value={settings.density} onChange={(e) => save({ density: e.target.value })}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </section>

          <section className="settings-card">
            <h2>Document Editor</h2>
            <label className="setting-row">
              <span>Typography</span>
              <select value={settings.fontFamily} onChange={(e) => save({ fontFamily: e.target.value })}>
                <option value="doc">Newsreader Serif</option>
                <option value="ui">Instrument Sans</option>
                <option value="mono">Monospace</option>
                <option value="system">Georgia Serif</option>
              </select>
            </label>
            <label className="setting-row">
              <span>Font Size ({settings.fontSize}px)</span>
              <input type="range" min="15" max="22" step="1" value={settings.fontSize} onChange={(e) => save({ fontSize: Number(e.target.value) })} />
            </label>
            <label className="setting-row">
              <span>Line Height ({settings.lineHeight})</span>
              <input type="range" min="1.45" max="2.0" step="0.05" value={settings.lineHeight} onChange={(e) => save({ lineHeight: Number(e.target.value) })} />
            </label>
            <label className="setting-row">
              <span>Page Width</span>
              <select value={settings.pageWidth} onChange={(e) => save({ pageWidth: e.target.value })}>
                <option value="44rem">Focused (44rem)</option>
                <option value="52rem">Standard (52rem)</option>
                <option value="64rem">Wide (64rem)</option>
                <option value="100%">Full Canvas</option>
              </select>
            </label>
            <label className="setting-check">
              <input type="checkbox" checked={!!settings.spellcheck} onChange={(e) => save({ spellcheck: e.target.checked })} />
              <span>Enable browser spellcheck</span>
            </label>
            <label className="setting-check">
              <input type="checkbox" checked={!!settings.showOutline} onChange={(e) => save({ showOutline: e.target.checked })} />
              <span>Show Document Outline when opening documents</span>
            </label>
            <label className="setting-check">
              <input type="checkbox" checked={!!settings.showStats} onChange={(e) => save({ showStats: e.target.checked })} />
              <span>Show bottom word count &amp; zoom bar</span>
            </label>
          </section>

          <section className="settings-card">
            <h2>LaTeX (.tex) Code Editor</h2>
            <label className="setting-row">
              <span>Tab Indentation</span>
              <select value={settings.latexTabSize} onChange={(e) => save({ latexTabSize: Number(e.target.value) })}>
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </select>
            </label>
            <label className="setting-check">
              <input type="checkbox" checked={!!settings.latexWordWrap} onChange={(e) => save({ latexWordWrap: e.target.checked })} />
              <span>Soft-wrap long lines in .tex editor</span>
            </label>
            <label className="setting-check">
              <input type="checkbox" checked={!!settings.latexAutoClose} onChange={(e) => save({ latexAutoClose: e.target.checked })} />
              <span>Auto-close braces {'{}'}, brackets [], and $</span>
            </label>
          </section>

          <section className="settings-card">
            <h2>Account &amp; Security</h2>
            <p className="muted">Signed in as <strong>{user.email}</strong></p>
            <form className="share-form" onSubmit={(e) => { e.preventDefault(); save({}, displayName); }}>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" required aria-label="Display name" />
              <button className="btn primary">Update Name</button>
            </form>
            <form className="stack-form" onSubmit={changePassword}>
              <input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} placeholder="Current password" required />
              <input type="password" minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} placeholder="New password (8+ chars)" required />
              <button className="btn">Change Password</button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
