/**
 * Live preview of a visual invoice template.
 * Renders a scaled-down HTML representation that updates
 * as the user modifies the builder config.
 */
export default function LivePreview({ config }) {
  if (!config) return <p className="text-xs text-slate-400 text-center py-8">Configura la plantilla para ver la vista previa</p>;

  const emp = config.empresa || {};
  const est = config.estilo || {};
  const cols = (config.columnas || []).filter(c => !c.oculta);
  const imp = config.impuestos?.[0] || { nombre: 'IVA', porcentaje: 21 };
  const c1 = est.color_primario || '#1a2e4a';
  const c2 = est.color_secundario || '#0d6dfd';
  const mon = config.moneda || '€';
  const titulo = config.titulo || 'FACTURA';
  const tam = est.tam_fuente || 10;

  const sampleRows = [
    { _label: 'Servicio profesional', _val: '500.00' },
    { _label: 'Material fungible', _val: '30.00' },
  ];

  const subtotal = 530;
  const impMonto = subtotal * (imp.porcentaje || 0) / 100;
  const total = subtotal + impMonto;

  return (
    <div style={{ fontSize: `${Math.max(tam * 0.55, 5.5)}px`, lineHeight: 1.4, color: '#333', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          {emp.logo_url && <img src={emp.logo_url} style={{ maxHeight: 20, maxWidth: 60, marginBottom: 3 }} alt="" />}
          <div style={{ fontWeight: 800, color: c1, fontSize: `${tam * 0.7}px` }}>{emp.nombre || 'Tu Empresa'}</div>
          {emp.cif && <div style={{ color: '#999', fontSize: `${tam * 0.45}px` }}>{emp.cif}</div>}
          {emp.direccion && <div style={{ color: '#999', fontSize: `${tam * 0.45}px` }}>{emp.direccion}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 900, color: c2, fontSize: `${tam * 0.9}px`, marginBottom: 3 }}>{titulo}</div>
          <div><b>Nº:</b> 2026-0001</div>
          <div><b>Fecha:</b> 20/03/2026</div>
        </div>
      </div>

      {/* Client */}
      {config.cliente?.mostrar !== false && (
        <div style={{ background: '#f5f6fa', padding: '4px 6px', marginBottom: 6, fontSize: `${tam * 0.5}px` }}>
          <div style={{ color: '#999', fontWeight: 700, fontSize: `${tam * 0.4}px`, marginBottom: 1 }}>FACTURAR A:</div>
          <b>Empresa Ejemplo S.L.</b><br />CIF: B12345678
        </div>
      )}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
        <thead>
          <tr style={{ backgroundColor: c1 }}>
            {cols.map((c, i) => (
              <th key={i} style={{ padding: '2px 4px', textAlign: c.alineacion || 'left', color: 'white', fontWeight: 700, fontSize: `${tam * 0.5}px` }}>
                {c.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sampleRows.map((row, ri) => (
            <tr key={ri} style={{ backgroundColor: ri % 2 === 1 ? '#f8f9fb' : 'white' }}>
              {cols.map((c, ci) => (
                <td key={ci} style={{ padding: '2px 4px', textAlign: c.alineacion || 'left', borderBottom: '1px solid #eaedf0', fontSize: `${tam * 0.5}px` }}>
                  {c.tipo === 'texto' ? row._label : (
                    <b>{row._val} {mon}</b>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 6, fontSize: `${tam * 0.5}px` }}>
        {config.mostrar_desglose !== false && <>
          <div style={{ display: 'flex', gap: 12, color: '#888' }}>
            <span>Subtotal</span><b style={{ color: '#333' }}>{subtotal.toFixed(2)} {mon}</b>
          </div>
          <div style={{ display: 'flex', gap: 12, color: '#888' }}>
            <span>{imp.nombre} ({imp.porcentaje}%)</span><b style={{ color: '#333' }}>{impMonto.toFixed(2)} {mon}</b>
          </div>
        </>}
        <div style={{ borderTop: `2px solid ${c1}`, marginTop: 3, paddingTop: 3, display: 'flex', gap: 12 }}>
          <span style={{ fontWeight: 800, color: c1, fontSize: `${tam * 0.6}px` }}>TOTAL</span>
          <b style={{ color: c1, fontSize: `${tam * 0.6}px` }}>{total.toFixed(2)} {mon}</b>
        </div>
      </div>

      {/* Detail sheet indicator */}
      {config.hoja_detalle?.activar && (
        <div style={{ marginTop: 8, padding: '3px 6px', background: '#fef9c3', border: '1px solid #fde68a', fontSize: `${tam * 0.4}px`, color: '#92400e' }}>
          + {sampleRows.length} hojas de detalle ("{config.hoja_detalle.titulo || 'Detalle'}")
        </div>
      )}
    </div>
  );
}
