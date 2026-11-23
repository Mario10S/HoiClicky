const params=new URLSearchParams(location.search);
const values=['x1','y1','x2','y2'].map(key=>Number(params.get(key)));
if(values.every(Number.isFinite)){
 const [x1,y1,x2,y2]=values;
 const line=document.getElementById('path'),circle=document.getElementById('target');
 for(const [key,value] of Object.entries({x1,y1,x2,y2}))line.setAttribute(key,String(value));
 circle.setAttribute('cx',String(x2));circle.setAttribute('cy',String(y2));
}
