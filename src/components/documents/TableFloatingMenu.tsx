import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Combine,
  Split,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  PaintBucket,
  Grid,
  Square,
  Minus,
  Table as TableIcon,
  ChevronDown,
  Check,
  X,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  ArrowUpDown,
} from 'lucide-react';
import {
  getActiveTableCellAttributes,
  setTableCellFormatting,
  applyFormattingToEntireTable,
  sortActiveTableByColumn,
  PREFORMATTED_TABLE_TEMPLATES,
  insertPreformattedTableTemplate,
  TABLE_CELL_BG_PALETTE,
  TABLE_BORDER_COLOR_PALETTE,
  TableBorderMode,
  TableTextAlign,
  TableVerticalAlign,
} from '../../lib/CustomTableExtensions';

interface TableFloatingMenuProps {
  editor: Editor | null;
  containerRef?: React.RefObject<HTMLElement | null>;
}

interface FloatingPosition {
  top: number;
  left: number;
  visible: boolean;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
}

export function TableFloatingMenu({ editor }: TableFloatingMenuProps) {
  const [floatingPos, setFloatingPos] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    visible: false,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  });
  const [activePopover, setActivePopover] = useState<'bg' | 'border' | 'align' | null>(null);
  const [applyEntireTable, setApplyEntireTable] = useState<boolean>(false);
  const [, setTick] = useState(0);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const updateFloatingPosition = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable) {
      setFloatingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    if (!editor.isActive('table')) {
      setFloatingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      setActivePopover(null);
      return;
    }

    const { view, state } = editor;
    const { from } = state.selection;

    try {
      const domAtPos = view.domAtPos(from);
      const node = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
      const cellEl = node?.closest('td, th') as HTMLElement | null;
      const tableEl = node?.closest('table') as HTMLElement | null;

      const targetEl = cellEl || tableEl;
      if (!targetEl) {
        setFloatingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const cellRect = targetEl.getBoundingClientRect();
      const tableRect = (tableEl || targetEl).getBoundingClientRect();

      // Anchor horizontally centered over the active cell (clamped within viewport)
      const menuWidth = 620;
      const viewportWidth = window.innerWidth;
      const idealLeft = Math.max(
        12,
        Math.min(
          viewportWidth - Math.min(menuWidth, viewportWidth - 24) - 12,
          cellRect.left + cellRect.width / 2 - Math.min(menuWidth, viewportWidth - 24) / 2
        )
      );

      // Place above the table or above the active cell if table is tall
      const preferAboveTable = tableRect.top > 135;
      const rawTop = preferAboveTable
        ? Math.max(96, Math.min(cellRect.top - 48, tableRect.top - 48))
        : Math.max(96, cellRect.bottom + 8);

      setFloatingPos({
        top: rawTop,
        left: idealLeft,
        visible: true,
      });
    } catch {
      // Ignore transient DOM measurement errors during rapid updates
    }
  }, [editor]);

  // Listen to TipTap selection/transaction updates and scroll/resize
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      setTick((t) => (t + 1) % 10000);
      updateFloatingPosition();
    };

    editor.on('selectionUpdate', handleUpdate);
    editor.on('transaction', handleUpdate);
    window.addEventListener('scroll', updateFloatingPosition, true);
    window.addEventListener('resize', updateFloatingPosition);

    return () => {
      editor.off('selectionUpdate', handleUpdate);
      editor.off('transaction', handleUpdate);
      window.removeEventListener('scroll', updateFloatingPosition, true);
      window.removeEventListener('resize', updateFloatingPosition);
    };
  }, [editor, updateFloatingPosition]);

  // Right-click context menu handler inside table cells
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const cell = target.closest('.ProseMirror td, .ProseMirror th') as HTMLElement | null;
      if (!cell || !editor.isEditable) return;

      e.preventDefault();
      const menuW = 280;
      const menuH = 420;
      const x = Math.min(window.innerWidth - menuW - 12, Math.max(12, e.clientX));
      const y = Math.min(window.innerHeight - menuH - 12, Math.max(12, e.clientY));

      setContextMenu({
        open: true,
        x,
        y,
      });
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
      if (menuRef.current && !menuRef.current.contains(target)) {
        setActivePopover(null);
      }
    };

    const dom = editor.view?.dom;
    if (dom) {
      dom.addEventListener('contextmenu', handleContextMenu);
    }
    window.addEventListener('mousedown', handleGlobalClick);

    return () => {
      if (dom) {
        dom.removeEventListener('contextmenu', handleContextMenu);
      }
      window.removeEventListener('mousedown', handleGlobalClick);
    };
  }, [editor]);

  if (!editor || !editor.isEditable) return null;

  const cellAttrs = getActiveTableCellAttributes(editor);

  const handleApplyFormatting = (updates: Parameters<typeof setTableCellFormatting>[1]) => {
    if (applyEntireTable) {
      applyFormattingToEntireTable(editor, updates);
    } else {
      setTableCellFormatting(editor, updates);
    }
  };

  const handleCycleBorders = () => {
    const order: TableBorderMode[] = ['all', 'none', 'bottom', 'thick', 'dashed'];
    const currentIdx = order.indexOf(cellAttrs.borderMode || 'all');
    const nextMode = order[(currentIdx + 1) % order.length];
    handleApplyFormatting({ borderMode: nextMode });
  };

  const handleAlignChange = (align: TableTextAlign) => {
    handleApplyFormatting({ textAlign: align });
  };

  const handleVerticalAlignChange = (vAlign: TableVerticalAlign) => {
    handleApplyFormatting({ verticalAlign: vAlign });
  };

  return (
    <>
      {/* 1. Floating Context Toolbar anchored to Active Table Cell */}
      {floatingPos.visible && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${floatingPos.top}px`,
            left: `${floatingPos.left}px`,
            zIndex: 60,
          }}
          className="print:hidden bg-slate-900/95 border border-teal-500/40 rounded-xl shadow-2xl px-2 py-1.5 backdrop-blur-md flex items-center gap-1 text-xs text-slate-200 select-none animate-in fade-in duration-150 max-w-[calc(100vw-24px)] overflow-x-auto sm:overflow-visible"
          onMouseDown={(e) => {
            // Prevent stealing focus from ProseMirror selection unless clicking an input
            if ((e.target as HTMLElement).tagName !== 'INPUT') {
              e.preventDefault();
            }
          }}
        >
          {/* Badge */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 font-bold text-[10px] uppercase tracking-wider shrink-0 border border-teal-500/30">
            <TableIcon className="w-3 h-3 text-teal-400" />
            <span className="hidden md:inline">Cell Menu</span>
          </div>

          {/* Row Operations */}
          <div className="flex items-center gap-0.5 pl-1 pr-1.5 border-r border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowBefore().run()}
              className="px-1.5 py-1 rounded hover:bg-slate-800 text-slate-200 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
              title="Insert Row Above"
            >
              <ArrowUp className="w-3 h-3 text-teal-400" />
              <span className="text-[11px] font-medium">+Row Above</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="px-1.5 py-1 rounded hover:bg-slate-800 text-slate-200 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
              title="Insert Row Below"
            >
              <ArrowDown className="w-3 h-3 text-teal-400" />
              <span className="text-[11px] font-medium">+Row Below</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
              title="Delete Current Row"
            >
              <Trash2 className="w-3 h-3" />
              <span className="sr-only">Delete Row</span>
            </button>
          </div>

          {/* Column Operations */}
          <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              className="px-1.5 py-1 rounded hover:bg-slate-800 text-slate-200 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
              title="Insert Column Left"
            >
              <ArrowLeft className="w-3 h-3 text-cyan-400" />
              <span className="text-[11px] font-medium">+Col Left</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="px-1.5 py-1 rounded hover:bg-slate-800 text-slate-200 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
              title="Insert Column Right"
            >
              <ArrowRight className="w-3 h-3 text-cyan-400" />
              <span className="text-[11px] font-medium">+Col Right</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
              title="Delete Current Column"
            >
              <Trash2 className="w-3 h-3" />
              <span className="sr-only">Delete Column</span>
            </button>
          </div>

          {/* Cell Borders Toggle + Dropdown */}
          <div className="relative flex items-center pr-1.5 border-r border-slate-800 shrink-0">
            <button
              type="button"
              onClick={handleCycleBorders}
              className={`px-1.5 py-1 rounded-l flex items-center gap-1 transition-colors cursor-pointer ${
                cellAttrs.borderMode !== 'none'
                  ? 'bg-teal-500/20 text-teal-300'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title={`Toggle Cell Borders (Current: ${cellAttrs.borderMode.toUpperCase()})`}
            >
              {cellAttrs.borderMode === 'none' ? (
                <Square className="w-3.5 h-3.5 opacity-50" />
              ) : cellAttrs.borderMode === 'bottom' ? (
                <Minus className="w-3.5 h-3.5" />
              ) : (
                <Grid className="w-3.5 h-3.5" />
              )}
              <span className="text-[11px] capitalize">{cellAttrs.borderMode}</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'border' ? null : 'border')}
              className="px-1 py-1 rounded-r bg-slate-800 hover:bg-slate-700 text-slate-300 border-l border-slate-700 cursor-pointer"
              title="Border Style & Color Options"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {activePopover === 'border' && (
              <div className="absolute top-full left-0 mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-70 text-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                  <span className="font-bold text-slate-200">Cell & Table Borders</span>
                  <label className="flex items-center gap-1 text-[10px] text-teal-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyEntireTable}
                      onChange={(e) => setApplyEntireTable(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-teal-500"
                    />
                    <span>Whole Table</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-1 mb-2.5">
                  {(
                    [
                      { mode: 'all', label: 'All Borders' },
                      { mode: 'none', label: 'No Border' },
                      { mode: 'bottom', label: 'Bottom Only' },
                      { mode: 'thick', label: 'Thick Border' },
                      { mode: 'dashed', label: 'Dashed' },
                      { mode: 'outer', label: 'Box Border' },
                    ] as { mode: TableBorderMode; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => handleApplyFormatting({ borderMode: item.mode })}
                      className={`px-2 py-1.5 rounded text-left text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                        cellAttrs.borderMode === item.mode
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                          : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span>{item.label}</span>
                      {cellAttrs.borderMode === item.mode && <Check className="w-3 h-3 text-teal-400" />}
                    </button>
                  ))}
                </div>

                <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Border Color</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {TABLE_BORDER_COLOR_PALETTE.map((swatch) => (
                    <button
                      key={swatch.label}
                      type="button"
                      onClick={() => handleApplyFormatting({ borderColor: swatch.value })}
                      style={{ backgroundColor: swatch.value || '#334155' }}
                      className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                        cellAttrs.borderColor === swatch.value
                          ? 'ring-2 ring-teal-400 border-white'
                          : 'border-slate-600'
                      }`}
                      title={swatch.label}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    applyFormattingToEntireTable(editor, {
                      borderMode: cellAttrs.borderMode === 'none' ? 'all' : 'none',
                    })
                  }
                  className="w-full mt-1 py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-[11px] text-center transition-colors cursor-pointer"
                >
                  Toggle All Table Borders On/Off
                </button>
              </div>
            )}
          </div>

          {/* Cell Background Color Picker */}
          <div className="relative flex items-center pr-1.5 border-r border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'bg' ? null : 'bg')}
              className={`px-1.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                cellAttrs.backgroundColor
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : ' hover:bg-slate-800 text-slate-300'
              }`}
              title="Cell Background Color"
            >
              <PaintBucket className="w-3.5 h-3.5 text-amber-400" />
              <span
                className="w-3 h-3 rounded-xs border border-slate-600"
                style={{ backgroundColor: cellAttrs.backgroundColor || 'transparent' }}
              />
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {activePopover === 'bg' && (
              <div className="absolute top-full left-0 mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-70 text-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                  <span className="font-bold text-slate-200">Cell Shading / Fill</span>
                  <label className="flex items-center gap-1 text-[10px] text-teal-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyEntireTable}
                      onChange={(e) => setApplyEntireTable(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-teal-500"
                    />
                    <span>Whole Table</span>
                  </label>
                </div>

                <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                  {TABLE_CELL_BG_PALETTE.map((swatch) => (
                    <button
                      key={swatch.label}
                      type="button"
                      onClick={() => handleApplyFormatting({ backgroundColor: swatch.value })}
                      className={`h-7 rounded-md border flex items-center justify-center transition-all hover:scale-105 cursor-pointer ${
                        cellAttrs.backgroundColor === swatch.value
                          ? 'ring-2 ring-teal-400 border-white'
                          : 'border-slate-700'
                      }`}
                      style={{ backgroundColor: swatch.value || 'transparent' }}
                      title={swatch.label}
                    >
                      {swatch.value === null && <X className="w-3.5 h-3.5 text-slate-400" />}
                      {cellAttrs.backgroundColor === swatch.value && swatch.value !== null && (
                        <Check className="w-3.5 h-3.5 text-slate-900 drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400">Custom Color:</span>
                  <input
                    type="color"
                    value={cellAttrs.backgroundColor || '#f1f5f9'}
                    onChange={(e) => handleApplyFormatting({ backgroundColor: e.target.value })}
                    className="w-8 h-6 rounded cursor-pointer bg-transparent border border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyFormatting({ backgroundColor: null })}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                  >
                    Clear Fill
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cell Text Alignment Controls */}
          <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => handleAlignChange('left')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                cellAttrs.textAlign === 'left'
                  ? 'bg-teal-500/25 text-teal-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Align Cell Text Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleAlignChange('center')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                cellAttrs.textAlign === 'center'
                  ? 'bg-teal-500/25 text-teal-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Align Cell Text Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleAlignChange('right')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                cellAttrs.textAlign === 'right'
                  ? 'bg-teal-500/25 text-teal-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Align Cell Text Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'align' ? null : 'align')}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Vertical Alignment & Justify"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            {activePopover === 'align' && (
              <div className="absolute top-full right-16 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5 z-70 text-xs">
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Horizontal Align</div>
                <div className="grid grid-cols-4 gap-1 mb-2.5">
                  {(
                    [
                      { id: 'left', icon: AlignLeft, label: 'Left' },
                      { id: 'center', icon: AlignCenter, label: 'Center' },
                      { id: 'right', icon: AlignRight, label: 'Right' },
                      { id: 'justify', icon: AlignJustify, label: 'Justify' },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAlignChange(item.id)}
                        className={`p-1.5 rounded flex items-center justify-center cursor-pointer ${
                          cellAttrs.textAlign === item.id
                            ? 'bg-teal-500/25 text-teal-300 border border-teal-500/40'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                        title={item.label}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>

                <div className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Vertical Align</div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'top', icon: AlignStartVertical, label: 'Top' },
                      { id: 'middle', icon: AlignCenterVertical, label: 'Middle' },
                      { id: 'bottom', icon: AlignEndVertical, label: 'Bottom' },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleVerticalAlignChange(item.id)}
                        className={`px-2 py-1 rounded flex items-center justify-center gap-1 text-[11px] cursor-pointer ${
                          cellAttrs.verticalAlign === item.id
                            ? 'bg-teal-500/25 text-teal-300 border border-teal-500/40 font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Merge / Split / Header / Delete Table */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => editor.chain().focus().mergeCells().run()}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-teal-300 cursor-pointer"
              title="Merge Selected Cells"
            >
              <Combine className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().splitCell().run()}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-teal-300 cursor-pointer"
              title="Split Merged Cell"
            >
              <Split className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => sortActiveTableByColumn(editor)}
              className="px-1.5 py-1 rounded hover:bg-slate-800 text-cyan-300 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
              title="Sort Column (Or click any Header cell directly to toggle Asc/Desc)"
            >
              <ArrowUpDown className="w-3 h-3 text-cyan-400" />
              <span>Sort</span>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              className="px-1.5 py-1 rounded hover:bg-slate-800 text-amber-300 text-[10px] font-bold cursor-pointer"
              title="Toggle Header Row"
            >
              H-Row
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="px-1.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-[10px] font-semibold flex items-center gap-1 cursor-pointer ml-0.5"
              title="Delete Entire Table"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden lg:inline">Table</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Right-Click Floating Context Menu inside Table Cells */}
      {contextMenu.open && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 100,
          }}
          className="print:hidden w-64 bg-slate-900/98 border border-slate-700 rounded-xl shadow-2xl p-2 text-xs text-slate-200 backdrop-blur-xl select-none animate-in fade-in zoom-in-95 duration-100"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800 mb-1">
            <span className="font-bold text-teal-300 flex items-center gap-1.5">
              <TableIcon className="w-3.5 h-3.5 text-teal-400" />
              Table Cell Actions
            </span>
            <button
              type="button"
              onClick={() => setContextMenu((prev) => ({ ...prev, open: false }))}
              className="text-slate-400 hover:text-white p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().addRowBefore().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-left transition-colors cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5 text-teal-400" />
              <span>Insert Row Above</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().addRowAfter().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-left transition-colors cursor-pointer"
            >
              <ArrowDown className="w-3.5 h-3.5 text-teal-400" />
              <span>Insert Row Below</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().addColumnBefore().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-left transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span>Insert Column Left</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().addColumnAfter().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-left transition-colors cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
              <span>Insert Column Right</span>
            </button>

            <div className="my-1 border-t border-slate-800" />

            <button
              type="button"
              onClick={() => {
                editor.chain().focus().deleteRow().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/50 text-rose-300 flex items-center gap-2 text-left transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete Row</span>
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().deleteColumn().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/50 text-rose-300 flex items-center gap-2 text-left transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete Column</span>
            </button>

            <div className="my-1 border-t border-slate-800" />

            <div className="grid grid-cols-2 gap-1 px-1 py-1">
              <button
                type="button"
                onClick={() => {
                  sortActiveTableByColumn(editor, 'asc');
                  setContextMenu((prev) => ({ ...prev, open: false }));
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 text-[11px] text-teal-300 cursor-pointer"
                title="Sort Column Ascending (A → Z / Low → High)"
              >
                <ArrowUp className="w-3 h-3 text-teal-400" />
                <span>Sort Asc ↑</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sortActiveTableByColumn(editor, 'desc');
                  setContextMenu((prev) => ({ ...prev, open: false }));
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 text-[11px] text-cyan-300 cursor-pointer"
                title="Sort Column Descending (Z → A / High → Low)"
              >
                <ArrowDown className="w-3 h-3 text-cyan-400" />
                <span>Sort Desc ↓</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().mergeCells().run();
                  setContextMenu((prev) => ({ ...prev, open: false }));
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 text-[11px] cursor-pointer"
              >
                <Combine className="w-3 h-3 text-teal-400" />
                <span>Merge Cells</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().splitCell().run();
                  setContextMenu((prev) => ({ ...prev, open: false }));
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 text-[11px] cursor-pointer"
              >
                <Split className="w-3 h-3 text-teal-400" />
                <span>Split Cell</span>
              </button>
            </div>

            {/* Quick Cell Background Swatches inside Context Menu */}
            <div className="px-2 py-1.5 border-t border-slate-800">
              <div className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Cell Background</span>
                <button
                  type="button"
                  onClick={() => setTableCellFormatting(editor, { backgroundColor: null })}
                  className="text-[10px] text-teal-400 hover:underline font-normal"
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {TABLE_CELL_BG_PALETTE.slice(0, 8).map((swatch) => (
                  <button
                    key={swatch.label}
                    type="button"
                    onClick={() => setTableCellFormatting(editor, { backgroundColor: swatch.value })}
                    style={{ backgroundColor: swatch.value || 'transparent' }}
                    className={`w-5 h-5 rounded border transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                      cellAttrs.backgroundColor === swatch.value
                        ? 'ring-2 ring-teal-400 border-white'
                        : 'border-slate-700'
                    }`}
                    title={swatch.label}
                  >
                    {swatch.value === null && <X className="w-3 h-3 text-slate-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Borders & Alignment inside Context Menu */}
            <div className="px-2 py-1.5 border-t border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTableCellFormatting(editor, { borderMode: 'all' })}
                  className={`p-1 rounded ${
                    cellAttrs.borderMode === 'all' ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-300'
                  }`}
                  title="All Borders"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setTableCellFormatting(editor, { borderMode: 'none' })}
                  className={`p-1 rounded ${
                    cellAttrs.borderMode === 'none' ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-300'
                  }`}
                  title="No Borders"
                >
                  <Square className="w-3.5 h-3.5 opacity-50" />
                </button>
                <button
                  type="button"
                  onClick={() => setTableCellFormatting(editor, { borderMode: 'bottom' })}
                  className={`p-1 rounded ${
                    cellAttrs.borderMode === 'bottom' ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Bottom Border"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleAlignChange('left')}
                  className={`p-1 rounded ${
                    cellAttrs.textAlign === 'left' ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAlignChange('center')}
                  className={`p-1 rounded ${
                    cellAttrs.textAlign === 'center' ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Align Center"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAlignChange('right')}
                  className={`p-1 rounded ${
                    cellAttrs.textAlign === 'right' ? 'bg-teal-500/25 text-teal-300' : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="my-1 border-t border-slate-800" />

            <button
              type="button"
              onClick={() => {
                editor.chain().focus().deleteTable().run();
                setContextMenu((prev) => ({ ...prev, open: false }));
              }}
              className="w-full px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/70 text-rose-300 flex items-center gap-2 text-left font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete Entire Table</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
