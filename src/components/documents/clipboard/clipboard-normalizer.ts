import { filterSafeStyles } from './clipboard-sanitizer';

/**
 * Normalizes foreign HTML (Word, Teams, Google Docs, ChatGPT, Webpages)
 * into clean, semantic, Hub-Mind/TipTap compatible HTML.
 */
export function normalizeClipboardHtml(sanitizedHtml: string, source: string): string {
  if (!sanitizedHtml) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedHtml, 'text/html');
  const body = doc.body;

  // Step 1: Remove Office XML/MSO comments & conditional blocks
  removeOfficeComments(body);

  // Step 1b: Convert escaped line-break sequences (\\n, /n, etc.) into real document breaks.
  normalizeEscapedLineBreaks(body);

  // Step 2: Resolve named paragraph styles and block-level Word/Google Docs formatting.
  normalizeParagraphStyles(body);

  // Step 3: Handle Microsoft Word lists (MsoListParagraph / mso-list)
  normalizeWordLists(body);

  // Step 4: Handle Google Docs wrappers
  normalizeGoogleDocsWrappers(body);

  // Step 5: Traverse and normalize elements recursively
  normalizeNodeTree(body);

  // Step 6: Clean up empty formatting tags and redundant spans
  cleanRedundantElements(body);

  return body.innerHTML;
}

/**
 * Strips HTML comment nodes and Word specific pseudo-comments
 */
function removeOfficeComments(root: HTMLElement) {
  const iterator = document.createNodeIterator(root, NodeFilter.SHOW_COMMENT);
  let commentNode: Node | null;
  const commentsToRemove: Node[] = [];

  while ((commentNode = iterator.nextNode())) {
    commentsToRemove.push(commentNode);
  }

  commentsToRemove.forEach((node) => node.parentNode?.removeChild(node));

  // Remove office specific tags like <o:p>, <w:worddocument>, etc.
  const officeTags = root.querySelectorAll('o\\:p, w\\:worddocument, v\\:shape, v\\:path, w\\:latentstyles, xml');
  officeTags.forEach((el) => el.remove());
}

/**
 * Converts literal escaped line break characters into <br> elements.
 */
function normalizeEscapedLineBreaks(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) nodes.push(node as Text);

  nodes.forEach((textNode) => {
    const value = textNode.nodeValue || '';

    // Handle actual CR/LF plus literal "\\n"/"\\r" and malformed "/n" sequences.
    if (!/(?:\\r?\\n|\\n|\\r|\/n)/.test(value)) return;

    const parts = value.split(/(?:\\r?\\n|\\n|\\r|\/n)/g);
    const fragment = document.createDocumentFragment();

    parts.forEach((part, index) => {
      if (part) fragment.appendChild(document.createTextNode(part));
      if (index < parts.length - 1) {
        fragment.appendChild(document.createElement('br'));
      }
    });

    textNode.parentNode?.replaceChild(fragment, textNode);
  });
}

/**
 * Maps Word and Docs specific headings & paragraph classes into proper semantic HTML tags
 */
function normalizeParagraphStyles(root: HTMLElement) {
  const paragraphs = root.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');

  paragraphs.forEach((el) => {
    const className = el.getAttribute('class') || '';
    const style = el.getAttribute('style') || '';

    // Detect Word headings
    if (/MsoHeading1|heading\s*1/i.test(className) || /heading\s*1/i.test(style)) {
      replaceTagName(el, 'h1');
    } else if (/MsoHeading2|heading\s*2/i.test(className) || /heading\s*2/i.test(style)) {
      replaceTagName(el, 'h2');
    } else if (/MsoHeading3|heading\s*3/i.test(className) || /heading\s*3/i.test(style)) {
      replaceTagName(el, 'h3');
    } else if (/MsoTitle|title/i.test(className)) {
      replaceTagName(el, 'h1');
    } else if (/MsoSubtitle|subtitle/i.test(className)) {
      replaceTagName(el, 'h2');
    }
  });
}

/**
 * Transforms Word MsoListParagraph blocks into standard ordered/unordered lists
 */
