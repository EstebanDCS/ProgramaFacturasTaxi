/**
 * Block type definitions for the visual invoice builder.
 *
 * Categories:
 *   section  — structural blocks (header, table, totals, footer)
 *   data     — single field blocks (text, number, currency, date)
 *   interactive — blocks with user interaction (dropdown, checkbox, image)
 */

export const BLOCK_TYPES = {
  // ── Section blocks ──
  header: {
    category: 'section',
    icon: 'business',
    label: 'Cabecera empresa',
    color: 'blue',
    defaultConfig: {
      nombre: '', cif: '', direccion: '', telefono: '', email: '', logo_url: '',
    },
  },
  client: {
    category: 'section',
    icon: 'person',
    label: 'Datos cliente',
    color: 'emerald',
    defaultConfig: { mostrar: true },
  },
  items_table: {
    category: 'section',
    icon: 'view_column',
    label: 'Tabla de líneas',
    color: 'blue',
    defaultConfig: {
      columnas: [
        { nombre: 'Descripción', campo: 'descripcion', alineacion: 'left', tipo: 'texto' },
        { nombre: 'Importe', campo: 'importe', alineacion: 'right', tipo: 'moneda' },
      ],
    },
  },
  totals: {
    category: 'section',
    icon: 'functions',
    label: 'Totales + impuestos',
    color: 'amber',
    defaultConfig: {
      titulo: 'FACTURA', moneda: '€', mostrar_desglose: true,
      impuestos: [{ nombre: 'IVA', porcentaje: 21 }],
    },
  },
  notes: {
    category: 'section',
    icon: 'sticky_note_2',
    label: 'Notas / observaciones',
    color: 'slate',
    defaultConfig: { placeholder: 'Condiciones de pago...' },
  },
  footer: {
    category: 'section',
    icon: 'article',
    label: 'Pie de página',
    color: 'slate',
    defaultConfig: { texto: '', mostrar_datos_pago: false, datos_pago: '' },
  },
  detail_sheet: {
    category: 'section',
    icon: 'auto_awesome',
    label: 'Hoja de detalle',
    color: 'violet',
    defaultConfig: { activar: false, titulo: 'Detalle' },
  },

  // ── Data blocks ──
  text_field: {
    category: 'data',
    icon: 'text_fields',
    label: 'Campo de texto',
    color: 'slate',
    defaultConfig: { label: 'Texto', campo: '', placeholder: '' },
  },
  number_field: {
    category: 'data',
    icon: 'pin',
    label: 'Campo numérico',
    color: 'blue',
    defaultConfig: { label: 'Número', campo: '', min: 0, max: 999999 },
  },
  currency_field: {
    category: 'data',
    icon: 'euro',
    label: 'Campo moneda',
    color: 'amber',
    defaultConfig: { label: 'Importe', campo: '', moneda: '€' },
  },
  date_field: {
    category: 'data',
    icon: 'calendar_today',
    label: 'Campo fecha',
    color: 'emerald',
    defaultConfig: { label: 'Fecha', campo: '' },
  },

  // ── Interactive blocks ──
  dropdown: {
    category: 'interactive',
    icon: 'arrow_drop_down_circle',
    label: 'Desplegable',
    color: 'violet',
    defaultConfig: { label: 'Seleccionar', campo: '', opciones: ['Opción 1', 'Opción 2'] },
  },
  checkbox: {
    category: 'interactive',
    icon: 'check_box',
    label: 'Casilla verificación',
    color: 'emerald',
    defaultConfig: { label: 'Activar', campo: '' },
  },
  image_field: {
    category: 'interactive',
    icon: 'image',
    label: 'Imagen / logo',
    color: 'coral',
    defaultConfig: { label: 'Imagen', url: '', max_height: 60 },
  },
};

export const CATEGORIES = [
  { id: 'section', label: 'Secciones', icon: 'dashboard' },
  { id: 'data', label: 'Datos', icon: 'input' },
  { id: 'interactive', label: 'Interactivos', icon: 'touch_app' },
];

/**
 * Creates a new block instance from a type key.
 */
export function createBlock(typeKey) {
  const type = BLOCK_TYPES[typeKey];
  if (!type) return null;
  return {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: typeKey,
    config: JSON.parse(JSON.stringify(type.defaultConfig)),
  };
}
