'use strict';
const root = document.getElementById('sources');
const status = document.getElementById('status');
function cancel(){ window.jessScreenSharePicker?.cancel?.(); }
document.getElementById('cancelTop').addEventListener('click', cancel);
function render(sources){
  root.replaceChildren();
  if(!Array.isArray(sources)||!sources.length){status.textContent='No shareable screens or windows were found.';return;}
  for(const source of sources){
    const button=document.createElement('button');button.type='button';button.className='card';
    const kind=String(source.kind||'window');
    if(source.thumbnail){const img=document.createElement('img');img.className='thumb';img.alt='Preview of '+String(source.name||kind);img.src=source.thumbnail;button.appendChild(img);}
    else{const ph=document.createElement('div');ph.className='placeholder';ph.textContent=kind==='screen'?'Screen preview unavailable':'Window preview unavailable';button.appendChild(ph);}
    const type=document.createElement('div');type.className='kind';type.textContent=kind==='screen'?'DISPLAY':'APPLICATION WINDOW';
    const name=document.createElement('div');name.className='name';name.textContent=String(source.name||'Unnamed source');
    button.append(type,name);
    button.addEventListener('click',()=>{status.textContent='Sharing selected source…';for(const item of root.querySelectorAll('button'))item.disabled=true;window.jessScreenSharePicker?.selectSource?.(source.id);});
    root.appendChild(button);
  }
  status.textContent=sources.length+' source'+(sources.length===1?'':'s')+' available.';
}
window.jessScreenSharePicker?.onSources?.(render);
