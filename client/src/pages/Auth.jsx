import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { ThemeToggle } from '../theme.jsx';

export default function Auth() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: form });
      signIn(data);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-pitch" aria-hidden="true">
        <div className="ambient-orb orb-1" />
        <div className="ambient-orb orb-2" />
        <div className="auth-pitch-inner">
          <span className="pill-badge">Real-time collaborative studio</span>
          <h1 className="brand">Coauthor</h1>
          <p className="pitch">Write together, in the same sentence, at the same time.</p>
          <div className="sheet-demo">
            <p>
              The launch plan needs a clearer first paragraph, so I rewrote the
              <span className="demo-caret" style={{ '--c': '#D1495B' }}><i>Maya</i></span>
              {' '}opening around what the reader will actually do.
            </p>
            <p>
              Budget numbers are still rough, but the timeline holds
              <span className="demo-caret is-delayed" style={{ '--c': '#2E86AB' }}><i>Arjun</i></span>
            </p>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-top">
          <ThemeToggle />
        </div>
        <form className="auth-form" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          {mode === 'register' && (
            <label>Name<input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
          )}
          <label>Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
          <label>
            Password
            <input type="password" value={form.password} onChange={set('password')} minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
          {mode === 'register' && <p className="hint">Use at least 8 characters.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
