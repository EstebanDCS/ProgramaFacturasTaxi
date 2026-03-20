import { useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import LoadingScreen from './components/LoadingScreen';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Plantillas from './pages/Plantillas';
import CrearPlantilla from './pages/CrearPlantilla';
import NuevaFactura from './pages/NuevaFactura';
import Historial from './pages/Historial';
import Admin from './pages/Admin';

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [backendReady, setBackendReady] = useState(false);
  const [editingPlantillaId, setEditingPlantillaId] = useState(null);
  const [editingFacturaId, setEditingFacturaId] = useState(null);

  const navigate = useCallback((p) => {
    setPage(p);
    setEditingPlantillaId(null);
    setEditingFacturaId(null);
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span></div>;
  if (!user) return <Login />;
  if (!backendReady) return <LoadingScreen onReady={() => setBackendReady(true)} />;

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'plantillas':
        if (editingPlantillaId !== null) return <CrearPlantilla editingId={editingPlantillaId} onBack={() => { setEditingPlantillaId(null); }} />;
        return <Plantillas onCrear={() => setEditingPlantillaId(0)} onEditar={(id) => setEditingPlantillaId(id)} />;
      case 'nueva': return <NuevaFactura editingId={editingFacturaId} onClearEdit={() => setEditingFacturaId(null)} />;
      case 'historial': return <Historial onEditFactura={(id) => { setEditingFacturaId(id); setPage('nueva'); }} />;
      case 'admin': return <Admin />;
      case 'comunidad': return (
        <div className="animate-fadeIn text-center py-20">
          <span className="material-symbols-outlined text-5xl text-slate-200 mb-4 block">groups</span>
          <p className="text-slate-400 font-medium">Comunidad — próximamente</p>
        </div>
      );
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar activePage={page} onNavigate={navigate} />
      <main className="flex-1 p-6 lg:p-10 overflow-auto">
        {renderPage()}
      </main>
    </div>
  );
}
