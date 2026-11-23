import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {activateControl}=createRequire(import.meta.url)('../../desktop/electron/activate-control.cjs');
test('explicit action prepares and revalidates immediately',async()=>{const calls=[];const result=await activateControl(async(method,args)=>{calls.push([method,args]);return {name:'Close'};},{x:2,y:3});assert.deepEqual(calls,[['prepareClick',{x:2,y:3}],['confirmClick',undefined]]);assert.match(result,/Clicked Close/);});
test('failed target validation never invokes the control',async()=>{const calls=[];const result=await activateControl(async method=>{calls.push(method);if(method==='prepareClick')throw Error('unsafe target');},{x:2,y:3});assert.deepEqual(calls,['prepareClick','cancelClick']);assert.match(result,/Could not click/);});
