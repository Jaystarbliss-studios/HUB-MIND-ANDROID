import React, { useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Download, Upload, FileText, Code, FileImage, Loader2, Cloud, Eye } from 'lucide-react';
import * as mammoth from 'mammoth';
import { 
  exportDocumentAsPDF, 
  exportDocumentAsDOCX, 
  exportDocumentAsHTML, 
  exportDocumentAsTXT 
} from '../../lib/documentExporter';
import { PaperSizeOption, OrientationOption, MarginOption } from '../../lib/paginationEngine';
import { getOfficialLetterheadHTML } from './OfficialLetterhead';
import { DRIVE_SCOPES, requestGoogleAccessToken, getCachedCalendarToken } from '../../lib/googleAuthToken';

interface ImportExportMenuProps {
  editor: Editor;
  docTitle: string;
  pageSize?: PaperSizeOption;
  orientation?: OrientationOption;
  marginOption?: MarginOption;
  onOpenPreview?: () => void;
}

export function ImportExportMenu({ 
  editor, 
  docTitle, 
  pageSize = 'a4',
  orientation = 'portrait',
  marginOption = 'normal',
  onOpenPreview 
}: ImportExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingDOCX, setIsExportingDOCX] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [driveToken, setDriveToken] = useState<string | null>(() => getCachedCalendarToken());
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSuccess, setDriveSuccess] = useState(false);

  const handleDriveExport = async () => {
    let token = driveToken || getCachedCalendarToken();
    if (!token) {
      try {
        token = await requestGoogleAccessToken(DRIVE_SCOPES);
        setDriveToken(token);
      } catch (err: any) {
        setDriveError(err?.message || 'Failed to authenticate with Google Drive');
        return;
      }
    }
    
    setIsUploadingDrive(true);
    setDriveError(null);
    setDriveSuccess(false);
    
    const bodyHtml = editor.getHTML();
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle || 'Document'}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #111827; }
    img { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; }
  </style>
</head>
<body>
  ${getOfficialLetterheadHTML()}
  <div class="document-content">
    ${bodyHtml}
  </div>
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const metadata = {
      name: `${docTitle || 'Document'}.html`,
      mimeType: 'text/html',
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Upload failed");
      setDriveSuccess(true);
      setTimeout(() => setIsOpen(false), 2000);
    } catch (err: any) {
      setDriveError(err.message || "Failed to upload document");
    } finally {
      setIsUploadingDrive(false);
    }
  };

  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportDOCX = async () => {
    setIsExportingDOCX(true);
    try {
      await exportDocumentAsDOCX(docTitle || 'Document', editor.getHTML(), pageSize, orientation, marginOption);
    } catch (e) {
      console.error('Failed to export DOCX', e);
    } finally {
      setIsExportingDOCX(false);
      setIsOpen(false);
    }
  };

  const handleExportHTML = () => {
    exportDocumentAsHTML(docTitle || 'Document', editor.getHTML(), pageSize, orientation, marginOption);
    setIsOpen(false);
  };

  const handleExportTXT = () => {
    exportDocumentAsTXT(docTitle || 'Document', editor.getText());
    setIsOpen(false);
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      await exportDocumentAsPDF(docTitle || 'Document', editor.getHTML(), pageSize, orientation, marginOption);
    } catch (e) {
      console.error('Failed to export PDF', e);
    } finally {
      setIsExportingPDF(false);
      setIsOpen(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setIsOpen(false);

    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const text = await file.text();
        editor.commands.setContent(`<p>${text.replace(/\n/g, '<br>')}</p>`);
      } else if (file.type === 'text/html' || file.name.endsWith('.html')) {
        const html = await file.text();
        editor.commands.setContent(html);
      } else if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const options = {
          convertImage: mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
              return {
                src: "data:" + image.contentType + ";base64," + imageBuffer
              };
            });
          }),
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Heading 5'] => h5:fresh",
            "p[style-name='Heading 6'] => h6:fresh",
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => h2:fresh",
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
            "p[style-name='Normal'] => p:fresh",
          ],
          includeDefaultStyleMap: true
        };
        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        editor.commands.setContent(result.value);
      } else {
        setDriveError('Unsupported file format'); setTimeout(() => setDriveError(null), 3000);
      }
    } catch (error) {
      console.error("Import error:", error);
      setDriveError('Failed to import document'); setTimeout(() => setDriveError(null), 3000);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
      >
        <FileText className="w-4 h-4" />
        <span className="hidden sm:inline">File</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50">
          <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview & Export</div>
          
          {onOpenPreview && (
            <button 
              onClick={() => {
                onOpenPreview();
                setIsOpen(false);
              }} 
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-cyan-300 hover:bg-slate-700 hover:text-white transition-colors font-medium"
            >
              <Eye className="w-4 h-4 text-cyan-400" /> Full Page Preview & Print
            </button>
          )}

          <button 
            onClick={handleExportPDF} 
            disabled={isExportingPDF}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <FileImage className="w-4 h-4 text-red-400" />}
            <span>{isExportingPDF ? 'Generating PDF...' : 'Download as PDF'}</span>
          </button>

          <button 
            onClick={handleExportDOCX} 
            disabled={isExportingDOCX}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {isExportingDOCX ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <FileText className="w-4 h-4 text-blue-400" />}
            <span>{isExportingDOCX ? 'Generating DOCX...' : 'Download as DOCX'}</span>
          </button>
          <button onClick={handleExportHTML} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
            <Code className="w-4 h-4" /> As HTML
          </button>
          <button onClick={handleExportTXT} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
            <FileText className="w-4 h-4" /> As TXT
          </button>
          <button onClick={handleDriveExport} disabled={isUploadingDrive} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
            {isUploadingDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />} 
            {isUploadingDrive ? 'Uploading...' : (!driveToken ? 'Connect Drive' : 'Save to Drive')}
          </button>
          {driveSuccess && <div className="px-4 py-1 text-xs text-green-400">Upload Successful!</div>}
          {driveError && <div className="px-4 py-1 text-xs text-red-400">{driveError}</div>}

          <div className="my-1 border-t border-slate-700"></div>
          
          <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Import</div>
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{isImporting ? 'Importing...' : 'Upload File (DOCX, TXT, HTML)'}</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            accept=".docx,.txt,.html" 
            className="hidden" 
          />
        </div>
      )}
    </div>
  );
}
