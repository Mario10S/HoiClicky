// Screen edge glow: one click-through, capture-excluded overlay per monitor that lights the screen edges
// while HoiClicky listens (mint), thinks (lavender) or works as an agent (pulsing lavender).
const path=require('node:path');

// Decide the glow from the chat window's presentation state.
function glowState({enabled=true,listening=false,busy=false,agent=false}={}){
 if(!enabled)return 'off';
 if(listening)return 'listening';
 if(agent)return 'agent';
 if(busy)return 'working';
 return 'off';
}

function createGlow({BrowserWindow,screen}){
 let windows=[],state='off',level=0,lastLevelSent=0;
 function build(){
  destroyWindows();
  windows=screen.getAllDisplays().map(display=>{
   const {x,y,width,height}=display.bounds;
   const win=new BrowserWindow({x,y,width,height,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,movable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,show:false,enableLargerThanScreen:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
   // Windows caps a new window at the primary monitor's height, so a taller (portrait) monitor got a glow that
   // ended in the middle of the screen. Setting the bounds again after creation gives the full size.
   win.setBounds({x,y,width,height});
   win.hoiBounds={x,y,width,height};
   win.setIgnoreMouseEvents(true);
   // Excluded from screenshots, so the AI never sees the glow when it looks at the screen.
   win.setContentProtection(true);
   win.setAlwaysOnTop(true,'screen-saver');
   win.loadFile(path.join(__dirname,'glow.html'));
   win.webContents.once('did-finish-load',()=>apply(win));
   return win;
  });
 }
 function destroyWindows(){for(const win of windows)if(!win.isDestroyed())win.destroy();windows=[];}
 function fitToDisplay(win){const want=win.hoiBounds,have=win.getBounds();if(want&&(have.x!==want.x||have.y!==want.y||have.width!==want.width||have.height!==want.height))win.setBounds(want);}
 function apply(win){
  if(win.isDestroyed())return;
  win.webContents.executeJavaScript(`window.setGlow&&window.setGlow(${JSON.stringify(state)},${level})`).catch(()=>{});
  if(state==='off'){setTimeout(()=>{if(!win.isDestroyed()&&state==='off')win.hide();},500);}
  else if(!win.isVisible()){win.showInactive();fitToDisplay(win);}
 }
 function set(next){if(next===state)return;state=next;if(state!=='listening')level=0;for(const win of windows)apply(win);}
 // Mic level while listening, throttled to about 12 updates per second.
 function setLevel(value){if(state!=='listening')return;level=Math.max(0,Math.min(1,value));const now=Date.now();if(now-lastLevelSent<80)return;lastLevelSent=now;for(const win of windows)if(!win.isDestroyed())win.webContents.executeJavaScript(`window.setGlow&&window.setGlow('listening',${level})`).catch(()=>{});}
 const rebuild=()=>build();
 screen.on('display-added',rebuild);screen.on('display-removed',rebuild);screen.on('display-metrics-changed',rebuild);
 build();
 return {set,setLevel,bounds:()=>windows.filter(w=>!w.isDestroyed()).map(w=>w.getBounds()),destroy(){screen.removeListener('display-added',rebuild);screen.removeListener('display-removed',rebuild);screen.removeListener('display-metrics-changed',rebuild);destroyWindows();}};
}

module.exports={createGlow,glowState};
