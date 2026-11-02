import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Editor } from '@tiptap/react';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type TableBorderMode = 'all' | 'none' | 'bottom' | 'thick' | 'dashed' | 'outer';
export type TableVerticalAlign = 'top' | 'middle' | 'bottom';
export type TableTextAlign = 'left' | 'center' | 'right' | 'justify';
export type TableSortDirection = 'asc' | 'desc' | null;

export interface TableCellFormattingAttributes {
  backgroundColor: string | null;
  borderMode: TableBorderMode;
  borderColor: string | null;
  textAlign: TableTextAlign | null;
  verticalAlign: TableVerticalAlign;
  sortDirection?: TableSortDirection;
}

export interface PreformattedTableTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  badge: string;
  html: string;
}

export const PREFORMATTED_TABLE_TEMPLATES: PreformattedTableTemplate[] = [
  {
    id: 'weekly-task-matrix',
    name: 'Weekly Task Matrix',
    category: 'Operations & Planning',
    description: 'Track weekly deliverables, owners, priority levels, daily focus, and completion status.',
    badge: '6 Cols • Sortable',
    html: `<table>
      <thead>
        <tr>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="left"><p><strong>Task / Deliverable</strong></p></th>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="left"><p><strong>Owner</strong></p></th>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="center"><p><strong>Priority</strong></p></th>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="left"><p><strong>Mon – Wed Focus</strong></p></th>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="left"><p><strong>Thu – Fri Focus</strong></p></th>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="center"><p><strong>Status</strong></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>Q4 Curriculum &amp; Assessment Audit</p></td>
          <td><p>Adaeze Okafor</p></td>
          <td data-bg-color="#ffe4e6" data-text-align="center"><p><strong>High</strong></p></td>
          <td><p>Compile faculty rubrics &amp; module metrics</p></td>
          <td><p>Final review with academic board</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>On Track</p></td>
        </tr>
        <tr>
          <td><p>Client Onboarding Portal Upgrade</p></td>
          <td><p>Tunde Bakare</p></td>
          <td data-bg-color="#fef3c7" data-text-align="center"><p><strong>Medium</strong></p></td>
          <td><p>API authentication &amp; role permissions</p></td>
          <td><p>Staging QA &amp; regression testing</p></td>
          <td data-bg-color="#e0f2fe" data-text-align="center"><p>In Progress</p></td>
        </tr>
        <tr>
          <td><p>Weekly Executive Financial Briefing</p></td>
          <td><p>Chidinma Eze</p></td>
          <td data-bg-color="#ffe4e6" data-text-align="center"><p><strong>High</strong></p></td>
          <td><p>Reconcile department ledgers</p></td>
          <td><p>Publish executive summary deck</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>Completed</p></td>
        </tr>
        <tr>
          <td><p>Partner Outreach &amp; Sponsorships</p></td>
          <td><p>Ibrahim Musa</p></td>
          <td data-bg-color="#f1f5f9" data-text-align="center"><p><strong>Low</strong></p></td>
          <td><p>Draft partner prospectus packages</p></td>
          <td><p>Schedule discovery calls</p></td>
          <td data-bg-color="#fef3c7" data-text-align="center"><p>Pending</p></td>
        </tr>
      </tbody>
    </table>`,
  },
  {
    id: 'expense-log',
    name: 'Expense Log',
    category: 'Finance & Accounting',
    description: 'Itemized expense tracker with dates, categories, vendors, payment methods, and sortable amounts.',
    badge: '6 Cols • Sortable',
    html: `<table>
      <thead>
        <tr>
          <th data-bg-color="#e0f2fe" data-border-mode="all" data-text-align="left"><p><strong>Date</strong></p></th>
          <th data-bg-color="#e0f2fe" data-border-mode="all" data-text-align="left"><p><strong>Category</strong></p></th>
          <th data-bg-color="#e0f2fe" data-border-mode="all" data-text-align="left"><p><strong>Description / Vendor</strong></p></th>
          <th data-bg-color="#e0f2fe" data-border-mode="all" data-text-align="center"><p><strong>Payment Method</strong></p></th>
          <th data-bg-color="#e0f2fe" data-border-mode="all" data-text-align="right"><p><strong>Amount ($)</strong></p></th>
          <th data-bg-color="#e0f2fe" data-border-mode="all" data-text-align="center"><p><strong>Approval</strong></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>2026-10-24</p></td>
          <td><p>Cloud Infrastructure</p></td>
          <td><p>Production Server Cluster &amp; CDN Hosting</p></td>
          <td data-text-align="center"><p>Corporate Card</p></td>
          <td data-text-align="right"><p>$1,480.00</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>Approved</p></td>
        </tr>
        <tr>
          <td><p>2026-10-26</p></td>
          <td><p>Software Licenses</p></td>
          <td><p>Design &amp; Collaborative Workspace Seats (Annual)</p></td>
          <td data-text-align="center"><p>Wire Transfer</p></td>
          <td data-text-align="right"><p>$840.00</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>Approved</p></td>
        </tr>
        <tr>
          <td><p>2026-10-28</p></td>
          <td><p>Training &amp; Events</p></td>
          <td><p>Executive Leadership Workshop Materials</p></td>
          <td data-text-align="center"><p>Corporate Card</p></td>
          <td data-text-align="right"><p>$395.50</p></td>
          <td data-bg-color="#fef3c7" data-text-align="center"><p>Pending Review</p></td>
        </tr>
        <tr>
          <td><p>2026-10-30</p></td>
          <td><p>Office Operations</p></td>
          <td><p>High-Speed Fiber Redundancy Link</p></td>
          <td data-text-align="center"><p>Direct Debit</p></td>
          <td data-text-align="right"><p>$620.00</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>Approved</p></td>
        </tr>
      </tbody>
    </table>`,
  },
  {
    id: 'project-roadmap',
    name: 'Project Milestone Roadmap',
    category: 'Project Management',
    description: 'Track strategic phases, department leads, target dates, budgets, and completion percentages.',
    badge: '5 Cols • Sortable',
    html: `<table>
      <thead>
        <tr>
          <th data-bg-color="#f3e8ff" data-border-mode="all" data-text-align="left"><p><strong>Milestone Phase</strong></p></th>
          <th data-bg-color="#f3e8ff" data-border-mode="all" data-text-align="left"><p><strong>Lead Team</strong></p></th>
          <th data-bg-color="#f3e8ff" data-border-mode="all" data-text-align="center"><p><strong>Target Date</strong></p></th>
          <th data-bg-color="#f3e8ff" data-border-mode="all" data-text-align="right"><p><strong>Budget ($)</strong></p></th>
          <th data-bg-color="#f3e8ff" data-border-mode="all" data-text-align="center"><p><strong>Progress</strong></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>Phase 1: Discovery &amp; Architecture</p></td>
          <td><p>Systems Engineering</p></td>
          <td data-text-align="center"><p>2026-11-15</p></td>
          <td data-text-align="right"><p>$12,500</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>100%</p></td>
        </tr>
        <tr>
          <td><p>Phase 2: Core Platform Implementation</p></td>
          <td><p>Product &amp; AI Lab</p></td>
          <td data-text-align="center"><p>2026-12-10</p></td>
          <td data-text-align="right"><p>$28,000</p></td>
          <td data-bg-color="#e0f2fe" data-text-align="center"><p>65%</p></td>
        </tr>
        <tr>
          <td><p>Phase 3: Security Audit &amp; Rollout</p></td>
          <td><p>Compliance &amp; QA</p></td>
          <td data-text-align="center"><p>2027-01-20</p></td>
          <td data-text-align="right"><p>$9,200</p></td>
          <td data-bg-color="#fef3c7" data-text-align="center"><p>20%</p></td>
        </tr>
      </tbody>
    </table>`,
  },
  {
    id: 'fees',
    name: 'Fee Schedule',
    category: 'Academic & Commercial',
    description: 'Structured tuition and program fee breakdown with durations and certification tiers.',
    badge: '4 Cols • Sortable',
    html: `<table>
      <thead>
        <tr>
          <th data-bg-color="#fef3c7" data-border-mode="all" data-text-align="left"><p><strong>Course Module</strong></p></th>
          <th data-bg-color="#fef3c7" data-border-mode="all" data-text-align="center"><p><strong>Duration</strong></p></th>
          <th data-bg-color="#fef3c7" data-border-mode="all" data-text-align="left"><p><strong>Certifications</strong></p></th>
          <th data-bg-color="#fef3c7" data-border-mode="all" data-text-align="right"><p><strong>Tuition Fee (USD)</strong></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>Executive Leadership &amp; Management</p></td>
          <td data-text-align="center"><p>6 Weeks</p></td>
          <td><p>Professional Diploma</p></td>
          <td data-text-align="right"><p>$250</p></td>
        </tr>
        <tr>
          <td><p>Full-Stack Web &amp; AI Engineering</p></td>
          <td data-text-align="center"><p>12 Weeks</p></td>
          <td><p>Certified Specialist</p></td>
          <td data-text-align="right"><p>$450</p></td>
        </tr>
        <tr>
          <td><p>Data Analytics &amp; Business Intelligence</p></td>
          <td data-text-align="center"><p>8 Weeks</p></td>
          <td><p>Associate Certificate</p></td>
          <td data-text-align="right"><p>$300</p></td>
        </tr>
      </tbody>
    </table>`,
  },
  {
    id: 'roster',
    name: 'Student & Cohort Roster',
    category: 'Academic & HR',
    description: 'Sortable cohort directory with ID numbers, departments, enrollment status, and GPA.',
    badge: '5 Cols • Sortable',
    html: `<table>
      <thead>
        <tr>
          <th data-bg-color="#d1fae5" data-border-mode="all" data-text-align="left"><p><strong>Student ID</strong></p></th>
          <th data-bg-color="#d1fae5" data-border-mode="all" data-text-align="left"><p><strong>Full Name</strong></p></th>
          <th data-bg-color="#d1fae5" data-border-mode="all" data-text-align="left"><p><strong>Department</strong></p></th>
          <th data-bg-color="#d1fae5" data-border-mode="all" data-text-align="center"><p><strong>Status</strong></p></th>
          <th data-bg-color="#d1fae5" data-border-mode="all" data-text-align="right"><p><strong>Grade Avg</strong></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>JDI-2026-001</p></td>
          <td><p>Adeyemi Johnson</p></td>
          <td><p>Computer Science</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>Active</p></td>
          <td data-text-align="right"><p>4.8</p></td>
        </tr>
        <tr>
          <td><p>JDI-2026-002</p></td>
          <td><p>Blessing Chinedu</p></td>
          <td><p>Business Admin</p></td>
          <td data-bg-color="#d1fae5" data-text-align="center"><p>Active</p></td>
          <td data-text-align="right"><p>4.5</p></td>
        </tr>
        <tr>
          <td><p>JDI-2026-003</p></td>
          <td><p>Faruq Abubakar</p></td>
          <td><p>Data Science</p></td>
          <td data-bg-color="#e0f2fe" data-text-align="center"><p>Enrolled</p></td>
          <td data-text-align="right"><p>4.2</p></td>
        </tr>
      </tbody>
    </table>`,
  },
  {
    id: 'comparison',
    name: 'Comparison Matrix',
    category: 'Strategy & Evaluation',
    description: 'Side-by-side evaluation matrix for comparing frameworks, vendors, or product tiers.',
    badge: '3 Cols • Sortable',
    html: `<table>
      <thead>
        <tr>
          <th data-bg-color="#f1f5f9" data-border-mode="all" data-text-align="left"><p><strong>Key Dimension</strong></p></th>
          <th data-bg-color="#f1f5f9" data-border-mode="all" data-text-align="left"><p><strong>Legacy Framework</strong></p></th>
          <th data-bg-color="#ccfbf1" data-border-mode="all" data-text-align="left"><p><strong>Proposed Architecture</strong></p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>Curriculum Architecture</p></td>
          <td><p>Traditional lecture-based</p></td>
          <td><p>AI-Integrated project sprints</p></td>
        </tr>
        <tr>
          <td><p>Practical Mastery</p></td>
          <td><p>Theoretical evaluations</p></td>
          <td><p>Live industrial capstones</p></td>
        </tr>
        <tr>
          <td><p>Industry Certification</p></td>
          <td><p>Internal diploma only</p></td>
          <td><p>Global dual credentialing</p></td>
        </tr>
      </tbody>
    </table>`,
  },
];

