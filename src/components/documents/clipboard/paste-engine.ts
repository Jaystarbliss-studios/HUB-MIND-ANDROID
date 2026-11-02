import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import { detectClipboardFormat, checkIsTsvSpreadsheet } from './clipboard-detector';
import { sanitizeClipboardHtml } from './clipboard-sanitizer';
import { normalizeClipboardHtml } from './clipboard-normalizer';
import { convertMarkdownToHtml, convertTsvToHtmlTable } from './clipboard-markdown';
import { extractClipboardImage } from './clipboard-images';

export const HubMindPasteEngine = Extension.create({
  name: 'hubMindPasteEngine',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('hubMindPastePlugin'),
        props: {
          handlePaste(view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            // 1. Detect clipboard contents & source signatures
            const detection = detectClipboardFormat(event);

            if (import.meta.env.DEV) {
              console.groupCollapsed('📋 [Hub-Mind Paste Engine] Processing Clipboard Event');
              console.log('Source:', detection.source);
              console.log('Available Types:', detection.types);
              console.log('Features Detected:', {
                hasHtml: detection.hasHtml,
                hasImage: detection.hasImage,
                isLikelyMarkdown: detection.isLikelyMarkdown,
                containsTable: detection.containsTable,
                containsList: detection.containsList,
                containsHeading: detection.containsHeading,
              });
              console.groupEnd();
            }

            // 2. Priority 1: Direct Clipboard Image Paste (e.g. Screenshot or copied image file)
            if (detection.hasImage && (!detection.hasHtml || detection.source === 'image')) {
              for (let i = 0; i < clipboardData.items.length; i++) {
                const item = clipboardData.items[i];
                if (item.type.indexOf('image/') === 0) {
                  const blob = item.getAsFile();
                  if (blob) {
                    event.preventDefault();
                    extractClipboardImage(blob).then((dataUrl) => {
                      editor.chain().focus().setImage({ src: dataUrl }).run();
                    }).catch((err) => {
                      console.error('Failed to paste clipboard image:', err);
                    });
                    return true;
                  }
                }
              }
            }

            // 3. Priority 2: Native Hub-Mind Document format
            if (detection.hasCustomHubMind) {
              const customData = clipboardData.getData('application/x-hubmind-document');
              if (customData) {
                try {
                  event.preventDefault();
                  const sanitized = sanitizeClipboardHtml(customData);
                  editor.chain().focus().insertContent(sanitized).run();
                  return true;
                } catch (e) {
                  console.warn('Failed to parse custom Hub-Mind clipboard format, falling back to standard pipeline');
                }
              }
            }

            // 4. Priority 3: Rich text/html (Word, Teams, Google Docs, ChatGPT, Webpages, etc.)
            if (detection.hasHtml) {
              const rawHtml = clipboardData.getData('text/html');
              if (rawHtml) {
                event.preventDefault();

                try {
                  // Pipeline: SANITIZE -> NORMALIZE -> VALIDATE & INSERT
                  const sanitized = sanitizeClipboardHtml(rawHtml);
                  const normalized = normalizeClipboardHtml(sanitized, detection.source);

                  if (normalized && normalized.trim()) {
                    // Single atomic transaction with automatic caret positioning & history
                    editor.chain().focus().insertContent(normalized).run();
                    return true;
                  }
                } catch (err) {
                  console.error('Error during HTML clipboard processing:', err);
                  // Fall through to plain text fallback
                }
              }
            }

            // 5. Priority 4: Plain text (with Markdown & TSV spreadsheet detection)
            if (detection.hasPlainText) {
              const rawText = clipboardData.getData('text/plain');
              if (rawText) {
                event.preventDefault();

                // Some generated/template sources put line breaks in the clipboard as
                // literal "\\n" or "/n". Decode those before Markdown/paragraph detection.
                const normalizedText = rawText.replace(/\\r?\\n|\/n/g, '\n');

                // Check for TSV (Excel / Google Sheets / Numbers copied cells)
                if (checkIsTsvSpreadsheet(normalizedText)) {
                  try {
                    const tableHtml = convertTsvToHtmlTable(normalizedText);
                    if (tableHtml) {
                      const sanitized = sanitizeClipboardHtml(tableHtml);
                      const normalized = normalizeClipboardHtml(sanitized, 'spreadsheet-tsv');
                      editor.chain().focus().insertContent(normalized).run();
                      return true;
                    }
                  } catch (err) {
                    console.error('Error during TSV table paste processing:', err);
                  }
                }

                if (detection.isLikelyMarkdown) {
                  try {
                    const markdownHtml = convertMarkdownToHtml(normalizedText);
                    const sanitized = sanitizeClipboardHtml(markdownHtml);
                    const normalized = normalizeClipboardHtml(sanitized, 'markdown');
                    editor.chain().focus().insertContent(normalized).run();
                    return true;
                  } catch (err) {
                    console.error('Error during Markdown clipboard processing:', err);
                  }
                }

                // Standard plain text: Split into paragraphs and preserve intentional linebreaks
                const paragraphs = normalizedText.split(/\r?\n\r?\n/);
                const htmlParagraphs = paragraphs
                  .map(p => {
                    const lineBreaks = p.split(/\r?\n/).map(escapeHtmlText).join('<br>');
                    return lineBreaks.trim() ? `<p>${lineBreaks}</p>` : '';
                  })
                  .filter(Boolean)
                  .join('');

                if (htmlParagraphs) {
                  editor.chain().focus().insertContent(htmlParagraphs).run();
                } else {
                  editor.chain().focus().insertContent(escapeHtmlText(normalizedText)).run();
                }
                return true;
              }
            }

            return false;
          },

          handleDOMEvents: {
            copy(view, event) {
              // Enhance copy event with custom Hub-Mind clipboard type for perfect fidelity within Hub-Mind
              const selection = view.state.selection;
              if (selection.empty || !event.clipboardData) return false;

              try {
                const slice = selection.content();
                // Use ProseMirror's public serializer instead of the internal
                // schema.cached serializer. The latter is not guaranteed to
                // exist and can throw while the editor is mounting.
                const serializer = DOMSerializer.fromSchema(view.state.schema);
                const tempDiv = document.createElement('div');
                const fragment = serializer.serializeFragment(slice.content);

                tempDiv.appendChild(fragment);
                const selectedHtml = tempDiv.innerHTML;
                event.clipboardData.setData('application/x-hubmind-document', selectedHtml);
              } catch (e) {
                // Non-critical, let default copy proceed
              }
              return false;
            }
          }
        },
      }),
    ];
  },
});

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
