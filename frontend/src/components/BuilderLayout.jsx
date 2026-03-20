import { useState } from 'react';

/**
 * 3-panel layout for the template builder:
 *   Left: Block palette (collapsible)
 *   Center: Canvas / editor
 *   Right: Live preview (collapsible)
 *
 * Usage:
 *   <BuilderLayout
 *     palette={<BlockPalette />}
 *     canvas={<CanvasEditor />}
 *     preview={<LivePreview />}
 *     title="Crear Plantilla"
 *     onBack={() => navigate('plantillas')}
 *   />
 */
export default function BuilderLayout({ palette, canvas, preview, title, subtitle, onBack, actions }) {
  const [showPalette, setShowPalette] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  return (
    <div className="animate-fadeIn flex flex-col h-[calc(100vh-3rem)]">
      {/* Top bar */}
      <header className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Panel toggles */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg mr-2">
            <button onClick={() => setShowPalette(!showPalette)}
              title="Panel bloques"
              className={`p-1.5 rounded-md transition-colors ${showPalette ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>widgets</span>
            </button>
            <button onClick={() => setShowPreview(!showPreview)}
              title="Vista previa"
              className={`p-1.5 rounded-md transition-colors ${showPreview ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility</span>
            </button>
          </div>
          {/* Action buttons */}
          {actions}
        </div>
      </header>

      {/* 3-panel body */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Left: Palette */}
        {showPalette && palette && (
          <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto transition-all duration-200">
            <div className="p-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bloques</p>
            </div>
            <div className="p-2">
              {palette}
            </div>
          </div>
        )}

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {canvas}
        </div>

        {/* Right: Preview */}
        {showPreview && preview && (
          <div className="w-80 flex-shrink-0 flex flex-col transition-all duration-200">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vista previa</p>
                <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 16 }}>refresh</span>
              </div>
              <div className="flex-1 overflow-auto p-3">
                {preview}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * Block item for the palette - draggable in future phases
 */
export function PaletteBlock({ icon, label, description, color = 'slate', onClick }) {
  const colorMap = {
    slate: 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300',
    blue: 'bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400',
    violet: 'bg-violet-50 text-violet-600 border-violet-200 hover:border-violet-400',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:border-emerald-400',
    amber: 'bg-amber-50 text-amber-600 border-amber-200 hover:border-amber-400',
    red: 'bg-red-50 text-red-600 border-red-200 hover:border-red-400',
  };

  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left mb-1.5 ${colorMap[color] || colorMap.slate}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold truncate">{label}</p>
        {description && <p className="text-[10px] opacity-60 truncate">{description}</p>}
      </div>
    </button>
  );
}


/**
 * Section wrapper for canvas blocks
 */
export function CanvasSection({ title, icon, children, collapsible = true, defaultOpen = true, onRemove }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 ${collapsible ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors`}
        onClick={() => collapsible && setOpen(!open)}>
        <div className="flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>{icon}</span>}
          <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-slate-300 hover:text-red-500 p-1 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          )}
          {collapsible && (
            <span className="material-symbols-outlined text-slate-300 transition-transform" style={{ fontSize: 18, transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>
              expand_more
            </span>
          )}
        </div>
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
