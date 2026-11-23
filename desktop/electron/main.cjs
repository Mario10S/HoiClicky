const {registerHistory}=require('./history.cjs');
const {app,BrowserWindow,ipcMain,globalShortcut,screen,dialog,shell}=require('electron');
const {spawn}=require('node:child_process');const path=require('node:path');const readline=require('node:readline');
const {registerSounds}=require('./completion-sound.cjs');
const {attachIslandMotion,initialIslandBounds}=require('./island-motion.cjs');
let stopIslandMotion=()=>{};
let main,island,service,pointer,pointerTimer,trail,trailTimer,pointing=null,lastPoint=null,seq=0;const pending=new Map();
function clearTrail(){clearTimeout(trailTimer);if(trail&&!trail.isDestroyed())trail.destroy();trail=null;}
function showTrail(startX,startY,target){
 clearTrail();
 const margin=32,left=Math.floor(Math.min(startX,target.x)-margin),top=Math.floor(Math.min(startY,target.y)-margin);
 const width=Math.ceil(Math.abs(target.x-startX)+margin*2),height=Math.ceil(Math.abs(target.y-startY)+margin*2);
 trail=new BrowserWindow({x:left,y:top,width,height,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,focusable:false,skipTaskbar:true,resizable:false,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const shown=trail;shown.setIgnoreMouseEvents(true);shown.setContentProtection(true);shown.setAlwaysOnTop(true,'screen-saver');
 shown.loadFile(path.join(__dirname,'trail.html'),{query:{x1:String(startX-left),y1:String(startY-top),x2:String(target.x-left),y2:String(target.y-top)}});
 shown.once('ready-to-show',()=>{if(!shown.isDestroyed())shown.showInactive();});
 trailTimer=setTimeout(()=>{if(!shown.isDestroyed())shown.destroy();if(trail===shown)trail=null;},4100);
}
function guidePointer(x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!pointer||pointer.isDestroyed())return;
 const target=screen.screenToDipPoint({x:Math.round(x),y:Math.round(y)});
 const [startX,startY]=pointer.getPosition();
 showTrail(startX+21,startY+12,target);
 pointing={startX,startY,target:{x:target.x-21,y:target.y-12},start:Date.now()};
}
function setPointer(enabled){
 clearInterval(pointerTimer);
 if(pointer&&!pointer.isDestroyed())pointer.destroy();
 pointer=null;
 if(!enabled){clearTrail();pointing=null;return;}
 const pos=screen.getCursorScreenPoint();
 pointer=new BrowserWindow({x:pos.x+20,y:pos.y+20,width:32,height:32,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,focusable:false,skipTaskbar:true,resizable:false,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 pointer.setIgnoreMouseEvents(true);pointer.setContentProtection(true);pointer.setAlwaysOnTop(true,'screen-saver');
 const shown=pointer;
 shown.loadFile(path.join(__dirname,'pointer.html'));
 shown.once('ready-to-show',()=>{if(!shown.isDestroyed())shown.showInactive();});
 let lastX=pos.x,lastY=pos.y;
 // Sample frequently; Windows and Electron still determine the actual update rate.
 pointerTimer=setInterval(()=>{if(shown.isDestroyed())return;if(pointing){const elapsed=Date.now()-pointing.start;if(elapsed<1200){const t=Math.min(1,elapsed/1200),e=t*t*(3-2*t);shown.setPosition(Math.round(pointing.startX+(pointing.target.x-pointing.startX)*e),Math.round(pointing.startY+(pointing.target.y-pointing.startY)*e));return;}if(elapsed<3700)return;if(elapsed<4500){const next=screen.getCursorScreenPoint(),t=(elapsed-3700)/800,e=t*t*(3-2*t);shown.setPosition(Math.round(pointing.target.x+(next.x+20-pointing.target.x)*e),Math.round(pointing.target.y+(next.y+20-pointing.target.y)*e));return;}pointing=null;lastX=NaN;lastY=NaN;}const next=screen.getCursorScreenPoint();if(next.x!==lastX||next.y!==lastY){lastX=next.x;lastY=next.y;shown.setPosition(next.x+20,next.y+20);}},4);
}
function emit(data){for(const w of [main,island])if(w&&!w.isDestroyed())w.webContents.send('event',data);}
function call(method,args){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});service.stdin.write(JSON.stringify({id,method,args})+'\n');});}
function create(options,query){const win=new BrowserWindow({...options,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.loadFile(path.join(__dirname,'../dist/index.html'),{query});return win;}
app.on('before-quit',()=>{setPointer(false);stopIslandMotion();globalShortcut.unregisterAll();service?.kill();});app.on('window-all-closed',()=>app.quit());
app.whenReady().then(()=>{
 registerHistory({ipcMain,app,dialog,getMain:()=>main});
 registerSounds({ipcMain,dialog,app,getMain:()=>main});
 ipcMain.handle('open-link',(event,url)=>{if(event.sender!==main.webContents&&event.sender!==island?.webContents)throw Error('Invalid sender');const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Unsupported link');return shell.openExternal(parsed.href);});
 service=spawn('dotnet',[path.join(__dirname,'../../backend/bin/Release/net8.0-windows/HoiClicky.Service.dll')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 function fail(message){for(const p of pending.values())p.reject(new Error(message));pending.clear();emit({eventName:'error',value:message});}
 service.on('error',()=>fail('The local service could not start. Run the backend build first.'));
 service.on('exit',()=>fail('The local service stopped. Restart HoiClicky.'));
 service.stderr.resume();
 service.stdin.on('error',()=>fail('The local service connection closed. Restart HoiClicky.'));
 readline.createInterface({input:service.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.eventName){if(data.eventName==='point'){lastPoint={x:data.x,y:data.y};guidePointer(data.x,data.y);}else emit(data);return;}const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);}}catch{}});
 ipcMain.handle('status',()=>call('status'));
 for(const method of ['connect','disconnect','claudeConnect','claudeDisconnect','models','voice','voiceStop','agentStop'])ipcMain.handle(method,()=>call(method));
 // Agent approvals can be answered from the chat window or the floating panel.
 ipcMain.handle('approve',(event,data)=>{if(event.sender!==main.webContents&&event.sender!==island?.webContents)throw Error('Invalid sender');if(typeof data?.id!=='string'||typeof data?.allow!=='boolean')throw Error('Invalid approval');return call('approve',{id:data.id.slice(0,200),allow:data.allow});});
 ipcMain.handle('confirm-action',(event,data)=>{if(event.sender!==main.webContents)throw Error('Invalid sender');if(typeof data?.title!=='string'||typeof data?.detail!=='string')throw Error('Invalid confirmation');return call('confirmAction',{title:data.title.slice(0,200),detail:data.detail.slice(0,1000)});});
 ipcMain.handle('pick-workspace',async event=>{if(event.sender!==main.webContents)throw Error('Invalid sender');const choice=await dialog.showOpenDialog(main,{title:'Choose a workspace folder for agent mode',properties:['openDirectory','createDirectory']});return choice.canceled?null:choice.filePaths[0]||null;});
 ipcMain.handle('settings',(_,data)=>{
  if(typeof data?.screen!=='boolean'||typeof data?.microphone!=='boolean'||typeof data?.model!=='string')throw Error('Invalid settings');
  return call('settings',data);
 });
 ipcMain.handle('ask',async(_,data)=>{
  if(typeof data?.question!=='string'||typeof data?.model!=='string'||typeof data?.screen!=='boolean'||data.question.length>32000||(data.agent!==undefined&&typeof data.agent!=='boolean'))throw Error('Invalid question');
  lastPoint=null;
  const answer=await call('ask',data);
  const requested=/^(?:please\s+)?(?:click|press|tap|activate)\b|\b(?:please|can you|could you|would you)\s+(?:please\s+)?(?:click|press|tap|activate)\b|\bplease\s+do\s+(?:it|that)\b/i.test(data.question.trim());
  if(data.agent||!data.screen||!requested||!lastPoint)return answer;
  const target=lastPoint;lastPoint=null;
  try{
   const info=await call('prepareClick',target);
   const choice=await dialog.showMessageBox({type:'question',title:'Confirm click',message:'Click '+info.name+'?',detail:'HoiClicky will activate this '+info.type+'. Check the highlighted location first.',buttons:['Cancel','Click'],defaultId:0,cancelId:0,noLink:true});
   if(choice.response===1){await call('confirmClick');return answer+'\n\nClicked '+info.name+'.';}
   await call('cancelClick');return answer+'\n\nClick cancelled.';
  }catch(error){await call('cancelClick').catch(()=>{});return answer+'\n\nCould not click: '+error.message;}
 });
 ipcMain.handle('presentation',(event,data)=>{if(event.sender!==main.webContents)throw Error('Invalid sender');if(typeof data?.phase!=='string'||typeof data?.answer!=='string')throw Error('Invalid presentation');const text=value=>typeof value==='string'?value:'';island.webContents.send('event',{eventName:'presentation',phase:data.phase.slice(0,160),answer:data.answer.slice(-24000),question:text(data.question).slice(0,600),model:text(data.model).slice(0,80),talk:text(data.talk).slice(0,40),busy:!!data.busy,listening:!!data.listening,error:text(data.error).slice(0,400)});});
 // Follow-up questions typed into the floating panel are sent through the chat window, so history and providers stay in one place.
 ipcMain.handle('island-ask',(event,text)=>{if(event.sender!==island.webContents)throw Error('Invalid sender');if(typeof text!=='string'||!text.trim()||text.length>32000)throw Error('Invalid question');main.webContents.send('event',{eventName:'islandAsk',text:text.trim()});});
 ipcMain.handle('window',(_,action)=>{if(action==='minimize')main.hide();else if(action==='close')app.quit();else{main.show();main.focus();}});
 main=create({width:1100,height:790,minWidth:850,minHeight:620,frame:false,backgroundColor:'#111216',show:false},{});
 const islandStore=path.join(app.getPath('userData'),'island.json');
 island=create({...initialIslandBounds(islandStore),frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,show:false},{island:'1'});
 main.setContentProtection(true);island.setContentProtection(true);
 setPointer(true);
 stopIslandMotion=attachIslandMotion(ipcMain,()=>island,islandStore);
 main.once('ready-to-show',()=>main.show());island.once('ready-to-show',()=>{island.setAlwaysOnTop(true,'screen-saver');island.showInactive();});
 island.on('blur',()=>{if(!island.isDestroyed()&&island.isVisible())island.setAlwaysOnTop(true,'screen-saver');});
}).catch(error=>{console.error('HoiClicky startup failed:',error);app.quit();});
