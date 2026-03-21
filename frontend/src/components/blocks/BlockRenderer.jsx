import { BLOCK_TYPES } from '../../utils/blockTypes';

const Inp = ({ label, value, onChange, className = '', ...props }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <label className="text-[11px] font-semibold text-slate-500">{label}</label>
    <input value={value || ''} onChange={e => onChange(e.target.value)}
      className="rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:ring-primary focus:border-primary" {...props} />
  </div>
);

export default function BlockRenderer({ block, onChange }) {
  const { type, config } = block;
  const update = (key, val) => onChange({ ...config, [key]: val });

  switch (type) {
    case 'header':
      return (
        <div className="grid grid-cols-2 gap-3">
          {[['nombre', 'Nombre empresa'], ['cif', 'CIF/NIF'], ['direccion', 'Dirección'], ['telefono', 'Teléfono'], ['email', 'Email'], ['logo_url', 'URL Logo']].map(([k, l]) => (
            <Inp key={k} label={l} value={config[k]} onChange={v => update(k, v)} />
          ))}
        </div>
      );

    case 'client':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.mostrar !== false} onChange={e => update('mostrar', e.target.checked)} className="rounded text-primary" />
          Mostrar sección de cliente en la factura
        </label>
      );

    case 'items_table':
      return <ColumnsEditor columnas={config.columnas || []} onChange={cols => update('columnas', cols)} />;

    case 'totals':
      return <TotalsEditor config={config} update={update} />;

    case 'notes':
      return <Inp label="Placeholder" value={config.placeholder} onChange={v => update('placeholder', v)} />;

    case 'footer':
      return (
        <div className="space-y-3">
          <Inp label="Texto del pie" value={config.texto} onChange={v => update('texto', v)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!config.mostrar_datos_pago} onChange={e => update('mostrar_datos_pago', e.target.checked)} className="rounded text-primary" />
            Mostrar datos de pago
          </label>
          {config.mostrar_datos_pago && <Inp label="Datos de pago" value={config.datos_pago} onChange={v => update('datos_pago', v)} />}
        </div>
      );

    case 'text_field': case 'number_field': case 'currency_field': case 'date_field':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Etiqueta" value={config.label} onChange={v => update('label', v)} />
          <Inp label="ID campo" value={config.campo} onChange={v => update('campo', v)} placeholder="campo_id" />
        </div>
      );

    case 'dropdown':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Inp label="Etiqueta" value={config.label} onChange={v => update('label', v)} />
            <Inp label="ID campo" value={config.campo} onChange={v => update('campo', v)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Opciones (una por línea)</label>
            <textarea value={(config.opciones || []).join('\n')} onChange={e => update('opciones', e.target.value.split('\n'))}
              className="w-full rounded-lg border-slate-200 bg-slate-50 px-3 py-2 text-sm min-h-[60px]" />
          </div>
        </div>
      );

    case 'checkbox':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Etiqueta" value={config.label} onChange={v => update('label', v)} />
          <Inp label="ID campo" value={config.campo} onChange={v => update('campo', v)} />
        </div>
      );

    case 'image_field':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Inp label="Etiqueta" value={config.label} onChange={v => update('label', v)} />
          <Inp label="URL imagen" value={config.url} onChange={v => update('url', v)} />
          <Inp label="Alto máximo (px)" type="number" value={config.max_height} onChange={v => update('max_height', parseInt(v) || 60)} />
        </div>
      );

    default:
      return <p className="text-xs text-slate-400">Bloque sin configuración</p>;
  }
}


