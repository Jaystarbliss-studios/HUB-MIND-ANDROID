import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Printer, Download, FileText, ZoomIn, ZoomOut,
  Check, Loader2, Eye, Copy, Layers, ChevronLeft, ChevronRight,
  Smartphone, Monitor
} from 'lucide-react';
import { OfficialLetterhead } from './OfficialLetterhead';
import { 
  PaperSizeOption, 
  OrientationOption, 
  MarginOption, 
  computePageLayout, 
  paginateDocument,
  PAPER_SIZES,
  MARGIN_PRESETS
} from '../../lib/paginationEngine';
import { 
  exportDocumentAsPDF, 
  printDocumentDirect, 
  exportDocumentAsDOCX, 
  exportDocumentAsHTML, 
  exportDocumentAsTXT 
} from '../../lib/documentExporter';

interface FullPagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  docTitle: string;
  bodyHtml: string;
  textContent: string;
  pageSize?: PaperSizeOption;
  orientation?: OrientationOption;
  marginOption?: MarginOption;
}

export const FullPagePreviewModal: React.FC<FullPagePreviewModalProps> = ({
  isOpen,
  onClose,
  docTitle,
  bodyHtml,
  textContent,
  pageSize = 'a4',
  orientation = 'portrait',
  marginOption = 'normal',
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingDOCX, setIsExportingDOCX] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [currentPageSize, setCurrentPageSize] = useState<PaperSizeOption>(pageSize);
  const [currentOrientation, setCurrentOrientation] = useState<OrientationOption>(orientation);
  const [currentMarginOption, setCurrentMarginOption] = useState<MarginOption>(marginOption);

  useEffect(() => {
    setCurrentPageSize(pageSize);
    setCurrentOrientation(orientation);
    setCurrentMarginOption(marginOption);
  }, [pageSize, orientation, marginOption]);

  const layout = useMemo(() => {
    return computePageLayout({
      paperSize: currentPageSize,
      orientation: currentOrientation,
      marginOption: currentMarginOption,
    });
  }, [currentPageSize, currentOrientation, currentMarginOption]);

  // Adjust default zoom for smaller mobile screens
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const viewportWidth = Math.max(280, window.innerWidth - 32);
      const fitScale = Math.min(0.95, Math.max(0.35, viewportWidth / layout.pageWidthPx));
      setZoomLevel(Math.round(fitScale * 100) / 100);
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Accurately paginate content into discrete physical page sheets
  const paginatedPages = useMemo(() => {
    if (!isOpen) return [''];
    const result = paginateDocument(bodyHtml, {
      paperSize: currentPageSize,
      orientation: currentOrientation,
      marginOption: currentMarginOption,
    });
    return result.pages;
  }, [isOpen, bodyHtml, currentPageSize, currentOrientation, currentMarginOption]);

  const totalPages = Math.max(1, paginatedPages.length);

  if (!isOpen) return null;

  const handlePrint = async () => {
    await printDocumentDirect(docTitle, bodyHtml, currentPageSize, currentOrientation, currentMarginOption);
  };

  const handleDownloadPDF = async () => {
    setIsExportingPDF(true);
    setPdfProgress(15);
    try {
      await exportDocumentAsPDF(
        docTitle, 
        bodyHtml, 
        currentPageSize, 
        currentOrientation, 
        currentMarginOption, 
        (percent) => {
          setPdfProgress(percent);
        }
      );
    } finally {
      setIsExportingPDF(false);
      setPdfProgress(0);
    }
  };

  const handleDownloadDOCX = async () => {
    setIsExportingDOCX(true);
    try {
      await exportDocumentAsDOCX(docTitle, bodyHtml, currentPageSize, currentOrientation, currentMarginOption);
    } finally {
      setIsExportingDOCX(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(textContent || '');
    setCopiedStatus(true);
    setTimeout(() => setCopiedStatus(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Controls Header Bar */}
      <div className="min-h-14 px-3 sm:px-6 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 sm:p-2 rounded-lg bg-accent/15 text-accent shrink-0">
            <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-base font-bold text-white truncate max-w-[180px] sm:max-w-xs md:max-w-md">
                {docTitle || 'Untitled Document'}
              </h2>
              <span className="bg-accent/20 text-accent font-mono text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold shrink-0">
                {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono hidden sm:block">
              Full Multi-Page Print Layout • {layout.paperDef.name} ({currentOrientation}, Margins: {layout.marginPreset.name})
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.35, Math.round((z - 0.1) * 100) / 100))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <span className="font-mono text-[10px] sm:text-xs font-semibold text-accent px-1.5 sm:px-2 min-w-[36px] sm:min-w-[44px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Page Size Switcher */}
          <div className="hidden sm:flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setCurrentPageSize('a4')}
              className={`px-2 py-1 rounded transition-colors font-medium cursor-pointer ${
                currentPageSize === 'a4' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              A4
            </button>
            <button
              onClick={() => setCurrentPageSize('letter')}
              className={`px-2 py-1 rounded transition-colors font-medium cursor-pointer ${
                currentPageSize === 'letter' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Letter
            </button>
            <button
              onClick={() => setCurrentPageSize('legal')}
              className={`px-2 py-1 rounded transition-colors font-medium cursor-pointer ${
                currentPageSize === 'legal' ? 'bg-accent text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Legal
            </button>
          </div>

          {/* Download PDF Button */}
          <button
            onClick={handleDownloadPDF}
            disabled={isExportingPDF}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Download formatted PDF file"
          >
            {isExportingPDF ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>PDF</span>
              </>
            )}
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
            title="Print or Save via System Print Dialog"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {/* Export Word */}
          <button
            onClick={handleDownloadDOCX}
            disabled={isExportingDOCX}
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 cursor-pointer"
            title="Export as Microsoft Word (.docx)"
          >
            {isExportingDOCX ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-blue-400" />}
            <span>DOCX</span>
          </button>

          {/* Close Modal Button */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Viewing Area with Separate Physical Page Cards */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 flex flex-col items-center bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800 space-y-8">
        {/* Multi-Page Indicator Pill */}
        <div className="flex items-center gap-2 bg-slate-900/95 border border-slate-800 backdrop-blur-md px-4 py-1.5 rounded-full text-xs text-slate-300 shadow-md shrink-0">
          <Layers className="w-3.5 h-3.5 text-accent" />
          <span>
            Document Preview: <strong>{totalPages} {layout.paperDef.name.toUpperCase()} {totalPages === 1 ? 'Page' : 'Pages'}</strong>
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400 font-mono text-[11px]">100% Aligned with Editor Canvas & PDF Export</span>
        </div>

        {/* Render each page as an independent physical paper sheet */}
        <div 
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="flex flex-col items-center space-y-12 pb-20"
        >
          {paginatedPages.map((pageHtml, index) => {
            const pageNumber = index + 1;
            const isFirstPage = index === 0;

            return (
              <div
                key={index}
                id={`preview-page-${pageNumber}`}
                style={{
                  width: `${layout.pageWidthPx}px`,
                  minHeight: `${layout.pageHeightPx}px`,
                  padding: `${layout.marginsPx.top}px ${layout.marginsPx.right}px ${layout.marginsPx.bottom}px ${layout.marginsPx.left}px`,
                  boxSizing: 'border-box',
                }}
                className="bg-white text-slate-950 rounded-xs shadow-2xl border border-slate-300 ring-1 ring-black/10 flex flex-col justify-between relative select-text"
              >
                {/* Page Top Margin / Header Zone */}
                <div>
                  {isFirstPage ? (
                    <OfficialLetterhead theme="white" className="mb-6" />
                  ) : (
                    <div className="mb-6 pb-3 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500 font-mono select-none">
                      <span className="font-semibold text-slate-700 truncate max-w-sm">
                        {docTitle || 'Untitled Document'}
                      </span>
                      <span className="text-slate-500">
                        Jaystarbliss Dynamic Institute
                      </span>
                    </div>
                  )}

                  {/* Page Body Content Slice */}
                  <div
                    className="ProseMirror paper-white max-w-none text-slate-900 font-sans pt-1"
                    dangerouslySetInnerHTML={{ __html: pageHtml || '<p class="text-slate-400 italic">Empty page.</p>' }}
                  />
                </div>

                {/* Floating Page Badge on top left corner */}
                <div className="absolute -left-12 top-4 hidden xl:flex items-center px-2 py-1 bg-slate-900 border border-slate-800 text-accent rounded text-[11px] font-mono font-bold shadow-lg">
                  Page {pageNumber}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
