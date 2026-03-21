export function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

export function descargarBlob(blob, header, nombre, formato) {
  let fn = nombre;
  if (header?.includes("filename=")) fn = header.split("filename=")[1].replace(/["']/g, "");
  else fn += formato === "excel" ? ".xlsm" : formato === "pdf" ? ".pdf" : ".zip";
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = fn;
  a.click();
  URL.revokeObjectURL(u);
}

/**
 * Evaluate a formula within a single line (e.g. =cantidad*precio)
 */
export function evalFormulaClient(formula, linea) {
  if (!formula || !formula.startsWith("=")) return "";
  let expr = formula.slice(1).trim();
  for (const [campo, valor] of Object.entries(linea).sort((a, b) => b[0].length - a[0].length)) {
    const num = parseFloat(valor) || 0;
    expr = expr.replaceAll(campo, String(num));
  }
  if (/^[\d\s.+\-*/()]+$/.test(expr)) {
    try { return new Function(`return (${expr})`)().toFixed(2); } catch { return "0.00"; }
  }
  return "0.00";
}

/**
 * Compute all formula columns in all lines, returns new array with computed values
 */
export function computeLineas(lineas, columnas) {
  const formulaCols = (columnas || []).filter(c => c.tipo === 'formula' && c.formula);
  return lineas.map(linea => {
    const computed = { ...linea };
    formulaCols.forEach(c => {
      computed[c.campo] = evalFormulaClient(c.formula, computed);
    });
    return computed;
  });
}

/**
 * Calculate subtotal: sum the last numeric/formula/moneda column across all lines
 */
export function calcSubtotal(lineas, columnas) {
  // Find the "total" column: prefer formula, then moneda, then last numeric
  const cols = columnas || [];
  const totalCol = cols.find(c => c.tipo === 'formula') || cols.find(c => c.tipo === 'moneda') || cols.findLast(c => c.tipo === 'numero');
  if (!totalCol) return 0;
  return lineas.reduce((sum, l) => sum + (parseFloat(l[totalCol.campo]) || 0), 0);
}

/**
 * Calculate taxes and grand total
 */
export function calcTotales(subtotal, impuestos) {
  const taxes = (impuestos || []).map(imp => ({
    nombre: imp.nombre || 'IVA',
    porcentaje: imp.porcentaje || 0,
    monto: subtotal * (imp.porcentaje || 0) / 100,
  }));
  const totalImpuestos = taxes.reduce((s, t) => s + t.monto, 0);
  return {
    subtotal,
    taxes,
    totalImpuestos,
    total: subtotal + totalImpuestos,
  };
}

/**
 * Sum currency/number fields across all tickets
 */
export function calcTicketsSummary(tickets, campos) {
  if (!tickets?.length || !campos?.length) return { count: 0, sumas: {} };
  const numCampos = campos.filter(c => c.tipo === 'moneda' || c.tipo === 'numero');
  const sumas = {};
  numCampos.forEach(c => {
    sumas[c.campo] = { nombre: c.nombre, total: tickets.reduce((s, t) => s + (parseFloat(t[c.campo]) || 0), 0) };
  });
  return { count: tickets.length, sumas };
}

/**
 * Format a number as currency
 */
export function fmt(num, moneda = '€') {
  return `${(num || 0).toFixed(2)} ${moneda}`;
}