const {app,BrowserWindow,ipcMain,globalShortcut,screen}=require('electron');
const {spawn}=require('node:child_process');const path=require('node:path');const readline=require('node:readline');
const {attachIslandMotion}=require('./island-motion.cjs');
let stopIslandMotion=()=>{};
let main,island,service,seq=0;const pending=new Map();
function emit(data){for(const w of [main,island])if(w&&!w.isDestroyed())w.webContents.send('event',data);}
function call(method,args){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});service.stdin.write(JSON.stringify({id,method,args})+'\n');});}
function create(options,query){const win=new BrowserWindow({...options,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.loadFile(path.join(__dirname,'../dist/index.html'),{query});return win;}
app.on('before-quit',()=>{stopIslandMotion();globalShortcut.unregisterAll();service?.kill();});app.on('window-all-closed',()=>app.quit());
app.whenReady().then(()=>{
 service=spawn('dotnet',[path.join(__dirname,'../../backend/bin/Release/net8.0-windows/HoiClicky.Service.dll')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 function fail(message){for(const p of pending.values())p.reject(new Error(message));pending.clear();emit({eventName:'error',value:message});}
 service.on('error',()=>fail('The local service could not start. Run the backend build first.'));
 service.on('exit',()=>fail('The local service stopped. Restart HoiClicky.'));
 service.stderr.resume();
 service.stdin.on('error',()=>fail('The local service connection closed. Restart HoiClicky.'));
 readline.createInterface({input:service.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.eventName){if(data.eventName==='captured'){main.show();island.show();}emit(data);return;}const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);}}catch{}});
 ipcMain.handle('status',()=>call('status'));
 for(const method of ['connect','disconnect','models','voice','voiceStop'])ipcMain.handle(method,()=>call(method));
 ipcMain.handle('settings',(_,data)=>{
  if(typeof data?.screen!=='boolean'||typeof data?.microphone!=='boolean'||typeof data?.model!=='string')throw Error('Invalid settings');
  return call('settings',data);
 });
 ipcMain.handle('ask',async(_,data)=>{
  if(typeof data?.question!=='string'||typeof data?.model!=='string'||typeof data?.screen!=='boolean'||data.question.length>32000)throw Error('Invalid question');
  const visible=main.isVisible();
  try{if(data.screen){main.hide();island.hide();await new Promise(resolve=>setTimeout(resolve,250));}return await call('ask',data);}
  finally{if(visible)main.show();island.show();}
 });
 ipcMain.handle('window',(_,action)=>{if(action==='minimize')main.minimize();else if(action==='close')app.quit();else{main.show();main.focus();}});
 main=create({width:1100,height:790,minWidth:850,minHeight:620,frame:false,backgroundColor:'#111216',show:false},{});
 const area=screen.getPrimaryDisplay().workArea;
 island=create({width:310,height:76,x:Math.round(area.x+(area.width-310)/2),y:area.y+10,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,resizable:false,skipTaskbar:true,show:false},{island:'1'});
 stopIslandMotion=attachIslandMotion(ipcMain,()=>island);
 main.once('ready-to-show',()=>main.show());island.once('ready-to-show',()=>island.show());
}).catch(error=>{console.error('HoiClicky startup failed:',error);app.quit();});
