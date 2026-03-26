import { useState, useRef, useEffect } from 'react';

const FUNCTIONS = [
  { id: 'sum', label: 'Suma', icon: 'add', desc: 'Suma de valores', types: ['moneda', 'numero', 'currency_field', 'number_field'] },
  { id: 'avg', label: 'Media', icon: 'percent', desc: 'Media aritmética', types: ['moneda', 'numero', 'currency_field', 'number_field'] },
  { id: 'max', label: 'Máximo', icon: 'arrow_upward', desc: 'Mayor valor o fecha más reciente', types: ['moneda', 'numero', 'fecha', 'currency_field', 'number_field', 'date_field'] },
  { id: 'min', label: 'Mínimo', icon: 'arrow_downward', desc: 'Menor valor o fecha más antigua', types: ['moneda', 'numero', 'fecha', 'currency_field', 'number_field', 'date_field'] },
  { id: 'join', label: 'Unir', icon: 'link', desc: 'Concatenar textos separados por coma', types: ['texto', 'numero', 'moneda', 'text_field', 'number_field', 'currency_field'] },
  { id: 'count', label: 'Contar', icon: 'tag', desc: 'Número de elementos', types: ['_all'] },
];

/**
 * FormulaInput — dual mode: visual selectors or raw formula text.
 * Props:
 *   value       — current formula string (e.g. "=tickets_max_fecha_servicio")
 *   onChange     — callback(newFormula)
 *   variables    — available variables from CrearPlantilla
 *   ticketFields — array of { campo, label, tipo } from ticket blocks
 *   placeholder  — placeholder text
 */
export default function FormulaInput({ value, onChange, variables, ticketFields, placeholder, className = '' }) {
  const [mode, setMode] = useState('visual'); // 'visual' | 'formula'
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Parse existing formula into visual state
  const parsed = parseFormula(value, ticketFields);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const setVisual = (fn, campo) => {
    if (!fn || !campo) { onChange(''); return; }
    if (fn === 'count') { onChange('=tickets_count'); return; }
    onChange(`=tickets_${fn}_${campo}`);
  };

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

  const fields = ticketFields || [];
  const globals = (variables || []).filter(v => v.type === 'global');
  const ready = (variables || []).filter(v => v.type === 'ready');

  // Which functions are compatible with the selected field?
  const selectedField = fields.find(f => f.campo === parsed.campo);
  const compatFns = selectedField
    ? FUNCTIONS.filter(fn => fn.types.includes('_all') || fn.types.includes(selectedField.tipo))
    : FUNCTIONS;

  return (
    <div className="space-y-1">
      {/* Mode toggle */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMode('visual')}
          className={`text-[9px] font-bold px-2 py-0.5 rounded-l transition-colors ${mode === 'visual' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}>
          Visual
        </button>
        <button type="button" onClick={() => setMode('formula')}
          className={`text-[9px] font-bold px-2 py-0.5 rounded-r transition-colors ${mode === 'formula' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}>
          ƒx Fórmula
        </button>
        {value && <code className="text-[9px] text-violet-400 ml-2 truncate max-w-[200px]">{value}</code>}
      </div>

      {/* Visual mode */}
      {mode === 'visual' && (
        <div className="flex gap-2 items-end">
          <div className="flex flex-col gap-0.5 w-28">
            <span className="text-[9px] font-bold text-slate-400">Función</span>
            <select value={parsed.fn} onChange={e => setVisual(e.target.value, parsed.campo)}
              className="rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-700">
              <option value="">—</option>
              {compatFns.map(fn => <option key={fn.id} value={fn.id}>{fn.label}</option>)}
            </select>
          </div>
          {parsed.fn !== 'count' && (
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="text-[9px] font-bold text-slate-400">Campo (de tickets)</span>
              <select value={parsed.campo} onChange={e => setVisual(parsed.fn, e.target.value)}
                className="rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-700">
                <option value="">Seleccionar...</option>
                {fields.map(f => (
                  <option key={f.campo} value={f.campo}>
                    {f.label || f.campo} ({f.tipo})
                  </option>
                ))}
              </select>
            </div>
          )}
          {value && (
            <button onClick={() => onChange('')} className="text-slate-300 hover:text-red-500 pb-1" title="Quitar">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
        </div>
      )}

      {/* Formula mode */}
      {mode === 'formula' && (
        <div className="relative" ref={dropRef}>
          <div className="flex gap-1">
            <input ref={inputRef} value={value || ''} onChange={e => onChange(e.target.value)}
              placeholder={placeholder || '=tickets_sum_importe'}
              className={`flex-1 rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700 focus:ring-violet-400 ${className}`}
              onFocus={() => { if (!value) onChange('='); }} />
            <button type="button" onClick={() => setOpen(!open)}
              className={`px-1.5 rounded-md border text-xs font-bold transition-all flex items-center gap-0.5
                ${open ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-500 border-violet-200 hover:border-violet-400'}`}>
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
              {ready.length > 0 && (
                <div className="p-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5">Funciones</p>
                  {ready.map(v => (
                    <button key={v.key} onClick={() => { insert(v.key); setOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 text-left transition-colors">
                      <code className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${v.isDate ? 'text-emerald-700 bg-emerald-50' : v.isText ? 'text-blue-700 bg-blue-50' : 'text-amber-700 bg-amber-50'}`}>{v.key}</code>
                      <span className="text-[10px] text-slate-500 truncate">{v.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseFormula(formula, fields) {
  if (!formula || !formula.startsWith('=')) return { fn: '', campo: '' };
  const expr = formula.slice(1).trim();
  if (expr === 'tickets_count') return { fn: 'count', campo: '' };
  const m = expr.match(/^tickets_(sum|avg|max|min|join)_(.+)$/);
  if (m) return { fn: m[1], campo: m[2] };
  return { fn: '', campo: '' };
}