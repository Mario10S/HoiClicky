const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hoi',{
 status:()=>ipcRenderer.invoke('status'),connect:()=>ipcRenderer.invoke('connect'),disconnect:()=>ipcRenderer.invoke('disconnect'),models:()=>ipcRenderer.invoke('models'),settings:(value)=>ipcRenderer.invoke('settings',value),ask:(value)=>ipcRenderer.invoke('ask',value),voice:()=>ipcRenderer.invoke('voice'),voiceStop:()=>ipcRenderer.invoke('voiceStop'),window:(action)=>ipcRenderer.invoke('window',action),events:(callback)=>{const listener=(_,data)=>callback(data);ipcRenderer.on('event',listener);return()=>ipcRenderer.removeListener('event',listener);}
});

