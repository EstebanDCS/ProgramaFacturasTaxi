let cryptoKey = null;

export async function initCrypto(userId) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(userId), "PBKDF2", false, ["deriveKey"]);
  cryptoKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("gestion-facturas-v2"), iterations: 100000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function cifrar(texto) {
  if (!cryptoKey) return texto;
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(texto));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.length);
  return "ENC:" + btoa(String.fromCharCode(...combined));
}

export async function descifrar(encoded) {
  if (!encoded || !encoded.startsWith("ENC:")) return encoded;
  if (!cryptoKey) return encoded;
  try {
    const data = Uint8Array.from(atob(encoded.slice(4)), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, cryptoKey, data.slice(12));
    return new TextDecoder().decode(pt);
  } catch { return encoded; }
}
