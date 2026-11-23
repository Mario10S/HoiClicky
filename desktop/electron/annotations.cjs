const path=require('node:path');
function createAnnotations({BrowserWindow}){
 let trail=null,timer;
 function clear(){clearTimeout(timer);if(trail&&!trail.isDestroyed())trail.destroy();trail=null;}
 function show(startX,startY,target,kind='point'){
  clear();
  const margin=32,left=Math.floor(Math.min(startX,target.x)-margin),top=Math.floor(Math.min(startY,target.y)-margin);
  const width=Math.ceil(Math.abs(target.x-startX)+margin*2),height=Math.ceil(Math.abs(target.y-startY)+margin*2);
  const shown=trail=new BrowserWindow({x:left,y:top,width,height,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,alwaysOnTop:true,focusable:false,skipTaskbar:true,resizable:false,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  shown.setIgnoreMouseEvents(true);shown.setContentProtection(true);shown.setAlwaysOnTop(true,'screen-saver');
  shown.loadFile(path.join(__dirname,'trail.html'),{query:{kind,x1:String(startX-left),y1:String(startY-top),x2:String(target.x-left),y2:String(target.y-top)}});
  timer=setTimeout(()=>{if(trail===shown)clear();},10000);
  shown.once('ready-to-show',()=>{if(shown.isDestroyed())return;clearTimeout(timer);shown.showInactive();shown.webContents.executeJavaScript("document.body.classList.add('visible')").catch(()=>{});timer=setTimeout(()=>{if(trail===shown)clear();},4300);});
  return shown;
 }
 return {show,clear};
}
module.exports={createAnnotations};
