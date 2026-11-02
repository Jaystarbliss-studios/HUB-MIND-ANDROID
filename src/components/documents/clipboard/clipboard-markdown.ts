/**
 * Converts Markdown text (often copied from ChatGPT, Claude, or Gemini)
 * into semantic, structured HTML suitable for TipTap.
 */
export function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const htmlOutput: string[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let blockquoteLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const flushList = () => {
    if (inList) {
      htmlOutput.push(`</${inList}>`);
      inList = null;
    }
  };

  const flushBlockquote = () => {
    if (inBlockquote) {
      const inner = blockquoteLines.map(l => `<p>${parseInlineMarkdown(l)}</p>`).join('');
      htmlOutput.push(`<blockquote>${inner}</blockquote>`);
      inBlockquote = false;
      blockquoteLines = [];
    }
  };

  const flushTable = () => {
    if (inTable) {
      htmlOutput.push(renderMarkdownTable(tableRows));
      inTable = false;
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Code Blocks (```)
    if (line.trim().startsWith('```')) {
      flushList();
      flushBlockquote();
      flushTable();

      if (inCodeBlock) {
        // End code block
        const codeText = escapeHtml(codeBlockContent.join('\n'));
        htmlOutput.push(`<pre><code>${codeText}</code></pre>`);
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        // Start code block
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 2. Tables (| col | col |)
    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushList();
      flushBlockquote();
      inTable = true;
      tableRows.push(line.trim());
      continue;
    } else if (inTable) {
      flushTable();
    }

    // 3. Blockquotes (> quote)
    if (/^\s*>\s*(.*)$/.test(line)) {
      flushList();
      flushTable();
      inBlockquote = true;
      blockquoteLines.push(line.replace(/^\s*>\s*/, ''));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // 4. Headings (# Heading)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      const content = parseInlineMarkdown(headingMatch[2]);
      htmlOutput.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    // 5. Horizontal Rule (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      flushTable();
      htmlOutput.push('<hr>');
      continue;
    }

    // 6. Unordered List (- item or * item)
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushTable();
      if (inList !== 'ul') {
        flushList();
        inList = 'ul';
        htmlOutput.push('<ul>');
      }
      htmlOutput.push(`<li>${parseInlineMarkdown(ulMatch[2])}</li>`);
      continue;
    }

    // 7. Ordered List (1. item)
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      flushTable();
      if (inList !== 'ol') {
        flushList();
        inList = 'ol';
        htmlOutput.push('<ol>');
      }
      htmlOutput.push(`<li>${parseInlineMarkdown(olMatch[2])}</li>`);
      continue;
    }

    // If not a list item, flush open list
    flushList();

    // 8. Empty lines
    if (!line.trim()) {
      continue;
    }

    // 9. Standard Paragraph
    htmlOutput.push(`<p>${parseInlineMarkdown(line)}</p>`);
  }

  flushList();
  flushBlockquote();
  flushTable();

  return htmlOutput.join('');
}

/**
 * Handles inline markdown: bold, italic, strikethrough, inline code, links, images
 */
function parseInlineMarkdown(text: string): string {
  let result = escapeHtml(text);

  // Inline images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1">');

  // Inline links: [text](url)
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & Italic: ***text*** or ___text___
  result = result.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

  // Bold: **text** or __text__
  result = result.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic: *text* or _text_
  result = result.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.*?)~~/g, '<s>$1</s>');

  return result;
}

/**
 * Renders a Markdown table into standard HTML table suitable for TipTap
 */
function renderMarkdownTable(rows: string[]): string {
  if (rows.length === 0) return '';

  const parseRowCells = (row: string) => {
    return row
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());
  };

  const headerCells = parseRowCells(rows[0]);
  let startIndex = 1;

  // Check for separator row (e.g. |---|:---:|---:|)
  if (rows.length > 1 && /^\|?(\s*:?-+:?\s*\|?)+$/.test(rows[1])) {
    startIndex = 2;
  }

  let tableHtml = '<table><thead><tr>';
  for (const h of headerCells) {
    tableHtml += `<th><p>${parseInlineMarkdown(h || ' ')}</p></th>`;
  }
  tableHtml += '</tr></thead><tbody>';

  for (let i = startIndex; i < rows.length; i++) {
    const cells = parseRowCells(rows[i]);
    if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;
    tableHtml += '<tr>';
    for (let c = 0; c < headerCells.length; c++) {
      const cellContent = cells[c] ? parseInlineMarkdown(cells[c]) : '';
      tableHtml += `<td><p>${cellContent || ''}</p></td>`;
    }
    tableHtml += '</tr>';
  }

  tableHtml += '</tbody></table>';
  return tableHtml;
}

/**
 * Converts TSV (Tab Separated Values) from Excel, Google Sheets, or CSV to TipTap HTML Table
 */
export function convertTsvToHtmlTable(tsv: string): string {
  if (!tsv) return '';
  const lines = tsv.trim().split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return '';

  const rowData = lines.map(line => line.split('\t').map(c => c.trim()));
  const maxCols = Math.max(...rowData.map(r => r.length));
  if (maxCols < 1) return '';

  let tableHtml = '<table><thead><tr>';
  // Use first row as header
  const firstRow = rowData[0];
  for (let c = 0; c < maxCols; c++) {
    const headerText = firstRow[c] !== undefined ? escapeHtml(firstRow[c]) : '';
    tableHtml += `<th><p>${headerText || ' '}</p></th>`;
  }
  tableHtml += '</tr></thead><tbody>';

  for (let r = 1; r < rowData.length; r++) {
    const row = rowData[r];
    tableHtml += '<tr>';
    for (let c = 0; c < maxCols; c++) {
      const cellText = row[c] !== undefined ? escapeHtml(row[c]) : '';
      tableHtml += `<td><p>${cellText || ''}</p></td>`;
    }
    tableHtml += '</tr>';
  }

  tableHtml += '</tbody></table>';
  return tableHtml;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
