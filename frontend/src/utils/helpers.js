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
