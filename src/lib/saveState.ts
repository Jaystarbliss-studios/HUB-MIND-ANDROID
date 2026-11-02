export type SaveState='idle'|'hydrating'|'saving'|'saved'|'offline'|'error';
export interface SaveController { isHydrated:boolean; hasUserChanges:boolean; lastLoadedContent:string; state:SaveState; lastSavedAt?:string; error?:string; }
export function createSaveController(initialContent=''):SaveController{return{isHydrated:false,hasUserChanges:false,lastLoadedContent:initialContent,state:'hydrating'};}
export function markHydrated(state:SaveController,content:string):SaveController{return{...state,isHydrated:true,hasUserChanges:false,lastLoadedContent:content,state:'saved',error:undefined};}
export function markChanged(state:SaveController,content:string):SaveController{if(!state.isHydrated||content===state.lastLoadedContent)return state;return{...state,hasUserChanges:true,state:'idle'};}
export function markSaving(state:SaveController):SaveController{return state.isHydrated&&state.hasUserChanges?{...state,state:'saving',error:undefined}:state;}
export function markSaved(state:SaveController,content:string):SaveController{return{...state,isHydrated:true,hasUserChanges:false,lastLoadedContent:content,state:'saved',lastSavedAt:new Date().toISOString(),error:undefined};}
export function markOffline(state:SaveController):SaveController{return{...state,state:'offline'};}
export function markSaveError(state:SaveController,error:string):SaveController{return{...state,state:'error',error};}
export function shouldAutosave(state:SaveController){return state.isHydrated&&state.hasUserChanges&&state.state!=='saving';}
