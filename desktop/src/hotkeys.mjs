// Turns a recorded key press into an Electron accelerator ("CommandOrControl+Shift+F8") and back into a label.
// Uses KeyboardEvent.code so the result does not depend on the keyboard layout.
const NAMED={Space:'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',Insert:'Insert',Delete:'Delete',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
const MODIFIER_CODES=/^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

// The main key of a code, or null for modifiers and keys we don't offer (Escape, Tab, Enter, ...).
export function keyFromCode(code){
 if(/^Key[A-Z]$/.test(code))return code.slice(3);
 if(/^Digit[0-9]$/.test(code))return code.slice(5);
 if(/^Numpad[0-9]$/.test(code))return 'num'+code.slice(6);
 if(/^F([1-9]|1[0-9]|2[0-4])$/.test(code))return code;
 return NAMED[code]||null;
}

// {code, ctrlKey, altKey, shiftKey, metaKey} → accelerator, or null when it isn't a usable shortcut yet.
// A shortcut needs Ctrl, Alt or Win, so it never steals normal typing; function keys may stand alone.
export function acceleratorFromEvent(event){
 if(!event||MODIFIER_CODES.test(event.code||''))return null;
 const key=keyFromCode(event.code||'');
 if(!key)return null;
 const isFunctionKey=/^F\d+$/.test(key);
 if(!isFunctionKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey)return null;
 return [event.ctrlKey&&'CommandOrControl',event.altKey&&'Alt',event.shiftKey&&'Shift',event.metaKey&&'Super',key].filter(Boolean).join('+');
}

// What is held so far, for the live preview while recording ("Ctrl + Alt + …").
export function modifiersPreview(event){
 const parts=[event.ctrlKey&&'Ctrl',event.altKey&&'Alt',event.shiftKey&&'Shift',event.metaKey&&'Win'].filter(Boolean);
 return parts.length?parts.join(' + ')+' + …':'';
}

const LABELS={CommandOrControl:'Ctrl',Control:'Ctrl',Super:'Win',num0:'Num 0'};
export function acceleratorParts(accelerator){
 return String(accelerator||'').split('+').filter(Boolean).map(part=>LABELS[part]||(/^num\d$/.test(part)?'Num '+part.slice(3):part));
}
export const prettyAccelerator=accelerator=>acceleratorParts(accelerator).join(' + ');
