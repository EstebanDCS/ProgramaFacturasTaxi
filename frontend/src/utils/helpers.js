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
 * Build formula context with ALL available variables from lines and tickets.
 * Generates aggregates for every numeric/currency field AND date fields.
 * Returns { variables, ctx } where variables is a descriptive list for the UI.
 */
export function buildFormulaContext(subtotal, tickets, ticketCampos, lineas, columnas) {
  const ctx = { subtotal: subtotal || 0 };
  const variables = [
    { key: 'subtotal', desc: 'Suma de líneas', group: 'Factura' },
  ];

  // Line column totals
  (columnas || []).filter(c => c.tipo === 'numero' || c.tipo === 'moneda' || c.tipo === 'formula').forEach(c => {
    const sum = (lineas || []).reduce((s, l) => s + (parseFloat(l[c.campo]) || 0), 0);
    ctx[`lineas_sum_${c.campo}`] = sum;
    ctx[`lineas_count`] = (lineas || []).length;
    variables.push({ key: `lineas_sum_${c.campo}`, desc: `Suma "${c.nombre}"`, group: 'Líneas' });
  });

  // Ticket aggregates
  const tix = tickets || [];
  ctx.tickets_count = tix.length;
  if (tix.length) variables.push({ key: 'tickets_count', desc: 'Nº de tickets', group: 'Tickets' });

  (ticketCampos || []).forEach(c => {
    const isNum = c.tipo === 'moneda' || c.tipo === 'numero';
    const isDate = c.tipo === 'fecha';

    if (isNum) {
      const vals = tix.map(t => parseFloat(t[c.campo]) || 0);
      const sum = vals.reduce((s, v) => s + v, 0);
      ctx[`tickets_sum_${c.campo}`] = sum;
      ctx[`tickets_avg_${c.campo}`] = vals.length ? sum / vals.length : 0;
      ctx[`tickets_min_${c.campo}`] = vals.length ? Math.min(...vals) : 0;
      ctx[`tickets_max_${c.campo}`] = vals.length ? Math.max(...vals) : 0;
      variables.push(
        { key: `tickets_sum_${c.campo}`, desc: `Suma "${c.nombre}"`, group: 'Tickets' },
        { key: `tickets_avg_${c.campo}`, desc: `Media "${c.nombre}"`, group: 'Tickets' },
        { key: `tickets_min_${c.campo}`, desc: `Mínimo "${c.nombre}"`, group: 'Tickets' },
        { key: `tickets_max_${c.campo}`, desc: `Máximo "${c.nombre}"`, group: 'Tickets' },
      );
    }

    if (isDate) {
      const dates = tix.map(t => t[c.campo]).filter(Boolean).sort();
      ctx[`tickets_min_${c.campo}`] = dates[0] || '';
      ctx[`tickets_max_${c.campo}`] = dates[dates.length - 1] || '';
      // For date: not usable in math formulas, but usable as auto-fill values
      variables.push(
        { key: `tickets_min_${c.campo}`, desc: `Fecha más antigua "${c.nombre}"`, group: 'Tickets (fechas)', isDate: true },
        { key: `tickets_max_${c.campo}`, desc: `Fecha más reciente "${c.nombre}"`, group: 'Tickets (fechas)', isDate: true },
      );
    }
  });

  return { ctx, variables };
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
 * Resolve a variable reference (for non-math fields like dates)
 * Usage: put =tickets_max_fecha in a date field
 */
export function resolveVariable(formula, ctx) {
  if (!formula || !formula.startsWith('=')) return formula;
  const key = formula.slice(1).trim();
  return ctx[key] !== undefined ? ctx[key] : formula;
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