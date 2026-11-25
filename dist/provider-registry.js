/* Controlled credit-provider identities and course links. This grants no transfer award. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeCreditProviders=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const entries=[
  {id:'sophia',name:'Sophia',aliases:['Sophia Learning','Sophia.org'],kind:'course',hosts:['sophia.org'],directory:'https://www.sophia.org/online-courses/all-courses/'},
  {id:'study-com',name:'Study.com',aliases:['Study com'],kind:'course',hosts:['study.com'],directory:'https://study.com/college/online-college-courses.html'},
  {id:'straighterline',name:'StraighterLine',aliases:[],kind:'course',hosts:['straighterline.com'],directory:'https://www.straighterline.com/online-college-courses/'},
  {id:'saylor',name:'Saylor',aliases:['Saylor Academy','Saylor Direct Credit'],kind:'course',hosts:['saylor.org'],directory:'https://www.saylor.org/'},
  {id:'clep',name:'CLEP',aliases:['CLEP examinations','College Level Examination Program'],kind:'exam',hosts:['clep.collegeboard.org'],directory:'https://clep.collegeboard.org/clep-exams'},
  {id:'dsst',name:'DSST',aliases:['DSST examinations'],kind:'exam',hosts:['getcollegecredit.com'],directory:'https://getcollegecredit.com/'},
  {id:'christian-leaders',name:'Christian Leaders Institute',aliases:['Christian Leaders','Christian Leaders Institute / College'],kind:'course',hosts:['christianleaders.org','christianleadersinstitute.org'],directory:'https://www.christianleadersinstitute.org/'},
  {id:'upi-study',name:'UPI Study',aliases:['University Pathways International','UPI Study, Inc.','UPI Study Inc.'],kind:'course',hosts:['upistudy.com'],directory:'https://www.upistudy.com/collections'},
  {id:'asu-ulc',name:'ASU Universal Learner',aliases:['ASU Universal Learner Courses'],kind:'course',hosts:['ea.asu.edu','courses.cpe.asu.edu'],directory:'https://ea.asu.edu/courses/'}
 ].map(entry=>Object.freeze({...entry,aliases:Object.freeze(entry.aliases),hosts:Object.freeze(entry.hosts)}));
 const byKey=new Map();for(const entry of entries)for(const alias of[entry.id,entry.name,...entry.aliases])byKey.set(norm(alias),entry);
 function get(provider){return byKey.get(norm(provider))||null;}
 function key(provider){const entry=get(provider);return norm(entry?entry.name:provider);}
 function name(provider){return get(provider)?.name||String(provider||'').trim();}
 function trustedURL(value,provider){
  const entry=get(provider);if(!entry||typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))return null;
  try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,'');if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!entry.hosts.some(domain=>host===domain||host.endsWith('.'+domain)))return null;return url.href;}catch{return null;}
 }
 function courseURL(value,provider){
  const safe=trustedURL(value,provider);if(!safe)return null;
  const url=new URL(safe),entry=get(provider),host=url.hostname.toLowerCase().replace(/^www\./,''),path=url.pathname.replace(/\/+$/,'');
  if(/\.(?:pdf|docx?|xlsx?)$/i.test(path))return null;
  if(entry.id==='sophia'){const match=path.match(/^\/online-courses\/(.+)$/);return match&&!['all-courses','business','math','science','humanities','social-science','english-and-communication','computer-science-and-it'].includes(match[1])?safe:null;}
  if(entry.id==='study-com')return /^\/academy\/course\/[^/]+/.test(path)?safe:null;
  if(entry.id==='straighterline')return /^\/online-college-courses\/[^/]+/.test(path)?safe:null;
  if(entry.id==='upi-study')return host==='upistudy.com'&&/^\/courses\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(path)?safe:null;
  if(entry.id==='clep')return host==='clep.collegeboard.org'&&/^\/clep-exams\/[^/]+/.test(path)?safe:null;
  if(entry.id==='dsst')return host==='getcollegecredit.com'&&/^\/exam\/[^/]+$/.test(path)?safe:null;
  if(entry.id==='saylor')return host==='learn.saylor.org'&&path==='/course/view.php'&&/^\d+$/.test(url.searchParams.get('id')||'')?safe:null;
  if(entry.id==='christian-leaders')return host==='christianleaders.org'&&path==='/course/view.php'&&/^\d+$/.test(url.searchParams.get('id')||'')?safe:null;
  if(entry.id==='asu-ulc')return host==='ea.asu.edu'&&/^\/courses\/[^/]+$/.test(path)?safe:null;
  return null;
 }
 const api={entries:Object.freeze(entries),get,key,name,trustedURL,courseURL,directory:provider=>get(provider)?.directory||null,kind:provider=>get(provider)?.kind||'other'};
 return Object.freeze(api);
}));
