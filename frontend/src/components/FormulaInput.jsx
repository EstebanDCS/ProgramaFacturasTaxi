import { useState, useRef, useEffect } from 'react';

export default function FormulaInput({ value, onChange, variables, placeholder, className = '' }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const insert = (text) => {
    const input = inputRef.current;
    const current = value || '=';
    const start = input?.selectionStart || current.length;
    const before = current.slice(0, start);
    const after = current.slice(start);
    const newVal = (before || '=') + text + after;
    onChange(newVal.startsWith('=') ? newVal : '=' + newVal);
    setTimeout(() => { input?.focus(); input?.setSelectionRange(start + text.length, start + text.length); }, 50);
  };

  const globals = (variables || []).filter(v => v.type === 'global');
  const ready = (variables || []).filter(v => v.type === 'ready');

  return (
    <div className="relative" ref={dropRef}>
      <div className="flex gap-1">
        <input ref={inputRef} value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '=subtotal+tickets_sum_importe'}
          className={`flex-1 rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700 focus:ring-violet-400 ${className}`}
          onFocus={() => { if (!value) onChange('='); }} />
        <button type="button" onClick={() => setOpen(!open)}
          className={`px-1.5 rounded-md border text-xs font-bold transition-all flex items-center gap-0.5
            ${open ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-500 border-violet-200 hover:border-violet-400'}`}
          title="Insertar variable">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>data_object</span>
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto"
          style={{ minWidth: 300, maxWidth: 400 }}>

          {/* Operators */}
          <div className="p-2 border-b border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Operadores</p>
            <div className="flex gap-1 flex-wrap">
              {['+', '-', '*', '/', '(', ')'].map(op => (
                <button key={op} onClick={() => insert(op)}
                  className="w-8 h-7 rounded bg-slate-100 text-xs font-mono font-bold text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-center">{op}</button>
              ))}
            </div>
          </div>

          {/* Globals */}
          {globals.length > 0 && (
            <div className="p-2 border-b border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Variables globales</p>
              {globals.map(v => (
                <button key={v.key} onClick={() => { insert(v.key); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-50 text-left transition-colors">
                  <code className="text-[10px] font-mono text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">{v.key}</code>
                  <span className="text-[10px] text-slate-500">{v.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Ready-to-use composed variables */}
          {ready.length > 0 && (
            <div className="p-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Funciones disponibles</p>
              {ready.map(v => (
                <button key={v.key} onClick={() => { insert(v.key); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 text-left transition-colors">
                  <code className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${v.isDate ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>{v.key}</code>
                  <span className="text-[10px] text-slate-500 truncate">{v.desc}</span>
                  {v.isDate && <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1 rounded-full flex-shrink-0">fecha</span>}
                </button>
              ))}
            </div>
          )}

          {!globals.length && !ready.length && (
            <p className="text-xs text-slate-400 text-center py-4">Añade campos en la plantilla para ver funciones</p>
          )}
        </div>
      )}
    </div>
  );
}