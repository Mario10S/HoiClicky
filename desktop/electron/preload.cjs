const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hoi',{
 history:(action,value)=>ipcRenderer.invoke('history',action,value),
 ttsKey:(value)=>value===undefined?ipcRenderer.invoke('tts-key-get'):ipcRenderer.invoke('tts-key-set',value),ttsVoices:()=>ipcRenderer.invoke('tts-voices'),ttsSpeak:(value)=>ipcRenderer.invoke('tts-speak',value),piperInstall:voice=>ipcRenderer.invoke('piper-install',voice),piperSpeak:value=>ipcRenderer.invoke('piper-speak',value),
 sound:(action,value)=>ipcRenderer.invoke('completion-sound',action,value),openLink:url=>ipcRenderer.invoke('open-link',url),
 presentation:value=>ipcRenderer.invoke('presentation',value),islandLayout:value=>ipcRenderer.invoke('island-layout',value),
 islandDrag:value=>ipcRenderer.invoke('island-drag',value),islandAsk:text=>ipcRenderer.invoke('island-ask',text),approve:value=>ipcRenderer.invoke('approve',value),agentStop:()=>ipcRenderer.invoke('agentStop'),pickWorkspace:()=>ipcRenderer.invoke('pick-workspace'),confirmAction:value=>ipcRenderer.invoke('confirm-action',value),
 status:()=>ipcRenderer.invoke('status'),connect:()=>ipcRenderer.invoke('connect'),disconnect:()=>ipcRenderer.invoke('disconnect'),claudeConnect:()=>ipcRenderer.invoke('claudeConnect'),claudeDisconnect:()=>ipcRenderer.invoke('claudeDisconnect'),models:()=>ipcRenderer.invoke('models'),settings:(value)=>ipcRenderer.invoke('settings',value),ask:(value)=>ipcRenderer.invoke('ask',value),voice:()=>ipcRenderer.invoke('voice'),voiceStop:()=>ipcRenderer.invoke('voiceStop'),window:(action)=>ipcRenderer.invoke('window',action),events:(callback)=>{const listener=(_,data)=>callback(data);ipcRenderer.on('event',listener);return()=>ipcRenderer.removeListener('event',listener);}
});
