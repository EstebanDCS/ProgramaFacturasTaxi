import { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BLOCK_TYPES, CATEGORIES } from '../../utils/blockTypes';
import BlockRenderer from './BlockRenderer';

// ── Palette item ──
export function PaletteItem({ typeKey, typeDef, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${typeKey}`, data: { origin: 'palette', typeKey },
  });
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-300',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-300',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 hover:border-amber-300',
    violet: 'bg-violet-50 text-violet-600 border-violet-100 hover:border-violet-300',
    slate: 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-300',
    coral: 'bg-orange-50 text-orange-600 border-orange-100 hover:border-orange-300',
  };
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd(typeKey)}
      className={`w-full flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing text-left transition-all ${colors[typeDef.color] || colors.slate} ${isDragging ? 'opacity-30 scale-95' : ''}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{typeDef.icon}</span>
      <span className="text-[11px] font-bold truncate">{typeDef.label}</span>
    </div>
  );
}

export function BlockPalette({ onAddBlock }) {
  const [expandedCat, setExpandedCat] = useState('section');
  return (
    <div className="space-y-2">
      {CATEGORIES.map(cat => (
        <div key={cat.id}>
          <button onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{cat.icon}</span>
            <span className="flex-1 text-left">{cat.label}</span>
            <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 14, transform: expandedCat === cat.id ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }}>expand_more</span>
          </button>
          {expandedCat === cat.id && (
            <div className="ml-1 mt-1 space-y-1">
              {Object.entries(BLOCK_TYPES).filter(([_, t]) => t.category === cat.id).map(([key, t]) => (
                <PaletteItem key={key} typeKey={key} typeDef={t} onAdd={onAddBlock} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Insertion zone between blocks ──
function InsertZone({ id, active }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef}
      className={`transition-all duration-150 ${active ? 'py-1' : 'py-0'}`}>
      <div className={`transition-all duration-150 rounded-full mx-4 ${
        isOver ? 'h-1 bg-primary shadow-lg shadow-primary/30' :
        active ? 'h-0.5 bg-primary/20' : 'h-0'
      }`} />
    </div>
  );
}

// ── Visual block ──
function BlockVisual({ block, estilo }) {
  const c1 = estilo?.color_primario || '#1a2e4a';
  const c2 = estilo?.color_secundario || '#0d6dfd';
  const cfg = block.config;
  switch (block.type) {
    case 'header':
      return (
        <div className="flex justify-between items-start py-2">
          <div>
            {cfg.logo_url && <div className="w-12 h-4 bg-slate-200 rounded mb-1" />}
            <div className="font-extrabold text-sm" style={{ color: c1 }}>{cfg.nombre || 'Empresa'}</div>
            <div className="text-[9px] text-slate-400">{[cfg.cif, cfg.direccion].filter(Boolean).join(' · ') || 'CIF · Dirección'}</div>
          </div>
          <div className="text-right">
            <div className="font-black text-lg" style={{ color: c2 }}>FACTURA</div>
            <div className="text-[9px] text-slate-400">Nº: 2026-0001</div>
          </div>
        </div>
      );
    case 'client':
      return cfg.mostrar !== false ? (
        <div className="bg-slate-50 rounded px-3 py-2 text-[10px]">
          <div className="text-[8px] font-bold text-slate-400 mb-0.5">FACTURAR A:</div>
          <div className="text-slate-600">Empresa Ejemplo S.L.</div>
        </div>
      ) : <div className="text-[10px] text-slate-300 italic">Cliente oculto</div>;
    case 'items_table': {
      const cols = (cfg.columnas || []).filter(c => !c.oculta);
      return (
        <div>
          <div className="flex rounded-t overflow-hidden" style={{ backgroundColor: c1 }}>
            {cols.map((c, i) => <div key={i} className="flex-1 px-2 py-1 text-[8px] font-bold text-white" style={{ textAlign: c.alineacion }}>{c.nombre}</div>)}
          </div>
          {['Servicio profesional', 'Material fungible'].map((n, i) => (
            <div key={i} className={`flex ${i % 2 ? 'bg-slate-50' : ''}`}>
              {cols.map((c, j) => <div key={j} className="flex-1 px-2 py-0.5 text-[8px] text-slate-600" style={{ textAlign: c.alineacion }}>{c.tipo === 'texto' ? n : '50.00 €'}</div>)}
            </div>
          ))}
        </div>
      );
    }
    case 'totals':
      return (
        <div className="flex flex-col items-end text-[9px] py-1">
          {cfg.mostrar_desglose !== false && <>
            <div className="flex gap-4"><span className="text-slate-400">Subtotal</span><b>530.00 {cfg.moneda || '€'}</b></div>
            <div className="flex gap-4"><span className="text-slate-400">{cfg.impuestos?.[0]?.nombre || 'IVA'} ({cfg.impuestos?.[0]?.porcentaje || 21}%)</span><b>111.30 {cfg.moneda || '€'}</b></div>
          </>}
          <div className="flex gap-4 mt-1 pt-1 border-t-2" style={{ borderColor: c1 }}>
            <span className="font-black" style={{ color: c1 }}>TOTAL</span>
            <b style={{ color: c1 }}>641.30 {cfg.moneda || '€'}</b>
          </div>
        </div>
      );
    case 'notes': return <div className="text-[9px] text-slate-400 italic py-1">{cfg.placeholder || 'Notas...'}</div>;
    case 'footer': return <div className="text-[9px] text-slate-400 border-t border-slate-200 pt-1">{cfg.texto || 'Pie de página'}</div>;
    case 'text_field': case 'number_field': case 'currency_field': case 'date_field':
      return (
        <div className="flex items-center gap-3 py-1">
          <span className="text-[9px] font-semibold text-slate-600 w-20">{cfg.label || 'Campo'}</span>
          <div className="flex-1 h-6 bg-slate-100 rounded border border-slate-200 px-2 flex items-center text-[8px] text-slate-400">
            {block.type === 'currency_field' ? '0.00 €' : block.type === 'number_field' ? '0' : block.type === 'date_field' ? 'dd/mm/aaaa' : 'texto...'}
          </div>
        </div>
      );
    case 'dropdown':
      return (
        <div className="flex items-center gap-3 py-1">
          <span className="text-[9px] font-semibold text-slate-600 w-20">{cfg.label || 'Seleccionar'}</span>
          <div className="flex-1 h-6 bg-slate-100 rounded border border-slate-200 px-2 flex items-center justify-between text-[8px] text-slate-400">
            <span>{(cfg.opciones || [])[0] || 'Opción...'}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>expand_more</span>
          </div>
        </div>
      );
    case 'checkbox':
      return (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-sm" />
          <span className="text-[9px] font-semibold text-slate-600">{cfg.label || 'Casilla'}</span>
        </div>
      );
    case 'image_field':
      return (
        <div className="flex items-center gap-3 py-1">
          <div className="w-12 h-8 bg-slate-100 border border-slate-200 rounded flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 14 }}>image</span>
          </div>
          <span className="text-[9px] text-slate-400">{cfg.label || 'Imagen'}</span>
        </div>
      );
    default: return <div className="text-[9px] text-slate-400">{BLOCK_TYPES[block.type]?.label || block.type}</div>;
  }
}

// ── Sortable block ──
function SortablePageBlock({ block, estilo, isSelected, onSelect, onUpdate, onRemove, formulaVariables }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const typeDef = BLOCK_TYPES[block.type] || {};
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`relative group rounded-lg transition-all cursor-grab active:cursor-grabbing
        ${isSelected ? 'ring-2 ring-primary bg-blue-50/30' : 'hover:bg-slate-50/50'}`}
      onClick={(e) => { e.stopPropagation(); onSelect(block.id); }}>
      <button onClick={e => { e.stopPropagation(); onRemove(); }} onPointerDown={e => e.stopPropagation()}
        className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 bg-white border border-slate-200 rounded-full w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-all z-10">
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
      </button>
      <div className="px-3 py-2"><BlockVisual block={block} estilo={estilo} /></div>
      {isSelected && (
        <div className="border-t border-primary/20 bg-blue-50/50 px-4 py-3 rounded-b-lg cursor-default"
          onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>{typeDef.icon}</span>
            <span className="text-xs font-bold text-primary">Editar: {typeDef.label}</span>
          </div>
          <BlockRenderer block={block} onChange={newConfig => onUpdate(newConfig)} formulaVariables={formulaVariables} />
        </div>
      )}
    </div>
  );
}

// ── Canvas with insertion zones ──
export function DropCanvas({ canvasId, blocks, onChange, estilo, isTicket, isDraggingFromPalette, formulaVariables }) {
  const [selectedId, setSelectedId] = useState(null);
  const { setNodeRef, isOver } = useDroppable({ id: canvasId || (isTicket ? 'ticket-canvas' : 'main-canvas') });
  const accent = isTicket ? 'border-violet-200' : 'border-slate-200';

  return (
    <div ref={setNodeRef}
      className={`relative bg-white rounded-xl border ${accent} shadow-lg mx-auto p-6 min-h-[200px] transition-all duration-200
        ${isDraggingFromPalette && isOver ? 'ring-2 ring-primary/20' : ''}`}
      style={{ maxWidth: 680 }}
      onClick={() => setSelectedId(null)}>

      {!blocks.length ? (
        <div className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl transition-all duration-200
          ${isDraggingFromPalette ? 'border-primary bg-primary/5' : isTicket ? 'border-violet-200' : 'border-slate-200'} text-slate-300`}>
          <span className="material-symbols-outlined text-3xl mb-2">{isDraggingFromPalette ? 'download' : 'add_circle'}</span>
          <p className="text-xs font-medium">{isDraggingFromPalette ? 'Suelta el bloque aquí' : 'Haz clic en la paleta para añadir bloques'}</p>
        </div>
      ) : (
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {/* Insertion zone before first block */}
          <InsertZone id={`${canvasId || 'main'}-insert-0`} active={isDraggingFromPalette} />

          {blocks.map((block, idx) => (
            <div key={block.id}>
              <SortablePageBlock block={block} estilo={estilo}
                isSelected={selectedId === block.id}
                onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
                onUpdate={cfg => onChange(blocks.map(b => b.id === block.id ? { ...b, config: cfg } : b))}
                onRemove={() => { onChange(blocks.filter(b => b.id !== block.id)); if (selectedId === block.id) setSelectedId(null); }}
                formulaVariables={formulaVariables} />

              {/* Insertion zone after each block */}
              <InsertZone id={`${canvasId || 'main'}-insert-${idx + 1}`} active={isDraggingFromPalette} />
            </div>
          ))}
        </SortableContext>
      )}
    </div>
  );
}