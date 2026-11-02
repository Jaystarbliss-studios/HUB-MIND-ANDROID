import React, { useState } from 'react';
import { UploadCloud, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DRIVE_SCOPES, requestGoogleAccessToken, getCachedCalendarToken } from '../lib/googleAuthToken';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DriveUploadProps {
  onUploadSuccess: (webViewLink: string, fileId: string) => void;
  className?: string;
  label?: string;
}

export function DriveUpload({ onUploadSuccess, className, label = "Upload to Drive" }: DriveUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getCachedCalendarToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const requestAuth = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const accessToken = await requestGoogleAccessToken(DRIVE_SCOPES);
      setToken(accessToken);
    } catch (err: any) {
      setError(err?.message || "Failed to authenticate with Google Drive.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let activeToken = token || getCachedCalendarToken();
    if (!activeToken) {
      setError("Please connect Google Drive first.");
      return;
    }

    setUploading(true);
    setError(null);

    const metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`
        },
        body: form
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || "Upload failed");
      }

      onUploadSuccess(data.webViewLink, data.id);
    } catch (err: any) {
      setError(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      {!token ? (
        <button
          type="button"
          onClick={requestAuth}
          disabled={isAuthenticating}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isAuthenticating ? (
            <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
          ) : (
            <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="Drive" className="w-4 h-4" />
          )}
          {isAuthenticating ? "Connecting..." : "Connect Google Drive"}
        </button>
      ) : (
        <label className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md cursor-pointer text-sm font-medium transition-colors">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <UploadCloud className="w-4 h-4" />}
          <span>{uploading ? "Uploading..." : label}</span>
          <input
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
      
      {error && <p className="text-red-400 text-xs max-w-xs">{error}</p>}
      
      {token && !uploading && !error && (
        <p className="text-accent text-xs flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Drive Connected
        </p>
      )}
      <p className="text-slate-500 text-xs flex items-center gap-1">
        <FileText className="w-3 h-3" /> Any document type supported
      </p>
    </div>
  );
}