export const TABLE_CELL_BG_PALETTE: { label: string; value: string | null; previewClass: string }[] = [
  { label: 'No Fill (Default)', value: null, previewClass: 'bg-transparent border-slate-500' },
  { label: 'Soft Slate', value: '#f1f5f9', previewClass: 'bg-[#f1f5f9]' },
  { label: 'Warm Gray', value: '#e2e8f0', previewClass: 'bg-[#e2e8f0]' },
  { label: 'Soft Teal', value: '#ccfbf1', previewClass: 'bg-[#ccfbf1]' },
  { label: 'Soft Cyan', value: '#cffafe', previewClass: 'bg-[#cffafe]' },
  { label: 'Soft Sky', value: '#e0f2fe', previewClass: 'bg-[#e0f2fe]' },
  { label: 'Soft Emerald', value: '#d1fae5', previewClass: 'bg-[#d1fae5]' },
  { label: 'Soft Amber', value: '#fef3c7', previewClass: 'bg-[#fef3c7]' },
  { label: 'Soft Orange', value: '#ffedd5', previewClass: 'bg-[#ffedd5]' },
  { label: 'Soft Rose', value: '#ffe4e6', previewClass: 'bg-[#ffe4e6]' },
  { label: 'Soft Purple', value: '#f3e8ff', previewClass: 'bg-[#f3e8ff]' },
  { label: 'Deep Navy Header', value: '#1e293b', previewClass: 'bg-[#1e293b]' },
];

