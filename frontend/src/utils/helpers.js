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
 * Build a context object with all available variables for formulas.
 *   subtotal            — sum of line items
 *   tickets_count       — number of tickets
 *   tickets_sum_X       — sum of field X across all tickets
 *   tickets_avg_X       — average of field X
 *   tickets_min_X / tickets_max_X
 */
export function buildFormulaContext(subtotal, tickets, ticketCampos) {
  const ctx = { subtotal: subtotal || 0 };
  const tix = tickets || [];
  ctx.tickets_count = tix.length;
  const numCampos = (ticketCampos || []).filter(c => c.tipo === 'moneda' || c.tipo === 'numero');
  numCampos.forEach(c => {
    const vals = tix.map(t => parseFloat(t[c.campo]) || 0);
    const sum = vals.reduce((s, v) => s + v, 0);
    ctx[`tickets_sum_${c.campo}`] = sum;
    ctx[`tickets_avg_${c.campo}`] = vals.length ? sum / vals.length : 0;
    ctx[`tickets_min_${c.campo}`] = vals.length ? Math.min(...vals) : 0;
    ctx[`tickets_max_${c.campo}`] = vals.length ? Math.max(...vals) : 0;
  });
  return ctx;
}

/**
 * Evaluate a formula using a context of named variables (longest-first replacement)
 */
export function evalWithContext(formula, ctx) {
  if (!formula || !formula.startsWith('=')) return null;
  let expr = formula.slice(1).trim();
  const keys = Object.keys(ctx).sort((a, b) => b.length - a.length);
  for (const key of keys) expr = expr.replaceAll(key, String(ctx[key] || 0));
  if (/^[\d\s.+\-*/()]+$/.test(expr)) {
    try { return new Function(`return (${expr})`)(); } catch { return 0; }
  }
  return 0;
}

/**
 * Compute all formula columns in all lines
 */
export function computeLineas(lineas, columnas) {
  const formulaCols = (columnas || []).filter(c => c.tipo === 'formula' && c.formula);
  return lineas.map(linea => {
    const computed = { ...linea };
    formulaCols.forEach(c => { computed[c.campo] = evalFormulaClient(c.formula, computed); });
    return computed;
  });
}

/**
 * Calculate subtotal from lines
 */
export function calcSubtotal(lineas, columnas) {
  const cols = columnas || [];
  const totalCol = cols.find(c => c.tipo === 'formula') || cols.find(c => c.tipo === 'moneda') || cols.findLast(c => c.tipo === 'numero');
  if (!totalCol) return 0;
  return lineas.reduce((sum, l) => sum + (parseFloat(l[totalCol.campo]) || 0), 0);
}

/**
 * Calculate taxes with formula context (supports ticket variables)
 */
export function calcTotales(subtotal, impuestos, formulaCtx) {
  const ctx = formulaCtx || { subtotal };
  const taxes = (impuestos || []).map(imp => {
    let monto;
    if (imp.formula && imp.formula.startsWith('=')) {
      monto = evalWithContext(imp.formula, ctx);
    } else {
      monto = subtotal * (imp.porcentaje || 0) / 100;
    }
    return { nombre: imp.nombre || 'IVA', porcentaje: imp.porcentaje || 0, monto, hasFormula: !!imp.formula };
  });
  const totalImpuestos = taxes.reduce((s, t) => s + t.monto, 0);
  return { subtotal, taxes, totalImpuestos, total: subtotal + totalImpuestos };
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
 * Format number as currency
 */
export function fmt(num, moneda = '€') {
  return `${(num || 0).toFixed(2)} ${moneda}`;
}