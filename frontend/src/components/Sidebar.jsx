import { useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`flex flex-col bg-gradient-to-b from-slate-900 to-[#0f1729] text-white transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-[264px]'} min-h-screen relative`}>
      {/* Header */}
      <div className={`px-4 py-5 border-b border-white/5 flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="bg-primary p-1.5 rounded-lg flex-shrink-0">
          <span className="material-symbols-outlined text-white text-lg fill-1">receipt_long</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold tracking-tight text-white truncate">Gestión Facturas</h1>
            <p className="text-[10px] text-blue-300/50 font-bold">v3.0</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 bg-slate-800 border border-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-10">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{collapsed ? 'chevron_right' : 'chevron_left'}</span>
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => !item.disabled && onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${item.disabled ? 'text-blue-200/30 cursor-default' :
                activePage === item.id ? 'bg-primary text-white shadow-lg shadow-primary/20' :
                'text-blue-200/70 hover:bg-white/10 hover:text-white cursor-pointer'}`}>
            <span className={`material-symbols-outlined ${activePage === item.id ? 'fill-1' : ''}`}>{item.icon}</span>
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
          </button>
        ))}
        {isAdmin && (
          <button onClick={() => onNavigate('admin')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activePage === 'admin' ? 'bg-primary text-white shadow-lg shadow-primary/20' :
              'text-amber-300/70 hover:bg-white/10 hover:text-amber-200 cursor-pointer'}`}>
            <span className={`material-symbols-outlined ${activePage === 'admin' ? 'fill-1' : ''}`}>admin_panel_settings</span>
            {!collapsed && <span className="text-sm font-medium">Admin</span>}
          </button>
        )}
      </nav>

      {/* Profile */}
      {profile.name && (
        <div className={`px-3 py-4 border-t border-white/5 ${collapsed ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/30 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{profile.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{profile.email}</p>
              </div>
            )}
          </div>
          <button onClick={signOut}
            className={`mt-3 flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors ${collapsed ? 'justify-center w-full' : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      )}
    </aside>
  );
}
