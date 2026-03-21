import { useState } from 'react';
import {
  DndContext, closestCenter, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BLOCK_TYPES, CATEGORIES, createBlock } from '../../utils/blockTypes';
import BlockRenderer from './BlockRenderer';


// ── Palette item (draggable + clickable) ──
function PaletteItem({ typeKey, typeDef, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${typeKey}`,
    data: { type: 'palette', typeKey },
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
    <div ref={setNodeRef} {...attributes} {...listeners}
      onClick={() => onAdd(typeKey)}
      className={`w-full flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing text-left transition-all ${colors[typeDef.color] || colors.slate} ${isDragging ? 'opacity-40' : ''}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{typeDef.icon}</span>
      <span className="text-[11px] font-bold truncate">{typeDef.label}</span>
    </div>
  );
}


// ── Block palette (left panel) ──
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


// ── Sortable block on canvas ──
function SortableBlock({ block, onUpdate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const [open, setOpen] = useState(true);
  const typeDef = BLOCK_TYPES[block.type] || {};
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const borderColors = {
    blue: 'border-l-blue-400', emerald: 'border-l-emerald-400', amber: 'border-l-amber-400',
    violet: 'border-l-violet-400', slate: 'border-l-slate-400', coral: 'border-l-orange-400',
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-white rounded-xl border border-slate-200 shadow-sm mb-3 overflow-hidden border-l-4 ${borderColors[typeDef.color] || 'border-l-slate-300'}`}>
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50/50 transition-colors" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <span {...attributes} {...listeners} className="material-symbols-outlined text-slate-300 cursor-grab active:cursor-grabbing" style={{ fontSize: 18 }}>drag_indicator</span>
          <span className="material-symbols-outlined text-primary/70" style={{ fontSize: 16 }}>{typeDef.icon}</span>
          <span className="text-sm font-bold text-slate-700">{typeDef.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={e => { e.stopPropagation(); onRemove(); }} className="text-slate-300 hover:text-red-500 p-1 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span></button>
          <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 16, transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }}>expand_more</span>
        </div>
      </div>
      {open && <div className="px-4 pb-4 pt-1"><BlockRenderer block={block} onChange={newConfig => onUpdate(newConfig)} /></div>}
    </div>
  );
}


// ── Drop zone indicator ──
function CanvasDropZone({ children, isEmpty }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop' });
  return (
    <div ref={setNodeRef} className={`min-h-[200px] rounded-xl transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-dashed' : ''}`}>
      {isEmpty ? (
        <div className={`flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-slate-200'} text-slate-300`}>
          <span className="material-symbols-outlined text-4xl mb-3">{isOver ? 'download' : 'add_circle'}</span>
          <p className="text-sm font-medium">{isOver ? 'Suelta para añadir' : 'Arrastra bloques aquí o haz clic en la paleta'}</p>
        </div>
      ) : children}
    </div>
  );
}


// ── Drag overlay (ghost element while dragging) ──
function DragGhost({ typeKey }) {
  const t = BLOCK_TYPES[typeKey];
  if (!t) return null;
  return (
    <div className="bg-white border border-primary shadow-xl rounded-xl px-4 py-3 flex items-center gap-2 opacity-90 pointer-events-none w-56">
      <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>{t.icon}</span>
      <span className="text-sm font-bold text-slate-800">{t.label}</span>
    </div>
  );
}


// ── Main canvas with shared DndContext ──
export function DragCanvas({ blocks, onChange, paletteContent }) {
  const [draggingType, setDraggingType] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (event) => {
    const { active } = event;
    if (active.data.current?.type === 'palette') {
      setDraggingType(active.data.current.typeKey);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setDraggingType(null);

    // Drop from palette onto canvas
    if (active.data.current?.type === 'palette') {
      if (over) {
        const newBlock = createBlock(active.data.current.typeKey);
        if (newBlock) onChange([...blocks, newBlock]);
      }
      return;
    }

    // Reorder within canvas
    if (over && active.id !== over.id) {
      const oldIdx = blocks.findIndex(b => b.id === active.id);
      const newIdx = blocks.findIndex(b => b.id === over.id);
      if (oldIdx >= 0 && newIdx >= 0) onChange(arrayMove(blocks, oldIdx, newIdx));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Palette */}
        {paletteContent && (
          <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto">
            <div className="p-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bloques</p>
            </div>
            <div className="p-2">{paletteContent}</div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <CanvasDropZone isEmpty={!blocks.length}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map(block => (
                <SortableBlock key={block.id} block={block}
                  onUpdate={cfg => onChange(blocks.map(b => b.id === block.id ? { ...b, config: cfg } : b))}
                  onRemove={() => onChange(blocks.filter(b => b.id !== block.id))} />
              ))}
            </SortableContext>
          </CanvasDropZone>
        </div>
      </div>

      <DragOverlay>
        {draggingType && <DragGhost typeKey={draggingType} />}
      </DragOverlay>
    </DndContext>
  );
}