import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// island-motion.cjs only needs Electron's screen inside functions we don't call here.
const Module=require('node:module');const realLoad=Module._load;
Module._load=function(request,...rest){return request==='electron'?{screen:{}}:realLoad.call(this,request,...rest);};
const {placeIsland}=require('../../desktop/electron/island-motion.cjs');
Module._load=realLoad;

const area={x:0,y:0,width:2560,height:1400};
const orb={width:64,height:64},panel={width:460,height:420};

test('an orb in the top-right corner opens towards the left and comes back to the same spot',()=>{
 const start={x:2480,y:10,width:64,height:64};
 const open=placeIsland({bounds:start,size:panel,mode:'orb',next:'panel',area,home:null,opened:null});
 assert.equal(open.target.x+open.target.width,start.x+start.width,'right edges line up');
 assert.equal(open.target.y,start.y,'top stays');
 const close=placeIsland({bounds:open.target,size:orb,mode:'panel',next:'orb',area,home:open.home,opened:open.opened});
 assert.deepEqual(close.target,start);
});

test('an orb in the middle opens centred and returns to the middle',()=>{
 const start={x:1248,y:10,width:64,height:64};
 const open=placeIsland({bounds:start,size:panel,mode:'orb',next:'panel',area,home:null,opened:null});
 assert.equal(open.target.x+open.target.width/2,start.x+32);
 const close=placeIsland({bounds:open.target,size:orb,mode:'panel',next:'orb',area,home:open.home,opened:open.opened});
 assert.deepEqual(close.target,start);
});

test('an orb at the bottom left grows upwards and to the right',()=>{
 const start={x:20,y:1320,width:64,height:64};
 const open=placeIsland({bounds:start,size:panel,mode:'orb',next:'panel',area,home:null,opened:null});
 assert.equal(open.target.x,20);
 assert.equal(open.target.y+open.target.height,start.y+start.height);
 const close=placeIsland({bounds:open.target,size:orb,mode:'panel',next:'orb',area,home:open.home,opened:open.opened});
 assert.deepEqual(close.target,start);
});

test('moving the open panel moves the orb by the same amount',()=>{
 const start={x:2480,y:10,width:64,height:64};
 const open=placeIsland({bounds:start,size:panel,mode:'orb',next:'panel',area,home:null,opened:null});
 const moved={...open.target,x:open.target.x-300,y:open.target.y+200};
 const close=placeIsland({bounds:moved,size:orb,mode:'panel',next:'orb',area,home:open.home,opened:open.opened});
 assert.deepEqual(close.target,{...start,x:start.x-300,y:start.y+200});
});

test('going through the pill keeps the way home',()=>{
 const start={x:2480,y:10,width:64,height:64};
 const pill=placeIsland({bounds:start,size:{width:300,height:64},mode:'orb',next:'pill',area,home:null,opened:null});
 const open=placeIsland({bounds:pill.target,size:panel,mode:'pill',next:'panel',area,home:pill.home,opened:pill.opened});
 assert.equal(open.target.x+open.target.width,start.x+start.width);
 const close=placeIsland({bounds:open.target,size:orb,mode:'panel',next:'orb',area,home:open.home,opened:open.opened});
 assert.deepEqual(close.target,start);
});
