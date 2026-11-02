import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { JESS_DOCUMENT_EDIT_KEY, PendingJessDocumentEdit, applyJessDocumentEdit } from '../lib/jessDocumentBridge';

function getDocumentId(pathname: string) { if (!pathname.startsWith('/documents/')) return null; return pathname.split('/')[2] || null; }

async function applyVisibleEdit(edit: PendingJessDocumentEdit) {
  if (applyJessDocumentEdit(edit)) return true;
  const editor = document.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]');
  if (!editor) return false;
  editor.focus(); const selection = window.getSelection(); if (!selection) return false; const range = document.createRange(); range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
  if (edit.mode === 'append') { range.collapse(false); selection.removeAllRanges(); selection.addRange(range); }
  const inserted = document.execCommand('insertHTML', false, edit.content);
  if (!inserted) document.execCommand('insertText', false, edit.content.replace(/<[^>]+>/g, ' '));
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
  return true;
}

export interface JessDocumentBridgeProps {
  editor?: any;
  docTitle?: string;
  docId?: string;
  onSaveDocument?: (content: any) => Promise<void> | void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export function JessDocumentBridge(props?: JessDocumentBridgeProps) {
  const location = useLocation();
  useEffect(() => {
    const documentId = getDocumentId(location.pathname); if (!documentId) return; let cancelled = false;
    const consume = async () => {
      let raw: string | null = null; try { raw = sessionStorage.getItem(JESS_DOCUMENT_EDIT_KEY); } catch { return; } if (!raw) return;
      let pending: PendingJessDocumentEdit; try { pending = JSON.parse(raw); } catch { sessionStorage.removeItem(JESS_DOCUMENT_EDIT_KEY); return; }
      if (pending.documentId !== documentId || Date.now() - pending.createdAt > 5 * 60 * 1000) return;
      for (let attempt = 0; attempt < 30 && !cancelled; attempt++) { if (await applyVisibleEdit(pending)) { try { sessionStorage.removeItem(JESS_DOCUMENT_EDIT_KEY); } catch {} return; } await new Promise(resolve => window.setTimeout(resolve, 100)); }
    };
    void consume(); const listener = () => { void consume(); }; window.addEventListener('jess:document_edit', listener); return () => { cancelled = true; window.removeEventListener('jess:document_edit', listener); };
  }, [location.pathname]);
  return null;
}
