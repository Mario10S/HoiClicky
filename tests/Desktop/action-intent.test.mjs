import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {requestsClick,namedWindowToClose}=createRequire(import.meta.url)('../../desktop/electron/action-intent.cjs');
test('explicit close and click requests are recognized, explanations are not',()=>{
 for(const text of ['please close this window.','Please close the notepad window.','Close Spotify','Can you close the window?','close this tab','please click the button','could you press OK'])assert.equal(requestsClick(text),true,text);
 for(const text of ['where is the close button?','how do I close this window?','how can you close this window?','please do it','what does close mean?','the window is closed'])assert.equal(requestsClick(text),false,text);
});
test('named application closing is limited to unambiguous direct phrasing',()=>{
 assert.equal(namedWindowToClose('Close Spotify'),'Spotify');
 for(const text of ['please close this Spotify tab','close this window','close it','how can you close Spotify?'])assert.equal(namedWindowToClose(text),null,text);
});
