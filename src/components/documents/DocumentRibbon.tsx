import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, Italic, Underline, Strikethrough, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, CheckSquare, Quote, Minus,
  Undo, Redo, Table as TableIcon, Image as ImageIcon, Link as LinkIcon,
  Subscript, Superscript, Eraser, Baseline,
  FileText, Layout as LayoutIcon, Eye, CheckCircle2,
  Printer, Download, Upload, Copy, Scissors, ClipboardPaste,
  Search, ZoomIn, ZoomOut, Maximize2, SplitSquareVertical,
  Plus, Trash2, Columns, Rows, Pin, PinOff, ChevronUp, ChevronDown,
  History, Clock, PaintBucket, Grid, Square, Combine, Split,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Check, X,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  ArrowUpDown, LayoutTemplate
} from 'lucide-react';
import { ImportExportMenu } from './ImportExportMenu';
import { PaperSizeOption, OrientationOption, MarginOption, PaperThemeOption } from '../../lib/paginationEngine';
import {
  getActiveTableCellAttributes,
  setTableCellFormatting,
  applyFormattingToEntireTable,
  TABLE_CELL_BG_PALETTE,
  TABLE_BORDER_COLOR_PALETTE,
  PREFORMATTED_TABLE_TEMPLATES,
  insertPreformattedTableTemplate,
  sortActiveTableByColumn,
  TableBorderMode,
  TableTextAlign,
  TableVerticalAlign,
} from '../../lib/CustomTableExtensions';

export type RibbonTab = 'home' | 'insert' | 'table' | 'layout' | 'review' | 'view' | 'file';

interface DocumentRibbonProps {
  editor: Editor;
  docTitle: string;
  pageSize: PaperSizeOption;
  setPageSize: (size: PaperSizeOption) => void;
  orientation: OrientationOption;
  setOrientation: (o: OrientationOption) => void;
  marginOption: MarginOption;
  setMarginOption: (m: MarginOption) => void;
  paperTheme: PaperThemeOption;
  setPaperTheme: React.Dispatch<React.SetStateAction<PaperThemeOption>>;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  showPageBreaks: boolean;
  setShowPageBreaks: React.Dispatch<React.SetStateAction<boolean>>;
  showMarginGuides: boolean;
  setShowMarginGuides: React.Dispatch<React.SetStateAction<boolean>>;
  showDebugInfo: boolean;
  setShowDebugInfo: React.Dispatch<React.SetStateAction<boolean>>;
  pageCount: number;
  activePage?: number;
  onOpenPreview?: () => void;
  onOpenVersionHistory?: () => void;
  onInsertPageBreak?: () => void;
  onAutoPaginate?: () => void;
  isApproachingBoundary?: boolean;
  docHeightPx?: number;
}

