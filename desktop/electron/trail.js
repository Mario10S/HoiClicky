const params=new URLSearchParams(location.search);
const values=['x1','y1','x2','y2'].map(key=>Number(params.get(key)));
if(values.every(Number.isFinite)){
 const [x1,y1,x2,y2]=values;
 const line=document.getElementById('path'),circle=document.getElementById('target');
 for(const [key,value] of Object.entries({x1,y1,x2,y2}))line.setAttribute(key,String(value));
 circle.setAttribute('cx',String(x2));circle.setAttribute('cy',String(y2));
 if(params.get('kind')==='circle')document.body.classList.add('circle');
 if(params.get('kind')==='arrow'){
  document.body.classList.add('arrow');
  const angle=Math.atan2(y2-y1,x2-x1),size=16,spread=.55;
  const ax=x2-size*Math.cos(angle-spread),ay=y2-size*Math.sin(angle-spread);
  const bx=x2-size*Math.cos(angle+spread),by=y2-size*Math.sin(angle+spread);
  document.getElementById('arrowhead').setAttribute('d',`M ${ax} ${ay} L ${x2} ${y2} L ${bx} ${by}`);
 }
}
