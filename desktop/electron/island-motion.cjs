const {screen}=require('electron');
const fs=require('node:fs');
// Floating assistant window: orb, status pill, or a resizable answer panel.
// Transparent windows cannot be edge-resized by Windows, so the renderer sends drag deltas for moving and resizing.
const SIZES={orb:{width:64,height:64},pill:{width:300,height:64}};
const PANEL={width:460,height:420,minWidth:340,minHeight:260,maxWidth:1100,maxHeight:1200};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function readStore(storePath){try{const value=JSON.parse(fs.readFileSync(storePath,'utf8'));return value&&typeof value==='object'?value:{};}catch{return {};}}
function workArea(x,y,width,height){return screen.getDisplayNearestPoint({x:Math.round(x+width/2),y:Math.round(y+height/2)}).workArea;}
function fit(x,y,width,height){const area=workArea(x,y,width,height);width=Math.min(width,area.width);height=Math.min(height,area.height);return {x:Math.round(clamp(x,area.x,area.x+area.width-width)),y:Math.round(clamp(y,area.y,area.y+area.height-height)),width:Math.round(width),height:Math.round(height)};}
// Where the orb starts: the remembered spot when it is still on a connected display, otherwise top centre.
function initialIslandBounds(storePath){
 const store=readStore(storePath),{width,height}=SIZES.orb;
 if(Number.isFinite(store.centerX)&&Number.isFinite(store.top)){const x=store.centerX-width/2,y=store.top,area=workArea(x,y,width,height);if(store.centerX>=area.x&&store.centerX<=area.x+area.width&&y>=area.y-8&&y<=area.y+area.height-height)return fit(x,y,width,height);}
 const area=screen.getPrimaryDisplay().workArea;return {x:Math.round(area.x+(area.width-width)/2),y:area.y+10,width,height};
}
function attachIslandMotion(ipcMain,getWindow,storePath){
 const store=readStore(storePath);let mode='orb',gesture=null,saveTimer=null,reset=null,previous=null;
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{fs.writeFileSync(storePath,JSON.stringify(store));}catch{}},400);}
 function remember(bounds){store.centerX=Math.round(bounds.x+bounds.width/2);store.top=bounds.y;save();}
 function panelSize(){return {width:clamp(Number(store.panelWidth)||PANEL.width,PANEL.minWidth,PANEL.maxWidth),height:clamp(Number(store.panelHeight)||PANEL.height,PANEL.minHeight,PANEL.maxHeight)};}
 function valid(event){const win=getWindow();return win&&!win.isDestroyed()&&event.sender===win.webContents?win:null;}
 function layout(event,value){
  const win=valid(event);const next=value?.mode;if(!win||!['orb','pill','panel'].includes(next))return mode;
  const b=win.getBounds(),size=next==='panel'?panelSize():SIZES[next];
  // Grow and shrink around the horizontal centre so the orb, pill and panel stay in the same place.
  const target=fit(b.x+(b.width-size.width)/2,b.y,size.width,size.height);
  if(target.x!==b.x||target.y!==b.y||target.width!==b.width||target.height!==b.height)win.setBounds(target);
  mode=next;win.setAlwaysOnTop(true,'screen-saver');if(!win.isVisible())win.showInactive();return mode;
 }
 function drag(event,value){
  const win=valid(event);if(!win||typeof value?.phase!=='string')return;
  if(value.phase==='start'){if(!['move','right','bottom','left','corner','corner-left'].includes(value.edge))return;if(value.edge!=='move'&&mode!=='panel')return;gesture={edge:value.edge,bounds:win.getBounds()};return;}
  if(!gesture)return;
  if(value.phase==='end'){const b=win.getBounds();if(gesture.edge!=='move'&&mode==='panel'){store.panelWidth=b.width;store.panelHeight=b.height;}remember(b);gesture=null;return;}
  const dx=Number(value.dx),dy=Number(value.dy);if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
  const s=gesture.bounds;
  if(gesture.edge==='move'){const t=fit(s.x+dx,s.y+dy,s.width,s.height);win.setPosition(t.x,t.y);return;}
  let {x,width,height}=s;const area=workArea(s.x,s.y,s.width,s.height);
  if(['right','corner'].includes(gesture.edge))width=clamp(s.width+dx,PANEL.minWidth,Math.min(PANEL.maxWidth,area.x+area.width-s.x));
  if(['left','corner-left'].includes(gesture.edge)){width=clamp(s.width-dx,PANEL.minWidth,Math.min(PANEL.maxWidth,s.x+s.width-area.x));x=s.x+s.width-width;}
  if(['bottom','corner','corner-left'].includes(gesture.edge))height=clamp(s.height+dy,PANEL.minHeight,Math.min(PANEL.maxHeight,area.y+area.height-s.y));
  win.setBounds({x:Math.round(x),y:s.y,width:Math.round(width),height:Math.round(height)});
 }
 ipcMain.handle('island-layout',layout);
 ipcMain.handle('island-drag',drag);
 // Observe moves for the springy logo and to remember the position after native header drags.
 const window=getWindow();
 function moved(){const current=window.getBounds(),now=Date.now();if(previous){const dt=Math.max(1,now-previous.time),dx=(current.x-previous.x)/dt,dy=(current.y-previous.y)/dt;window.webContents.send('event',{eventName:'logo-motion',x:clamp(-dx*3,-4,4),y:clamp(-dy*2,-3,3),tilt:clamp(dx*7,-10,10)});}previous={x:current.x,y:current.y,time:now};clearTimeout(reset);reset=setTimeout(()=>{previous=null;if(!window.isDestroyed()){window.webContents.send('event',{eventName:'logo-motion',x:0,y:0,tilt:0});if(!gesture)remember(window.getBounds());}},140);}
 window.on('move',moved);
 return ()=>{clearTimeout(reset);clearTimeout(saveTimer);try{fs.writeFileSync(storePath,JSON.stringify(store));}catch{}window.removeListener('move',moved);};
}
module.exports={attachIslandMotion,initialIslandBounds};
