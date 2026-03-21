import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BLOCK_TYPES, CATEGORIES, createBlock } from '../../utils/blockTypes';
import BlockRenderer from './BlockRenderer';

/**
 * Block palette — left panel with available blocks to add
 */
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
              {Object.entries(BLOCK_TYPES).filter(([_, t]) => t.category === cat.id).map(([key, t]) => {
                const colors = {
                  blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-300',
                  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-300',
                  amber: 'bg-amber-50 text-amber-600 border-amber-100 hover:border-amber-300',
                  violet: 'bg-violet-50 text-violet-600 border-violet-100 hover:border-violet-300',
                  slate: 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-300',
                  coral: 'bg-orange-50 text-orange-600 border-orange-100 hover:border-orange-300',
                };
                return (
                  <button key={key} onClick={() => onAddBlock(key)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${colors[t.color] || colors.slate}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
                    <span className="text-[11px] font-bold truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


/**
 * Sortable block item on the canvas
 */
function SortableBlock({ block, onUpdate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const [open, setOpen] = useState(true);
  const typeDef = BLOCK_TYPES[block.type] || {};

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const colorMap = {
    blue: 'border-l-blue-400',
    emerald: 'border-l-emerald-400',
    amber: 'border-l-amber-400',
    violet: 'border-l-violet-400',
    slate: 'border-l-slate-400',
    coral: 'border-l-orange-400',
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-white rounded-xl border border-slate-200 shadow-sm mb-3 overflow-hidden border-l-4 ${colorMap[typeDef.color] || 'border-l-slate-300'}`}>
      {/* Header - drag handle */}
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2" {...attributes} {...listeners}>
          <span className="material-symbols-outlined text-slate-300 cursor-grab active:cursor-grabbing" style={{ fontSize: 18 }}>drag_indicator</span>
          <span className="material-symbols-outlined text-primary/70" style={{ fontSize: 16 }}>{typeDef.icon}</span>
          <span className="text-sm font-bold text-slate-700">{typeDef.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-slate-300 hover:text-red-500 p-1 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
          <span className="material-symbols-outlined text-slate-300 transition-transform"
            style={{ fontSize: 16, transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>expand_more</span>
        </div>
      </div>
      {/* Body */}
      {open && (
        <div className="px-4 pb-4 pt-1">
          <BlockRenderer block={block} onChange={(newConfig) => onUpdate(newConfig)} />
        </div>
      )}
    </div>
  );
}


/**
 * Main drag canvas — receives blocks, allows reorder and edit
 */
export function DragCanvas({ blocks, onChange }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  };

  const updateBlock = (id, newConfig) => {
    onChange(blocks.map(b => b.id === id ? { ...b, config: newConfig } : b));
  };

  const removeBlock = (id) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  if (!blocks.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-xl text-slate-300">
        <span className="material-symbols-outlined text-4xl mb-3">add_circle</span>
        <p className="text-sm font-medium">Añade bloques desde el panel izquierdo</p>
        <p className="text-xs mt-1">Haz clic en los bloques para agregarlos</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map(block => (
          <SortableBlock key={block.id} block={block}
            onUpdate={(cfg) => updateBlock(block.id, cfg)}
            onRemove={() => removeBlock(block.id)} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
