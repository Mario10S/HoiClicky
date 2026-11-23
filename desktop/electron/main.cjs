const {registerHistory}=require('./history.cjs');
const {app,BrowserWindow,ipcMain,globalShortcut,screen,dialog,shell,safeStorage}=require('electron');
const {spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const readline=require('node:readline');
const {registerSounds}=require('./completion-sound.cjs');
const {attachIslandMotion,initialIslandBounds}=require('./island-motion.cjs');
const {requestsClick,namedWindowToClose}=require('./action-intent.cjs');
const {activateControl}=require('./activate-control.cjs');
let stopIslandMotion=()=>{};
let main,island,service,pointer,pointerTimer,pointing=null,lastPoint=null,seq=0;const pending=new Map();
const {show:showTrail,clear:clearTrail}=require('./annotations.cjs').createAnnotations({BrowserWindow});
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
 const voiceFile=path.join(app.getPath('userData'),'voice-key.bin');
 ipcMain.handle('tts-key-get',event=>{if(![main?.webContents,island?.webContents].includes(event.sender))throw Error('Invalid sender');return fs.existsSync(voiceFile)?'configured':'';});
 ipcMain.handle('tts-key-set',(event,key)=>{if(event.sender!==main?.webContents)throw Error('Invalid sender');if(typeof key!=='string'||key.length>256)throw Error('Invalid API key');if(!key){if(fs.existsSync(voiceFile))fs.unlinkSync(voiceFile);return '';}if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');fs.writeFileSync(voiceFile,safeStorage.encryptString(key));return 'configured';});
 ipcMain.handle('tts-voices',async event=>{if(event.sender!==main?.webContents)throw Error('Invalid sender');const key=fs.existsSync(voiceFile)?safeStorage.decryptString(fs.readFileSync(voiceFile)):'';if(!key)return [];const r=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':key}});if(!r.ok)throw Error('Could not load ElevenLabs voices (HTTP '+r.status+').');return (await r.json()).voices.map(v=>({id:v.voice_id,name:v.name}));});
 ipcMain.handle('tts-speak',async(event,{text,voiceId})=>{if(![main?.webContents,island?.webContents].includes(event.sender))throw Error('Invalid sender');if(typeof text!=='string'||text.length>12000||typeof voiceId!=='string')throw Error('Invalid speech request');const key=fs.existsSync(voiceFile)?safeStorage.decryptString(fs.readFileSync(voiceFile)):'';if(!key)throw Error('Configure an ElevenLabs API key in Settings.');const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId),{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text,model_id:'eleven_multilingual_v2'})});if(!r.ok)throw Error('Voice request failed (HTTP '+r.status+').');return Buffer.from(await r.arrayBuffer()).toString('base64');});
 ipcMain.handle('open-link',(event,url)=>{if(event.sender!==main.webContents&&event.sender!==island?.webContents)throw Error('Invalid sender');const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Unsupported link');return shell.openExternal(parsed.href);});
 service=spawn('dotnet',[path.join(__dirname,'../../backend/bin/Release/net8.0-windows/HoiClicky.Service.dll')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 function fail(message){for(const p of pending.values())p.reject(new Error(message));pending.clear();emit({eventName:'error',value:message});}
 service.on('error',()=>fail('The local service could not start. Run the backend build first.'));
 service.on('exit',()=>fail('The local service stopped. Restart HoiClicky.'));
 service.stderr.resume();
 service.stdin.on('error',()=>fail('The local service connection closed. Restart HoiClicky.'));
 readline.createInterface({input:service.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.eventName){if(data.eventName==='point'&&[data.x,data.y].every(Number.isFinite)){lastPoint={x:data.x,y:data.y};const target=screen.screenToDipPoint({x:data.x,y:data.y});showTrail(target.x,target.y,target,'circle');}else if(data.eventName==='arrow'&&[data.x1,data.y1,data.x2,data.y2].every(Number.isFinite)){const a=screen.screenToDipPoint({x:data.x1,y:data.y1}),b=screen.screenToDipPoint({x:data.x2,y:data.y2});showTrail(a.x,a.y,b,'arrow');}else emit(data);return;}const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);}}catch{}});
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
  if(data.agent)return answer;
  const requested=requestsClick(data.question);
  if(!requested)return answer;
  if(!data.screen)return answer+'\n\nI need a screen question to identify the control before acting.';
  const namedWindow=namedWindowToClose(data.question);
  if(namedWindow){try{const result=await call('closeNamedWindow',{name:namedWindow});return answer+'\n\nRequested that '+result.name+' close.';}catch(error){return answer+'\n\nCould not close it: '+error.message;}}
  if(!lastPoint)return answer+'\n\nI could not identify a control to activate, so no click was performed.';
  const target=lastPoint;lastPoint=null;
  // Even click-through windows can appear in Windows accessibility hit testing.
  // Hide our own overlays until the target has been revalidated and invoked.
  clearTrail();
  const hiddenPointer=pointer&&!pointer.isDestroyed()?pointer:null;
  if(hiddenPointer)hiddenPointer.hide();
  try{return answer+await activateControl(call,target);}
  finally{if(hiddenPointer&&!hiddenPointer.isDestroyed())hiddenPointer.showInactive();}
 });
 ipcMain.handle('presentation',(event,data)=>{if(event.sender!==main.webContents)throw Error('Invalid sender');if(typeof data?.phase!=='string'||typeof data?.answer!=='string')throw Error('Invalid presentation');const text=value=>typeof value==='string'?value:'';island.webContents.send('event',{eventName:'presentation',phase:data.phase.slice(0,160),answer:data.answer.slice(-24000),question:text(data.question).slice(0,600),model:text(data.model).slice(0,80),talk:text(data.talk).slice(0,40),busy:!!data.busy,listening:!!data.listening,error:text(data.error).slice(0,400)});});
 // Follow-up questions typed into the floating panel are sent through the chat window, so history and providers stay in one place.
 ipcMain.handle('island-ask',(event,text)=>{if(event.sender!==island.webContents)throw Error('Invalid sender');if(typeof text!=='string'||!text.trim()||text.length>32000)throw Error('Invalid question');main.webContents.send('event',{eventName:'islandAsk',text:text.trim()});});
 ipcMain.handle('window',(_,action)=>{if(action==='close'){app.quit();return;}if(!main||main.isDestroyed())return;if(action==='minimize')main.hide();else{main.show();main.focus();}});
 main=create({width:1100,height:790,minWidth:850,minHeight:620,frame:false,backgroundColor:'#111216',show:false},{});
 main.on('closed',()=>app.quit());
 const islandStore=path.join(app.getPath('userData'),'island.json');
 island=create({...initialIslandBounds(islandStore),frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,show:false},{island:'1'});
 main.setContentProtection(true);island.setContentProtection(true);
 setPointer(true);
 stopIslandMotion=attachIslandMotion(ipcMain,()=>island,islandStore);
 main.once('ready-to-show',()=>main.show());island.once('ready-to-show',()=>{island.setAlwaysOnTop(true,'screen-saver');island.showInactive();});
 island.on('blur',()=>{if(!island.isDestroyed()&&island.isVisible())island.setAlwaysOnTop(true,'screen-saver');});
}).catch(error=>{console.error('HoiClicky startup failed:',error);app.quit();});
