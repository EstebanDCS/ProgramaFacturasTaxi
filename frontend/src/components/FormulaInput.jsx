import { useState, useRef, useEffect } from 'react';

/**
 * Formula input with function/field picker.
 * Shows available functions and field IDs — user composes the formula.
 */
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

  // Extract field IDs and functions from variables prop
  const fields = (variables || []).filter(v => v.type === 'field');
  const functions = (variables || []).filter(v => v.type === 'function');
  const globals = (variables || []).filter(v => v.type === 'global');

  return (
    <div className="relative" ref={dropRef}>
      <div className="flex gap-1">
        <input ref={inputRef} value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '=subtotal*0.21'}
          className={`flex-1 rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700 focus:ring-violet-400 ${className}`}
          onFocus={() => { if (!value) onChange('='); }} />
        <button type="button" onClick={() => setOpen(!open)}
          className={`px-1.5 rounded-md border text-xs font-bold transition-all flex items-center gap-0.5
            ${open ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-500 border-violet-200 hover:border-violet-400'}`}
          title="Insertar función o variable">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>data_object</span>
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto"
          style={{ minWidth: 300, maxWidth: 380 }}>

          {/* Operators */}
          <div className="p-2 border-b border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Operadores</p>
            <div className="flex gap-1 flex-wrap">
              {['+', '-', '*', '/', '(', ')', '0.01'].map(op => (
                <button key={op} onClick={() => insert(op)}
                  className="px-2 py-1 rounded bg-slate-100 text-xs font-mono font-bold text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors">{op}</button>
              ))}
            </div>
          </div>

          {/* Global variables */}
          {globals.length > 0 && (
            <div className="p-2 border-b border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Variables</p>
              {globals.map(v => (
                <button key={v.key} onClick={() => { insert(v.key); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-50 text-left transition-colors">
                  <code className="text-[10px] font-mono text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">{v.key}</code>
                  <span className="text-[10px] text-slate-500">{v.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Functions */}
          {functions.length > 0 && (
            <div className="p-2 border-b border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Funciones <span className="normal-case font-normal">— haz clic y añade el ID del campo</span></p>
              {functions.map(v => (
                <button key={v.key} onClick={() => insert(v.key)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 text-left transition-colors">
                  <code className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{v.key}<span className="text-amber-400">campo</span></code>
                  <span className="text-[10px] text-slate-500">{v.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Available field IDs */}
          {fields.length > 0 && (
            <div className="p-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Campos disponibles <span className="normal-case font-normal">— IDs para usar en funciones</span></p>
              <div className="flex flex-wrap gap-1">
                {fields.map(v => (
                  <button key={v.key} onClick={() => insert(v.key)}
                    className={`text-[10px] font-mono px-2 py-1 rounded-md border transition-colors
                      ${v.isDate ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400' :
                        'bg-slate-50 text-slate-600 border-slate-200 hover:border-primary hover:text-primary'}`}>
                    {v.key} {v.isDate && <span className="text-[8px]">📅</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!(globals.length || functions.length || fields.length) && (
            <p className="text-xs text-slate-400 text-center py-4">Añade campos en la plantilla para ver opciones</p>
          )}
        </div>
      )}
    </div>
  );
}