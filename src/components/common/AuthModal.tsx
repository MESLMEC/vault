import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Key, Server, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { api } from '../../services/api';
import { authStorage } from '../../services/backendApi';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthChange: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthChange,
}) => {
  const [username, setUsername] = useState('treasurer');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<{ online: boolean; authenticated: boolean }>({
    online: false,
    authenticated: false,
  });
  const [mode, setMode] = useState<'auto' | 'backend' | 'engine'>(authStorage.getMode());

  const checkStatus = async () => {
    try {
      const status = await api.auth.checkBackendHealth();
      setBackendHealth(status);
    } catch {
      setBackendHealth({ online: false, authenticated: false });
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setMode(authStorage.getMode());
      setUsername(authStorage.getUsername());
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.auth.login({ username, password });
      setPassword('');
      await checkStatus();
      onAuthChange();
      onClose();
    } catch (err: any) {
      setError(err?.reason || err?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.auth.logout();
    checkStatus();
    onAuthChange();
  };

  const handleModeChange = (newMode: 'auto' | 'backend' | 'engine') => {
    setMode(newMode);
    api.auth.setMode(newMode);
    onAuthChange();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
              Backend API & Treasurer Auth
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Server & Connectivity Status */}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-400">
              <Server className="h-4 w-4" /> FastAPI Backend:
            </span>
            {backendHealth.online ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Online (:8000)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" /> Offline / Standalone
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-400">
              <Key className="h-4 w-4" /> Bearer Token:
            </span>
            {api.auth.isAuthenticated() ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Active ({authStorage.getUsername()})
              </span>
            ) : (
              <span className="text-zinc-400">Not authenticated</span>
            )}
          </div>
        </div>

        {/* Data Source Mode Toggle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Operation Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'auto', label: 'Auto (Hybrid)', desc: 'Backend if live, Engine for rest' },
              { id: 'backend', label: 'Backend Strict', desc: 'Require live FastAPI' },
              { id: 'engine', label: 'Local Engine', desc: 'In-browser simulation' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleModeChange(m.id as any)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  mode === m.id
                    ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900/5 dark:bg-zinc-100/10 font-semibold text-zinc-900 dark:text-zinc-100'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="text-[11px] font-semibold">{m.label}</div>
                <div className="text-[9px] text-zinc-400 leading-tight mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Login Form or Active Session */}
        {api.auth.isAuthenticated() ? (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  Logged in as {authStorage.getUsername()}
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  JWT active. Endpoints from openapi.json will execute against PostgreSQL.
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-2.5 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Treasurer Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Treasurer Password
              </label>
              <input
                type="password"
                placeholder="Enter password (default: change-me)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In with Token'}
            </button>
          </form>
        )}

        <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
