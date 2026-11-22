const {registerHistory}=require('./history.cjs');
const {app,BrowserWindow,ipcMain,globalShortcut,screen,dialog,shell}=require('electron');
const {spawn}=require('node:child_process');const path=require('node:path');const readline=require('node:readline');
const {registerSounds}=require('./completion-sound.cjs');
const {attachIslandMotion}=require('./island-motion.cjs');
let stopIslandMotion=()=>{};
let main,island,service,seq=0;const pending=new Map();
function emit(data){for(const w of [main,island])if(w&&!w.isDestroyed())w.webContents.send('event',data);}
function call(method,args){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});service.stdin.write(JSON.stringify({id,method,args})+'\n');});}
function create(options,query){const win=new BrowserWindow({...options,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.loadFile(path.join(__dirname,'../dist/index.html'),{query});return win;}
app.on('before-quit',()=>{stopIslandMotion();globalShortcut.unregisterAll();service?.kill();});app.on('window-all-closed',()=>app.quit());
app.whenReady().then(()=>{
 registerHistory({ipcMain,app,dialog,getMain:()=>main});
 registerSounds({ipcMain,dialog,app,getMain:()=>main});
 ipcMain.handle('open-link',(event,url)=>{if(event.sender!==main.webContents)throw Error('Invalid sender');const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Unsupported link');return shell.openExternal(parsed.href);});
 service=spawn('dotnet',[path.join(__dirname,'../../backend/bin/Release/net8.0-windows/HoiClicky.Service.dll')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 function fail(message){for(const p of pending.values())p.reject(new Error(message));pending.clear();emit({eventName:'error',value:message});}
 service.on('error',()=>fail('The local service could not start. Run the backend build first.'));
 service.on('exit',()=>fail('The local service stopped. Restart HoiClicky.'));
 service.stderr.resume();
 service.stdin.on('error',()=>fail('The local service connection closed. Restart HoiClicky.'));
 readline.createInterface({input:service.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.eventName){emit(data);return;}const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);}}catch{}});
 ipcMain.handle('status',()=>call('status'));
 for(const method of ['connect','disconnect','models','voice','voiceStop'])ipcMain.handle(method,()=>call(method));
 ipcMain.handle('settings',(_,data)=>{
  if(typeof data?.screen!=='boolean'||typeof data?.microphone!=='boolean'||typeof data?.model!=='string')throw Error('Invalid settings');
  return call('settings',data);
 });
 ipcMain.handle('ask',async(_,data)=>{
  if(typeof data?.question!=='string'||typeof data?.model!=='string'||typeof data?.screen!=='boolean'||data.question.length>32000)throw Error('Invalid question');
  return call('ask',data);
 });
 ipcMain.handle('presentation',(event,data)=>{if(event.sender!==main.webContents)throw Error('Invalid sender');if(typeof data?.phase!=='string'||typeof data?.answer!=='string')throw Error('Invalid presentation');island.webContents.send('event',{eventName:'presentation',phase:data.phase.slice(0,160),answer:data.answer.slice(-1200),busy:!!data.busy,listening:!!data.listening,error:typeof data.error==='string'?data.error.slice(0,240):''});});
 ipcMain.handle('window',(_,action)=>{if(action==='minimize')main.hide();else if(action==='close')app.quit();else{main.show();main.focus();}});
 main=create({width:1100,height:790,minWidth:850,minHeight:620,frame:false,backgroundColor:'#111216',show:false},{});
 const area=screen.getPrimaryDisplay().workArea;
 island=create({width:56,height:56,x:Math.round(area.x+(area.width-56)/2),y:area.y+10,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,show:false},{island:'1'});
 main.setContentProtection(true);island.setContentProtection(true);
 stopIslandMotion=attachIslandMotion(ipcMain,()=>island);
 main.once('ready-to-show',()=>main.show());island.once('ready-to-show',()=>{island.setAlwaysOnTop(true,'screen-saver');island.showInactive();});
 island.on('blur',()=>{if(!island.isDestroyed()&&island.isVisible())island.setAlwaysOnTop(true,'screen-saver');});
}).catch(error=>{console.error('HoiClicky startup failed:',error);app.quit();});
