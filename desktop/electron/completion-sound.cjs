const fs=require('node:fs'),path=require('node:path');
function registerSounds({ipcMain,dialog,app,getMain}){
 const folder=path.join(app.getPath('userData'),'sounds'),config=path.join(folder,'settings.json'),audio=path.join(folder,'completion.mp3');
 function read(){try{return JSON.parse(fs.readFileSync(config,'utf8'));}catch{return {mode:'off',volume:.35,name:''};}}
 function save(value){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(config+'.tmp',JSON.stringify(value));fs.renameSync(config+'.tmp',config);return value;}
 ipcMain.handle('completion-sound',async(event,action,value)=>{
  if(event.sender!==getMain()?.webContents)throw Error('Invalid sender');
  if(action==='get')return read();
  if(action==='save'){if(!['off','soft','bright','mp3'].includes(value?.mode)||!Number.isFinite(value?.volume)||value.volume<0||value.volume>1)throw Error('Invalid sound settings');return save({...read(),mode:value.mode,volume:value.volume});}
  if(action==='pick'){const result=await dialog.showOpenDialog(getMain(),{title:'Choose a completion sound',properties:['openFile'],filters:[{name:'MP3 audio',extensions:['mp3']}]});if(result.canceled)return read();const selected=result.filePaths[0];if(path.extname(selected).toLowerCase()!=='.mp3')throw Error('Choose an MP3 file.');if(fs.statSync(selected).size>20*1024*1024)throw Error('Choose an MP3 smaller than 20 MB.');fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(selected,audio);return save({...read(),mode:'mp3',name:path.basename(selected)});}
  if(action==='audio'){try{return 'data:audio/mpeg;base64,'+fs.readFileSync(audio).toString('base64');}catch{throw Error('Your sound file is missing. Choose an MP3 again.');}}
  throw Error('Unsupported sound action');
 });
}
module.exports={registerSounds};
