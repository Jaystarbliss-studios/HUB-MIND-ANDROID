import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { REAL_LOGO_BASE64 } from '../components/documents/logoData';
import { 
  PaperSizeOption, 
  OrientationOption, 
  MarginOption, 
  computePageLayout, 
  paginateDocument,
  PAPER_SIZES,
  MARGIN_PRESETS,
  PX_PER_MM
} from './paginationEngine';

export interface ExportOptions {
  pageSize?: PaperSizeOption;
  orientation?: OrientationOption;
  marginOption?: MarginOption;
  paperTheme?: 'white' | 'dark';
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes input arguments so that even if title and bodyHtml were swapped,
 * the actual HTML content and document title are properly extracted.
 */
function resolveDocParams(arg1: string, arg2: string): { title: string; html: string } {
  let title = (arg1 || '').trim();
  let html = (arg2 || '').trim();

  // If arg1 contains HTML tags and arg2 does not (or is short), swap them
  const arg1HasHtml = arg1.includes('<p') || arg1.includes('<div') || arg1.includes('<h1') || arg1.includes('<span') || arg1.includes('<br');
  const arg2HasHtml = arg2.includes('<p') || arg2.includes('<div') || arg2.includes('<h1') || arg2.includes('<span') || arg2.includes('<br');

  if (arg1HasHtml && !arg2HasHtml) {
    html = arg1;
    title = arg2 || 'Document';
  } else if (!arg1HasHtml && !arg2HasHtml && arg1.length > 300 && arg2.length < 100) {
    html = arg1;
    title = arg2 || 'Document';
  }

  if (!title) title = 'Untitled Document';
  if (!html) html = '<p>No content in document.</p>';

  return { title, html };
}

/**
 * Builds clean, standalone multi-page HTML suitable for printing
 */
export function buildDocumentHTML(
  rawTitle: string, 
  rawBodyHtml: string, 
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): string {
  const { title, html: bodyHtml } = resolveDocParams(rawTitle, rawBodyHtml);
  const layout = computePageLayout({ paperSize: pageSize, orientation, marginOption });
  const pagination = paginateDocument(bodyHtml, { paperSize: pageSize, orientation, marginOption });
  const pages = pagination.pages;

  const isLandscape = orientation === 'landscape';
  const paperDef = PAPER_SIZES[pageSize] || PAPER_SIZES.a4;
  const sheetWidthMm = isLandscape ? paperDef.heightMm : paperDef.widthMm;
  const sheetHeightMm = isLandscape ? paperDef.widthMm : paperDef.heightMm;

  const pagesMarkup = pages
    .map((pageHtml, index) => {
      const isFirst = index === 0;

      return `
      <div class="document-sheet">
        <div class="sheet-content">
          ${
            isFirst
              ? `<div class="official-header">
                  <table>
                    <tr>
                      <td class="logo-cell">
                        <img src="${REAL_LOGO_BASE64}" class="logo-img" alt="Jaystarbliss Logo" />
                      </td>
                      <td class="info-cell">
                        <div class="inst-title">JAYSTARBLISS DYNAMIC INSTITUTE</div>
                        <div class="inst-line">No, 3 Komolafe Street, Cedar County estate, Sangotedo, Lagos state.</div>
                        <div class="inst-line">+234 9136518194, +2349130529010</div>
                        <div class="inst-links">
                          <span>jaystarblissstudios@gmail.com</span> • 
                          <span>www.jaystarbliss-studios.name.ng</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>`
              : `<div class="running-header">
                  <span>${escapeHtml(title)}</span>
                  <span>Jaystarbliss Dynamic Institute</span>
                </div>`
          }
          <div class="content-body">
            ${pageHtml}
          </div>
        </div>
      </div>
    `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${sheetWidthMm}mm ${sheetHeightMm}mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.6;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .document-sheet {
      width: ${sheetWidthMm}mm;
      min-height: ${sheetHeightMm}mm;
      height: ${sheetHeightMm}mm;
      padding: ${layout.marginsMm.topMm}mm ${layout.marginsMm.rightMm}mm ${layout.marginsMm.bottomMm}mm ${layout.marginsMm.leftMm}mm;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      break-after: page;
      box-sizing: border-box;
    }
    .sheet-content {
      flex: 1;
    }
    .official-header {
      width: 100%;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .official-header table {
      width: 100%;
      border-collapse: collapse;
      border: none;
    }
    .official-header td {
      border: none;
      padding: 0;
      vertical-align: middle;
    }
    .logo-cell {
      width: 85px;
      text-align: center;
    }
    .logo-img {
      width: 74px;
      height: 74px;
      border-radius: 50%;
      object-fit: contain;
      filter: grayscale(100%) contrast(140%);
    }
    .info-cell {
      text-align: center;
      padding-left: 10px;
    }
    .inst-title {
      font-size: 16pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000000;
      margin: 0 0 4px 0;
    }
    .inst-line {
      font-size: 9.5pt;
      font-weight: 600;
      color: #334155;
      margin: 0 0 2px 0;
    }
    .inst-links {
      font-size: 9.5pt;
      font-weight: 600;
      color: #0284c7;
      margin: 2px 0 0 0;
    }
    .running-header {
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #64748b;
      font-family: monospace;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .content-body {
      font-size: 11pt;
      line-height: 1.6;
    }
    h1 { font-size: 28px; font-weight: 800; color: #000000; margin: 20px 0 9.6px 0; line-height: 1.25; page-break-after: avoid; break-after: avoid; }
    h2 { font-size: 23.2px; font-weight: 700; color: #0f172a; margin: 17.6px 0 8px 0; line-height: 1.3; page-break-after: avoid; break-after: avoid; }
    h3 { font-size: 19.5px; font-weight: 600; color: #1e293b; margin: 14.4px 0 6.4px 0; line-height: 1.35; page-break-after: avoid; break-after: avoid; }
    p { margin: 0 0 12px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; page-break-inside: auto; break-inside: auto; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 10pt; text-align: left; }
    th { background-color: #f1f5f9; font-weight: 700; }
    img { max-width: 100%; height: auto; margin: 8px 0; page-break-inside: avoid; break-inside: avoid; }
    ul { list-style-type: disc; margin: 0 0 10px 0; padding-left: 22px; }
    ol { list-style-type: decimal; margin: 0 0 10px 0; padding-left: 22px; }
    li { margin-bottom: 3px; }
    blockquote { border-left: 4px solid #cbd5e1; padding-left: 12px; margin: 10px 0; font-style: italic; color: #475569; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
  </style>
</head>
<body>
  ${pagesMarkup}
</body>
</html>`;
}

/**
 * Triggers direct browser printing with unified layout
 */
export async function printDocumentDirect(
  rawTitle: string, 
  rawBodyHtml: string, 
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): Promise<boolean> {
  const fullHtml = buildDocumentHTML(rawTitle, rawBodyHtml, pageSize, orientation, marginOption);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return true;
  }

  doc.open();
  doc.write(fullHtml);
  doc.close();

  // Wait for the generated document to finish layout before printing.
  // A fixed delay is unreliable on slower phones and can print before fonts/images
  // have affected pagination.
  await new Promise<void>((resolve) => {
    const win = iframe.contentWindow;
    if (!win) return resolve();
    const images = Array.from(doc.images);
    const imagePromises = images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((done) => {
        img.addEventListener('load', () => done(), { once: true });
        img.addEventListener('error', () => done(), { once: true });
      });
    });
    Promise.all(imagePromises).then(async () => {
      try {
        if (doc.fonts?.ready) await doc.fonts.ready;
      } catch (_) {}
      // Allow one layout frame after all resources resolve.
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()));
    });
  });

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 2000);
    return true;
  } catch (err) {
    console.error('Print iframe error:', err);
    window.print();
    return true;
  }
}

/**
 * Exports document as multi-page PDF using exact physical layout matching the editor canvas
 */
export async function exportDocumentAsPDF(
  rawTitle: string,
  rawBodyHtml: string,
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal',
  onProgress?: (percent: number) => void
): Promise<boolean> {
  const { title, html: bodyHtml } = resolveDocParams(rawTitle, rawBodyHtml);
  const isLandscape = orientation === 'landscape';
  const paperDef = PAPER_SIZES[pageSize] || PAPER_SIZES.a4;
  const sheetWidthMm = isLandscape ? paperDef.heightMm : paperDef.widthMm;
  const sheetHeightMm = isLandscape ? paperDef.widthMm : paperDef.heightMm;

  const layout = computePageLayout({ paperSize: pageSize, orientation, marginOption });
  const pagination = paginateDocument(bodyHtml, { paperSize: pageSize, orientation, marginOption });
  const pages = pagination.pages;
  const totalPages = Math.max(1, pages.length);

  const targetWidthPx = layout.pageWidthPx;
  const targetHeightPx = layout.pageHeightPx;

  // Staging off-screen wrapper
  const stagingWrapper = document.createElement('div');
  stagingWrapper.style.position = 'fixed';
  stagingWrapper.style.left = '-99999px';
  stagingWrapper.style.top = '0';
  stagingWrapper.style.zIndex = '-1000';
  document.body.appendChild(stagingWrapper);

  try {
    if (onProgress) onProgress(10);

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [sheetWidthMm, sheetHeightMm],
      compress: true,
    });

    const progressStep = 80 / totalPages;

    for (let i = 0; i < totalPages; i++) {
      if (i > 0) {
        pdf.addPage([sheetWidthMm, sheetHeightMm], isLandscape ? 'landscape' : 'portrait');
      }

      const pageHtml = pages[i] || '<p></p>';
      const isFirstPage = i === 0;

      const pageCard = document.createElement('div');
      pageCard.style.width = `${targetWidthPx}px`;
      pageCard.style.height = `${targetHeightPx}px`;
      pageCard.style.backgroundColor = '#ffffff';
      pageCard.style.color = '#0f172a';
      pageCard.style.padding = `${layout.marginsPx.top}px ${layout.marginsPx.right}px ${layout.marginsPx.bottom}px ${layout.marginsPx.left}px`;
      pageCard.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      pageCard.style.boxSizing = 'border-box';
      pageCard.style.display = 'flex';
      pageCard.style.flexDirection = 'column';
      pageCard.style.justifyContent = 'space-between';

      pageCard.innerHTML = `
        <style>
          * { box-sizing: border-box; }
          h1 { font-size: 28px; font-weight: 800; color: #000000; margin: 20px 0 9.6px 0; line-height: 1.25; }
          h2 { font-size: 23.2px; font-weight: 700; color: #0f172a; margin: 17.6px 0 8px 0; line-height: 1.3; }
          h3 { font-size: 19.5px; font-weight: 600; color: #1e293b; margin: 14.4px 0 6.4px 0; line-height: 1.35; }
          p { font-size: 11pt; line-height: 1.6; color: #0f172a; margin: 0 0 12px 0; }
          strong, b { font-weight: 700; color: inherit; }
          em, i { font-style: italic; }
          u { text-decoration: underline; }
          s { text-decoration: line-through; }
          mark { background-color: #fef08a; padding: 1px 3px; border-radius: 2px; }
          ul { list-style-type: disc; margin: 0 0 10px 0; padding-left: 22px; }
          ol { list-style-type: decimal; margin: 0 0 10px 0; padding-left: 22px; }
          li { margin-bottom: 3px; font-size: 11pt; line-height: 1.5; }
          blockquote { border-left: 4px solid #cbd5e1; padding-left: 12px; margin: 10px 0; font-style: italic; color: #475569; background: #f8fafc; padding-top: 3px; padding-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 10pt; text-align: left; }
          th { background-color: #f1f5f9; font-weight: 700; }
          img { max-width: 100%; height: auto; margin: 8px 0; }
          hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
        </style>
        <div>
          ${
            isFirstPage
              ? `<div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px;">
                  <table style="width: 100%; border-collapse: collapse; border: none;">
                    <tr>
                      <td style="width: 85px; text-align: center; border: none; padding: 0;">
                        <img src="${REAL_LOGO_BASE64}" style="width: 74px; height: 74px; border-radius: 50%; object-fit: contain; filter: grayscale(100%) contrast(140%);" alt="Logo" />
                      </td>
                      <td style="text-align: center; border: none; padding: 0 0 0 10px;">
                        <div style="font-size: 16pt; font-weight: 800; text-transform: uppercase; color: #000; letter-spacing: 0.5px; margin-bottom: 3px;">JAYSTARBLISS DYNAMIC INSTITUTE</div>
                        <div style="font-size: 9.5pt; font-weight: 600; color: #334155; margin-bottom: 2px;">No, 3 Komolafe Street, Cedar County estate, Sangotedo, Lagos state.</div>
                        <div style="font-size: 9.5pt; font-weight: 600; color: #334155; margin-bottom: 2px;">+234 9136518194, +2349130529010</div>
                        <div style="font-size: 9.5pt; font-weight: 600; color: #0284c7;">
                          <span>jaystarblissstudios@gmail.com</span> &bull; 
                          <span>www.jaystarbliss-studios.name.ng</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>`
              : `<div style="display: flex; justify-content: space-between; font-size: 8.5pt; color: #64748b; font-family: monospace; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 16px;">
                  <span>${escapeHtml(title)}</span>
                  <span>Jaystarbliss Dynamic Institute</span>
                </div>`
          }
          <div style="font-size: 11pt; line-height: 1.6; color: #0f172a;">
            ${pageHtml}
          </div>
        </div>
      `;

      stagingWrapper.replaceChildren(pageCard);
      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(pageCard, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: targetWidthPx,
        height: targetHeightPx,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, sheetWidthMm, sheetHeightMm, undefined, 'FAST');

      if (onProgress) {
        onProgress(Math.round(10 + (i + 1) * progressStep));
      }
    }

    const safeTitle = (title || 'Document').replace(/[^a-z0-9_\-\s]/gi, '_').trim() || 'Document';
    pdf.save(`${safeTitle}.pdf`);

    if (onProgress) onProgress(100);
    return true;
  } catch (err) {
    console.error('Multi-Page PDF export error, falling back to direct print:', err);
    printDocumentDirect(rawTitle, rawBodyHtml, pageSize, orientation, marginOption);
    return true;
  } finally {
    if (stagingWrapper.parentNode) {
      stagingWrapper.parentNode.removeChild(stagingWrapper);
    }
  }
}

/**
 * Exports document as Microsoft Word (.docx) with embedded Official Letterhead and matching page dimensions
 */
export async function exportDocumentAsDOCX(
  rawTitle: string, 
  rawBodyHtml: string,
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): Promise<boolean> {
  try {
    const { title, html: bodyHtml } = resolveDocParams(rawTitle, rawBodyHtml);
    const isLandscape = orientation === 'landscape';
    const paperDef = PAPER_SIZES[pageSize] || PAPER_SIZES.a4;
    const margins = MARGIN_PRESETS[marginOption] || MARGIN_PRESETS.normal;

    const widthCm = ((isLandscape ? paperDef.heightMm : paperDef.widthMm) / 10).toFixed(1);
    const heightCm = ((isLandscape ? paperDef.widthMm : paperDef.heightMm) / 10).toFixed(1);
    const topMarginCm = (margins.topMm / 10).toFixed(1);
    const rightMarginCm = (margins.rightMm / 10).toFixed(1);
    const bottomMarginCm = (margins.bottomMm / 10).toFixed(1);
    const leftMarginCm = (margins.leftMm / 10).toFixed(1);

    const wordDocHTML = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title)}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            mso-page-orientation: ${orientation};
            size: ${widthCm}cm ${heightCm}cm;
            margin: ${topMarginCm}cm ${rightMarginCm}cm ${bottomMarginCm}cm ${leftMarginCm}cm;
          }
          body {
            font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #000000;
          }
          h1 { font-size: 18pt; font-weight: bold; color: #000000; margin: 12pt 0 6pt 0; }
          h2 { font-size: 14pt; font-weight: bold; color: #0f172a; margin: 10pt 0 4pt 0; }
          h3 { font-size: 12pt; font-weight: bold; color: #1e293b; margin: 8pt 0 3pt 0; }
          p { margin: 0 0 8pt 0; }
          table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
          th, td { border: 1px solid #cbd5e1; padding: 6pt 8pt; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; }
          img { max-width: 100%; height: auto; }
          .header-box { border-bottom: 2pt solid #0f172a; padding-bottom: 10pt; margin-bottom: 16pt; }
        </style>
      </head>
      <body>
        <div class="header-box">
          <table style="width: 100%; border: none;">
            <tr>
              <td style="width: 80px; vertical-align: middle; border: none;">
                <img src="${REAL_LOGO_BASE64}" width="70" height="70" style="border-radius: 50%;" alt="Logo" />
              </td>
              <td style="text-align: center; vertical-align: middle; border: none;">
                <div style="font-size: 15pt; font-weight: bold; text-transform: uppercase;">JAYSTARBLISS DYNAMIC INSTITUTE</div>
                <div style="font-size: 9pt; color: #334155;">No, 3 Komolafe Street, Cedar County estate, Sangotedo, Lagos state.</div>
                <div style="font-size: 9pt; color: #334155;">+234 9136518194, +2349130529010</div>
                <div style="font-size: 9pt; color: #0284c7;">jaystarblissstudios@gmail.com | www.jaystarbliss-studios.name.ng</div>
              </td>
            </tr>
          </table>
        </div>
        <div>
          ${bodyHtml}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordDocHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (title || 'Document').replace(/[^a-z0-9_\-\s]/gi, '_').trim() || 'Document';
    a.download = `${safeTitle}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Word export error:', err);
    return false;
  }
}

/**
 * Exports document as clean HTML
 */
export function exportDocumentAsHTML(
  rawTitle: string, 
  rawBodyHtml: string, 
  pageSize: PaperSizeOption = 'a4',
  orientation: OrientationOption = 'portrait',
  marginOption: MarginOption = 'normal'
): boolean {
  try {
    const { title } = resolveDocParams(rawTitle, rawBodyHtml);
    const htmlString = buildDocumentHTML(rawTitle, rawBodyHtml, pageSize, orientation, marginOption);
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (title || 'Document').replace(/[^a-z0-9_\-\s]/gi, '_').trim() || 'Document';
    a.download = `${safeTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('HTML export error:', err);
    return false;
  }
}

/**
 * Exports document as plain text
 */
export function exportDocumentAsTXT(rawTitle: string, textContent: string): boolean {
  try {
    const title = (rawTitle || 'Document').trim();
    const fullText = `JAYSTARBLISS DYNAMIC INSTITUTE\nOfficial Document Record\n${'='.repeat(40)}\nTitle: ${title}\nDate: ${new Date().toLocaleDateString()}\n${'='.repeat(40)}\n\n${textContent || ''}`;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = title.replace(/[^a-z0-9_\-\s]/gi, '_').trim() || 'Document';
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('TXT export error:', err);
    return false;
  }
}