export const TABLE_BORDER_COLOR_PALETTE: { label: string; value: string | null }[] = [
  { label: 'Default Border', value: null },
  { label: 'Slate Gray', value: '#cbd5e1' },
  { label: 'Charcoal', value: '#475569' },
  { label: 'Jet Black', value: '#0f172a' },
  { label: 'Teal Accent', value: '#14b8a6' },
  { label: 'Sky Blue', value: '#0284c7' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Rose', value: '#e11d48' },
];

function computeBorderCss(mode: TableBorderMode | null | undefined, borderColor: string | null | undefined): string {
  const color = borderColor || '#cbd5e1';
  switch (mode) {
    case 'none':
      return 'border: 1px dashed transparent;';
    case 'bottom':
      return `border-top: none; border-left: none; border-right: none; border-bottom: 2px solid ${color};`;
    case 'thick':
      return `border: 2.5px solid ${color};`;
    case 'dashed':
      return `border: 1.5px dashed ${color};`;
    case 'outer':
      return `border: 1.5px solid ${color};`;
    case 'all':
    default:
      return borderColor ? `border: 1px solid ${borderColor};` : '';
  }
}

const sharedTableCellAttributes = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-bg-color') || element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.backgroundColor) return {};
      return {
        'data-bg-color': attributes.backgroundColor,
        style: `background-color: ${attributes.backgroundColor};`,
      };
    },
  },
  borderMode: {
    default: 'all',
    parseHTML: (element: HTMLElement) =>
      (element.getAttribute('data-border-mode') as TableBorderMode) || 'all',
    renderHTML: (attributes: Record<string, any>) => {
      const mode = (attributes.borderMode as TableBorderMode) || 'all';
      const borderCss = computeBorderCss(mode, attributes.borderColor);
      return {
        'data-border-mode': mode,
        ...(borderCss ? { style: borderCss } : {}),
      };
    },
  },
  borderColor: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-border-color') || element.style.borderColor || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.borderColor) return {};
      return {
        'data-border-color': attributes.borderColor,
        style: `border-color: ${attributes.borderColor};`,
      };
    },
  },
  textAlign: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-text-align') ||
      element.style.textAlign ||
      element.getAttribute('align') ||
      null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.textAlign) return {};
      return {
        'data-text-align': attributes.textAlign,
        style: `text-align: ${attributes.textAlign};`,
      };
    },
  },
  verticalAlign: {
    default: 'top',
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-vertical-align') || element.style.verticalAlign || 'top',
    renderHTML: (attributes: Record<string, any>) => {
      const vAlign = attributes.verticalAlign || 'top';
      return {
        'data-vertical-align': vAlign,
        style: `vertical-align: ${vAlign};`,
      };
    },
  },
};

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sharedTableCellAttributes,
    };
  },
});

