async function activateControl(call,target){
 try{
  const info=await call('prepareClick',target);
  await call('confirmClick');
  return '\n\nClicked '+info.name+'.';
 }catch(error){
  await call('cancelClick').catch(()=>{});
  return '\n\nCould not click: '+error.message;
 }
}
module.exports={activateControl};
