import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, clearToken, getToken, setToken } from './api.js';
import { ThemeProvider } from './theme.jsx';
import { SettingsProvider } from './settings.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EditorPage from './pages/EditorPage.jsx';
import ToolsPage from './pages/ToolsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking the saved session

  useEffect(() => {
    if (!getToken()) return setUser(null);
    api('/auth/me').then((r) => setUser(r.user)).catch(() => { clearToken(); setUser(null); });
  }, []);

  const value = {
    user,
    signIn: ({ user, token }) => { setToken(token); setUser(user); },
    signOut: () => { clearToken(); setUser(null); },
  };

  if (user === undefined) {
    return (
      <ThemeProvider>
        <div className="boot-screen">
          <div className="boot-card">
            <span className="brand small">Coauthor</span>
            <div className="shimmer-bar" aria-hidden="true" />
            <p className="muted">Loading workspace…</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthContext.Provider value={value}>
        <SettingsProvider user={user} onUserUpdated={setUser}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Auth />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/d/:id" element={<Protected><EditorPage /></Protected>} />
            <Route path="/tools" element={<Protected><ToolsPage /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SettingsProvider>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}
