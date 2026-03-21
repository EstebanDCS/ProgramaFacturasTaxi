import { BLOCK_TYPES, COL_PRESETS } from '../../utils/blockTypes';

const Inp = ({ label, value, onChange, ...props }) => (
  <div className="flex flex-col gap-1">
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
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Inp label="Título factura" value={config.titulo} onChange={v => update('titulo', v)} />
          <Inp label="Impuesto" value={config.impuestos?.[0]?.nombre} onChange={v => update('impuestos', [{ ...config.impuestos?.[0], nombre: v }])} />
          <Inp label="%" type="number" value={config.impuestos?.[0]?.porcentaje} onChange={v => update('impuestos', [{ ...config.impuestos?.[0], porcentaje: parseFloat(v) || 0 }])} />
          <Inp label="Moneda" value={config.moneda} onChange={v => update('moneda', v)} />
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={config.mostrar_desglose !== false} onChange={e => update('mostrar_desglose', e.target.checked)} className="rounded text-primary" />
            Mostrar desglose subtotal + impuesto
          </label>
        </div>
      );

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

    case 'detail_sheet':
      return (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!config.activar} onChange={e => update('activar', e.target.checked)} className="rounded text-primary" />
            Generar hoja de detalle por cada línea
          </label>
          {config.activar && <Inp label="Título de la hoja" value={config.titulo} onChange={v => update('titulo', v)} />}
        </div>
      );

    case 'text_field':
    case 'number_field':
    case 'currency_field':
    case 'date_field':
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
        <span className="text-xs text-slate-400">Preset:</span>
        {['simple', 'detallado', 'servicios'].map(k => (
          <button key={k} onClick={() => loadPreset(k)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 hover:bg-primary/10 hover:text-primary transition-colors capitalize">{k}</button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1fr_60px_80px_1fr_24px] gap-1.5 mb-1.5">
        {['Nombre', 'ID', 'Alin.', 'Tipo', 'Fórmula', ''].map(h => (
          <span key={h} className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{h}</span>
        ))}
      </div>
      {columnas.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_60px_80px_1fr_24px] gap-1.5 items-center mb-1">
          <input value={c.nombre} onChange={e => updateCol(i, 'nombre', e.target.value)} className="rounded-md border-slate-200 bg-slate-50 px-2 py-1.5 text-xs" placeholder="Nombre" />
          <input value={c.campo} onChange={e => updateCol(i, 'campo', e.target.value)} className="rounded-md border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono text-slate-500" placeholder="id" />
          <select value={c.alineacion} onChange={e => updateCol(i, 'alineacion', e.target.value)} className="rounded-md border-slate-200 bg-slate-50 px-1 py-1.5 text-xs">
            <option value="left">Izq</option><option value="center">Cen</option><option value="right">Der</option>
          </select>
          <select value={c.tipo} onChange={e => updateCol(i, 'tipo', e.target.value)} className="rounded-md border-slate-200 bg-slate-50 px-1 py-1.5 text-xs">
            <option value="texto">Texto</option><option value="numero">Nº</option><option value="moneda">€</option><option value="formula">ƒx</option>
          </select>
          {c.tipo === 'formula' ? (
            <input value={c.formula || ''} onChange={e => updateCol(i, 'formula', e.target.value)} placeholder="=cant*precio"
              className="rounded-md border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-mono text-violet-700" />
          ) : <span />}
          <button onClick={() => removeCol(i)} className="text-slate-300 hover:text-red-500">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      ))}
      <button onClick={addCol} className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-primary hover:text-primary transition-colors">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Columna
      </button>
    </div>
  );
}
