import DOMPurify from 'dompurify';
import { SanitizerOptions } from './clipboard-types';

/**
 * Sanitizes untrusted clipboard HTML to prevent XSS, remove malicious code,
 * and strip dangerous attributes while preserving valid document formatting.
 */
export function sanitizeClipboardHtml(rawHtml: string, options: SanitizerOptions = {}): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  // Configure DOMPurify with strict whitelist tailored for rich document editors
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
      'span', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr',
      'pre', 'code', 'sub', 'sup', 'mark',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'img', 'font', 'br', 'div', 'section', 'article', 'aside'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title',
      'width', 'height', 'colspan', 'rowspan', 'colwidth',
      'align', 'style', 'color', 'face', 'size',
      'data-type', 'data-hubmind-page-break', 'data-page-break',
      'data-bg-color', 'data-border-mode', 'data-border-color',
      'data-text-align', 'data-vertical-align', 'data-sort-dir', 'class'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,)/i,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math', 'link', 'meta', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction', 'data-action'],
  });

  return cleanHtml;
}

/**
 * Filters inline style declarations, keeping only recognized and safe CSS properties
 */
export function filterSafeStyles(styleString: string): string {
  if (!styleString) return '';

  const declarations = styleString.split(';');
  const safeDeclarations: string[] = [];

  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();

    // Skip dangerous patterns
    if (val.includes('javascript:') || val.includes('url(') || val.includes('expression(') || val.includes('-moz-binding')) {
      continue;
    }

    // Skip Office mso- properties in inline styles (handled separately in normalizer)
    if (prop.startsWith('mso-') || prop.startsWith('-ms-')) {
      continue;
    }

    // Allowed style properties for TipTap/ProseMirror representation
    const allowedProps = [
      'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
      'color', 'background-color', 'background',
      'font-size', 'font-family',
      'text-align', 'line-height',
      'width', 'height', 'max-width', 'min-width',
      'border', 'border-color', 'border-width', 'border-style',
      'border-top', 'border-right', 'border-bottom', 'border-left',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
      'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'text-indent',
      'letter-spacing', 'white-space', 'vertical-align',
      'border-collapse', 'border-spacing', 'page-break-before', 'page-break-after', 'break-before', 'break-after'
    ];

    if (allowedProps.includes(prop)) {
      safeDeclarations.push(`${prop}: ${val}`);
    }
  }

  return safeDeclarations.join('; ');
}
