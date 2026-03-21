import { useState } from 'react';

const FORMATS = [
  { id: 'excel', icon: 'table_view', label: 'Excel', desc: 'Hoja de cálculo editable', color: 'emerald' },
  { id: 'pdf', icon: 'picture_as_pdf', label: 'PDF', desc: 'Documento listo para enviar', color: 'red' },
  { id: 'html', icon: 'code', label: 'HTML', desc: 'Formato web (fallback)', color: 'blue' },
];

export default function DownloadModal({ open, onClose, onSelect, loading }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {!loading ? (
          <>
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Descargar factura</h3>
              <p className="text-sm text-slate-400 mt-1">Selecciona el formato</p>
            </div>
            <div className="p-4 space-y-2">
              {FORMATS.map(f => (
                <button key={f.id} onClick={() => onSelect(f.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-primary hover:bg-blue-50 transition-all text-left group">
                  <span className={`material-symbols-outlined text-2xl ${
                    f.color === 'emerald' ? 'text-emerald-600' : f.color === 'red' ? 'text-red-600' : 'text-blue-600'
                  }`}>{f.icon}</span>
                  <div>
                    <span className="block font-bold text-slate-700 group-hover:text-primary">{f.label}</span>
                    <span className="text-xs text-slate-500">{f.desc}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 text-right">
              <button onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancelar</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-10 px-6">
            <div className="relative flex items-center justify-center mb-6">
              <svg className="w-24 h-24 -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent"
                  strokeDasharray="251" strokeDashoffset="50"
                  className="text-primary animate-spin" style={{ animationDuration: '1.5s' }} />
              </svg>
              <span className="absolute material-symbols-outlined text-primary text-2xl animate-pulse">download</span>
            </div>
            <p className="text-base font-bold text-slate-800">Generando archivo...</p>
            <p className="text-xs text-slate-400 mt-1">Puede tardar unos segundos</p>
          </div>
        )}
      </div>
    </div>
  );
}
