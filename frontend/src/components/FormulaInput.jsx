import { useState, useRef, useEffect } from 'react';

/**
 * Formula input with variable picker dropdown.
 * Shows available variables grouped by source (Factura, Líneas, Tickets).
 * Click a variable to insert it at cursor position.
 */
export default function FormulaInput({ value, onChange, variables, placeholder, className = '' }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const insertVar = (key) => {
    const input = inputRef.current;
    const current = value || '=';
    const start = input?.selectionStart || current.length;
    const before = current.slice(0, start);
    const after = current.slice(start);
    const newVal = (before || '=') + key + after;
    onChange(newVal.startsWith('=') ? newVal : '=' + newVal);
    setOpen(false);
    setTimeout(() => { input?.focus(); input?.setSelectionRange(start + key.length, start + key.length); }, 50);
  };

  // Group variables
  const groups = {};
  (variables || []).filter(v => !filter || v.key.includes(filter) || v.desc.toLowerCase().includes(filter.toLowerCase())).forEach(v => {
    if (!groups[v.group]) groups[v.group] = [];
    groups[v.group].push(v);
  });

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
          title="Insertar variable">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>data_object</span>
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-hidden flex flex-col"
          style={{ minWidth: 280 }}>
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar variable..."
              className="w-full rounded-md border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:ring-primary" autoFocus />
          </div>

          {/* Variables list */}
          <div className="overflow-y-auto flex-1 p-1">
            {Object.entries(groups).map(([group, vars]) => (
              <div key={group}>
                <div className="px-2 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">{group}</div>
                {vars.map(v => (
                  <button key={v.key} onClick={() => insertVar(v.key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-50 text-left transition-colors group">
                    <code className="text-[10px] font-mono text-violet-600 bg-violet-50 group-hover:bg-violet-100 px-1.5 py-0.5 rounded flex-shrink-0">
                      {v.key}
                    </code>
                    <span className="text-[10px] text-slate-500 truncate">{v.desc}</span>
                    {v.isDate && <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1 rounded-full flex-shrink-0">fecha</span>}
                  </button>
                ))}
              </div>
            ))}
            {!Object.keys(groups).length && (
              <p className="text-xs text-slate-400 text-center py-4">
                {(variables || []).length ? 'Sin resultados' : 'Añade tickets con campos numéricos o de fecha para ver variables'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
