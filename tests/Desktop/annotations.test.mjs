import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createAnnotations}=require('../../desktop/electron/annotations.cjs');
class FakeWindow {
 constructor(options){this.options=options;this.destroyed=false;this.handlers={};this.webContents={executeJavaScript:code=>{this.script=code;return Promise.resolve();}};}
 setIgnoreMouseEvents(value){this.clickThrough=value;}
 setContentProtection(value){this.protected=value;}
 setAlwaysOnTop(value,level){this.top=[value,level];}
 loadFile(file,options){this.query=options.query;}
 once(event,callback){this.handlers[event]=callback;}
 isDestroyed(){return this.destroyed;}
 destroy(){this.destroyed=true;}
 showInactive(){this.visible=true;}
}
test('annotations create click-through windows at the intended positions and clean up',()=>{
 const overlay=createAnnotations({BrowserWindow:FakeWindow});
 const circle=overlay.show(-600,250,{x:-600,y:250},'circle');
 assert.deepEqual([circle.options.x,circle.options.y,circle.options.width,circle.options.height],[-632,218,64,64]);
 assert.equal(circle.clickThrough,true);assert.equal(circle.protected,true);assert.equal(circle.options.focusable,false);
 assert.deepEqual(circle.query,{kind:'circle',x1:'32',y1:'32',x2:'32',y2:'32'});
 circle.handlers['ready-to-show']();assert.equal(circle.visible,true);assert.match(circle.script,/visible/);
 const arrow=overlay.show(-600,250,{x:-400,y:100},'arrow');assert.equal(circle.destroyed,true);
 assert.deepEqual([arrow.options.x,arrow.options.y,arrow.options.width,arrow.options.height],[-632,68,264,214]);
 assert.deepEqual(arrow.query,{kind:'arrow',x1:'32',y1:'182',x2:'232',y2:'32'});
 overlay.clear();assert.equal(arrow.destroyed,true);
});
