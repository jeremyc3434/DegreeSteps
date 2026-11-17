/* Public, versioned program discovery. Private course records are never sent here. */
const catalogIndexes=new WeakMap();
export function handleCatalog(request,data){
 const url=new URL(request.url),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
 const respond=(value,status=200)=>new Response(request.method==='HEAD'?null:JSON.stringify(value),{status,headers});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(!data||data.version!==1||!Array.isArray(data.programs))return respond({error:'Program directory temporarily unavailable.'},503);
 if(url.pathname==='/api/catalog/coverage')return respond({version:data.version,checkedAt:data.checkedAt,programCount:data.programs.length,sources:data.sources,scope:data.scope});
 if(url.pathname!=='/api/catalog/programs')return respond({error:'Catalog route not found.'},404);
 const p=url.searchParams,q=(p.get('q')||'').trim(),school=(p.get('school')||'').trim(),level=p.get('level')||'',mode=p.get('modality')||'';
 if(q.length>200||school.length>160||level&&!['associate','bachelor','master','doctorate','specialist'].includes(level)||mode&&!['online','campus','unknown'].includes(mode))return respond({error:'Use a valid school, degree level, study format and search phrase.'},400);
 const integer=(name,fallback,max)=>{const v=p.get(name);if(v===null)return fallback;if(!/^\d+$/.test(v)||Number(v)>max)throw Error('Invalid pagination');return Number(v);};
 let limit,offset;try{limit=integer('limit',30,100);offset=integer('offset',0,100000);if(limit<1)throw Error();}catch{return respond({error:'Use limit 1–100 and a nonnegative offset.'},400);}
 const normalize=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 let index=catalogIndexes.get(data);if(!index){index=data.programs.map(program=>({program,search:normalize(program.title),school:normalize(program.school)})).sort((a,b)=>a.program.school.localeCompare(b.program.school)||a.program.title.localeCompare(b.program.title));catalogIndexes.set(data,index);}
 const rows=index.filter(x=>(!q||x.search.includes(normalize(q)))&&(!school||x.school===normalize(school)||x.program.schoolId===school)&&(!level||x.program.level===level)&&(!mode||mode==='unknown'?!mode||!x.program.modalities.length:x.program.modalities.includes(mode)));
 return respond({version:data.version,checkedAt:data.checkedAt,total:rows.length,offset,limit,programs:rows.slice(offset,offset+limit).map(x=>x.program),scope:'Official program listings; course equivalency and individual eligibility require separate verification.'});
}