/**
 * Smart value parser for sorting table cells (supports numbers, currency, percentages, dates, and text).
 */
function parseSortableValue(rawText: string): { type: 'empty' | 'number' | 'date' | 'string'; val: number | string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { type: 'empty', val: '' };
  }

  // Check currency / numeric / percentage patterns like "$1,480.00", "₦150,000", "65%", "-42.5"
  const numericCleaned = trimmed.replace(/^[$€£¥₦]\s*/, '').replace(/,/g, '').replace(/\s*%$/, '');
  if (/^-?\d+(\.\d+)?$/.test(numericCleaned)) {
    const num = parseFloat(numericCleaned);
    if (!Number.isNaN(num)) {
      return { type: 'number', val: num };
    }
  }

  // Check ISO date or standard date strings (e.g. 2026-10-24)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts)) {
      return { type: 'date', val: ts };
    }
  }

  return { type: 'string', val: trimmed.toLowerCase() };
}

function compareCellText(aText: string, bText: string, direction: 'asc' | 'desc'): number {
  const parsedA = parseSortableValue(aText);
  const parsedB = parseSortableValue(bText);

  // Always keep empty cells at the bottom
  if (parsedA.type === 'empty' && parsedB.type === 'empty') return 0;
  if (parsedA.type === 'empty') return 1;
  if (parsedB.type === 'empty') return -1;

  const multiplier = direction === 'asc' ? 1 : -1;

  if (parsedA.type === 'number' && parsedB.type === 'number') {
    return ((parsedA.val as number) - (parsedB.val as number)) * multiplier;
  }

  if (parsedA.type === 'date' && parsedB.type === 'date') {
    return ((parsedA.val as number) - (parsedB.val as number)) * multiplier;
  }

  return (
    aText.trim().localeCompare(bText.trim(), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * multiplier
  );
}

/**
 * Sorts a ProseMirror table node at `tablePos` by the specified `colIndex`.
 */
function dispatchTableSort(
  view: any,
  tableNode: ProseMirrorNode,
  tablePos: number,
  colIndex: number,
  explicitDirection?: 'asc' | 'desc'
): 'asc' | 'desc' | null {
  if (tableNode.childCount < 2) return null;

  const rows: ProseMirrorNode[] = [];
  tableNode.forEach((row) => rows.push(row));

  const firstRow = rows[0];
  const hasHeaderCells =
    firstRow.firstChild?.type.name === 'tableHeader' ||
    firstRow.childCount > 0;

  if (!hasHeaderCells || colIndex < 0 || colIndex >= firstRow.childCount) {
    return null;
  }

  const targetHeaderCell = firstRow.child(colIndex);
  const currentDir = (targetHeaderCell.attrs?.sortDirection as TableSortDirection) || null;
  const nextDirection: 'asc' | 'desc' = explicitDirection
    ? explicitDirection
    : currentDir === 'asc'
    ? 'desc'
    : 'asc';

  // Update header cells in row 0 to reflect active sortDirection on colIndex
  const updatedHeaderCells: ProseMirrorNode[] = [];
  firstRow.forEach((cell, _offset, idx) => {
    const nextAttrs = {
      ...cell.attrs,
      sortDirection: idx === colIndex ? nextDirection : null,
    };
    updatedHeaderCells.push(cell.type.create(nextAttrs, cell.content, cell.marks));
  });
  const updatedFirstRow = firstRow.type.create(firstRow.attrs, updatedHeaderCells, firstRow.marks);

  // Separate body rows and sort them stably by cell text at colIndex
  const bodyRows = rows.slice(1).map((row, originalIdx) => {
    const cell = colIndex < row.childCount ? row.child(colIndex) : null;
    const text = cell ? cell.textContent : '';
    return { row, text, originalIdx };
  });

  bodyRows.sort((a, b) => {
    const cmp = compareCellText(a.text, b.text, nextDirection);
    return cmp !== 0 ? cmp : a.originalIdx - b.originalIdx;
  });

  const newTableChildren = [updatedFirstRow, ...bodyRows.map((item) => item.row)];
  const newTableNode = tableNode.type.create(tableNode.attrs, newTableChildren, tableNode.marks);

  const { state } = view;
  const prevFrom = state.selection.from;
  let tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTableNode);

  // Restore selection safely inside the table
  const clampedPos = Math.min(Math.max(tablePos + 2, prevFrom), tablePos + newTableNode.nodeSize - 2);
  try {
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(clampedPos)));
  } catch {
    // Keep default selection if resolve fails
  }

  view.dispatch(tr);
  return nextDirection;
}

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sharedTableCellAttributes,
      sortDirection: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute('data-sort-dir') as TableSortDirection) || null,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.sortDirection) return {};
          return {
            'data-sort-dir': attributes.sortDirection,
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      new Plugin({
        key: new PluginKey('hubmindTableHeaderSort'),
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              if (!view.editable) return false;
              const target = event.target as HTMLElement | null;
              if (!target) return false;

              // Ignore clicks on resize handles
              if (target.closest('.column-resize-handle')) return false;

              const thEl = target.closest('th') as HTMLTableCellElement | null;
              if (!thEl) return false;

              // Do not sort if the user was dragging to select text inside the header
              const domSel = window.getSelection();
              if (domSel && !domSel.isCollapsed) return false;

              const trEl = thEl.parentElement as HTMLTableRowElement | null;
              if (!trEl) return false;

              const thCells = Array.from(trEl.children);
              const colIndex = thCells.indexOf(thEl);
              if (colIndex === -1) return false;

              try {
                const posInCell = view.posAtDOM(thEl, 0);
                const $pos = view.state.doc.resolve(posInCell);

                let tableDepth = -1;
                for (let d = $pos.depth; d > 0; d--) {
                  if ($pos.node(d).type.name === 'table') {
                    tableDepth = d;
                    break;
                  }
                }

                if (tableDepth === -1) return false;

                const tablePos = $pos.before(tableDepth);
                const tableNode = $pos.node(tableDepth);

                dispatchTableSort(view, tableNode, tablePos, colIndex);
              } catch {
                // Ignore if DOM position cannot be resolved
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});

/**
 * Sorts the currently active table by the given column index (or the currently focused column).
 */
export function sortActiveTableByColumn(
  editor: Editor,
  explicitDirection?: 'asc' | 'desc',
  explicitColIndex?: number
): 'asc' | 'desc' | null {
  if (!editor || editor.isDestroyed) return null;
  const { state, view } = editor;
  const { $from } = state.selection;

  let tableDepth = -1;
  let rowDepth = -1;
  let cellDepth = -1;

  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'table' && tableDepth === -1) tableDepth = d;
    if (name === 'tableRow' && rowDepth === -1) rowDepth = d;
    if ((name === 'tableCell' || name === 'tableHeader') && cellDepth === -1) cellDepth = d;
  }

  if (tableDepth === -1) return null;

  const tablePos = $from.before(tableDepth);
  const tableNode = $from.node(tableDepth);

  let colIndex = explicitColIndex ?? 0;
  if (explicitColIndex === undefined && rowDepth !== -1 && cellDepth !== -1) {
    const rowNode = $from.node(rowDepth);
    const activeCellNode = $from.node(cellDepth);
    rowNode.forEach((cell, _offset, idx) => {
      if (cell === activeCellNode) {
        colIndex = idx;
      }
    });
  }

  return dispatchTableSort(view, tableNode, tablePos, colIndex, explicitDirection);
}

