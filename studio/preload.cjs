const {contextBridge,ipcRenderer}=require('electron');
const invoke=(method,...args)=>ipcRenderer.invoke('d20-studio:'+method,...args);
contextBridge.exposeInMainWorld('D20Desktop',Object.freeze({
  info:()=>invoke('info'),openProject:()=>invoke('open-project'),saveProject:(data,saveAs)=>invoke('save-project',data,saveAs),
  autosave:data=>invoke('autosave',data),archiveDraft:data=>invoke('archive-draft',data),newProject:()=>invoke('new-project'),flush:data=>ipcRenderer.sendSync('d20-studio:flush',data),restore:()=>invoke('restore'),importGLB:()=>invoke('import-glb'),exportPreset:data=>invoke('export-preset',data),
  exportGLB:(bytes,name)=>invoke('export-glb',bytes,name),exportPackage:(data,bytes)=>invoke('export-package',data,bytes),
  prepareBlender:(data,bytes)=>invoke('prepare-blender',data,bytes),jobs:()=>invoke('jobs'),openBlender:id=>invoke('open-blender',id),
  readBlender:id=>invoke('read-blender',id),chooseBlender:()=>invoke('choose-blender')
}));
