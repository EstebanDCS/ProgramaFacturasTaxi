import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'plantillas', icon: 'draft', label: 'Plantillas' },
  { id: 'nueva', icon: 'note_add', label: 'Nueva Factura' },
  { id: 'historial', icon: 'history', label: 'Historial' },
  { id: 'comunidad', icon: 'groups', label: 'Comunidad', disabled: true },
];

export default function Sidebar({ activePage, onNavigate }) {
  const { isAdmin, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', collapsed); } catch {}
  }, [collapsed]);

  // Ctrl+B toggle
  useEffect(() => {
    const handler = (e) => { if (e.ctrlKey && e.key === 'b') { e.preventDefault(); setCollapsed(c => !c); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const w = collapsed ? 'w-16' : 'w-64';

  return (
    <aside className={`flex flex-col bg-gradient-to-b from-slate-900 to-[#0f1729] text-white ${w} min-h-screen relative transition-all duration-200 ease-out flex-shrink-0`}>
      {/* Header */}
      <div className={`px-3 py-4 border-b border-white/5 flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="bg-primary p-1.5 rounded-lg flex-shrink-0">
          <span className="material-symbols-outlined text-white text-lg fill-1">receipt_long</span>
        </div>
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <h1 className="text-sm font-extrabold tracking-tight text-white truncate">Gestión Facturas</h1>
            <p className="text-[10px] text-blue-300/50 font-bold">v3.0</p>
          </div>
        )}
      </div>

      {/* Toggle */}
      <button onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-14 bg-slate-800 border border-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-primary transition-all z-10 shadow-md"
        title="Ctrl+B">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{collapsed ? 'chevron_right' : 'chevron_left'}</span>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => !item.disabled && onNavigate(item.id)}
            title={collapsed ? item.label : ''}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
              ${item.disabled ? 'text-blue-200/20 cursor-default' :
                activePage === item.id ? 'bg-primary text-white shadow-lg shadow-primary/20' :
                'text-blue-200/60 hover:bg-white/8 hover:text-white cursor-pointer'}`}>
            <span className={`material-symbols-outlined text-xl ${activePage === item.id ? 'fill-1' : ''}`}>{item.icon}</span>
            {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
          </button>
        ))}
        {isAdmin && (
          <button onClick={() => onNavigate('admin')}
            title={collapsed ? 'Admin' : ''}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : ''} gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
              ${activePage === 'admin' ? 'bg-primary text-white shadow-lg shadow-primary/20' :
              'text-amber-300/60 hover:bg-white/8 hover:text-amber-200 cursor-pointer'}`}>
            <span className={`material-symbols-outlined text-xl ${activePage === 'admin' ? 'fill-1' : ''}`}>admin_panel_settings</span>
            {!collapsed && <span className="text-sm font-medium">Admin</span>}
          </button>
        )}
      </nav>

      {/* Profile */}
      {profile.name && (
        <div className={`px-2 py-3 border-t border-white/5`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-1'}`}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{profile.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{profile.email}</p>
              </div>
            )}
          </div>
          <button onClick={signOut} title={collapsed ? 'Cerrar sesión' : ''}
            className={`mt-2 flex items-center gap-2 text-[11px] text-slate-500 hover:text-red-400 transition-colors ${collapsed ? 'justify-center w-full' : 'px-1'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      )}
    </aside>
  );
}