function normalizeWordLists(root: HTMLElement) {
  const listItems = Array.from(root.querySelectorAll('p.MsoListParagraph, p.MsoListParagraphCxSpFirst, p.MsoListParagraphCxSpMiddle, p.MsoListParagraphCxSpLast, p[style*="mso-list"]'));

  if (listItems.length === 0) return;

  let currentList: HTMLElement | null = null;
  let isOrdered = false;

  listItems.forEach((item) => {
    const text = item.textContent || '';
    const isNumbered = /^\s*(\d+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[\.\)]\s*/.test(text);

    // Determine if we need to start a new list container
    if (!currentList || (isNumbered !== isOrdered)) {
      isOrdered = isNumbered;
      currentList = document.createElement(isOrdered ? 'ol' : 'ul');
      item.parentNode?.insertBefore(currentList, item);
    }

    // Strip leading list bullet/numbering marker from Word text
    const cleanText = text.replace(/^\s*(?:[\u2022\u00B7\u25CF\u25AA\u2013\-*]|\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]|\(?[ivxlcdmIVXLCDM]+[\.\)])\s+/, '');
    const li = document.createElement('li');
    li.innerHTML = cleanText ? cleanText : item.innerHTML;
    currentList.appendChild(li);
    item.remove();
  });
}

/**
 * Unwraps Google Docs nested wrapper b/span tags
 */
function normalizeGoogleDocsWrappers(root: HTMLElement) {
  // Google docs wraps pasted content in <b id="docs-internal-guid-...">
  const docsWrappers = root.querySelectorAll('b[id^="docs-internal-guid-"]');
  docsWrappers.forEach((wrapper) => {
    const parent = wrapper.parentNode;
    if (parent) {
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    }
  });
}

/**
 * Recursively cleans styles, normalizes tags, and handles inline formatting
 */
function normalizeNodeTree(root: HTMLElement) {
  const elements = root.querySelectorAll('*');

  elements.forEach((el) => {
    const htmlEl = el as HTMLElement;

    // Filter inline styles to safe subset
    if (htmlEl.hasAttribute('style')) {
      const rawStyle = htmlEl.getAttribute('style') || '';
      const safeStyle = filterSafeStyles(rawStyle);
      if (safeStyle) {
        htmlEl.setAttribute('style', safeStyle);
      } else {
        htmlEl.removeAttribute('style');
      }
    }

    // Remove legacy mso-* or temp class names
    if (htmlEl.hasAttribute('class')) {
      const classes = (htmlEl.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => !c.startsWith('Mso') && !c.startsWith('mso-') && c !== 'Apple-converted-space')
        .join(' ');
      if (classes) {
        htmlEl.setAttribute('class', classes);
      } else {
        htmlEl.removeAttribute('class');
      }
    }
  });
}

/**
 * Removes empty spans and empty formatting elements
 */
function cleanRedundantElements(root: HTMLElement) {
  const spans = root.querySelectorAll('span, font, div');

  spans.forEach((el) => {
    const htmlEl = el as HTMLElement;
    // If span has no attributes and no formatting, unwrap it
    if (htmlEl.tagName.toLowerCase() === 'span' && !htmlEl.hasAttributes()) {
      const parent = htmlEl.parentNode;
      if (parent) {
        while (htmlEl.firstChild) {
          parent.insertBefore(htmlEl.firstChild, htmlEl);
        }
        htmlEl.remove();
      }
    } else if (!htmlEl.textContent?.trim() && !htmlEl.querySelector('img, br, hr, table, input')) {
      // Remove empty container elements that contain no meaningful content
      if (htmlEl.tagName.toLowerCase() === 'span' || htmlEl.tagName.toLowerCase() === 'font') {
        htmlEl.remove();
      }
    }
  });
}

/**
 * Helper to replace a DOM node with a different tag name while keeping children and attributes
 */
function replaceTagName(element: Element, newTagName: string): HTMLElement {
  const newElement = document.createElement(newTagName);
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    newElement.setAttribute(attr.name, attr.value);
  }
  while (element.firstChild) {
    newElement.appendChild(element.firstChild);
  }
  element.parentNode?.replaceChild(newElement, element);
  return newElement;
}

