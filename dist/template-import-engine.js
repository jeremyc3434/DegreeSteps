/* Local community-template decoding. Suggested courses are never earned credit. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeTemplateImport=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const limits=Object.freeze({maxBytes:10*1024*1024,maxZipBytes:32*1024*1024,maxZipEntryBytes:8*1024*1024,maxZipEntries:512,maxRows:2000,maxColumns:100,maxCells:50000,maxSheets:100,maxRequirements:500});
const error=(code,message)=>Object.assign(new Error(message),{code});
const bytesOf=value=>value instanceof Uint8Array?value:new Uint8Array(value);
const textDecoder=()=>new TextDecoder('utf-8',{fatal:true});
const plain=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
const normal=value=>plain(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const codeKey=value=>normal(value);
function safeURL(value){
 try{const u=new URL(plain(value));if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|\[)/i.test(u.hostname)||/^\d+(?:\.\d+){3}$/.test(u.hostname)||/\.(?:localhost|local|internal)$/i.test(u.hostname))return'';
  for(const key of [...u.searchParams.keys()])if(/^(?:adkey|aff|affiliate|affiliateid|ref|referral|coupon|couponcode|promo|promocode|utm_.+|_campaign|_channel)$/i.test(key))u.searchParams.delete(key);
  u.hash='';return u.href;
 }catch{return'';}
}
 const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
 function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
 function unpackWorkbook(input,fflate){
  const bytes=bytesOf(input);if(bytes.length>limits.maxBytes)throw error('file-too-large','Choose a plan workbook smaller than 10 MB.');
  if(!fflate?.inflateSync||!fflate?.zipSync)throw error('reader-unavailable','The Excel reader could not load. Reload this page or export the sheet as CSV.');
  const unsafe=message=>{throw error('xlsx-unsafe',message||'This workbook could not be opened safely. Save a new .xlsx or CSV copy and try again.');};
  if(bytes.length<22)unsafe();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50&&at+22+view.getUint16(at+20,true)===bytes.length){end=at;break;}
  if(end<0)unsafe('This is not a readable .xlsx workbook. Older or password-protected Excel files must be saved as an unprotected .xlsx or CSV.');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0||view.getUint16(end+8,true)!==count||count===65535||count>limits.maxZipEntries||start+size!==end)unsafe();
  const entries=[],names=new Set();let at=start,total=0;
  for(let index=0;index<count;index++){
   if(at+46>end||view.getUint32(at,true)!==0x02014b50)unsafe();
   const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),compressed=view.getUint32(at+20,true),original=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
   if(at+46+nameLength+extra+comment>end||flags&1||![0,8].includes(method)||local+30>start||view.getUint32(local,true)!==0x04034b50)unsafe();
   let name;try{name=textDecoder().decode(bytes.subarray(at+46,at+46+nameLength));}catch{unsafe();}
   if(!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||names.has(name)||/vbaProject\.bin|\/macrosheets\//i.test(name))unsafe();
   names.add(name);total+=original;
   if(original>limits.maxZipEntryBytes||total>limits.maxZipBytes||original>Math.max(1024*1024,compressed*250))throw error('xlsx-too-large','This workbook expands beyond the local reading limit. Save just the degree tabs in a new .xlsx file.');
   const localNameLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),data=local+30+localNameLength+localExtra;
   let localName;try{localName=textDecoder().decode(bytes.subarray(local+30,local+30+localNameLength));}catch{unsafe();}
   if(localName!==name||view.getUint16(local+8,true)!==method||view.getUint16(local+6,true)&1||data+compressed>start||method===0&&compressed!==original)unsafe();
   entries.push({name,method,crc,compressed,original,data});at+=46+nameLength+extra+comment;
  }
  if(at!==start+size||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))unsafe();
  const files=Object.create(null);let cellCount=0;
  for(const entry of entries){
   // Images, embedded objects and other binary content are never passed to the
   // spreadsheet reader. Only bounded XML parts can describe our raw rows.
   if(!/\.xml$|\.rels$/i.test(entry.name))continue;
   const compressed=bytes.subarray(entry.data,entry.data+entry.compressed);let decoded;
   try{decoded=entry.method===0?compressed.slice():fflate.inflateSync(compressed,{out:new Uint8Array(entry.original+1)});}catch{unsafe();}
   if(decoded.length!==entry.original||crc32(decoded)!==entry.crc)unsafe();
   let xml;try{xml=textDecoder().decode(decoded);}catch{unsafe();}
   if(/<!DOCTYPE|<!ENTITY/i.test(xml))unsafe();
   if(entry.name==='[Content_Types].xml')for(const match of xml.matchAll(/<Override\b[^>]*>/g))if(/\bPartName=["']\/xl\/workbook\.xml["']/i.test(match[0])&&/\bContentType=["'][^"']*macroEnabled/i.test(match[0]))unsafe();
   if(/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name)){
    // Shared plans often format a thousand empty rows on every tab. Remove
    // blank styling before decoding, while keeping every value and formula.
    xml=xml.replace(/<c\b[^>]*\/>/g,'').replace(/<c\b[^>]*>([\s\S]*?)<\/c>/g,(cell,body)=>/<(?:v|is|f)(?:\s|>)/.test(body)?cell:'');
    const references=xml.matchAll(/<c\b[^>]*\br=["']([A-Za-z]+)(\d+)["'][^>]*>/g);
    for(const match of references){
     let column=0;for(const letter of match[1].toUpperCase())column=column*26+letter.charCodeAt(0)-64;
     if(++cellCount>limits.maxCells||Number(match[2])>limits.maxRows||column>limits.maxColumns)throw error('xlsx-too-large','Use no more than 100 columns, 2,000 source rows per sheet and 50,000 populated cells.');
    }
    decoded=new TextEncoder().encode(xml);
   }
   files[entry.name]=decoded;
  }
  return fflate.zipSync(files,{level:0});
 }
function columns(values){
 const out={alternatives:[],credentials:[],context:[]};
 for(const [index,value]of values.entries()){
  const label=normal(value);
  if(['id','code','coursecode','courseid','coursenumber'].includes(label))out.code=index;
  else if(['coursename','coursetitle','title','requirement','requirementname'].includes(label))out.title=index;
  else if(['units','credits','creditunits','credithours','cus'].includes(label))out.credits=index;
  else if(['section','category','area'].includes(label))out.section=index;
  else if(/certificat|credential|certs$/.test(label))out.credentials.push({index,label:plain(value)});
  else if(/(?:plan|price|cost|subscription|membership|days|strat|^term$)/.test(label))out.context.push({index,label:plain(value)});
  else if(/studycom|sophia|straighterline|saylor|upistudy|clep|dsst|transfercourse|transferoption/.test(label))out.alternatives.push({index,label:plain(value)});
 }
 return out.title!==undefined&&out.credits!==undefined?out:null;
}
function suggestions(value,label,link){
 const raw=plain(value).slice(0,2000);if(!raw||/^[-–—]$/.test(raw))return null;
 const ids=[...new Set(raw.match(/(?:SDCM|SOPH|UPIS)-\d{3,5}/gi)||[])].map(x=>x.toUpperCase());
 const sequence=/→|\bthen\b|\bfollowed by\b/i.test(raw),bundle=!sequence&&(/\band\b|\bplus\b|\s\+\s/i.test(raw)),choice=!sequence&&!bundle&&/\bor\b|\s\/\s/i.test(raw);
 return{provider:/study/i.test(label)?'Study.com':/sophia/i.test(label)?'Sophia':/straighter/i.test(label)?'StraighterLine':/saylor/i.test(label)?'Saylor':/upi/i.test(label)?'UPI Study':label,
  text:raw,courseIds:ids,logic:sequence?'sequence':bundle?'bundle':choice?'one-of':'single',requiresReview:true,sourceUrl:safeURL(link)};
}
function parseGrid(grid,{sheetName='',links={},fileName=''}={}){
 if(!Array.isArray(grid)||grid.length>limits.maxRows)throw error('invalid-table','Use a sheet with at most 2,000 source rows.');
 let header=null,headerRow=-1;
 for(let i=0;i<Math.min(grid.length,50);i++){const found=columns(grid[i]||[]);if(found){header=found;headerRow=i;break;}}
 if(!header)return{sheetName,fileName,rows:[],totalCredits:0,issues:['No course-title and credit columns were found. Choose a degree tab.'],metadata:{},headerRow:null};
 const rows=[],issues=[],seen=new Set();let section='Major requirements';
 for(let i=headerRow+1;i<grid.length;i++){
  const cells=grid[i]||[],title=plain(cells[header.title]),code=header.code===undefined?'':plain(cells[header.code]),rawCredits=cells[header.credits];
  if(!title&&!code)continue;
  if(/^(?:sub\s*total|total(?:\s+(?:credits|units|cus))?|grand\s+total)$/i.test(title||code))continue;
  if(columns(cells))continue;
  const n=typeof rawCredits==='number'?rawCredits:/^\d+(?:\.\d+)?$/.test(plain(rawCredits))?Number(rawCredits):NaN;
  if(!title||!Number.isFinite(n)||n<=0||n>200){issues.push('Row '+(i+1)+' was left out because its requirement title or exact credits are missing.');continue;}
  if(rows.length>=limits.maxRequirements)throw error('too-many-requirements','Import one degree with at most 500 requirements.');
  if(header.section!==undefined&&plain(cells[header.section])){section=plain(cells[header.section]).replace(/^[a-z]\.[\s]*/i,'').slice(0,100);if(/^general$/i.test(section))section='General education';}
  const ambiguous=/\b(?:choose|select)\s+(?:\d+|one|two|three)|\bor\b/i.test(title+' '+code),duplicate=!!code&&seen.has(codeKey(code));if(code)seen.add(codeKey(code));
  const alternatives=header.alternatives.map(c=>suggestions(cells[c.index],c.label,links[i+':'+c.index])).filter(Boolean);
  const credentials=header.credentials.map(c=>({text:plain(cells[c.index]).slice(0,2000),sourceUrl:safeURL(links[i+':'+c.index]),status:'unverified-credential-suggestion'})).filter(c=>c.text);
  const contextNotes=header.context.map(c=>({label:c.label,text:plain(cells[c.index]).slice(0,1000)})).filter(c=>c.text&&!/^[-–—]$/.test(c.text));
  const universityLink=safeURL(links[i+':'+header.title]),notes=[...alternatives.map(a=>a.provider+': '+a.text+' ['+a.logic+'; proposed]'),...credentials.map(c=>'Credential suggestion: '+c.text+' [transfer eligibility not established]'),...contextNotes.map(c=>c.label+': '+c.text+' [undated spreadsheet note; not used for estimates]')];
  rows.push({id:'template-row-'+(i+1),sourceRow:i+1,section,code:code.slice(0,100),title:title.slice(0,200),credits:n,sourceUrl:universityLink,alternatives,credentials,contextNotes,selected:!ambiguous&&!duplicate,issues:[...(ambiguous?['Resolve this requirement choice before building.']:[]),...(duplicate?['Repeated course code; resolve the duplicate before building.']:[])],importNotes:notes.join('\n').slice(0,1800)});
 }
 const initial=grid.slice(0,headerRow+1).flat().map(plain),linkList=Object.values(links),isWGU=initial.some(s=>/\bWGU\b|western governors/i.test(s))||linkList.some(s=>/^https:\/\/(?:[^/]+\.)?wgu\.edu\//i.test(s));
 const named=initial.find(s=>/^(?:BS|BA|B\.S\.|B\.A\.|Bachelor|Master|MBA|MS|MA)\b/i.test(s));
 const metadata={school:isWGU?'Western Governors University':'',title:(sheetName||named||'').replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/,'').slice(0,200),creditSystem:isWGU?'competency-unit':'',level:isWGU&&/\b(?:BS|BA|B\.S\.|B\.A\.|Bachelor)/i.test(sheetName||named||'')?'bachelor':'',modality:isWGU?'online':'',sourceUrl:'',catalog:'',totalCredits:''};
 const totalCredits=rows.reduce((s,r)=>s+r.credits,0);if(totalCredits>500)throw error('too-many-credits','Choose a single degree tab totaling no more than 500 credits.');
 return{sheetName,fileName,rows,totalCredits,issues,metadata,headerRow:headerRow+1,trust:'community-proposed-not-verified',earnedCourses:[]};
}
function inspectWorkbook(input,{XLSX,fflate,sheet}={}){
 if(!XLSX?.read||!XLSX?.utils)throw error('reader-unavailable','The local Excel reader could not load. Try again or use CSV.');
 const safe=unpackWorkbook(input,fflate);let book;try{book=XLSX.read(safe,{type:'array',cellFormula:true,cellDates:false,cellHTML:false,cellStyles:false,bookVBA:false,bookDeps:false,sheetRows:limits.maxRows+1});}catch{throw error('invalid-workbook','Save an unprotected .xlsx copy and try again.');}
 if(!book.SheetNames?.length||book.SheetNames.length>limits.maxSheets)throw error('too-many-sheets','Use a workbook with no more than 100 sheets.');
 const tables=book.SheetNames.map((name,index)=>{
  const ws=book.Sheets[name]||{},grid=[],links={},issues=[];
  // Ignore declared styling dimensions. Only actual cells passed the ZIP
  // bounds; a thousand formatted empty rows cannot inflate this grid.
  for(const [address,cell]of Object.entries(ws)){
   if(!/^[A-Z]+\d+$/i.test(address))continue;const {r,c}=XLSX.utils.decode_cell(address);
   if(r>=limits.maxRows||c>=limits.maxColumns)throw error('table-too-large','Keep populated source cells within 2,000 rows and 100 columns.');
   let value=cell?.v??'';
   if(cell&&(Object.prototype.hasOwnProperty.call(cell,'f')||Object.prototype.hasOwnProperty.call(cell,'F'))){value='';issues.push('Formula at '+address+' was not used.');}
   else if(cell?.t==='e')value='';
   if(typeof value==='string'&&value.length>20000)throw error('cell-too-long','A cell contains too much text. Use a smaller plan sheet.');
   if(value!==''||cell?.f){grid[r]??=[];grid[r][c]=value;}
   const link=safeURL(cell?.l?.Target);if(link)links[r+':'+c]=link;
  }
  const hidden=!!book.Workbook?.Sheets?.[index]?.Hidden;const parsed=parseGrid(grid,{sheetName:name,links});
  return{name,index,hidden,grid,links,issues,parsed};
 });
 const wanted=Number.isInteger(sheet)?tables.find(t=>t.index===sheet&&!t.hidden):null,selected=wanted||tables.find(t=>!t.hidden&&t.parsed.rows.length)||tables.find(t=>!t.hidden);if(!selected)throw error('no-visible-sheet','Choose a workbook with a visible degree sheet.');
 return{sheets:tables.map(t=>({name:t.name,index:t.index,hidden:t.hidden,requirements:t.parsed.rows.length,totalCredits:t.parsed.totalCredits})),selectedSheet:{name:selected.name,index:selected.index},parsed:{...selected.parsed,issues:[...selected.parsed.issues,...selected.issues]}};
}
function parseDelimited(raw,meta={}){
 if(typeof raw!=='string'||raw.length>1000000)throw error('text-too-large','Use a CSV smaller than 1 MB.');
 const delimiter=raw.includes('\t')?'\t':',',rows=[];let row=[],value='',quoted=false,closed=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c==='"'){if(value||closed)throw error('invalid-csv','A quote must start a CSV field.');quoted=true;}
  else if(c===delimiter||c==='\n'||c==='\r'){row.push(value);value='';closed=false;if(c!==delimiter){if(c==='\r'&&raw[i+1]==='\n')i++;rows.push(row);row=[];if(rows.length>limits.maxRows)throw error('too-many-rows','Use a table with at most 2,000 source rows.');}}
  else{if(closed&&!/\s/.test(c))throw error('invalid-csv','Put a separator after a quoted field.');if(!closed)value+=c;}
 }
 if(quoted)throw error('invalid-csv','A quoted CSV field is unfinished.');row.push(value);if(row.some(v=>v.trim()))rows.push(row);
 return parseGrid(rows,meta);
}
function exactModelMatches(parsed,models){
 const rows=parsed.rows.filter(r=>r.selected!==false);if(!rows.length||rows.some(r=>!r.code)||new Set(rows.map(r=>codeKey(r.code))).size!==rows.length)return[];
 return(models||[]).filter(m=>normal(m.school)===normal(parsed.metadata.school)&&m.creditSystem===parsed.metadata.creditSystem&&Math.abs(m.totalCredits-rows.reduce((s,r)=>s+r.credits,0))<0.001&&m.requirements?.length===rows.length&&rows.every(r=>m.requirements.some(q=>codeKey(q.code)===codeKey(r.code)&&Math.abs(q.credits-r.credits)<0.001)));
}
function bindMatchingModel(parsed,model,{sourceUrl=''}={}){
 if(exactModelMatches(parsed,[model]).length!==1)throw error('model-mismatch','The current degree ledger does not match these rows.');
 const next=JSON.parse(JSON.stringify(parsed)),key=codeKey;
 for(const row of next.rows){const requirement=model.requirements.find(r=>key(r.code)===key(row.code));if(!requirement)continue;
  if(normal(requirement.title)!==normal(row.title)){row.originalTitle=row.title;row.importNotes=('Spreadsheet label: '+row.title+'\n'+(row.importNotes||'')).slice(0,1800);row.title=plain(requirement.title).slice(0,200);}
  const section=(model.curriculumSections||[]).find(s=>(s.requirementIds||[]).includes(requirement.id));if(section?.title)row.section=plain(section.title).slice(0,100);
  row.requiredAtUniversity=requirement.institutionalOnly===true;row.upperLevel=requirement.upper===true;row.sourceUrl=safeURL(sourceUrl)||row.sourceUrl;
 }
 return next;
}
function draftPayload(parsed,metadata){
 const rows=parsed.rows.filter(r=>r.selected!==false).map(r=>({section:r.section,code:r.code,title:r.title,credits:r.credits,sourceUrl:safeURL(r.sourceUrl),requiredAtUniversity:r.requiredAtUniversity===true,upperLevel:r.upperLevel===true,...(r.importNotes?{importNotes:r.importNotes}:{})}));
 if(!rows.length)throw error('no-requirements','Select at least one requirement.');
 return{metadata:{...metadata,templateFile:plain(parsed.fileName).slice(0,200),templateSheet:plain(parsed.sheetName).slice(0,200)},rows,csv:'',mode:'rows'};
}
function exportTemplate(parsed,metadata){return{version:1,kind:'community-degree-template-draft',trust:'community-proposed-not-verified',metadata:{...metadata,sourceUrl:safeURL(metadata.sourceUrl)},source:{fileName:plain(parsed.fileName),sheetName:plain(parsed.sheetName)},requirements:parsed.rows.filter(r=>r.selected!==false).map(({id,sourceRow,section,code,title,originalTitle,credits,sourceUrl,alternatives,credentials,contextNotes,importNotes})=>({id,sourceRow,section,code,title,...(originalTitle?{originalTitle}:{}),credits,sourceUrl:safeURL(sourceUrl),alternatives,credentials,contextNotes,importNotes})),earnedCourses:[],published:false};}
return Object.freeze({limits,safeURL,suggestions,parseGrid,parseDelimited,inspectWorkbook,exactModelMatches,bindMatchingModel,draftPayload,exportTemplate});
}));