/**
 * Inserts a pre-formatted table template by its template ID.
 */
export function insertPreformattedTableTemplate(editor: Editor, templateId: string): boolean {
  const template = PREFORMATTED_TABLE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return false;
  editor.chain().focus().insertContent(template.html).run();
  return true;
}

/**
 * Reads the current active table cell or header attributes from the editor.
 */
export function getActiveTableCellAttributes(editor: Editor | null): TableCellFormattingAttributes {
  if (!editor) {
    return {
      backgroundColor: null,
      borderMode: 'all',
      borderColor: null,
      textAlign: null,
      verticalAlign: 'top',
      sortDirection: null,
    };
  }

  const isHeader = editor.isActive('tableHeader');
  const attrs = editor.getAttributes(isHeader ? 'tableHeader' : 'tableCell') || {};
  const paragraphAlign = editor.getAttributes('paragraph')?.textAlign || null;

  return {
    backgroundColor: attrs.backgroundColor || null,
    borderMode: (attrs.borderMode as TableBorderMode) || 'all',
    borderColor: attrs.borderColor || null,
    textAlign: (attrs.textAlign as TableTextAlign) || paragraphAlign || 'left',
    verticalAlign: (attrs.verticalAlign as TableVerticalAlign) || 'top',
    sortDirection: (attrs.sortDirection as TableSortDirection) || null,
  };
}