export function DocumentRibbon({
  editor,
  docTitle,
  pageSize,
  setPageSize,
  orientation,
  setOrientation,
  marginOption,
  setMarginOption,
  paperTheme,
  setPaperTheme,
  zoomLevel,
  setZoomLevel,
  showPageBreaks,
  setShowPageBreaks,
  showMarginGuides,
  setShowMarginGuides,
  showDebugInfo,
  setShowDebugInfo,
  pageCount,
  activePage = 1,
  onOpenPreview,
  onOpenVersionHistory,
  onInsertPageBreak,
  onAutoPaginate,
  isApproachingBoundary,
  docHeightPx,
}: DocumentRibbonProps) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('home');
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    const saved = localStorage.getItem('hubmind_ribbon_pinned');
    return saved !== null ? saved === 'true' : true;
  });
  const [isTemporarilyOpen, setIsTemporarilyOpen] = useState<boolean>(false);
  const [, setSelectionTick] = useState(0);

  const [promptState, setPromptState] = useState<{ type: 'image' | 'link' | null; defaultVal: string }>({
    type: null,
    defaultVal: ''
  });
  const [findText, setFindText] = useState('');
  const [showFindBar, setShowFindBar] = useState(false);

  // Table Drawer / Popover State
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isTemplatesMenuOpen, setIsTemplatesMenuOpen] = useState(false);
  const [gridHover, setGridHover] = useState<{ rows: number; cols: number }>({ rows: 3, cols: 3 });
  const [customTableRows, setCustomTableRows] = useState<number>(3);
  const [customTableCols, setCustomTableCols] = useState<number>(3);
  const [customTableWithHeader, setCustomTableWithHeader] = useState<boolean>(true);
  const [tableBorderMenuOpen, setTableBorderMenuOpen] = useState(false);
  const [tableBgMenuOpen, setTableBgMenuOpen] = useState(false);
  const [applyToWholeTable, setApplyToWholeTable] = useState(false);

  // Re-render ribbon on every selection update or transaction so active tool highlights match Microsoft Word precisely
  useEffect(() => {
    if (!editor) return;
    const forceUpdate = () => setSelectionTick((t) => (t + 1) % 10000);
    editor.on('selectionUpdate', forceUpdate);
    editor.on('transaction', forceUpdate);
    return () => {
      editor.off('selectionUpdate', forceUpdate);
      editor.off('transaction', forceUpdate);
    };
  }, [editor]);

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem('hubmind_ribbon_pinned', String(next));
      if (!next) {
        setIsTemporarilyOpen(false);
      }
      return next;
    });
  };

  const handleTabClick = (tab: RibbonTab) => {
    if (activeTab === tab && !isPinned) {
      setIsTemporarilyOpen((prev) => !prev);
    } else {
      setActiveTab(tab);
      if (!isPinned) {
        setIsTemporarilyOpen(true);
      }
    }
  };

  const isStripVisible = isPinned || isTemporarilyOpen;

  if (!editor) return null;

  const addImage = () => {
    setPromptState({ type: 'image', defaultVal: '' });
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href || '';
    setPromptState({ type: 'link', defaultVal: previousUrl });
  };

  const handlePromptSubmit = (val: string) => {
    if (promptState.type === 'image') {
      if (val) editor.chain().focus().setImage({ src: val }).run();
    } else if (promptState.type === 'link') {
      if (val === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else if (val !== null) {
        editor.chain().focus().extendMarkRange('link').setLink({ href: val }).run();
      }
    }
    setPromptState({ type: null, defaultVal: '' });
  };

  const insertTable = () => {
    setIsTableMenuOpen(prev => !prev);
    setIsTemplatesMenuOpen(false);
  };

  const toggleTemplatesMenu = () => {
    setIsTemplatesMenuOpen(prev => !prev);
    setIsTableMenuOpen(false);
  };

  const handleInsertGridTable = (rows: number, cols: number, withHeader: boolean = true) => {
    editor.chain().focus().insertTable({ rows: Math.max(1, rows), cols: Math.max(1, cols), withHeaderRow: withHeader }).run();
    setIsTableMenuOpen(false);
    setIsTemplatesMenuOpen(false);
  };

  const handleInsertCustomTable = () => {
    handleInsertGridTable(customTableRows, customTableCols, customTableWithHeader);
  };

  const handleInsertTemplateTable = (templateId: string) => {
    if (templateId === 'matrix') {
      handleInsertGridTable(3, 3, true);
    } else {
      insertPreformattedTableTemplate(editor, templateId);
    }
    setIsTableMenuOpen(false);
    setIsTemplatesMenuOpen(false);
  };

  const fontFamilies = [
    { label: 'Inter (Clean)', value: 'Inter, sans-serif' },
    { label: 'Arial (Standard)', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Georgia (Editorial)', value: 'Georgia, serif' },
    { label: 'Courier New (Mono)', value: '"Courier New", Courier, monospace' },
  ];

  const fontSizes = ['11px', '12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px', '48px'];

  const handleCopy = () => {
    document.execCommand('copy');
  };

  const handleCut = () => {
    document.execCommand('cut');
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.chain().focus().insertContent(text).run();
      }
    } catch (e) {
      editor.chain().focus().run();
    }
  };

  // Helper for active button classes with Word-style highlight
  const getToolClass = (isActive: boolean) =>
    isActive
      ? 'p-1.5 rounded-lg bg-teal-500/25 text-teal-300 ring-1 ring-teal-400/50 shadow-inner font-bold transition-all'
      : 'p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors';

  return (
    <div className="relative z-30 bg-slate-900 border-b border-slate-800 text-slate-200 select-none shrink-0 print:hidden shadow-md transition-all duration-200">
      {/* Top Ribbon Navigation Tabs */}
      <div className="flex items-center gap-0.5 px-3 pt-1 border-b border-slate-800/80 bg-slate-950 overflow-x-auto scrollbar-none text-xs">
        <button
          onClick={() => handleTabClick('file')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'file'
              ? 'bg-accent text-slate-950 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>File</span>
        </button>

        <button
          onClick={() => handleTabClick('home')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors cursor-pointer ${
            activeTab === 'home'
              ? 'bg-slate-900 text-white border-t-2 border-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Home
        </button>

        <button
          onClick={() => handleTabClick('insert')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors cursor-pointer ${
            activeTab === 'insert'
              ? 'bg-slate-900 text-white border-t-2 border-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Insert
        </button>

        <button
          onClick={() => handleTabClick('layout')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors cursor-pointer ${
            activeTab === 'layout'
              ? 'bg-slate-900 text-white border-t-2 border-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Layout
        </button>

        <button
          onClick={() => handleTabClick('review')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors cursor-pointer ${
            activeTab === 'review'
              ? 'bg-slate-900 text-white border-t-2 border-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          Review
        </button>

        <button
          onClick={() => handleTabClick('view')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors cursor-pointer ${
            activeTab === 'view'
              ? 'bg-slate-900 text-white border-t-2 border-accent'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          View
        </button>

        <button
          onClick={() => handleTabClick('table')}
          className={`px-3.5 py-1.5 font-semibold rounded-t-md transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'table'
              ? 'bg-slate-900 text-teal-300 border-t-2 border-teal-400 font-bold'
              : editor.isActive('table')
              ? 'bg-teal-500/15 text-teal-300 border-t-2 border-teal-400/60 hover:bg-teal-500/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title="Table Creation, Cell Borders, Shading & Alignment Tools"
        >
          <TableIcon className="w-3.5 h-3.5 text-teal-400" />
          <span>Table Tools</span>
          {editor.isActive('table') && (
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          )}
        </button>

        {/* Ribbon Pin & Collapse Controls + Page Counter */}
        <div className="ml-auto flex items-center gap-2 pl-3 py-1 shrink-0">
          {/* Pagination Counter Badge */}
          <div 
            className="hidden sm:flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs shadow-xs hover:border-slate-700 transition-colors"
            title={`Real-Time Document Pagination: Page ${activePage} of ${pageCount} (${pageSize.toUpperCase()})`}
          >
            <div className="flex items-center gap-1.5 font-medium text-slate-300">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              <span className="text-slate-400">Page</span>
              <span className="text-accent font-mono font-bold">{activePage}</span>
              <span className="text-slate-500">/</span>
              <span className="text-white font-mono font-bold">{pageCount}</span>
            </div>
          </div>

          {/* Microsoft Word Ribbon Pin / Collapse Button */}
          <button
            onClick={togglePin}
            className={`p-1.5 rounded-lg border transition-all text-xs flex items-center gap-1 cursor-pointer ${
              isPinned
                ? 'bg-slate-800 border-slate-700 text-teal-400 hover:text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
            title={isPinned ? 'Collapse Ribbon (Show Tabs Only)' : 'Pin Ribbon (Always Show Tools)'}
          >
            {isPinned ? (
              <>
                <Pin className="w-3.5 h-3.5 fill-teal-400" />
                <span className="hidden md:inline text-[11px] font-medium">Pinned</span>
                <ChevronUp className="w-3 h-3 text-slate-400 ml-0.5" />
              </>
            ) : (
              <>
                <PinOff className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden md:inline text-[11px] font-medium">Auto-Hide</span>
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Ribbon Command Strip (Slide down / collapse based on isStripVisible) */}
      {isStripVisible && (
        <div className="p-2 overflow-x-auto whitespace-nowrap flex items-center gap-3 min-h-[58px] animate-in fade-in slide-in-from-top-1 duration-150">
          {/* TAB 1: FILE */}
          {activeTab === 'file' && (
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 pr-3 border-r border-slate-800">
                <button
                  onClick={() => onOpenPreview ? onOpenPreview() : window.print()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                  title="Print or Save as PDF"
                >
                  <Printer className="w-4 h-4 text-cyan-400" />
                  <span>Full Preview / PDF</span>
                </button>

                {onOpenVersionHistory && (
                  <button
                    onClick={onOpenVersionHistory}
                    className="px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1.5 font-semibold transition-colors cursor-pointer"
                    title="View, compare, and restore previous document versions"
                  >
                    <History className="w-4 h-4 text-teal-400" />
                    <span>Version History</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Export & Cloud:</span>
                <ImportExportMenu editor={editor} docTitle={docTitle} onOpenPreview={onOpenPreview} />
              </div>
            </div>
          )}

          {/* TAB 2: HOME */}
          {activeTab === 'home' && (
            <div className="flex items-center gap-2 text-xs">
              {/* Clipboard Group */}
              <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
                <button
                  onClick={handlePaste}
                  className="p-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Smart Paste with Clean Formatting (Ctrl+V)"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px]">Paste</span>
                </button>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={handleCut}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                    title="Cut (Ctrl+X)"
                  >
                    <Scissors className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                    title="Copy (Ctrl+C)"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Undo / Redo */}
              <div className="flex items-center gap-0.5 pr-2 border-r border-slate-800">
                <button
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Font Family & Size */}
              <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
                <select
                  onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
                  value={editor.getAttributes('textStyle').fontFamily || fontFamilies[0].value}
                  className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1 focus:outline-none w-32 cursor-pointer"
                >
                  {fontFamilies.map((font) => (
                    <option key={font.value} value={font.value}>{font.label}</option>
                  ))}
                </select>

                <select
                  onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
                  value={editor.getAttributes('textStyle').fontSize || '16px'}
                  className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1 focus:outline-none w-16 cursor-pointer"
                >
                  {fontSizes.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              {/* Font Style Formatting with Word-Style Active Reflection */}
              <div className="flex items-center gap-0.5 pr-2 border-r border-slate-800">
                <button
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`${getToolClass(editor.isActive('bold'))} cursor-pointer`}
                  title={`Bold (Ctrl+B) ${editor.isActive('bold') ? '• [Active]' : ''}`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`${getToolClass(editor.isActive('italic'))} cursor-pointer`}
                  title={`Italic (Ctrl+I) ${editor.isActive('italic') ? '• [Active]' : ''}`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className={`${getToolClass(editor.isActive('underline'))} cursor-pointer`}
                  title={`Underline (Ctrl+U) ${editor.isActive('underline') ? '• [Active]' : ''}`}
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={`${getToolClass(editor.isActive('strike'))} cursor-pointer`}
                  title={`Strikethrough ${editor.isActive('strike') ? '• [Active]' : ''}`}
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleSubscript().run()}
                  className={`${getToolClass(editor.isActive('subscript'))} cursor-pointer`}
                  title={`Subscript ${editor.isActive('subscript') ? '• [Active]' : ''}`}
                >
                  <Subscript className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleSuperscript().run()}
                  className={`${getToolClass(editor.isActive('superscript'))} cursor-pointer`}
                  title={`Superscript ${editor.isActive('superscript') ? '• [Active]' : ''}`}
                >
                  <Superscript className="w-3.5 h-3.5" />
                </button>

                {/* Text Color Picker */}
                <div className={`relative group p-1 rounded-lg ${editor.getAttributes('textStyle').color ? 'bg-teal-500/10 ring-1 ring-teal-400/30' : ''}`}>
                  <Baseline className="w-3.5 h-3.5 text-slate-400 group-hover:text-white cursor-pointer" />
                  <input
                    type="color"
                    onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                    value={editor.getAttributes('textStyle').color || '#000000'}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Font Color"
                  />
                </div>

                {/* Highlight Picker */}
                <div className={`relative group p-1 rounded-lg ${editor.isActive('highlight') ? 'bg-yellow-400/20 ring-1 ring-yellow-400/50' : ''}`}>
                  <Highlighter className={`w-3.5 h-3.5 cursor-pointer ${editor.isActive('highlight') ? 'text-yellow-400' : 'text-slate-400 group-hover:text-amber-400'}`} />
                  <input
                    type="color"
                    onInput={(e) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
                    value={editor.getAttributes('highlight').color || '#ffff00'}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Text Highlight"
                  />
                </div>

                <button
                  onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                  title="Clear Formatting"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Paragraph & Table Cell Alignments with Word-Style Active Reflection */}
              <div className="flex items-center gap-0.5 pr-2 border-r border-slate-800">
                <button
                  onClick={() => {
                    if (editor.isActive('table')) {
                      setTableCellFormatting(editor, { textAlign: 'left' });
                    } else {
                      editor.chain().focus().setTextAlign('left').run();
                    }
                  }}
                  className={`${getToolClass(
                    editor.isActive({ textAlign: 'left' }) ||
                      (editor.isActive('table') && getActiveTableCellAttributes(editor).textAlign === 'left')
                  )} cursor-pointer`}
                  title="Align Left (Paragraph & Table Cells)"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (editor.isActive('table')) {
                      setTableCellFormatting(editor, { textAlign: 'center' });
                    } else {
                      editor.chain().focus().setTextAlign('center').run();
                    }
                  }}
                  className={`${getToolClass(
                    editor.isActive({ textAlign: 'center' }) ||
                      (editor.isActive('table') && getActiveTableCellAttributes(editor).textAlign === 'center')
                  )} cursor-pointer`}
                  title="Align Center (Paragraph & Table Cells)"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (editor.isActive('table')) {
                      setTableCellFormatting(editor, { textAlign: 'right' });
                    } else {
                      editor.chain().focus().setTextAlign('right').run();
                    }
                  }}
                  className={`${getToolClass(
                    editor.isActive({ textAlign: 'right' }) ||
                      (editor.isActive('table') && getActiveTableCellAttributes(editor).textAlign === 'right')
                  )} cursor-pointer`}
                  title="Align Right (Paragraph & Table Cells)"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (editor.isActive('table')) {
                      setTableCellFormatting(editor, { textAlign: 'justify' });
                    } else {
                      editor.chain().focus().setTextAlign('justify').run();
                    }
                  }}
                  className={`${getToolClass(
                    editor.isActive({ textAlign: 'justify' }) ||
                      (editor.isActive('table') && getActiveTableCellAttributes(editor).textAlign === 'justify')
                  )} cursor-pointer`}
                  title="Justify (Paragraph & Table Cells)"
                >
                  <AlignJustify className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Lists, Quotes & Quick Table Insert */}
              <div className="flex items-center gap-0.5 pr-2 border-r border-slate-800">
                <button
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className={`${getToolClass(editor.isActive('bulletList'))} cursor-pointer`}
                  title="Bullet List"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className={`${getToolClass(editor.isActive('orderedList'))} cursor-pointer`}
                  title="Numbered List"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                  className={`${getToolClass(editor.isActive('taskList'))} cursor-pointer`}
                  title="Task Checklist"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  className={`${getToolClass(editor.isActive('blockquote'))} cursor-pointer`}
                  title="Blockquote"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={insertTable}
                  className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ml-0.5 ${
                    isTableMenuOpen || editor.isActive('table')
                      ? 'bg-teal-500/25 text-teal-300 ring-1 ring-teal-400/50 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title="Create or Edit Table"
                >
                  <TableIcon className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-[11px]">Table</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <button
                  onClick={toggleTemplatesMenu}
                  className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                    isTemplatesMenuOpen
                      ? 'bg-cyan-500/25 text-cyan-300 ring-1 ring-cyan-400/50 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title="Insert Pre-Formatted Table Template (Weekly Task Matrix, Expense Log, etc.)"
                >
                  <LayoutTemplate className="w-3 h-3 text-cyan-400" />
                  <span className="text-[11px]">Table Templates</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </div>

              {/* Inline Table Formatting & Sort Toggles on Home Tab when inside a Table */}
              {editor.isActive('table') && (
                <div className="flex items-center gap-1 pr-2 border-r border-slate-800 bg-teal-500/10 px-2 py-0.5 rounded-lg border border-teal-500/30">
                  <button
                    onClick={() => sortActiveTableByColumn(editor)}
                    className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center gap-1 text-[11px] cursor-pointer"
                    title="Sort Active Column (Or click any Table Header cell directly to toggle Asc/Desc)"
                  >
                    <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                    <span>Sort Col</span>
                  </button>
                  <button
                    onClick={() => {
                      const current = getActiveTableCellAttributes(editor).borderMode;
                      const order: TableBorderMode[] = ['all', 'none', 'bottom', 'thick', 'dashed'];
                      const next = order[(order.indexOf(current) + 1) % order.length];
                      setTableCellFormatting(editor, { borderMode: next });
                    }}
                    className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 flex items-center gap-1 text-[11px] cursor-pointer"
                    title={`Toggle Cell Borders (Current: ${getActiveTableCellAttributes(editor).borderMode})`}
                  >
                    <Grid className="w-3 h-3 text-teal-400" />
                    <span className="capitalize">{getActiveTableCellAttributes(editor).borderMode}</span>
                  </button>
                  <button
                    onClick={() => {
                      setTableBgMenuOpen((prev) => !prev);
                      setTableBorderMenuOpen(false);
                    }}
                    className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[11px] cursor-pointer"
                    title="Cell Background Color"
                  >
                    <PaintBucket className="w-3 h-3 text-amber-400" />
                    <span
                      className="w-2.5 h-2.5 rounded-xs border border-slate-600"
                      style={{
                        backgroundColor: getActiveTableCellAttributes(editor).backgroundColor || 'transparent',
                      }}
                    />
                  </button>
                  <button
                    onClick={() => setActiveTab('table')}
                    className="px-1.5 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-semibold text-[10px] cursor-pointer"
                    title="Open Full Table Formatting Toolbar"
                  >
                    More Table Tools
                  </button>
                </div>
              )}

              {/* Quick Heading Style Presets with Word-Style Active Reflection */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => editor.chain().focus().setParagraph().run()}
                  className={`px-2.5 py-1 rounded text-xs border cursor-pointer transition-all ${
                    editor.isActive('paragraph') && !editor.isActive('heading')
                      ? 'border-teal-400 bg-teal-500/20 text-teal-300 font-bold ring-1 ring-teal-400/40'
                      : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Normal
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  className={`px-2.5 py-1 rounded text-xs border font-bold cursor-pointer transition-all ${
                    editor.isActive('heading', { level: 1 })
                      ? 'border-teal-400 bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/40'
                      : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Heading 1
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  className={`px-2.5 py-1 rounded text-xs border font-semibold cursor-pointer transition-all ${
                    editor.isActive('heading', { level: 2 })
                      ? 'border-teal-400 bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/40'
                      : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Heading 2
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  className={`px-2.5 py-1 rounded text-xs border cursor-pointer transition-all ${
                    editor.isActive('heading', { level: 3 })
                      ? 'border-teal-400 bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/40'
                      : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Heading 3
                </button>
              </div>
            </div>
          )}

        {/* TAB 3: INSERT */}
        {activeTab === 'insert' && (
          <div className="flex items-center gap-3 text-xs relative">
            <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
              {/* Interactive Table Insert / Draw Button */}
              <div className="relative flex items-center gap-1.5">
                <button
                  onClick={insertTable}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isTableMenuOpen || editor.isActive('table')
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                  title="Draw or Insert Table"
                >
                  <TableIcon className="w-3.5 h-3.5 text-teal-400" />
                  <span>Insert Table</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
                </button>
                <button
                  onClick={toggleTemplatesMenu}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isTemplatesMenuOpen
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                  title="Insert Pre-Formatted Table Template (Weekly Task Matrix, Expense Log, etc.)"
                >
                  <LayoutTemplate className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Table Templates</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
                </button>
              </div>

              <button
                onClick={addImage}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
                title="Insert Image (URL or Paste Screenshot)"
              >
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Image</span>
              </button>
              <button
                onClick={setLink}
                className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                  editor.isActive('link') ? 'bg-accent text-slate-950 font-bold' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
                title="Insert / Edit Hyperlink"
              >
                <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>Link</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
              <button
                onClick={() => {
                  if (onInsertPageBreak) {
                    onInsertPageBreak();
                  } else if (editor?.commands?.setPageBreak) {
                    editor.commands.setPageBreak('hard');
                  } else {
                    editor?.chain().focus().setHorizontalRule().run();
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
                title="Insert Page Break (Ctrl+Enter / Mod+Enter)"
              >
                <SplitSquareVertical className="w-3.5 h-3.5 text-accent" />
                <span>Page Break</span>
              </button>
              {onAutoPaginate && (
                <button
                  onClick={onAutoPaginate}
                  className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors text-xs ${
                    isApproachingBoundary
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                  title="Auto Paginate: Inserts soft page breaks when content approaches A4 boundaries"
                >
                  <SplitSquareVertical className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Auto Paginate (A4)</span>
                </button>
              )}
              <button
                onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
                title="Horizontal Dividing Line"
              >
                <Minus className="w-3.5 h-3.5 text-slate-400" />
                <span>Divider</span>
              </button>
              <button
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                  editor.isActive('codeBlock') ? 'bg-accent text-slate-950 font-bold' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
                title="Code Block"
              >
                <span className="font-mono text-xs font-bold text-amber-400">&lt;/&gt;</span>
                <span>Code Block</span>
              </button>
            </div>

            {/* Table Dynamic Tools when cursor is in table */}
            {editor.isActive('table') && (
              <div className="flex items-center gap-1 bg-teal-500/10 border border-teal-500/30 rounded-lg px-2 py-1">
                <span className="text-[11px] font-bold text-teal-300 pr-1 flex items-center gap-1">
                  <TableIcon className="w-3 h-3 text-teal-400" />
                  Table:
                </span>
                <button onClick={() => editor.chain().focus().addRowBefore().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer" title="Insert Row Above">+Row Above</button>
                <button onClick={() => editor.chain().focus().addRowAfter().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer" title="Insert Row Below">+Row Below</button>
                <button onClick={() => editor.chain().focus().addColumnBefore().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer" title="Insert Column Left">+Col Left</button>
                <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer" title="Insert Column Right">+Col Right</button>
                <button onClick={() => editor.chain().focus().deleteRow().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-red-300 cursor-pointer" title="Delete Row">-Row</button>
                <button onClick={() => editor.chain().focus().deleteColumn().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-red-300 cursor-pointer" title="Delete Column">-Col</button>
                <button onClick={() => editor.chain().focus().mergeCells().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-teal-300 font-semibold cursor-pointer" title="Merge Selected Cells">Merge</button>
                <button onClick={() => editor.chain().focus().splitCell().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-teal-300 font-semibold cursor-pointer" title="Split Cell">Split</button>
                <button onClick={() => editor.chain().focus().toggleHeaderRow().run()} className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 font-medium cursor-pointer" title="Toggle Header Row">H-Row</button>
                <button onClick={() => editor.chain().focus().deleteTable().run()} className="px-1.5 py-1 rounded bg-red-950/70 hover:bg-red-900 border border-red-800 text-[10px] text-red-300 font-semibold cursor-pointer" title="Delete Table">Delete Table</button>
              </div>
            )}
          </div>
        )}

        {/* TAB: TABLE TOOLS (Table Creation, Templates, Sorting, Rows/Cols, Cell Borders, Cell Background Color, Text Alignment) */}
        {activeTab === 'table' && (
          <div className="flex items-center gap-2.5 text-xs">
            {/* Create / Insert Table & Pre-Formatted Templates Buttons */}
            <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-800">
              <button
                onClick={insertTable}
                className="px-2.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Create New Table"
              >
                <TableIcon className="w-3.5 h-3.5 text-teal-400" />
                <span>New Table</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                onClick={toggleTemplatesMenu}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isTemplatesMenuOpen
                    ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700'
                }`}
                title="Insert Pre-Formatted Table Templates (Weekly Task Matrix, Expense Log, etc.)"
              >
                <LayoutTemplate className="w-3.5 h-3.5 text-cyan-400" />
                <span>Templates</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Column Sorting Controls */}
            <div className="flex items-center gap-1 pr-2.5 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 mr-0.5" title="Tip: You can also click any table header cell directly to sort!">
                Sort Col:
              </span>
              <button
                onClick={() => sortActiveTableByColumn(editor, 'asc')}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-teal-300 flex items-center gap-1 cursor-pointer"
                title="Sort Active Column Ascending (A → Z / Low → High) — or click any Header Cell"
              >
                <ArrowUp className="w-3 h-3 text-teal-400" />
                <span>Asc</span>
              </button>
              <button
                onClick={() => sortActiveTableByColumn(editor, 'desc')}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-cyan-300 flex items-center gap-1 cursor-pointer"
                title="Sort Active Column Descending (Z → A / High → Low) — or click any Header Cell"
              >
                <ArrowDown className="w-3 h-3 text-cyan-400" />
                <span>Desc</span>
              </button>
            </div>

            {/* Row & Column Quick Insert/Delete */}
            <div className="flex items-center gap-1 pr-2.5 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 mr-0.5">Rows & Cols:</span>
              <button
                onClick={() => editor.chain().focus().addRowBefore().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 cursor-pointer"
                title="Insert Row Above"
              >
                <ArrowUp className="w-3 h-3 text-teal-400" />
                <span>+Row Above</span>
              </button>
              <button
                onClick={() => editor.chain().focus().addRowAfter().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 cursor-pointer"
                title="Insert Row Below"
              >
                <ArrowDown className="w-3 h-3 text-teal-400" />
                <span>+Row Below</span>
              </button>
              <button
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 cursor-pointer"
                title="Insert Column Left"
              >
                <ArrowLeft className="w-3 h-3 text-cyan-400" />
                <span>+Col Left</span>
              </button>
              <button
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 cursor-pointer"
                title="Insert Column Right"
              >
                <ArrowRight className="w-3 h-3 text-cyan-400" />
                <span>+Col Right</span>
              </button>
              <button
                onClick={() => editor.chain().focus().deleteRow().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/60 disabled:opacity-40 text-rose-300 flex items-center gap-1 cursor-pointer"
                title="Delete Row"
              >
                <Trash2 className="w-3 h-3" />
                <span>-Row</span>
              </button>
              <button
                onClick={() => editor.chain().focus().deleteColumn().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/60 disabled:opacity-40 text-rose-300 flex items-center gap-1 cursor-pointer"
                title="Delete Column"
              >
                <Trash2 className="w-3 h-3" />
                <span>-Col</span>
              </button>
            </div>

            {/* Cell Borders Toolbar Toggle */}
            <div className="flex items-center gap-1 pr-2.5 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 mr-0.5">Borders:</span>
              {(
                [
                  { mode: 'all', label: 'All', icon: Grid },
                  { mode: 'none', label: 'None', icon: Square },
                  { mode: 'bottom', label: 'Bottom', icon: Minus },
                  { mode: 'thick', label: 'Thick', icon: Grid },
                ] as { mode: TableBorderMode; label: string; icon: any }[]
              ).map((b) => {
                const Icon = b.icon;
                const active = editor.isActive('table') && getActiveTableCellAttributes(editor).borderMode === b.mode;
                return (
                  <button
                    key={b.mode}
                    onClick={() => {
                      if (applyToWholeTable) {
                        applyFormattingToEntireTable(editor, { borderMode: b.mode });
                      } else {
                        setTableCellFormatting(editor, { borderMode: b.mode });
                      }
                    }}
                    disabled={!editor.isActive('table')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer ${
                      active
                        ? 'bg-teal-500/25 text-teal-300 border border-teal-500/40 font-semibold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title={`Set ${b.label} Borders`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{b.label}</span>
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setTableBorderMenuOpen((prev) => !prev);
                  setTableBgMenuOpen(false);
                }}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 flex items-center gap-1 cursor-pointer"
                title="Border Color & Table Scope"
              >
                <span>Color</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Cell Background Color Toolbar Toggle */}
            <div className="flex items-center gap-1 pr-2.5 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 mr-0.5">Cell Fill:</span>
              <button
                onClick={() => {
                  setTableBgMenuOpen((prev) => !prev);
                  setTableBorderMenuOpen(false);
                }}
                disabled={!editor.isActive('table')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1.5 cursor-pointer"
                title="Choose Cell Background Color"
              >
                <PaintBucket className="w-3.5 h-3.5 text-amber-400" />
                <span
                  className="w-3 h-3 rounded-xs border border-slate-600"
                  style={{
                    backgroundColor: getActiveTableCellAttributes(editor).backgroundColor || 'transparent',
                  }}
                />
                <span>Shading</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
              {editor.isActive('table') && getActiveTableCellAttributes(editor).backgroundColor && (
                <button
                  onClick={() => setTableCellFormatting(editor, { backgroundColor: null })}
                  className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] cursor-pointer"
                  title="Clear Cell Fill"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Table Cell Text Alignment Toggles */}
            <div className="flex items-center gap-0.5 pr-2.5 border-r border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Align:</span>
              {(
                [
                  { id: 'left', icon: AlignLeft, label: 'Align Left' },
                  { id: 'center', icon: AlignCenter, label: 'Align Center' },
                  { id: 'right', icon: AlignRight, label: 'Align Right' },
                  { id: 'justify', icon: AlignJustify, label: 'Justify' },
                ] as { id: TableTextAlign; icon: any; label: string }[]
              ).map((a) => {
                const Icon = a.icon;
                const active = editor.isActive('table') && getActiveTableCellAttributes(editor).textAlign === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setTableCellFormatting(editor, { textAlign: a.id })}
                    disabled={!editor.isActive('table')}
                    className={`p-1.5 rounded disabled:opacity-40 cursor-pointer ${
                      active
                        ? 'bg-teal-500/25 text-teal-300 ring-1 ring-teal-400/50'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                    title={a.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}

              <span className="mx-1 text-slate-700">|</span>

              {(
                [
                  { id: 'top', icon: AlignStartVertical, label: 'Align Top' },
                  { id: 'middle', icon: AlignCenterVertical, label: 'Align Middle' },
                  { id: 'bottom', icon: AlignEndVertical, label: 'Align Bottom' },
                ] as { id: TableVerticalAlign; icon: any; label: string }[]
              ).map((v) => {
                const Icon = v.icon;
                const active =
                  editor.isActive('table') && getActiveTableCellAttributes(editor).verticalAlign === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setTableCellFormatting(editor, { verticalAlign: v.id })}
                    disabled={!editor.isActive('table')}
                    className={`p-1.5 rounded disabled:opacity-40 cursor-pointer ${
                      active
                        ? 'bg-teal-500/25 text-teal-300 ring-1 ring-teal-400/50'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                    title={v.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Merge / Split / Header / Delete Table */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => editor.chain().focus().mergeCells().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-teal-300 flex items-center gap-1 cursor-pointer"
                title="Merge Selected Cells"
              >
                <Combine className="w-3 h-3" />
                <span>Merge</span>
              </button>
              <button
                onClick={() => editor.chain().focus().splitCell().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-teal-300 flex items-center gap-1 cursor-pointer"
                title="Split Cell"
              >
                <Split className="w-3 h-3" />
                <span>Split</span>
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 font-semibold cursor-pointer"
                title="Toggle Header Row"
              >
                Header Row
              </button>
              <button
                onClick={() => editor.chain().focus().deleteTable().run()}
                disabled={!editor.isActive('table')}
                className="px-2 py-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800 disabled:opacity-40 text-rose-300 font-semibold flex items-center gap-1 cursor-pointer"
                title="Delete Entire Table"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Table</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: LAYOUT */}
        {activeTab === 'layout' && (
          <div className="flex items-center gap-3 text-xs overflow-x-auto py-1 scrollbar-none">
            {/* Paper Size Selector */}
            <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-800 shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Size:</span>
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  onClick={() => setPageSize('a4')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    pageSize === 'a4' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="A4 (210 × 297 mm)"
                >
                  A4
                </button>
                <button
                  onClick={() => setPageSize('letter')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    pageSize === 'letter' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="US Letter (8.5 × 11 in)"
                >
                  Letter
                </button>
                <button
                  onClick={() => setPageSize('legal')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    pageSize === 'legal' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="US Legal (8.5 × 14 in)"
                >
                  Legal
                </button>
              </div>
            </div>

            {/* Orientation Selector */}
            <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-800 shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Orientation:</span>
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  onClick={() => setOrientation('portrait')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    orientation === 'portrait' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Portrait (Vertical)"
                >
                  Portrait
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    orientation === 'landscape' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Landscape (Horizontal)"
                >
                  Landscape
                </button>
              </div>
            </div>

            {/* Margin System Selector */}
            <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-800 shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Margins:</span>
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  onClick={() => setMarginOption('normal')}
                  className={`px-2 py-1 rounded transition-colors font-medium ${
                    marginOption === 'normal' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Normal: 20mm (All sides)"
                >
                  Normal
                </button>
                <button
                  onClick={() => setMarginOption('narrow')}
                  className={`px-2 py-1 rounded transition-colors font-medium ${
                    marginOption === 'narrow' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Narrow: 12.7mm (0.5 in)"
                >
                  Narrow
                </button>
                <button
                  onClick={() => setMarginOption('moderate')}
                  className={`px-2 py-1 rounded transition-colors font-medium ${
                    marginOption === 'moderate' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Moderate: Top/Bottom 25.4mm, Left/Right 19mm"
                >
                  Moderate
                </button>
                <button
                  onClick={() => setMarginOption('wide')}
                  className={`px-2 py-1 rounded transition-colors font-medium ${
                    marginOption === 'wide' ? 'bg-accent text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Wide: Top/Bottom 25.4mm, Left/Right 50.8mm"
                >
                  Wide
                </button>
              </div>
            </div>

            {/* Paper Theme (White vs Dark) */}
            <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-800 shrink-0">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Theme:</span>
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  onClick={() => setPaperTheme('white')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    paperTheme === 'white' ? 'bg-white text-slate-950 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  White Paper
                </button>
                <button
                  onClick={() => setPaperTheme('dark')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    paperTheme === 'dark' ? 'bg-slate-950 text-cyan-400 border border-slate-700 font-bold shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Dark Sheet
                </button>
              </div>
            </div>

            {/* Margin Guides, Page Breaks, and Debug Inspector Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowMarginGuides(!showMarginGuides)}
                className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showMarginGuides
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300 font-semibold'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Toggle visual margin guide boundaries on paper"
              >
                <span>Guides: {showMarginGuides ? 'On' : 'Off'}</span>
              </button>

              <button
                onClick={() => setShowDebugInfo(!showDebugInfo)}
                className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showDebugInfo
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 font-semibold'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Toggle real-time physical pagination metrics & inspector"
              >
                <span>Inspector: {showDebugInfo ? 'On' : 'Off'}</span>
              </button>

              <button
                onClick={() => {
                  if (onInsertPageBreak) {
                    onInsertPageBreak();
                  } else if (editor?.commands?.setPageBreak) {
                    editor.commands.setPageBreak('hard');
                  } else {
                    editor?.chain().focus().setHorizontalRule().run();
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                title="Insert explicit page break (Ctrl+Enter / Mod+Enter)"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span>Page Break</span>
              </button>

              {onAutoPaginate && (
                <button
                  onClick={onAutoPaginate}
                  className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                    isApproachingBoundary
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                  title="Auto Paginate: Inserts soft page breaks when content approaches A4 boundaries"
                >
                  <SplitSquareVertical className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Auto Paginate (A4)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: REVIEW */}
        {activeTab === 'review' && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-4 pr-4 border-r border-slate-800">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Pages</span>
                <span className="text-sm font-bold text-slate-200">{pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Doc Height</span>
                <span className="text-sm font-bold text-cyan-300 font-mono">{docHeightPx ? `${docHeightPx}px` : 'Dynamic'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Word Count</span>
                <span className="text-sm font-bold text-accent">{editor.storage.characterCount?.words() || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Characters</span>
                <span className="text-sm font-bold text-slate-200">{editor.storage.characterCount?.characters() || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Est. Read Time</span>
                <span className="text-sm font-bold text-slate-200">
                  {Math.max(1, Math.ceil((editor.storage.characterCount?.words() || 0) / 200))} min
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenVersionHistory && (
                <button
                  onClick={onOpenVersionHistory}
                  className="px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1.5 font-semibold transition-colors cursor-pointer"
                  title="View and restore previous document versions"
                >
                  <History className="w-3.5 h-3.5 text-teal-400" />
                  <span>Version History</span>
                </button>
              )}
              <button
                onClick={() => editor.chain().focus().selectAll().run()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Select All</span>
              </button>
              <button
                onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5 text-amber-400" />
                <span>Clean All Styles</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 6: VIEW */}
        {activeTab === 'view' && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Zoom:</span>
              <button
                onClick={() => setZoomLevel((prev) => Math.max(0.6, Math.round((prev - 0.1) * 10) / 10))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-xs font-bold text-accent min-w-[40px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((prev) => Math.min(1.6, Math.round((prev + 0.1) * 10) / 10))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(1.0)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                title="Reset Zoom to 100%"
              >
                100%
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (onOpenPreview) {
                    onOpenPreview();
                  } else {
                    window.print();
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 font-medium cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>Full Page Print & PDF Preview</span>
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Unclipped Table Creation / Draw Popover */}
      {isTableMenuOpen && (
        <div
          className="absolute top-full left-4 mt-1.5 z-50 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 select-none text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="font-bold text-xs text-teal-300 flex items-center gap-1.5">
              <TableIcon className="w-3.5 h-3.5 text-teal-400" />
              Create & Insert Table
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-teal-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {gridHover.cols} × {gridHover.rows}
              </span>
              <button
                onClick={() => setIsTableMenuOpen(false)}
                className="p-0.5 rounded text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive 8x8 Visual Grid Selector */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 mb-3 flex flex-col gap-1 items-center">
            {Array.from({ length: 8 }).map((_, rIdx) => {
              const rowNum = rIdx + 1;
              return (
                <div key={`grid-row-${rowNum}`} className="flex gap-1">
                  {Array.from({ length: 8 }).map((_, cIdx) => {
                    const colNum = cIdx + 1;
                    const isHovered = rowNum <= gridHover.rows && colNum <= gridHover.cols;
                    return (
                      <button
                        key={`cell-${rowNum}-${colNum}`}
                        type="button"
                        onMouseEnter={() => setGridHover({ rows: rowNum, cols: colNum })}
                        onClick={() => handleInsertGridTable(rowNum, colNum, customTableWithHeader)}
                        className={`w-6 h-5 rounded-xs transition-colors border cursor-pointer ${
                          isHovered
                            ? 'bg-teal-500/50 border-teal-400 shadow-xs'
                            : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700'
                        }`}
                        title={`Insert ${colNum} × ${rowNum} Table`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Quick Pre-Formatted Templates inside Table Drawer */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Pre-Formatted Table Templates
              </span>
              <span className="text-[9px] text-teal-400 font-mono">Click Header to Sort ⇅</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PREFORMATTED_TABLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleInsertTemplateTable(tpl.id)}
                  className="text-left px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 hover:text-teal-300 truncate transition-colors cursor-pointer border border-slate-700/60 hover:border-teal-500/40"
                  title={`${tpl.name}: ${tpl.description}`}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Dimension Form */}
          <div className="pt-2.5 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customTableWithHeader}
                  onChange={(e) => setCustomTableWithHeader(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-teal-500"
                />
                <span>Include Header Row</span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-slate-400">Cols:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={customTableCols}
                  onChange={(e) => setCustomTableCols(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-center text-xs text-white"
                />
                <span className="text-slate-400 ml-1">Rows:</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={customTableRows}
                  onChange={(e) => setCustomTableRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-center text-xs text-white"
                />
              </div>
              <button
                onClick={handleInsertCustomTable}
                className="px-3 py-1 rounded-md bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-colors shrink-0 cursor-pointer"
              >
                Insert Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unclipped Pre-Formatted Table Templates Gallery Popover */}
      {isTemplatesMenuOpen && (
        <div
          className="absolute top-full left-16 mt-1.5 z-50 w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 select-none text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
            <div>
              <span className="font-bold text-xs text-cyan-300 flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5 text-cyan-400" />
                Insert Pre-Formatted Table Template
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Ready-to-use tables with styled headers &amp; click-to-sort columns
              </p>
            </div>
            <button
              onClick={() => setIsTemplatesMenuOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
            {PREFORMATTED_TABLE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleInsertTemplateTable(tpl.id)}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/40 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-xs text-slate-100 group-hover:text-cyan-300 transition-colors">
                    {tpl.name}
                  </span>
                  <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
                    {tpl.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{tpl.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unclipped Table Border Color & Style Popover */}
      {tableBorderMenuOpen && (
        <div
          className="absolute top-full left-48 mt-1.5 z-50 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3.5 backdrop-blur-xl text-xs text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <span className="font-bold text-teal-300">Cell & Table Borders</span>
            <button
              onClick={() => setTableBorderMenuOpen(false)}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-teal-300 mb-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToWholeTable}
              onChange={(e) => setApplyToWholeTable(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-teal-500"
            />
            <span>Apply changes to entire table</span>
          </label>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {(
              [
                { mode: 'all', label: 'All Borders' },
                { mode: 'none', label: 'No Borders' },
                { mode: 'bottom', label: 'Bottom Border' },
                { mode: 'thick', label: 'Thick Borders' },
                { mode: 'dashed', label: 'Dashed Borders' },
                { mode: 'outer', label: 'Box Borders' },
              ] as { mode: TableBorderMode; label: string }[]
            ).map((item) => (
              <button
                key={item.mode}
                onClick={() => {
                  if (applyToWholeTable) {
                    applyFormattingToEntireTable(editor, { borderMode: item.mode });
                  } else {
                    setTableCellFormatting(editor, { borderMode: item.mode });
                  }
                }}
                className={`px-2 py-1.5 rounded text-left text-[11px] flex items-center justify-between cursor-pointer ${
                  getActiveTableCellAttributes(editor).borderMode === item.mode
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <span>{item.label}</span>
                {getActiveTableCellAttributes(editor).borderMode === item.mode && (
                  <Check className="w-3 h-3 text-teal-400" />
                )}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Border Color</div>
          <div className="flex flex-wrap gap-1.5">
            {TABLE_BORDER_COLOR_PALETTE.map((swatch) => (
              <button
                key={swatch.label}
                onClick={() => {
                  if (applyToWholeTable) {
                    applyFormattingToEntireTable(editor, { borderColor: swatch.value });
                  } else {
                    setTableCellFormatting(editor, { borderColor: swatch.value });
                  }
                }}
                style={{ backgroundColor: swatch.value || '#334155' }}
                className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                  getActiveTableCellAttributes(editor).borderColor === swatch.value
                    ? 'ring-2 ring-teal-400 border-white'
                    : 'border-slate-600'
                }`}
                title={swatch.label}
              />
            ))}
          </div>
        </div>
      )}

      {/* Unclipped Table Cell Background Shading Popover */}
      {tableBgMenuOpen && (
        <div
          className="absolute top-full left-64 mt-1.5 z-50 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3.5 backdrop-blur-xl text-xs text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <span className="font-bold text-teal-300">Cell Background Color</span>
            <button
              onClick={() => setTableBgMenuOpen(false)}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-teal-300 mb-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToWholeTable}
              onChange={(e) => setApplyToWholeTable(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-teal-500"
            />
            <span>Apply fill to entire table</span>
          </label>

          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {TABLE_CELL_BG_PALETTE.map((swatch) => (
              <button
                key={swatch.label}
                onClick={() => {
                  if (applyToWholeTable) {
                    applyFormattingToEntireTable(editor, { backgroundColor: swatch.value });
                  } else {
                    setTableCellFormatting(editor, { backgroundColor: swatch.value });
                  }
                }}
                style={{ backgroundColor: swatch.value || 'transparent' }}
                className={`h-7 rounded-md border flex items-center justify-center transition-transform hover:scale-105 cursor-pointer ${
                  getActiveTableCellAttributes(editor).backgroundColor === swatch.value
                    ? 'ring-2 ring-teal-400 border-white'
                    : 'border-slate-700'
                }`}
                title={swatch.label}
              >
                {swatch.value === null && <X className="w-3.5 h-3.5 text-slate-400" />}
                {getActiveTableCellAttributes(editor).backgroundColor === swatch.value &&
                  swatch.value !== null && <Check className="w-3.5 h-3.5 text-slate-900 drop-shadow" />}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <span className="text-[11px] text-slate-400">Custom Fill:</span>
            <input
              type="color"
              value={getActiveTableCellAttributes(editor).backgroundColor || '#f1f5f9'}
              onChange={(e) => {
                if (applyToWholeTable) {
                  applyFormattingToEntireTable(editor, { backgroundColor: e.target.value });
                } else {
                  setTableCellFormatting(editor, { backgroundColor: e.target.value });
                }
              }}
              className="w-8 h-6 rounded cursor-pointer bg-transparent border border-slate-700"
            />
            <button
              onClick={() => {
                if (applyToWholeTable) {
                  applyFormattingToEntireTable(editor, { backgroundColor: null });
                } else {
                  setTableCellFormatting(editor, { backgroundColor: null });
                }
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
            >
              Clear Fill
            </button>
          </div>
        </div>
      )}

      {/* Modal prompt for Link and Image insertion */}
      {promptState.type && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-150">
            <h3 className="text-sm font-bold text-slate-100 mb-2 capitalize">
              Insert {promptState.type}
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              {promptState.type === 'image' 
                ? 'Enter the image URL or paste an image directly from your clipboard anywhere into the document.' 
                : 'Enter the destination web URL (https://...):'}
            </p>
            <input
              type="text"
              defaultValue={promptState.defaultVal}
              id="prompt-input-field"
              placeholder={promptState.type === 'image' ? 'https://example.com/image.png' : 'https://example.com'}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 mb-4 focus:outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePromptSubmit((e.target as HTMLInputElement).value);
                }
              }}
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setPromptState({ type: null, defaultVal: '' })}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('prompt-input-field') as HTMLInputElement;
                  handlePromptSubmit(input ? input.value : '');
                }}
                className="px-4 py-1.5 rounded-lg bg-accent text-slate-950 font-bold hover:bg-accent/90 transition-colors"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
