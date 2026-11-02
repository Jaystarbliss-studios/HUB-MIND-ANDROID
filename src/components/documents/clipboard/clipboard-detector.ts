import { ClipboardDetectionResult } from './clipboard-types';

/**
 * Inspects a ClipboardEvent and detects source signature, formats, and structural characteristics
 */
export function detectClipboardFormat(event: ClipboardEvent): ClipboardDetectionResult {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return {
      types: [],
      hasHtml: false,
      hasPlainText: false,
      hasImage: false,
      hasRtf: false,
      hasCustomHubMind: false,
      source: 'unknown',
      containsTable: false,
      containsList: false,
      containsHeading: false,
      containsLink: false,
      containsImage: false,
      containsCode: false,
      isLikelyMarkdown: false,
    };
  }

  const types = Array.from(clipboardData.types || []);
  const html = clipboardData.getData('text/html') || '';
  const text = clipboardData.getData('text/plain') || '';
  const rtf = clipboardData.getData('text/rtf') || '';
  const hasCustomHubMind = types.includes('application/x-hubmind-document');

  // Check for image files in items
  let hasImage = false;
  if (clipboardData.items) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.indexOf('image/') === 0) {
        hasImage = true;
        break;
      }
    }
  }

  const hasHtml = html.length > 0;
  const hasPlainText = text.length > 0;
  const hasRtf = rtf.length > 0;

  // Source detection logic
  let source: ClipboardDetectionResult['source'] = 'unknown';

  if (hasCustomHubMind) {
    source = 'hubmind';
  } else if (
    html.includes('urn:schemas-microsoft-com:office') ||
    html.includes('mso-') ||
    html.includes('Microsoft Word') ||
    html.includes('WordDocument') ||
    html.includes('xmlns:w="urn:schemas-microsoft-com:office:word"')
  ) {
    source = 'word';
  } else if (
    html.includes('mso-') && html.includes('Teams') ||
    html.includes('data-tid="message-body"') ||
    html.includes('teams.microsoft.com')
  ) {
    source = 'teams';
  } else if (
    html.includes('docs-internal-guid') ||
    html.includes('id="docs-internal-guid') ||
    html.includes('google-sheets-html-origin')
  ) {
    source = 'google-docs';
  } else if (
    html.includes('notion-') ||
    types.includes('application/x-notion-blocks')
  ) {
    source = 'notion';
  } else if (
    html.includes('chatgpt') ||
    html.includes('markdown-content') ||
    (hasPlainText && (text.startsWith('### ') || text.includes('\n```') || text.includes('**') && text.includes('1. ')))
  ) {
    source = 'chatgpt';
  } else if (
    html.includes('gemini') ||
    html.includes('model-response')
  ) {
    source = 'gemini';
  } else if (hasHtml) {
    source = 'generic-html';
  } else if (hasImage && !hasPlainText) {
    source = 'image';
  } else if (hasPlainText) {
    source = 'plain-text';
  }

  // Structural feature detection
  const lowerHtml = html.toLowerCase();
  const isTsvTable = checkIsTsvSpreadsheet(text);
  const isMarkdownTable = checkIsMarkdownTable(text);
  const containsTable = lowerHtml.includes('<table') || lowerHtml.includes('<tr') || lowerHtml.includes('<td') || isTsvTable || isMarkdownTable;
  const containsList = lowerHtml.includes('<ul') || lowerHtml.includes('<ol') || lowerHtml.includes('<li');
  const containsHeading = /<h[1-6][^>]*>/i.test(lowerHtml);
  const containsLink = lowerHtml.includes('<a ') || lowerHtml.includes('href=');
  const containsImage = lowerHtml.includes('<img') || hasImage;
  const containsCode = lowerHtml.includes('<pre') || lowerHtml.includes('<code') || text.includes('```');

  // Check if plain text looks like markdown
  const isLikelyMarkdown = checkIsLikelyMarkdown(text) || isMarkdownTable;

  return {
    types,
    hasHtml,
    hasPlainText,
    hasImage,
    hasRtf,
    hasCustomHubMind,
    source,
    containsTable,
    containsList,
    containsHeading,
    containsLink,
    containsImage,
    containsCode,
    isLikelyMarkdown,
  };
}

/**
 * Detects if plain text is TSV (Tab Separated Values) from Excel / Google Sheets
 */
export function checkIsTsvSpreadsheet(text: string): boolean {
  if (!text || !text.includes('\t')) return false;
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return false;
  // If at least one line has multiple tabs or multiple lines have tabs
  const tabLines = lines.filter(l => l.includes('\t'));
  return tabLines.length >= 1 && (tabLines.length >= 2 || tabLines[0].split('\t').length >= 2);
}

/**
 * Detects if plain text is a markdown table
 */
export function checkIsMarkdownTable(text: string): boolean {
  if (!text || !text.includes('|')) return false;
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  const tableLines = lines.filter(l => /^\s*\|.+\|\s*$/.test(l));
  return tableLines.length >= 2;
}

/**
 * Tests whether plain text string exhibits clear Markdown patterns
 */
export function checkIsLikelyMarkdown(text: string): boolean {
  if (!text || text.length < 5) return false;

  // Check for common markdown syntax indicators
  const headingPattern = /^#{1,6}\s+.+/m;
  const boldPattern = /\*\*[^*]+\*\*/;
  const italicPattern = /(^|\s)\*[^*]+\*(\s|$)/;
  const codeBlockPattern = /```[\s\S]*?```/;
  const inlineCodePattern = /`[^`]+`/;
  const bulletListPattern = /^(\s*[-*+]\s+.+\n?){2,}/m;
  const numberedListPattern = /^(\s*\d+\.\s+.+\n?){2,}/m;
  const blockquotePattern = /^>\s+.+/m;
  const linkPattern = /\[[^\]]+\]\(https?:\/\/[^\s)]+\)/;
  const tablePattern = /^\s*\|.+\|\s*$/m;

  let patternHits = 0;
  if (headingPattern.test(text)) patternHits += 2;
  if (codeBlockPattern.test(text)) patternHits += 2;
  if (boldPattern.test(text)) patternHits += 1;
  if (italicPattern.test(text)) patternHits += 1;
  if (inlineCodePattern.test(text)) patternHits += 1;
  if (bulletListPattern.test(text)) patternHits += 2;
  if (numberedListPattern.test(text)) patternHits += 2;
  if (blockquotePattern.test(text)) patternHits += 1;
  if (linkPattern.test(text)) patternHits += 2;
  if (tablePattern.test(text)) patternHits += 2;

  return patternHits >= 2;
}
