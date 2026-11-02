import React from 'react';
import { REAL_LOGO_BASE64 } from './logoData';

export const REAL_LOGO_SRC = '/jaystarbliss-logo.png';

export interface OfficialLetterheadProps {
  className?: string;
  theme?: 'light' | 'white' | 'dark' | 'auto';
}

export const OfficialLetterhead: React.FC<OfficialLetterheadProps> = ({ 
  className = '',
  theme = 'white'
}) => {
  const isWhite = theme === 'white' || theme === 'light';

  return (
    <div
      id="official-document-header"
      className={`official-letterhead pb-6 mb-8 select-none ${
        isWhite ? 'border-b-2 border-slate-300 text-slate-900' : 'border-b-2 border-slate-700/60 text-slate-100'
      } ${className}`}
    >
      <div className="flex flex-row items-center justify-center gap-4 md:gap-6 text-center">
        {/* Real Black and White Circular Emblem Logo */}
        <div className="shrink-0 flex items-center justify-center">
          <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden shadow-lg bg-black flex items-center justify-center p-0.5 ${
            isWhite ? 'border-2 border-slate-900 shadow-slate-300/50' : 'border-2 border-zinc-700 shadow-black'
          }`}>
            <img
              src={REAL_LOGO_SRC}
              alt="Jaystarbliss Dynamic Institute Logo"
              className="w-full h-full object-contain filter grayscale contrast-[140%] brightness-110 rounded-full"
              onError={(e) => {
                // Fallback to base64 if path is not loaded
                (e.target as HTMLImageElement).src = REAL_LOGO_BASE64;
              }}
            />
          </div>
        </div>

        {/* Institution Info Header Details */}
        <div className="flex flex-col items-center text-center space-y-1.5 flex-1 min-w-0">
          <h1 className={`text-lg sm:text-xl md:text-2xl font-extrabold uppercase tracking-tight font-sans print:text-black ${
            isWhite ? 'text-slate-950' : 'text-white'
          }`}>
            JAYSTARBLISS DYNAMIC INSTITUTE
          </h1>
          <p className={`text-xs sm:text-sm font-semibold print:text-black leading-snug ${
            isWhite ? 'text-slate-700' : 'text-slate-300'
          }`}>
            No, 3 Komolafe Street, Cedar County estate, Sangotedo, Lagos state.
          </p>
          <p className={`text-xs sm:text-sm font-semibold print:text-black ${
            isWhite ? 'text-slate-800' : 'text-slate-300'
          }`}>
            +234 9136518194, +2349130529010
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm pt-0.5 font-medium">
            <a
              href="mailto:jaystarblissstudios@gmail.com"
              className={`hover:underline print:text-black font-semibold ${
                isWhite ? 'text-sky-700 hover:text-sky-900' : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              jaystarblissstudios@gmail.com
            </a>
            <span className={`hidden sm:inline ${isWhite ? 'text-slate-400' : 'text-slate-600'} print:text-slate-400`}>•</span>
            <a
              href="https://www.jaystarbliss-studios.name.ng"
              target="_blank"
              rel="noreferrer"
              className={`hover:underline print:text-black font-semibold ${
                isWhite ? 'text-sky-700 hover:text-sky-900' : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              www.jaystarbliss-studios.name.ng
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Returns clean HTML for exporting to Word (.docx), HTML files, Google Drive, or PDF with the real black and white logo embedded
 */
export function getOfficialLetterheadHTML(): string {
  return `
  <table style="width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; font-family: Arial, Helvetica, sans-serif; text-align: center;">
    <tr>
      <td style="width: 100px; vertical-align: middle; text-align: center;">
        <img src="${REAL_LOGO_BASE64}" width="88" height="88" alt="Jaystarbliss Logo" style="display: block; margin: 0; border-radius: 50%; filter: grayscale(100%) contrast(140%);" />
      </td>
      <td style="vertical-align: middle; text-align: center;">
        <h1 style="margin: 0 0 6px 0; font-size: 19pt; font-weight: bold; color: #000000; letter-spacing: 0.5px; text-transform: uppercase;">
          JAYSTARBLISS DYNAMIC INSTITUTE
        </h1>
        <p style="margin: 0 0 4px 0; font-size: 10.5pt; font-weight: bold; color: #1e293b;">
          No, 3 Komolafe Street, Cedar County estate, Sangotedo, Lagos state.
        </p>
        <p style="margin: 0 0 4px 0; font-size: 10.5pt; font-weight: bold; color: #1e293b;">
          +234 9136518194, +2349130529010
        </p>
        <p style="margin: 0; font-size: 10pt;">
          <a href="mailto:jaystarblissstudios@gmail.com" style="color: #0284c7; text-decoration: underline; font-weight: bold;">jaystarblissstudios@gmail.com</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="https://www.jaystarbliss-studios.name.ng" style="color: #0284c7; text-decoration: underline; font-weight: bold;">www.jaystarbliss-studios.name.ng</a>
        </p>
      </td>
    </tr>
  </table>
  `;
}

/**
 * Returns plain text letterhead for TXT exports
 */
export function getOfficialLetterheadPlainText(): string {
  return `================================================================================
JAYSTARBLISS DYNAMIC INSTITUTE
No, 3 Komolafe Street, Cedar County estate, Sangotedo, Lagos state.
+234 9136518194, +2349130529010
jaystarblissstudios@gmail.com | www.jaystarbliss-studios.name.ng
================================================================================\n\n`;
}
