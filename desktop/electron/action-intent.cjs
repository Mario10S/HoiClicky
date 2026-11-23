// Only explicit requests may enter the accessibility activation flow.
function requestsClick(text){
 const value=text.trim();
 const direct='(?:click|press|tap|activate)';
 const close='close\\s+(?:(?:this|the|that|current)\\s+)?(?:[\\w.-]+\\s+){0,3}(?:window|tab|dialog|popup)';
 return !!namedWindowToClose(value)||new RegExp('^(?:please\\s+)?(?:'+direct+'\\b|'+close+'\\b)|^(?:can you|could you|would you)\\s+(?:please\\s+)?(?:'+direct+'\\b|'+close+'\\b)','i').test(value);
}
function namedWindowToClose(text){
 const m=text.trim().match(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?close\s+([\w][\w.-]{1,39})[.!?]*$/i);
 if(!m||/^(it|this|that|window|tab|dialog|popup)$/i.test(m[1]))return null;
 return m[1];
}
module.exports={requestsClick,namedWindowToClose};
