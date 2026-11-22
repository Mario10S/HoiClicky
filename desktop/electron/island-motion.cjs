const {screen}=require('electron');
function attachIslandMotion(ipcMain,getWindow){
 let timer=null,drag=null,vx=0,vy=0,compact=false,last=0;
 function stop(){if(timer)clearInterval(timer);timer=null;drag=null;vx=vy=0;}
 function bounds(x,y,w,h){const area=screen.getDisplayNearestPoint({x:Math.round(x+w/2),y:Math.round(y+h/2)}).workArea;return {minX:area.x,minY:area.y,maxX:area.x+area.width-w,maxY:area.y+area.height-h};}
 function valid(event){const win=getWindow();return win&&!win.isDestroyed()&&event.sender===win.webContents?win:null;}
 ipcMain.handle('island-mode',(event,value)=>{const win=valid(event);if(!win||typeof value!=='boolean')return;stop();compact=value;const b=win.getBounds();const width=compact?76:310,height=76;const x=b.x+(b.width-width)/2;const limits=bounds(x,b.y,width,height);win.setBounds({x:Math.round(Math.max(limits.minX,Math.min(limits.maxX,x))),y:Math.round(Math.max(limits.minY,Math.min(limits.maxY,b.y))),width,height});return compact;});
 // Windows owns movement through CSS drag regions. Observe moves only for the logo.
 let reset=null,previous=null;
 const window=getWindow();
 function moved(){const current=window.getBounds(),now=Date.now();if(previous){const dt=Math.max(1,now-previous.time),dx=(current.x-previous.x)/dt,dy=(current.y-previous.y)/dt;window.webContents.send('event',{eventName:'logo-motion',x:Math.max(-4,Math.min(4,-dx*3)),y:Math.max(-3,Math.min(3,-dy*2)),tilt:Math.max(-10,Math.min(10,dx*7))});}previous={x:current.x,y:current.y,time:now};clearTimeout(reset);reset=setTimeout(()=>{previous=null;if(!window.isDestroyed())window.webContents.send('event',{eventName:'logo-motion',x:0,y:0,tilt:0});},90);}
 window.on('move',moved);

 return ()=>{stop();clearTimeout(reset);window.removeListener('move',moved);};
}
module.exports={attachIslandMotion};

