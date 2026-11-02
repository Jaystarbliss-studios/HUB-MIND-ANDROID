export const JESS_DOCUMENT_EDIT_KEY = 'hubmind.jess.pendingDocumentEdit.v1';
export type PendingJessDocumentEdit = { documentId:string; content:string; mode?:'replace'|'append'; createdAt:number };

let activeEditor:any = null;
let activeDocumentId:string|null = null;

export function registerJessDocumentEditor(editor:any, documentId:string) {
  activeEditor = editor;
  activeDocumentId = documentId;
}
export function unregisterJessDocumentEditor(editor:any) {
  if (activeEditor === editor) { activeEditor = null; activeDocumentId = null; }
}
export function applyJessDocumentEdit(edit:PendingJessDocumentEdit) {
  if (!activeEditor || activeEditor.isDestroyed || activeDocumentId !== edit.documentId) return false;
  if (edit.mode === 'append') activeEditor.commands.insertContent(edit.content);
  else activeEditor.commands.setContent(edit.content);
  return true;
}
export function queueJessDocumentEdit(edit:Omit<PendingJessDocumentEdit,'createdAt'>) {
  if (typeof window === 'undefined') return;
  const payload:PendingJessDocumentEdit = { ...edit, createdAt:Date.now() };
  try { sessionStorage.setItem(JESS_DOCUMENT_EDIT_KEY,JSON.stringify(payload)); } catch {}
  window.dispatchEvent(new CustomEvent('jess:document_edit',{detail:payload}));
}
