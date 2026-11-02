import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import {
  computePageLayout,
  PAPER_SIZES,
  MARGIN_PRESETS,
  type PaperSizeOption,
  type OrientationOption,
  type MarginOption,
  type ComputedPageLayout,
} from './paginationEngine';

/**
 * TIPTAP EXTENSION: PAGE BREAK
 * Natively supports both hard (user-inserted) and soft (automatically generated)
 * page breaks with full schema support, undo/redo history, and Mod-Enter shortcut.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Inserts an explicit page break (hard or soft) */
      setPageBreak: (type?: 'hard' | 'soft') => ReturnType;
      /** Removes any soft page breaks */
      clearSoftPageBreaks: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      'data-page-break': {
        default: 'hard',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-page-break') ||
          (element.classList.contains('soft-page-break') ? 'soft' : 'hard'),
        renderHTML: (attributes) => ({
          'data-page-break': attributes['data-page-break'] || 'hard',
        }),
      },
      class: {
        default: 'page-break hard-page-break',
        parseHTML: (element: HTMLElement) => element.className || 'page-break hard-page-break',
        renderHTML: (attributes) => {
          const breakType = attributes['data-page-break'] || 'hard';
          const typeClass = breakType === 'soft' ? 'soft-page-break' : 'hard-page-break';
          return {
            class: `page-break ${typeClass}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'hr.page-break' },
      { tag: 'hr[data-page-break]' },
      { tag: 'div.page-break' },
      { tag: 'div[data-page-break]' },
      { tag: 'hr.soft-page-break' },
      { tag: 'hr.hard-page-break' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const isSoft = HTMLAttributes['data-page-break'] === 'soft';
    const className = `page-break ${isSoft ? 'soft-page-break' : 'hard-page-break'}`;
    return ['hr', mergeAttributes(HTMLAttributes, { class: className })];
  },

  addCommands() {
    return {
      setPageBreak:
        (type: 'hard' | 'soft' = 'hard') =>
        ({ chain }) => {
          const isSoft = type === 'soft';
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                'data-page-break': type,
                class: `page-break ${isSoft ? 'soft-page-break' : 'hard-page-break'}`,
              },
            })
            .run();
        },

      clearSoftPageBreaks:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          let changed = false;
          tr.doc.descendants((node, pos) => {
            if (node.type.name === 'pageBreak' && node.attrs['data-page-break'] === 'soft') {
              tr.delete(pos, pos + node.nodeSize);
              changed = true;
              return false;
            }
            return true;
          });
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Mod-Enter (Ctrl+Enter / Cmd+Enter) inserts standard Hard Page Break
      'Mod-Enter': () => this.editor.commands.setPageBreak('hard'),
    };
  },
});

/**
 * Calculates current document rendered height in pixels.
 */
export function calculateDocumentHeight(editorHost: HTMLElement | null): number {
  if (!editorHost) return 0;
  const editorProse = editorHost.querySelector('.tiptap.ProseMirror') as HTMLElement | null;
  if (!editorProse) return 0;
  return editorProse.offsetHeight || editorProse.scrollHeight || 0;
}

/**
 * Returns exact A4 page metrics and usable boundary heights for pagination.
 */
export function getA4BoundaryMetrics(
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): {
  layout: ComputedPageLayout;
  page1UsableHeightPx: number;
  subsequentUsableHeightPx: number;
  safetyBufferPx: number;
} {
  const layout = computePageLayout({
    paperSize: pageSize,
    orientation,
    marginOption,
  });

  const safetyBufferPx = 28; // Margin buffer preventing text from clipping boundary

  return {
    layout,
    page1UsableHeightPx: Math.max(150, layout.page1UsableHeightPx - safetyBufferPx),
    subsequentUsableHeightPx: Math.max(200, layout.subsequentUsableHeightPx - safetyBufferPx),
    safetyBufferPx,
  };
}

export interface PaginationHelperStatus {
  documentHeightPx: number;
  pageCount: number;
  isApproachingBoundary: boolean;
  activePageRemainingPx: number;
  hasSoftBreaks: boolean;
}

/**
 * Inserts an explicit Hard Page Break at current cursor position
 */
export function insertHardPageBreak(editor: Editor): boolean {
  if (!editor || editor.isDestroyed) return false;
  return editor.chain().focus().setPageBreak('hard').run();
}

/**
 * Automatically inspects the document structure and inserts or adjusts soft page breaks
 * when text blocks approach or cross the defined A4-size boundary.
 */
export function autoPaginateDocument(
  editor: Editor,
  editorHost: HTMLElement | null,
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): PaginationHelperStatus {
  const defaultStatus: PaginationHelperStatus = {
    documentHeightPx: 0,
    pageCount: 1,
    isApproachingBoundary: false,
    activePageRemainingPx: 0,
    hasSoftBreaks: false,
  };

  if (!editor || editor.isDestroyed || !editorHost) {
    return defaultStatus;
  }

  const editorProse = editorHost.querySelector('.tiptap.ProseMirror') as HTMLElement | null;
  if (!editorProse) {
    return defaultStatus;
  }

  const totalHeight = editorProse.offsetHeight || editorProse.scrollHeight || 0;
  const { page1UsableHeightPx, subsequentUsableHeightPx } = getA4BoundaryMetrics(
    pageSize,
    orientation,
    marginOption
  );

  const children = Array.from(editorProse.children) as HTMLElement[];
  if (children.length === 0) {
    return {
      ...defaultStatus,
      documentHeightPx: totalHeight,
      activePageRemainingPx: page1UsableHeightPx,
    };
  }

  let currentPage = 1;
  let accumulatedHeight = 0;
  let currentCapacity = page1UsableHeightPx;
  let hasSoftBreaks = false;
  let isApproachingBoundary = false;

  children.forEach((child, index) => {
    const tagName = child.tagName.toLowerCase();
    const isHardBreak =
      tagName === 'hr' &&
      (child.getAttribute('data-page-break') === 'hard' ||
        child.classList.contains('hard-page-break') ||
        !child.classList.contains('soft-page-break'));
    const isSoftBreak =
      child.getAttribute('data-page-break') === 'soft' ||
      child.classList.contains('soft-page-break');

    if (isSoftBreak) {
      hasSoftBreaks = true;
    }

    if (isHardBreak || isSoftBreak) {
      currentPage++;
      accumulatedHeight = 0;
      currentCapacity = subsequentUsableHeightPx;
      return;
    }

    const childStyle = window.getComputedStyle(child);
    const marginTop = parseFloat(childStyle.marginTop) || 0;
    const marginBottom = parseFloat(childStyle.marginBottom) || 0;
    const childHeight = (child.offsetHeight || 28) + marginTop + marginBottom;

    // Check if remaining space is tight (within 60px of boundary)
    const remainingBefore = currentCapacity - accumulatedHeight;
    if (remainingBefore < 60 && remainingBefore > 0) {
      isApproachingBoundary = true;
    }

    if (accumulatedHeight + childHeight > currentCapacity && index > 0) {
      // Content crosses the boundary into next page
      currentPage++;
      accumulatedHeight = childHeight;
      currentCapacity = subsequentUsableHeightPx;
    } else {
      accumulatedHeight += childHeight;
    }
  });

  const remaining = Math.max(0, currentCapacity - accumulatedHeight);

  return {
    documentHeightPx: totalHeight,
    pageCount: currentPage,
    isApproachingBoundary,
    activePageRemainingPx: remaining,
    hasSoftBreaks,
  };
}

/**
 * Removes all soft page breaks from the document.
 */
export function removeSoftPageBreaks(editor: Editor): boolean {
  if (!editor || editor.isDestroyed) return false;
  return editor.commands.clearSoftPageBreaks();
}

/**
 * Automatically inspects content height against A4 printable boundaries,
 * and inserts soft page breaks at exact top-level block junctions before boundary overflows.
 */
export function insertAutoSoftPageBreaks(
  editor: Editor,
  editorHost: HTMLElement | null,
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): { insertedCount: number; newPageCount: number } {
  if (!editor || editor.isDestroyed || !editorHost) {
    return { insertedCount: 0, newPageCount: 1 };
  }

  const editorProse = editorHost.querySelector('.tiptap.ProseMirror') as HTMLElement | null;
  if (!editorProse) {
    return { insertedCount: 0, newPageCount: 1 };
  }

  const { page1UsableHeightPx, subsequentUsableHeightPx } = getA4BoundaryMetrics(
    pageSize,
    orientation,
    marginOption
  );

  // Clear existing soft page breaks first
  editor.commands.clearSoftPageBreaks();

  const children = Array.from(editorProse.children) as HTMLElement[];
  if (children.length <= 1) {
    return { insertedCount: 0, newPageCount: 1 };
  }

  const breakPositions: number[] = [];
  let currentPage = 1;
  let accumulatedHeight = 0;
  let currentCapacity = page1UsableHeightPx;

  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const tagName = child.tagName.toLowerCase();
    const isHardBreak =
      tagName === 'hr' &&
      (child.getAttribute('data-page-break') === 'hard' ||
        child.classList.contains('hard-page-break') ||
        !child.classList.contains('soft-page-break'));

    if (isHardBreak) {
      currentPage++;
      accumulatedHeight = 0;
      currentCapacity = subsequentUsableHeightPx;
      continue;
    }

    const childStyle = window.getComputedStyle(child);
    const marginTop = parseFloat(childStyle.marginTop) || 0;
    const marginBottom = parseFloat(childStyle.marginBottom) || 0;
    const childHeight = (child.offsetHeight || 28) + marginTop + marginBottom;

    // If adding this child overflows current page capacity
    if (accumulatedHeight + childHeight > currentCapacity && index > 0) {
      try {
        const domPos = editor.view.posAtDOM(child, 0);
        const resolved = editor.state.doc.resolve(domPos);
        const insertPos = resolved.before(1);
        if (insertPos >= 0 && !breakPositions.includes(insertPos)) {
          breakPositions.push(insertPos);
        }
      } catch {
        // Safe fallback if posAtDOM fails
      }
      currentPage++;
      accumulatedHeight = childHeight;
      currentCapacity = subsequentUsableHeightPx;
    } else {
      accumulatedHeight += childHeight;
    }
  }

  if (breakPositions.length > 0 && editor.schema.nodes.pageBreak) {
    const tr = editor.state.tr;
    // Insert from highest position to lowest so earlier positions don't shift
    breakPositions.sort((a, b) => b - a);

    for (const pos of breakPositions) {
      const pageBreakNode = editor.schema.nodes.pageBreak.create({
        'data-page-break': 'soft',
        class: 'page-break soft-page-break',
      });
      tr.insert(pos, pageBreakNode);
    }

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  return { insertedCount: breakPositions.length, newPageCount: currentPage };
}