// ── Totals editor: multiple taxes, formula support ──
function TotalsEditor({ config, update }) {
  const impuestos = config.impuestos || [{ nombre: 'IVA', porcentaje: 21, formula: '' }];
  const updateImp = (i, field, val) => { const n = [...impuestos]; n[i] = { ...n[i], [field]: val }; update('impuestos', n); };
  const addImp = () => update('impuestos', [...impuestos, { nombre: '', porcentaje: 0, formula: '' }]);
  const removeImp = (i) => update('impuestos', impuestos.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Inp label="Título factura" value={config.titulo} onChange={v => update('titulo', v)} />
        <Inp label="Moneda" value={config.moneda} onChange={v => update('moneda', v)} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={config.mostrar_desglose !== false} onChange={e => update('mostrar_desglose', e.target.checked)} className="rounded text-primary" />
        Mostrar desglose (subtotal + impuestos)
      </label>

      <div>
        <label className="text-[11px] font-semibold text-slate-500 block mb-2">Impuestos / recargos / descuentos</label>
        {impuestos.map((imp, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-3 mb-2 relative group">
            <button onClick={() => removeImp(i)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
            <div className="grid grid-cols-[1fr_80px] gap-2 mb-2">
              <Inp label="Nombre" value={imp.nombre} onChange={v => updateImp(i, 'nombre', v)} placeholder="IVA, IRPF, Descuento..." />
              <Inp label="%" type="number" value={imp.porcentaje} onChange={v => updateImp(i, 'porcentaje', parseFloat(v) || 0)} />
            </div>
            <div>
              <label className="text-[10px] text-violet-500 flex items-center gap-1 mb-1">
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>functions</span>
                Fórmula (opcional, sobreescribe %)
              </label>
              <input value={imp.formula || ''} onChange={e => updateImp(i, 'formula', e.target.value)}
                placeholder="Ej: =subtotal*0.21, =-subtotal*0.15"
                className="w-full rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700" />
            </div>
          </div>
        ))}
        <button onClick={addImp} className="w-full flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-amber-400 hover:text-amber-600 transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Añadir impuesto / recargo
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-700 leading-relaxed">
        <b>Variables disponibles en fórmulas:</b><br/>
        <code className="bg-amber-100 px-1 rounded">subtotal</code> = suma de líneas<br/>
        <code className="bg-amber-100 px-1 rounded">tickets_count</code> = nº de tickets<br/>
        <code className="bg-amber-100 px-1 rounded">tickets_sum_<i>campo</i></code> = suma del campo en todos los tickets<br/>
        <code className="bg-amber-100 px-1 rounded">tickets_avg_<i>campo</i></code> / <code className="bg-amber-100 px-1 rounded">tickets_min_<i>campo</i></code> / <code className="bg-amber-100 px-1 rounded">tickets_max_<i>campo</i></code><br/>
        Ej: <code className="bg-amber-100 px-1 rounded">=subtotal+tickets_sum_importe</code> para sumar líneas + tickets
      </div>
    </div>
  );
}


// ── Columns editor (card layout) ──
function ColumnsEditor({ columnas, onChange }) {
  const addCol = () => onChange([...columnas, { nombre: '', campo: '', alineacion: 'left', tipo: 'texto', formula: '' }]);
  const removeCol = (i) => onChange(columnas.filter((_, idx) => idx !== i));
  const updateCol = (i, field, val) => { const n = [...columnas]; n[i] = { ...n[i], [field]: val }; onChange(n); };
  const loadPreset = (key) => {
    const presets = {
      simple: [
        { nombre: 'Descripción', campo: 'descripcion', alineacion: 'left', tipo: 'texto' },
        { nombre: 'Importe', campo: 'importe', alineacion: 'right', tipo: 'moneda' },
      ],
      detallado: [
        { nombre: 'Descripción', campo: 'descripcion', alineacion: 'left', tipo: 'texto' },
        { nombre: 'Cantidad', campo: 'cantidad', alineacion: 'right', tipo: 'numero' },
        { nombre: 'Precio Ud.', campo: 'precio', alineacion: 'right', tipo: 'moneda' },
        { nombre: 'Total', campo: 'total', alineacion: 'right', tipo: 'formula', formula: '=cantidad*precio' },
      ],
      servicios: [
        { nombre: 'Servicio', campo: 'descripcion', alineacion: 'left', tipo: 'texto' },
        { nombre: 'Horas', campo: 'horas', alineacion: 'right', tipo: 'numero' },
        { nombre: 'Tarifa', campo: 'tarifa', alineacion: 'right', tipo: 'moneda' },
        { nombre: 'Total', campo: 'total', alineacion: 'right', tipo: 'formula', formula: '=horas*tarifa' },
      ],
    };
    onChange([...(presets[key] || presets.simple)]);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-slate-400">Preset:</span>
        {['simple', 'detallado', 'servicios'].map(k => (
          <button key={k} onClick={() => loadPreset(k)}
            className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 hover:bg-primary/10 hover:text-primary transition-colors capitalize">{k}</button>
        ))}
      </div>

      {columnas.map((c, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-2.5 mb-2 relative group">
          <button onClick={() => removeCol(i)} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
          <div className="grid grid-cols-2 gap-2 mb-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Nombre</span>
              <input value={c.nombre} onChange={e => updateCol(i, 'nombre', e.target.value)} placeholder="Descripción"
                className="rounded-md border-slate-200 bg-white px-2 py-1.5 text-xs" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase">ID campo</span>
              <input value={c.campo} onChange={e => updateCol(i, 'campo', e.target.value)} placeholder="campo_id"
                className="rounded-md border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-0.5 w-24">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Alin.</span>
              <select value={c.alineacion} onChange={e => updateCol(i, 'alineacion', e.target.value)} className="rounded-md border-slate-200 bg-white px-1.5 py-1.5 text-xs">
                <option value="left">← Izq</option><option value="center">Centro</option><option value="right">Der →</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5 w-28">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Tipo</span>
              <select value={c.tipo} onChange={e => updateCol(i, 'tipo', e.target.value)} className="rounded-md border-slate-200 bg-white px-1.5 py-1.5 text-xs">
                <option value="texto">Texto</option><option value="numero">Número</option><option value="moneda">Moneda €</option><option value="formula">ƒx Fórmula</option>
              </select>
            </div>
            {c.tipo === 'formula' && (
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-[9px] font-bold text-violet-400 uppercase">Fórmula</span>
                <input value={c.formula || ''} onChange={e => updateCol(i, 'formula', e.target.value)} placeholder="=cantidad*precio"
                  className="rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700" />
              </div>
            )}
          </div>
        </div>
      ))}

      <button onClick={addCol} className="mt-1 w-full flex items-center justify-center gap-1 py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-primary hover:text-primary transition-colors">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Columna
      </button>
    </div>
  );
}