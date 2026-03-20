import { API_URL } from '../config';

let showReconnectCallback = null;

export function setReconnectCallback(cb) {
  showReconnectCallback = cb;
}

export function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

export async function apiFetch(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    if (r.status === 502 || r.status === 503) throw new Error("server_down");
    return r;
  } catch (e) {
    if (e.name === "TypeError" || e.message === "server_down" || e.name === "AbortError") {
      if (showReconnectCallback) await showReconnectCallback();
      return fetch(url, opts);
    }
    throw e;
  }
}

export async function waitForBackend(onProgress) {
  let pct = 10;
  const msgs = ["Despertando el servidor...", "Casi listo...", "Conectando..."];
  for (let i = 0; i < 20; i++) {
    try {
      if (onProgress) onProgress(Math.min(pct, 90), i > 2 ? msgs[Math.min(i - 3, 2)] : "Conectando...");
      const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        if (onProgress) onProgress(100, "Conectado");
        return true;
      }
    } catch {}
    pct += Math.random() * 12 + 3;
    await new Promise(r => setTimeout(r, 2000));
  }
  if (onProgress) onProgress(100, "El servidor tarda más de lo normal. Recarga la página.");
  return false;
}
