import React, { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from 'react';
import { EditorContent, Editor } from '@tiptap/react';
import { OfficialLetterhead } from './OfficialLetterhead';
import { 
  PaperSizeOption, 
  OrientationOption, 
  MarginOption, 
  PaperThemeOption, 
  computePageLayout, 
  ComputedPageLayout,
  paginateDocument,
  PageDebugInfo,
  pxToMm
} from '../../lib/paginationEngine';
import { Layers, Bug, SplitSquareVertical, FileText } from 'lucide-react';

interface PaginatedPageContainerProps {
  editor: Editor | null;
  paperSize: PaperSizeOption;
  orientation: OrientationOption;
  marginOption: MarginOption;
  paperTheme: PaperThemeOption;
  zoomLevel: number;
  showPageBreaks: boolean;
  showMarginGuides: boolean;
  showDebugInfo: boolean;
  pageCount: number;
  activePage: number;
  onPageCountChange: (count: number) => void;
  onActivePageChange: (page: number) => void;
  onDebugInfoChange?: (info: PageDebugInfo[]) => void;
}

export function PaginatedPageContainer({
  editor,
  paperSize,
  orientation,
  marginOption,
  paperTheme,
  zoomLevel,
  showPageBreaks,
  showMarginGuides,
  showDebugInfo,
  pageCount,
  activePage,
  onPageCountChange,
  onActivePageChange,
  onDebugInfoChange,
}: PaginatedPageContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(false);
  const [debugData, setDebugData] = useState<PageDebugInfo[]>([]);
  const [internalPageCount, setInternalPageCount] = useState<number>(Math.max(1, pageCount));

  const deskGapPx = 48;

  // Calculate physical layout from single source of truth
  const layout = useMemo(() => {
    return computePageLayout({
      paperSize,
      orientation,
      marginOption,
      includeLetterheadOnPage1: true,
    });
  }, [paperSize, orientation, marginOption]);

  // Umo-style page view: keep physical paper geometry fixed and scale the
  // complete page surface for the device viewport.
  const [mobileZoomFactor, setMobileZoomFactor] = useState(1);
  const mobileCanvasScale = useMemo(() => {
    if (!isMobileScreen) return 1;
    const viewportWidth = Math.max(280, containerRef.current?.clientWidth || window.innerWidth);
    const fitScale = Math.min(1, Math.max(0.42, (viewportWidth - 24) / layout.pageWidthPx));
    return Math.min(2.5, Math.max(0.42, fitScale * mobileZoomFactor));
  }, [isMobileScreen, layout.pageWidthPx, mobileZoomFactor]);

  // Check mobile viewport width
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Compute exact spacer needed to bridge from bottom of Sheet (N) to content top of Sheet (N+1)
  const breakSpacerHeight = useMemo(() => {
    return layout.marginsPx.bottom + deskGapPx + layout.marginsPx.top + layout.subsequentHeaderHeightPx + 20;
  }, [layout.marginsPx.bottom, deskGapPx, layout.marginsPx.top, layout.subsequentHeaderHeightPx]);

  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileScreen || event.touches.length !== 2) return;
    pinchStartDistanceRef.current = getTouchDistance(event.touches);
    pinchStartZoomRef.current = mobileZoomFactor;
  }, [getTouchDistance, isMobileScreen, mobileZoomFactor]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileScreen || event.touches.length !== 2 || !pinchStartDistanceRef.current) return;
    event.preventDefault();
    const distance = getTouchDistance(event.touches);
    if (!distance) return;
    setMobileZoomFactor(Math.min(2.5, Math.max(1, pinchStartZoomRef.current * (distance / pinchStartDistanceRef.current))));
  }, [getTouchDistance, isMobileScreen]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchStartDistanceRef.current = null;
      setMobileZoomFactor((current) => Math.abs(current - 1) < 0.06 ? 1 : current);
    }
  }, []);

  // Calculate page placement without permanently rewriting the user's paragraph margins.
  // Page geometry remains controlled by the central pagination engine while the
  // ProseMirror document retains its own typography and alignment.
  const reflowEditorPages = useCallback(() => {
    if (!editorHostRef.current) return 1;

    const editorProse = editorHostRef.current.querySelector('.tiptap.ProseMirror') as HTMLElement | null;
    if (!editorProse) return 1;

    const children = Array.from(editorProse.children) as HTMLElement[];
    if (children.length === 0) {
      setInternalPageCount(1);
      if (pageCount !== 1) onPageCountChange(1);
      return 1;
    }

    // Clear only our previous temporary page-placement overrides before measuring.
    children.forEach((child) => {
      const original = child.dataset.hubmindOriginalMarginTop;
      if (original !== undefined) child.style.marginTop = original;
      delete child.dataset.hubmindOriginalMarginTop;
      delete child.dataset.pageNumber;
    });

    // Leave a small safety buffer so glyph descenders/anti-aliasing never appear
    // inside the physical bottom margin.
    const safetyPx = 12;
    const firstPageCapacity = Math.max(
      150,
      layout.pageHeightPx -
        layout.marginsPx.top -
        layout.marginsPx.bottom -
        layout.page1HeaderHeightPx -
        safetyPx
    );
    const subsequentPageCapacity = Math.max(
      200,
      layout.pageHeightPx -
        layout.marginsPx.top -
        layout.marginsPx.bottom -
        layout.subsequentHeaderHeightPx -
        20 -
        safetyPx
    );

    let currentPage = 1;
    let usedHeight = 0;

    children.forEach((child, index) => {
      const tagName = child.tagName.toLowerCase();
      const isExplicitBreak =
        tagName === 'hr' ||
        child.classList.contains('page-break') ||
        child.classList.contains('soft-page-break') ||
        child.classList.contains('hard-page-break') ||
        child.getAttribute('data-page-break') === 'true' ||
        child.getAttribute('data-page-break') === 'hard' ||
        child.getAttribute('data-page-break') === 'soft';

      const style = window.getComputedStyle(child);
      const marginTop = parseFloat(style.marginTop || '0') || 0;
      const marginBottom = parseFloat(style.marginBottom || '0') || 0;
      const childHeight =
        Math.max(1, child.getBoundingClientRect().height) +
        marginTop +
        marginBottom;

      const capacity =
        currentPage === 1 ? firstPageCapacity : subsequentPageCapacity;
      const isHeading = /^h[1-6]$/.test(tagName);
      const orphanBuffer = isHeading ? 48 : 0;

      if (
        isExplicitBreak ||
        (index > 0 &&
          usedHeight > 0 &&
          usedHeight + childHeight + orphanBuffer > capacity)
      ) {
        currentPage += 1;
        usedHeight = 0;
      }

      child.dataset.pageNumber = String(currentPage);

      if (isExplicitBreak) {
        usedHeight = 0;
        return;
      }

      // Position the first block of every subsequent sheet at that sheet's
      // printable top. The original author-defined margin is retained and restored
      // before every measurement, so alignment/spacing never becomes cumulative.
      if (currentPage > 1 && usedHeight === 0) {
        const originalMarginTop = child.style.marginTop;
        child.dataset.hubmindOriginalMarginTop = originalMarginTop;

        const editorTop = editorProse.getBoundingClientRect().top;
        const pageTop =
          editorTop +
          (currentPage - 1) * (layout.pageHeightPx + deskGapPx) +
          layout.marginsPx.top +
          layout.subsequentHeaderHeightPx +
          20;

        const previous = children[index - 1];
        const previousBottom = previous
          ? previous.getBoundingClientRect().bottom
          : editorTop;

        const bridge = Math.max(0, Math.round(pageTop - previousBottom));
        child.style.marginTop = `${Math.max(marginTop, bridge)}px`;
      }

      usedHeight += childHeight;
    });

    const totalPagesComputed = Math.max(1, currentPage);
    setInternalPageCount(totalPagesComputed);
    if (totalPagesComputed !== pageCount) {
      onPageCountChange(totalPagesComputed);
    }

    return totalPagesComputed;
  }, [layout, deskGapPx, pageCount, onPageCountChange]);

  // Synchronize layout & pagination engine debug stats whenever editor changes
  useEffect(() => {
    if (!editor) return;

    const syncPagination = () => {
      if (editor.isDestroyed || !(editor as any).view?.dom) return;
      reflowEditorPages();

      const html = editor.getHTML();
      const result = paginateDocument(html, {
        paperSize,
        orientation,
        marginOption,
        includeLetterheadOnPage1: true,
      });

      setDebugData(result.debugInfo);
      if (onDebugInfoChange) {
        onDebugInfoChange(result.debugInfo);
      }
    };

    syncPagination();
    const timer = setTimeout(syncPagination, 60);

    // TipTap transaction hook
    editor.on('transaction', syncPagination);

    return () => {
      clearTimeout(timer);
      editor.off('transaction', syncPagination);
    };
  }, [editor, paperSize, orientation, marginOption, reflowEditorPages, onDebugInfoChange]);

  // Re-flow on layout changes or window resizing
  useLayoutEffect(() => {
    reflowEditorPages();
  }, [layout, zoomLevel, paperSize, orientation, marginOption, reflowEditorPages]);

  // Track active page based on scroll position in editor container
  useEffect(() => {
    const handleScroll = () => {
      const scrollParent = containerRef.current?.closest('.overflow-y-auto');
      if (!scrollParent) return;

      const scrollTop = scrollParent.scrollTop;
      const targetHeight = (layout.pageHeightPx + deskGapPx) * (isMobileScreen ? mobileCanvasScale : zoomLevel);
      const currentPage = Math.min(
        effectivePageCount,
        Math.max(1, Math.floor((scrollTop + 200) / targetHeight) + 1)
      );

      if (currentPage !== activePage) {
        onActivePageChange(currentPage);
      }
    };

    const scrollParent = containerRef.current?.closest('.overflow-y-auto');
    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollParent.removeEventListener('scroll', handleScroll);
    }
  }, [layout.pageHeightPx, deskGapPx, zoomLevel, mobileCanvasScale, internalPageCount, pageCount, activePage, onActivePageChange, isMobileScreen]);

  const effectivePageCount = Math.max(1, Math.max(pageCount, internalPageCount));
  const pagesArray = useMemo(() => {
    return Array.from({ length: effectivePageCount }, (_, idx) => idx + 1);
  }, [effectivePageCount]);

  const isWhitePaper = paperTheme === 'white';

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={
        isMobileScreen
          ? {
              width: `${layout.pageWidthPx}px`,
              transform: `scale(${mobileCanvasScale})`,
              transformOrigin: 'top center',
              transition: 'transform 0.12s ease-out',
              touchAction: 'pan-x pan-y',
              marginBottom: `${-(layout.pageHeightPx * (1 - mobileCanvasScale))}px`,
            }
          : {
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top center',
              transition: 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
            }
      }
      className="w-full flex flex-col items-center pb-24 print:transform-none print:pb-0"
    >
      {/* Top Multi-Page & Orientation Status Badge */}
      <div className="mb-4 print:hidden flex items-center gap-2 bg-slate-900/95 border border-slate-800 backdrop-blur-md px-4 py-1.5 rounded-full text-xs text-slate-300 shadow-xl select-none animate-in fade-in duration-200">
        <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="font-medium">
          <strong className="text-white font-mono">{effectivePageCount} {paperSize.toUpperCase()} {effectivePageCount === 1 ? 'Page' : 'Pages'}</strong>
        </span>
        <span className="text-slate-600">•</span>
        <span className="text-[11px] text-slate-400 capitalize font-mono">{orientation}</span>
        <span className="text-slate-600">•</span>
        <span className="text-[11px] text-slate-400 font-mono">Margins: {marginOption}</span>
        <span className="text-slate-600">•</span>
        <span className="text-[11px] text-teal-400 font-mono font-semibold">Page {activePage} of {effectivePageCount}</span>
      </div>

      {/* Multi-Page Stack Canvas: Container holding layered physical sheets + active content */}
      <div 
        className="relative flex flex-col items-center print:block print:w-full"
        style={{
          width: `${layout.pageWidthPx}px`,
        }}
      >
        {/* Layer 1: Background Physical Paper Sheets (with desk gaps, running headers, footers) */}
        <div className="flex flex-col items-center w-full select-none pointer-events-none print:hidden">
          {pagesArray.map((pageNum, idx) => {
            const isFirstPage = pageNum === 1;

            return (
              <React.Fragment key={pageNum}>
                {/* Physical Sheet Card */}
                <div
                  id={`document-physical-sheet-${pageNum}`}
                  style={{
                    width: `${layout.pageWidthPx}px`,
                    height: `${layout.pageHeightPx}px`,
                    paddingTop: `${layout.marginsPx.top}px`,
                    paddingRight: `${layout.marginsPx.right}px`,
                    paddingBottom: `${layout.marginsPx.bottom}px`,
                    paddingLeft: `${layout.marginsPx.left}px`,
                    boxSizing: 'border-box',
                  }}
                  className={`relative transition-colors duration-150 ${
                    isWhitePaper
                      ? 'paper-white bg-white text-slate-950 border border-slate-300 shadow-2xl rounded-xs ring-1 ring-black/5'
                      : 'paper-dark bg-slate-900 text-slate-100 border border-slate-800 shadow-2xl rounded-xs ring-1 ring-white/5'
                  }`}
                >
                  {/* Optional Visual Margin Guides (Dashed Box) */}
                  {showMarginGuides && !isMobileScreen && (
                    <div 
                      className="absolute inset-0 pointer-events-none border border-dashed border-cyan-400/40 z-20 print:hidden"
                      style={{
                        top: `${layout.marginsPx.top}px`,
                        right: `${layout.marginsPx.right}px`,
                        bottom: `${layout.marginsPx.bottom}px`,
                        left: `${layout.marginsPx.left}px`,
                      }}
                    >
                      <span className="absolute -top-3 left-2 bg-cyan-950/80 text-cyan-300 text-[9px] font-mono px-1 rounded border border-cyan-500/40">
                        Print Area: {layout.contentWidthMm}mm × {layout.contentHeightMm}mm
                      </span>
                    </div>
                  )}

                  {/* Left Gutter Floating Sheet Number */}
                  {!isMobileScreen && (
                    <div className="absolute -left-16 top-4 hidden xl:flex flex-col items-center gap-1 print:hidden select-none pointer-events-auto">
                      <div className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-300 rounded text-[10px] font-mono font-bold shadow-xl flex items-center gap-1">
                        <FileText className="w-3 h-3 text-accent" />
                        <span>{pageNum}</span>
                      </div>
                    </div>
                  )}

                  {/* Top of Sheet: Official Letterhead on Page 1, Running Header on Page 2+ */}
                  {isFirstPage ? (
                    <div className="pointer-events-auto">
                      <OfficialLetterhead theme={paperTheme} />
                    </div>
                  ) : (
                    <div 
                      style={{ height: `${layout.subsequentHeaderHeightPx}px` }}
                      className="running-header pb-2 mb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 font-sans select-none print:border-slate-300 pointer-events-auto"
                    >
                      <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-700 dark:text-slate-300 print:text-black">
                        Jaystarbliss Dynamic Institute
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 print:text-black font-semibold">
                        Sheet {pageNum} of {effectivePageCount}
                      </span>
                    </div>
                  )}

                  {/* Bottom of Sheet: Footer Page Indicator */}
                  <div className="absolute bottom-3 right-6 text-[10px] font-mono text-slate-400 print:text-black select-none pointer-events-none font-semibold">
                    Page {pageNum} of {effectivePageCount}
                  </div>
                </div>

                {/* Desk Gap & Clean Visual Separation Between Consecutive Sheets */}
                {idx < pagesArray.length - 1 && (
                  <div 
                    style={{ height: `${deskGapPx}px` }}
                    className="w-full flex items-center justify-center select-none pointer-events-none print:hidden"
                  >
                    {showPageBreaks && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/90 border border-slate-800 backdrop-blur-xs rounded-full text-[10px] font-mono text-slate-400 shadow-md">
                        <SplitSquareVertical className="w-3 h-3 text-accent" />
                        <span>Page Break</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-teal-400 font-bold">Sheet {pageNum + 1} of {effectivePageCount}</span>
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Layer 2: Active TipTap Content Host Surface (positioned on top of the physical sheets) */}
        <div
          ref={editorHostRef}
          id="hubmind-active-editor-content-host"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${layout.pageWidthPx}px`,
            paddingTop: `${layout.marginsPx.top + layout.page1HeaderHeightPx}px`,
            paddingRight: `${layout.marginsPx.right}px`,
            paddingBottom: `${layout.marginsPx.bottom}px`,
            paddingLeft: `${layout.marginsPx.left}px`,
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
          className={`z-10 print:static print:p-0 print:w-full ${
            isWhitePaper ? 'paper-white text-slate-900' : 'paper-dark text-slate-100'
          }`}
        >
          {editor && (
            <div className={`document-paginated-editor-content min-h-[300px] ${
              isWhitePaper ? 'paper-white text-slate-900' : 'paper-dark text-slate-100'
            }`}>
              <EditorContent editor={editor} />
            </div>
          )}
        </div>
      </div>

      {/* Pagination Debug Inspector Overlay */}
      {showDebugInfo && debugData.length > 0 && (
        <div className="fixed bottom-12 right-6 z-40 bg-slate-900/95 border border-cyan-500/40 rounded-xl p-4 shadow-2xl backdrop-blur-md max-w-sm w-full text-xs text-slate-200 print:hidden font-mono animate-in fade-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Bug className="w-4 h-4" />
              <span>Pagination Engine Inspector</span>
            </div>
            <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {paperSize.toUpperCase()} • {orientation}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-slate-400">
              <span>Paper Size:</span>
              <span className="text-white font-semibold">{layout.pageWidthMm}mm × {layout.pageHeightMm}mm ({layout.pageWidthPx}×{layout.pageHeightPx}px)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Margins (T/R/B/L):</span>
              <span className="text-white font-semibold">{layout.marginsMm.topMm}mm / {layout.marginsMm.rightMm}mm / {layout.marginsMm.bottomMm}mm / {layout.marginsMm.leftMm}mm</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Content Area:</span>
              <span className="text-white font-semibold">{layout.contentWidthMm}mm × {layout.contentHeightMm}mm ({layout.contentWidthPx}×{layout.contentHeightPx}px)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Break Spacer:</span>
              <span className="text-teal-300 font-semibold">{breakSpacerHeight}px</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2">
            <div className="text-[10px] uppercase text-slate-500 font-bold mb-1.5">Page Breakdown</div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 pr-1">
              {debugData.map((info) => (
                <div key={info.pageNumber} className="bg-slate-950 p-2 rounded border border-slate-800 flex items-center justify-between text-[11px]">
                  <div>
                    <span className="text-accent font-bold">Page {info.pageNumber}</span>
                    <span className="text-slate-500 ml-1.5">({info.totalElements} nodes)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-300 font-mono">{info.usedHeightPx}px / {info.maxHeightPx}px</span>
                    <span className="text-slate-500 ml-1">({pxToMm(info.usedHeightPx)}mm)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