/**
 * Sets attributes on the currently selected cell(s) or active cell.
 */
export function setTableCellFormatting(
  editor: Editor,
  updates: Partial<TableCellFormattingAttributes>
) {
  let chain = editor.chain().focus();

  if (updates.backgroundColor !== undefined) {
    chain = chain.setCellAttribute('backgroundColor', updates.backgroundColor);
  }
  if (updates.borderMode !== undefined) {
    chain = chain.setCellAttribute('borderMode', updates.borderMode);
  }
  if (updates.borderColor !== undefined) {
    chain = chain.setCellAttribute('borderColor', updates.borderColor);
  }
  if (updates.verticalAlign !== undefined) {
    chain = chain.setCellAttribute('verticalAlign', updates.verticalAlign);
  }
  if (updates.textAlign !== undefined && updates.textAlign !== null) {
    chain = chain
      .setCellAttribute('textAlign', updates.textAlign)
      .setTextAlign(updates.textAlign);
  }

  chain.run();
}

/**
 * Applies formatting attributes to EVERY cell in the currently active table.
 * Useful when toggling table-wide borders or table-wide border color.
 */
export function applyFormattingToEntireTable(
  editor: Editor,
  updates: Partial<TableCellFormattingAttributes>
) {
  const { state, view } = editor;
  const { $from } = state.selection;

  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
  }

  if (tableDepth === -1) return;

  const tableStart = $from.start(tableDepth);
  const tableNode = $from.node(tableDepth);
  let tr = state.tr;

  tableNode.descendants((node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const absolutePos = tableStart + pos;
      const nextAttrs = {
        ...node.attrs,
        ...(updates.backgroundColor !== undefined ? { backgroundColor: updates.backgroundColor } : {}),
        ...(updates.borderMode !== undefined ? { borderMode: updates.borderMode } : {}),
        ...(updates.borderColor !== undefined ? { borderColor: updates.borderColor } : {}),
        ...(updates.verticalAlign !== undefined ? { verticalAlign: updates.verticalAlign } : {}),
        ...(updates.textAlign !== undefined ? { textAlign: updates.textAlign } : {}),
      };
      tr = tr.setNodeMarkup(absolutePos, undefined, nextAttrs);
    }
  });

  if (tr.docChanged) {
    view.dispatch(tr);
    editor.commands.focus();
  }
}
