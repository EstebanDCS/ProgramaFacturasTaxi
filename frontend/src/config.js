const PROD_HOSTNAME = "programa-facturas-taxi.vercel.app";
const isProd = typeof window !== 'undefined' && window.location.hostname === PROD_HOSTNAME;

export const API_URL = isProd
  ? "https://programafacturas.onrender.com"
  : "https://programafacturas-dev.onrender.com";

export const SUPABASE_URL = "https://aghojuugmunegqpdjgfm.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaG9qdXVnbXVuZWdxcGRqZ2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NzQ1NTgsImV4cCI6MjA4OTQ1MDU1OH0.FMfXxOMxu15IPKRG63uo6z1iG9vUq1P16MSeA2t6Szc";

export const COL_PRESETS = {
  simple: [
    { nombre: "Descripción", campo: "descripcion", alineacion: "left", tipo: "texto" },
    { nombre: "Importe", campo: "importe", alineacion: "right", tipo: "moneda" },
  ],
  detallado: [
    { nombre: "Descripción", campo: "descripcion", alineacion: "left", tipo: "texto" },
    { nombre: "Cantidad", campo: "cantidad", alineacion: "right", tipo: "numero" },
    { nombre: "Precio Ud.", campo: "precio", alineacion: "right", tipo: "moneda" },
    { nombre: "Total", campo: "total", alineacion: "right", tipo: "formula", formula: "=cantidad*precio" },
  ],
  servicios: [
    { nombre: "Servicio", campo: "descripcion", alineacion: "left", tipo: "texto" },
    { nombre: "Horas", campo: "horas", alineacion: "right", tipo: "numero" },
    { nombre: "Tarifa", campo: "tarifa", alineacion: "right", tipo: "moneda" },
    { nombre: "Total", campo: "total", alineacion: "right", tipo: "formula", formula: "=horas*tarifa" },
  ],
};
