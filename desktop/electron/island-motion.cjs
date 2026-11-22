const {screen}=require('electron');
function attachIslandMotion(ipcMain,getWindow){
 let timer=null,drag=null,vx=0,vy=0,compact=false,last=0;
 function stop(){if(timer)clearInterval(timer);timer=null;drag=null;vx=vy=0;}
 function bounds(x,y,w,h){const area=screen.getDisplayNearestPoint({x:Math.round(x+w/2),y:Math.round(y+h/2)}).workArea;return {minX:area.x,minY:area.y,maxX:area.x+area.width-w,maxY:area.y+area.height-h};}
 function valid(event){const win=getWindow();return win&&!win.isDestroyed()&&event.sender===win.webContents?win:null;}
 ipcMain.handle('island-mode',(event,value)=>{const win=valid(event);if(!win||typeof value!=='boolean')return;stop();compact=value;const b=win.getBounds();const width=compact?76:310,height=76;const x=b.x+(b.width-width)/2;const limits=bounds(x,b.y,width,height);win.setBounds({x:Math.round(Math.max(limits.minX,Math.min(limits.maxX,x))),y:Math.round(Math.max(limits.minY,Math.min(limits.maxY,b.y))),width,height});return compact;});
 ipcMain.handle('island-drag-start',event=>{const win=valid(event);if(!win)return;stop();const p=screen.getCursorScreenPoint(),b=win.getBounds();drag={x:p.x,y:p.y,wx:b.x,wy:b.y,px:b.x,py:b.y,start:Date.now()};last=Date.now();timer=setInterval(()=>{if(!drag||win.isDestroyed()){stop();return;}const now=Date.now(),dt=Math.max(1,now-last);last=now;const p=screen.getCursorScreenPoint();const x=drag.wx+p.x-drag.x,y=drag.wy+p.y-drag.y;vx=.5*vx+.5*(x-drag.px)/dt;vy=.5*vy+.5*(y-drag.py)/dt;drag.px=x;drag.py=y;win.setPosition(Math.round(x),Math.round(y));win.webContents.send('event',{eventName:'logo-motion',x:Math.max(-5,Math.min(5,-vx*4)),y:Math.max(-3,Math.min(3,-vy*3)),tilt:Math.max(-12,Math.min(12,vx*9))});if(now-drag.start>15000)stop();},16);});
 ipcMain.handle('island-drag-end',event=>{const win=valid(event);if(!win||!drag)return;stop();win.webContents.send('event',{eventName:'logo-motion',x:0,y:0,tilt:0});const b=win.getBounds(),limits=bounds(b.x,b.y,b.width,b.height);win.setPosition(Math.round(Math.max(limits.minX,Math.min(limits.maxX,b.x))),Math.round(Math.max(limits.minY,Math.min(limits.maxY,b.y))));});

 return stop;
}
module.exports={attachIslandMotion};

