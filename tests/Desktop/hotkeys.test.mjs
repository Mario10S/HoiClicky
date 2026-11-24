import test from 'node:test';
import assert from 'node:assert/strict';
import {acceleratorFromEvent,keyFromCode,modifiersPreview,prettyAccelerator,acceleratorParts} from '../../desktop/src/hotkeys.mjs';

const press=(code,mods='')=>({code,ctrlKey:mods.includes('c'),altKey:mods.includes('a'),shiftKey:mods.includes('s'),metaKey:mods.includes('w')});

test('records combinations with Ctrl, Alt or Win',()=>{
 assert.equal(acceleratorFromEvent(press('KeyJ','ca')),'CommandOrControl+Alt+J');
 assert.equal(acceleratorFromEvent(press('F8','cs')),'CommandOrControl+Shift+F8');
 assert.equal(acceleratorFromEvent(press('Digit5','a')),'Alt+5');
 assert.equal(acceleratorFromEvent(press('Space','w')),'Super+Space');
 assert.equal(acceleratorFromEvent(press('Numpad3','c')),'CommandOrControl+num3');
});

test('function keys may stand alone, normal keys may not',()=>{
 assert.equal(acceleratorFromEvent(press('F9')),'F9');
 assert.equal(acceleratorFromEvent(press('KeyJ')),null);
 assert.equal(acceleratorFromEvent(press('KeyJ','s')),null,'Shift+letter is just typing');
});

test('ignores lone modifiers and keys that are not offered',()=>{
 assert.equal(acceleratorFromEvent(press('ControlLeft','c')),null);
 assert.equal(acceleratorFromEvent(press('AltRight','a')),null);
 assert.equal(acceleratorFromEvent(press('Escape','c')),null);
 assert.equal(acceleratorFromEvent(press('Tab','a')),null);
 assert.equal(keyFromCode('F25'),null);
});

test('labels for the settings field',()=>{
 assert.equal(prettyAccelerator('CommandOrControl+Alt+J'),'Ctrl + Alt + J');
 assert.equal(prettyAccelerator('Super+Shift+num4'),'Win + Shift + Num 4');
 assert.deepEqual(acceleratorParts(''),[]);
 assert.equal(modifiersPreview(press('ControlLeft','ca')),'Ctrl + Alt + …');
 assert.equal(modifiersPreview(press('KeyJ')),'');
});
