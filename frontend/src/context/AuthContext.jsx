import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, API_URL } from '../config';
import { initCrypto } from '../utils/crypto';
import { apiFetch, authHeaders } from '../utils/api';

const AuthContext = createContext(null);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: '', email: '', avatar: '' });

  const setupUser = useCallback(async (session) => {
    if (!session) { setUser(null); setToken(null); setLoading(false); return; }
    const u = session.user;
    setUser(u);
    setToken(session.access_token);
    await initCrypto(u.id);
    const meta = u.user_metadata || {};
    setProfile({
      name: meta.full_name || meta.name || u.email || '',
      email: u.email || '',
      avatar: meta.avatar_url || meta.picture || '',
    });
    try {
      const r = await apiFetch(`${API_URL}/admin/check`, { headers: authHeaders(session.access_token) });
      if (r.ok) { const d = await r.json(); setIsAdmin(d.is_admin === true); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setupUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN' && session) setupUser(session);
      else if (ev === 'SIGNED_OUT') { setUser(null); setToken(null); setIsAdmin(false); }
    });
    return () => subscription.unsubscribe();
  }, [setupUser]);

  const signIn = async () => {
    const isProd = window.location.hostname === 'programa-facturas-taxi.vercel.app';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: isProd ? `https://programa-facturas-taxi.vercel.app` : window.location.href }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, token, isAdmin, loading, profile, signIn, signOut, supabase }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
