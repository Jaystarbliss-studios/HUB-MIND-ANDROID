export interface JessContext { page:string; documentId?:string; projectId?:string; taskId?:string; clientId?:string; }

export function resolveJessContext(pathname:string): JessContext {
  const parts=pathname.split('/').filter(Boolean);
  const page=pathname || '/';
  const resource=parts[0];
  const id=parts[1];
  if(resource==='documents' && id) return {page,documentId:id};
  if(resource==='projects' && id) return {page,projectId:id};
  if(resource==='tasks' && id) return {page,taskId:id};
  if(resource==='clients' && id) return {page,clientId:id};
  return {page};
}
