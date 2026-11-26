/* Private, student-provided requirements. This module never awards credit or uploads documents. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./program-catalog.js'):root.DegreeProgramCatalog);if(typeof module==='object'&&module.exports)module.exports=api;else root.AuditCurriculum=api;}(typeof globalThis!=='undefined'?globalThis:this,function(ProgramCatalog){
 'use strict';
 const MAX_ENTRIES=5,MAX_ROWS=500,MAX_BYTES=220000,MAX_DRAFTS=10,MAX_DRAFT_BYTES=220000,MAX_WORKSPACE_BYTES=480000,copy=v=>JSON.parse(JSON.stringify(v)),list=v=>Array.isArray(v)?v:[],norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''),text=(v,n=200)=>String(v||'').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,n);
 const levels=['associate','bachelor','master','doctorate','specialist'],units=['semester','quarter','competency-unit'];
 const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
 function https(value){try{const u=new URL(String(value||''));if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}return '';}
 function identifier(v){return typeof v==='string'&&/^student-audit-[A-Za-z0-9_-]{1,100}$/.test(v);}
 function category(value){const v=norm(value);if(/generaled|commons|gened/.test(v))return'general';if(/freeelect|elective/.test(v))return'elective';if(/concentration|cognate|specialization/.test(v))return'concentration';if(/minor/.test(v))return'minor';if(/core|foundation/.test(v))return'core';if(/university|residenc/.test(v))return'institutional';return'major';}
 function csvRows(raw){
  if(typeof raw!=='string'||raw.length>150000)throw Error('Use a requirements CSV with at most 150,000 characters.');
  const rows=[];let cells=[],cell='',quoted=false,closed=false;
  for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}if(c==='"'){if(cell.trim()||closed)throw Error('A CSV quote must start a field.');quoted=true;continue;}if(c===','||c==='\n'||c==='\r'){cells.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&raw[i+1]==='\n')i++;if(cells.some(v=>v.trim()))rows.push(cells);cells=[];}}else{if(closed&&!/\s/.test(c))throw Error('Put a comma after a quoted CSV field.');if(!closed)cell+=c;}}
  if(quoted)throw Error('A quoted CSV field is unfinished.');cells.push(cell);if(cells.some(v=>v.trim()))rows.push(cells);return rows;
 }
 // Options and group arithmetic must be resolved into exact, non-overlapping
 // requirements by the student. Counting every listed option would inflate a plan.
 function ambiguous(row){
  const value=[row.section,row.code,row.title].filter(Boolean).join(' '),code=String(row.code||'');
  return /\bor\b/i.test(value)||/\b(?:choose|select|take|complete)\s+(?:(?:any|exactly|at\s+least|at\s+most|up\s+to|a\s+minimum\s+of|a\s+maximum\s+of)\s+)*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(value)||/\b\d+(?:\.\d+)?\s*(?:[-–—]|to|through)\s*\d+(?:\.\d+)?\s*(?:(?:semester|quarter|elective|upper[-\s]level|lower[-\s]level|graduate|undergraduate)\s+)*(?:credits?|hours?|units?)\b/i.test(value)||/[A-Za-z]{2,}\s*\d+[A-Za-z]?\s*(?:(?:[-–—/]|to|through)\s*(?:[A-Za-z]{2,}\s*)?\d+|\s*\/\s*[A-Za-z]{2,}\s*\d+)/.test(code)||/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:courses?|options?)\s+)?(?:of|from)\b/i.test(value)||/\b(?:options?\s+(?:listed|below)|(?:course|requirement)\s+group|group\s+(?:total|options?))\b/i.test(value);
 }
 function assertUnambiguous(row,number){if(ambiguous(row))throw Error('Resolve OR choices, choose-N groups and ranges into exact requirements before building (row '+number+'). Keep the original text in your private draft.');}
 function tableCells(raw,delimiter){
  if(typeof raw!=='string'||raw.length>150000)throw Error('Paste a requirements table with at most 150,000 characters.');
  const result=[];let values=[],value='',quoted=false,closed=false,line=1,start=1;
  for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else{value+=c;if(c==='\n')line++;}continue;}if(c==='"'){if(value.trim()||closed)throw Error('A table quote must start a field on row '+line+'.');quoted=true;continue;}if(c===delimiter||c==='\n'||c==='\r'){values.push(value);value='';closed=false;if(c!==delimiter){if(c==='\r'&&raw[i+1]==='\n')i++;if(values.some(v=>v.trim()))result.push({values,line:start});values=[];line++;start=line;}}else{if(closed&&!/\s/.test(c))throw Error('Put a separator after a quoted field on row '+line+'.');if(!closed)value+=c;}}
  if(quoted)throw Error('A quoted table field is unfinished.');values.push(value);if(values.some(v=>v.trim()))result.push({values,line:start});if(result.length>MAX_ROWS*3+20)throw Error('Use at most '+MAX_ROWS+' requirement rows.');return result;
 }
 function tableDelimiter(raw){let quote=false;for(let i=0;i<raw.length;i++){if(raw[i]==='"'){if(quote&&raw[i+1]==='"'){i++;continue;}quote=!quote;}else if(!quote&&raw[i]==='\t')return'\t';}return',';}
 function parseTable(raw){
  if(typeof raw!=='string'||raw.length>150000)throw Error('Paste a requirements table with at most 150,000 characters.');
  const delimiter=tableDelimiter(raw),cells=tableCells(raw,delimiter),aliases={section:'section',category:'section',requirementsection:'section',code:'code',coursecode:'code',coursenumber:'code',title:'title',coursetitle:'title',coursename:'title',requirement:'title',credits:'credits',credithours:'credits',credit:'credits',hours:'credits',units:'credits',sourceurl:'sourceurl',source:'sourceurl',requiredatuniversity:'requiredatuniversity',atuniversity:'requiredatuniversity',requiredatthisuniversity:'requiredatuniversity',upperlevel:'upperlevel'},rows=[],skipped=[],warnings=[];
  let headers=null,section='Major requirements';
  const summary=value=>/^(?:sub[\s-]*total|grand\s+total)(?:\s+for\b.*|\s*[-–—:(].*)?$/i.test(value.trim())||/^(?:(?:section|category|program|degree|major(?: requirements?)?|minor(?: requirements?)?|core|general education|electives?|university requirements?)\s+)?(?:sub[\s-]*total|grand\s+total|total)(?:\s+(?:credits?|credit\s+hours?|hours?|units?|required))?\s*:?(?:\s*\(?\d+(?:\.\d+)?\s*(?:credits?|hours?|units?)?\s*\)?)?\s*$/i.test(value.trim())||/^(?:credits?|credit\s+hours?|hours?|units?)\s+(?:sub[\s-]*total|total)\s*:?$/i.test(value.trim());
  for(const cell of cells){const values=cell.values.map(v=>v.trim().replace(/^\uFEFF/,'')),labels=values.map(v=>aliases[norm(v)]),nonempty=values.filter(Boolean);
   if(labels.includes('title')&&labels.includes('credits')){if(labels.some(v=>!v)||new Set(labels).size!==labels.length)throw Error('Use unique section, course code, course title, credit hours and optional source/flags column labels.');if(headers){headers=labels;skipped.push({row:cell.line,reason:'repeated-header',label:values.join(' · ')});continue;}headers=labels;continue;}
   if(nonempty.length===1&&!/^\d+(?:\.\d+)?$/.test(nonempty[0])){if(summary(nonempty[0])){skipped.push({row:cell.line,reason:'subtotal',label:nonempty[0]});warnings.push('Skipped summary on row '+cell.line+': '+nonempty[0]+'. Confirm the degree total separately.');}else{assertUnambiguous({title:nonempty[0]},cell.line);if(nonempty[0].length>100)throw Error('Use a section label of at most 100 characters on row '+cell.line+'.');section=nonempty[0].replace(/:$/,'');skipped.push({row:cell.line,reason:'section-label',label:section});}continue;}
   if(!headers){if(values.length===2)headers=['title','credits'];else if(values.length===3)headers=['code','title','credits'];else if(values.length===4)headers=['section','code','title','credits'];else throw Error('Include course title and credit hours column labels, or paste code, title and credits in three columns.');}
   if(values.length>headers.length&&values.slice(headers.length).some(Boolean))throw Error('Check the number of columns on row '+cell.line+'.');while(values.length<headers.length)values.push('');
   const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]])),label=row.title||row.code||row.section||'';
   if(summary(label)&&(!row.code||summary(row.code))){skipped.push({row:cell.line,reason:'subtotal',label});warnings.push('Skipped summary on row '+cell.line+': '+label+'. Confirm the degree total separately.');continue;}
   if(!row.title&&!row.credits&&row.section){assertUnambiguous({title:row.section},cell.line);if(row.section.length>100)throw Error('Use a section label of at most 100 characters on row '+cell.line+'.');section=row.section.replace(/:$/,'');skipped.push({row:cell.line,reason:'section-label',label:section});continue;}
   assertUnambiguous(row,cell.line);
   if(!row.title||row.title.length>200)throw Error('Add a course or requirement title of at most 200 characters on row '+cell.line+'.');
   if(!/^\d+(?:\.\d+)?$/.test(row.credits||'')||Number(row.credits)<=0||Number(row.credits)>200)throw Error('Use one exact positive credit amount, up to 200, on row '+cell.line+'. Ranges and group totals need manual resolution.');
   const flag=value=>{const v=String(value||'').toLowerCase();if(!['','yes','no','true','false','1','0'].includes(v))throw Error('Use yes or no for university and upper-level flags on row '+cell.line+'.');return['yes','true','1'].includes(v);};
   if(row.sourceurl&&!https(row.sourceurl))throw Error('Use an https university link on row '+cell.line+'.');
   rows.push({section:text(row.section||section,100),code:text(row.code,100),title:text(row.title,200),credits:Number(row.credits),sourceUrl:row.sourceurl?https(row.sourceurl):'',requiredAtUniversity:flag(row.requiredatuniversity),upperLevel:flag(row.upperlevel)});
   if(rows.length>MAX_ROWS)throw Error('Use at most '+MAX_ROWS+' requirement rows.');
  }
  if(!rows.length)throw Error('Add at least one exact requirement with a title and positive credits.');const totalCredits=rows.reduce((sum,row)=>sum+row.credits,0);if(totalCredits>500)throw Error('A degree plan can contain at most 500 total credits.');return{rows,totalCredits,total:totalCredits,skipped,warnings,delimiter:delimiter==='\t'?'tsv':'csv'};
 }
 function parseCSV(raw){
  const cells=csvRows(raw);if(cells.length<2)throw Error('Add your requirements below the column labels before importing.');if(cells.length>MAX_ROWS+1)throw Error('Use at most '+MAX_ROWS+' requirement rows.');
  const headers=cells.shift().map(v=>norm(v.replace(/^\uFEFF/,''))),allowed=['section','code','title','credits','sourceurl','requiredatuniversity','upperlevel'];
  if(new Set(headers).size!==headers.length)throw Error('Column labels must be unique.');if(!headers.includes('title')||!headers.includes('credits'))throw Error('Include title and credits columns.');if(headers.some(h=>!allowed.includes(h)))throw Error('Use these column labels: section, code, title, credits, sourceUrl, requiredAtUniversity.');
  const rows=cells.map((values,i)=>{const number=i+2;if(values.length!==headers.length)throw Error('Check the number of columns on row '+number+'.');const row=Object.fromEntries(headers.map((h,j)=>[h,values[j].trim()]));assertUnambiguous(row,number);if(!row.title||row.title.length>200)throw Error('Add a course or requirement title of at most 200 characters on row '+number+'.');if(!/^\d+(?:\.\d+)?$/.test(row.credits||'')||!(Number(row.credits)>0)||Number(row.credits)>200)throw Error('Use positive credits, up to 200, on row '+number+'.');const flag=(row.requiredatuniversity||'').toLowerCase();if(!['','yes','no','true','false','1','0'].includes(flag))throw Error('Use yes or no under requiredAtUniversity on row '+number+'.');const upper=(row.upperlevel||'').toLowerCase();if(!['','yes','no','true','false','1','0'].includes(upper))throw Error('Use yes or no under upperLevel on row '+number+'.');if(row.sourceurl&&!https(row.sourceurl))throw Error('Use an https university link on row '+number+'.');return{section:text(row.section||'Major requirements',100),code:text(row.code,100),title:text(row.title,200),credits:Number(row.credits),sourceUrl:row.sourceurl?https(row.sourceurl):'',requiredAtUniversity:['yes','true','1'].includes(flag),upperLevel:['yes','true','1'].includes(upper)};});
  const totalCredits=rows.reduce((s,r)=>s+r.credits,0);if(totalCredits>500)throw Error('A degree plan can contain at most 500 total credits.');return{rows,totalCredits};
 }
 function validRows(rows,allowChoices=false){if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS)throw Error('Import between 1 and '+MAX_ROWS+' requirement rows.');return rows.map((r,i)=>{if(!r||typeof r.title!=='string'||!r.title.trim()||r.title.length>200||!Number.isFinite(r.credits)||r.credits<=0||r.credits>200)throw Error('Check the title and credits on requirement '+(i+1)+'.');if(!(allowChoices&&r.selectionRequired===true))assertUnambiguous(r,i+1);if(r.sourceUrl&&!https(r.sourceUrl))throw Error('Use https links for requirement sources.');return{section:text(r.section||'Major requirements',100),code:text(r.code,100),title:text(r.title,200),credits:r.credits,sourceUrl:r.sourceUrl?https(r.sourceUrl):'',requiredAtUniversity:r.requiredAtUniversity===true,upperLevel:r.upperLevel===true,...(allowChoices&&r.selectionRequired===true?{selectionRequired:true}:{})};});}
 function createPrivate(rows,meta={},research=false){
  rows=validRows(rows,research);const total=rows.reduce((s,r)=>s+r.credits,0),required=Number(meta.totalCredits),school=text(meta.school,120),title=text(meta.title,200),sourceUrl=https(meta.sourceUrl),level=meta.level,creditSystem=meta.creditSystem||'semester';
  if(!school||!title||!sourceUrl)throw Error('Add the school, degree name, and its official https catalog link.');if(!levels.includes(level)||!units.includes(creditSystem))throw Error('Choose a degree level and credit units.');if(!Number.isFinite(required)||required<=0||required>500||Math.abs(required-total)>0.001)throw Error('The imported rows total '+total+' credits. They must match the degree total you confirm.');if(!research&&meta.reviewedByStudent!==true)throw Error('Review the requirements and confirm the degree total before building.');if(research&&(meta.reviewedByStudent!==false||typeof meta.templateId!=='string'||!meta.templateId||meta.templateId.length>100||!Number.isSafeInteger(meta.templateRevision)||meta.templateRevision<1))throw Error('Choose a saved AI research revision before opening this private plan.');
  const id=identifier(meta.id)?meta.id:'student-audit-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)),sources=[],sourceIds=new Map(),sections=new Map();
  function source(url){if(sourceIds.has(url))return sourceIds.get(url);const sid='audit-source-'+(sourceIds.size+1);sourceIds.set(url,sid);sources.push({id:sid,title:research?'Public source for AI-researched requirements — confirmation needed':'Reference URL for student-provided requirements — not independent verification',url,checked:null,evidenceType:'student-provided-reference'});return sid;}
  const requirements=rows.map((r,i)=>{const rid='audit-row-'+(i+1),sourceId=source(r.sourceUrl||sourceUrl),placeholder=!r.code,sectionKey=norm(r.section)||'major';if(!sections.has(sectionKey))sections.set(sectionKey,{id:'audit-section-'+(sections.size+1),title:r.section,requirementIds:[],sourceId});sections.get(sectionKey).requirementIds.push(rid);return{id:rid,...(r.code?{code:r.code}:{}),title:r.title,credits:r.credits,category:category(r.section),upper:r.upperLevel,institutionalOnly:r.requiredAtUniversity,sourceIds:[sourceId],studentProvided:true,...(research&&r.selectionRequired===true?{selectionRequired:true}:{}),options:[{id:'audit-university-'+(i+1),provider:'University',...(r.code?{code:r.code}:{}),title:r.title,credits:r.credits,creditSystem,creditOrigin:'institutional',upper:r.upperLevel,sourceIds:[sourceId],evidence:'conditional',evidenceType:'student-provided-audit',conditions:['This requirement was imported from your file and has not been independently verified. Confirm the catalog, course choice and applicability with the university.'],...(placeholder?{selectionRequired:true}:{})}]};});
  const policyReview=[{field:'auditRequirements',status:'unverified',message:research?'This degree plan was generated from public sources. Its requirements and placements need confirmation.':'These requirements are student-provided. The reference catalog link does not establish that the imported audit is correct.'},{field:'externalMaxCredits',status:'unverified',message:'Confirm the exact degree’s overall transfer limit, major residency and approved credit sources.'},{field:'alternativeMaxCredits',status:'unverified',message:'Confirm limits on ACE, NCCRS and other alternative credits before enrolling.'}];
  const model={id,school,title,level,format:meta.modality==='online'?'Online':meta.modality==='campus'?'Residential':research&&meta.modality==='hybrid'?'Hybrid':'Needs confirmation',creditSystem,totalCredits:required,catalog:text(meta.catalog,80)||'Student-provided; catalog needs confirmation',requirements,sources,curriculumSections:[...sections.values()],coverageLabel:'Student-provided requirements · proposed plan',completeExecutablePathway:false,policyReview,unresolved:['Confirm the imported requirements and catalog with the university.','Imported rows are requirements, not completed or awarded credits.','Outside course equivalencies are included only when separately sourced.'],auditProvenance:{status:research?'ai-research':'student-provided',reviewedByStudent:!research,independentlyVerified:false,referenceUrl:sourceUrl,...(research?{templateId:meta.templateId,templateRevision:meta.templateRevision}:{})},evidenceCheckedOn:null};
  for(const [field,label] of [['institutionMinCredits','university credit minimum'],['upperMinCredits','upper-level credit minimum']]){const value=meta[field];if(value!==''&&value!==undefined&&value!==null){const n=Number(value);if(!Number.isFinite(n)||n<0||n>required)throw Error('Check the '+label+'.');model[field]=n;policyReview.push({field,status:'unverified',message:'The '+label+(research?' was researched from public sources and needs university confirmation.':' was supplied by the student and needs university confirmation.')});}else policyReview.push({field,status:'unverified',message:'Confirm the '+label+' for this degree.'});}
  const route={id,modelId:id,school,title,level,creditSystem,catalog:model.catalog,modalities:(['online','campus'].includes(meta.modality)||research&&meta.modality==='hybrid')?[meta.modality]:[],url:sourceUrl,routeType:'student-audit',sourceStatus:'student-provided',courseMapStatus:research?'ai-research':'student-provided',field:'any',fields:[],goals:['any-degree','career-growth','change-career'],sources:[{title:'Student-provided audit reference',url:sourceUrl}],summary:'Your imported requirements. University confirmation is still needed.'};
  const entry={route,model,createdAt:new Date().toISOString()};validateEntry(entry);return entry;
 }
 function create(rows,meta={}){return createPrivate(rows,meta,false);}
 function createResearch(rows,meta={}){return createPrivate(rows,{...meta,reviewedByStudent:false},true);}
 function reviewedPublicTemplate(model){const marker=model?.communityTemplate;return model?.auditProvenance?.status==='student-provided'&&marker&&typeof marker.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(marker.id)&&Number.isSafeInteger(marker.revision)&&marker.revision>0&&marker.sourcesReviewed===true&&marker.academicReviewed===true;}
 function institutionDomain(value){try{const host=new URL(value).hostname.toLowerCase(),parts=host.split('.');return /\.(?:ac|edu)\.[a-z]{2}$/.test(host)?parts.slice(-3).join('.'):host.endsWith('.edu')?parts.slice(-2).join('.'):host.replace(/^(?:www|catalog)\./,'');}catch{return '';}}
 function reviewedFreeElectiveChoice(model,requirement,option,sources){
  const review=model?.namedCourseCompletionReview,reviewId='tesu-general-management-named-course-completion-2026-11-17',date='2026-11-17';
  if(!reviewedPublicTemplate(model)||norm(model.school)!=='thomasedisonstateuniversity'||norm(model.title)!=='bsingeneralmanagement'||model.level!=='bachelor'||model.creditSystem!=='semester'||requirement.freeElective!==true||requirement.selectionRequired===true||requirement.credits!==3||option.provider!=='University'||option.evidence!=='published'||option.selectionRequired===true||option.creditSystem!=='semester'||option.creditOrigin!=='institutional'||option.sourceCredits!==3||option.sourceCreditSystem!=='semester'||option.receivingCode!==undefined||option.evidenceType!=='official-university-course'||option.courseChoiceReviewId!==reviewId||option.courseChoiceCheckedOn!==date||review?.id!==reviewId||review.checkedOn!==date||review.evidencePath!=='content/reviews/tesu-named-course-completion-2026-11-17.json'||review.outsideEquivalenciesAdded!==0||review.standardResidencyCredits!==15||!list(review.requirementIds).includes(requirement.id))return false;
  const choices={elective2:['ART-1000','A World of Art','https://www2.tesu.edu/ucourse.php?CourseCode=ART-1000&sem='],elective3:['ANT-1010','Introduction to Anthropology','https://www2.tesu.edu/ucourse.php?CourseCode=ANT-1010&sem='],elective4:['PSY-1010','Introduction to Psychology','https://www2.tesu.edu/ucourse.php?CourseCode=PSY-1010&sem='],elective5:['HIS-1210','Introduction to World History I','https://tesu.smartcatalogiq.com/en/current/undergraduate-catalog/courses/his-history/1000/his-1210']},choice=choices[norm(requirement.code)];
  if(!choice||norm(option.code)!==norm(choice[0])||norm(option.title)!==norm(choice[1])||https(option.url)!==https(choice[2]))return false;
  const program='https://tesu.smartcatalogiq.com/en/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-science-in-business-administration/bs-in-general-management',courseList='https://www2.tesu.edu/listall.php',requirements=list(requirement.sourceIds),references=list(option.sourceIds);
  const source=id=>sources instanceof Map?sources.get(id):list(model.sources).find(item=>item.id===id),valid=id=>{const item=source(id);if(!item||item.kind!=='university'||item.checked!==date)return false;try{return ['www2.tesu.edu','tesu.smartcatalogiq.com'].includes(new URL(item.url).hostname)&&!!https(item.url);}catch{return false;}},urls=ids=>ids.map(id=>https(source(id)?.url));
  return requirements.length>0&&references.length>0&&requirements.every(id=>references.includes(id)&&valid(id))&&references.every(valid)&&[program,courseList].every(url=>urls(requirements).includes(url))&&urls(references).includes(choice[2]);
 }
 function reviewedPublishedOption(model,requirement,option,sources){
  if(!reviewedPublicTemplate(model)||option.evidence!=='published'||option.creditSystem!==model.creditSystem||typeof option.code!=='string'||!option.code.trim()||typeof requirement.code!=='string'||!requirement.code.trim()||option.selectionRequired===true||requirement.selectionRequired===true)return false;
  if(norm(option.provider==='University'?option.code:option.receivingCode)!==norm(requirement.code))return reviewedFreeElectiveChoice(model,requirement,option,sources);
  const domain=institutionDomain(model.auditProvenance.referenceUrl),official=id=>{const source=sources.get(id);return source&&domain&&institutionDomain(source.url)===domain;};
  return list(requirement.sourceIds).length>0&&list(requirement.sourceIds).every(id=>sources.has(id))&&requirement.sourceIds.some(official)&&list(option.sourceIds).some(official);
 }
 function validateModel(model){
  const provenance=model?.auditProvenance,research=provenance?.status==='ai-research',validProvenance=provenance?.independentlyVerified===false&&(research?provenance.reviewedByStudent===false&&typeof provenance.templateId==='string'&&!!provenance.templateId&&provenance.templateId.length<=100&&Number.isSafeInteger(provenance.templateRevision)&&provenance.templateRevision>0:provenance?.status==='student-provided'&&provenance.reviewedByStudent===true);
  if(!model||!identifier(model.id)||typeof model.school!=='string'||!model.school||model.school.length>120||typeof model.title!=='string'||!model.title||model.title.length>200||!levels.includes(model.level)||!units.includes(model.creditSystem)||!Number.isFinite(model.totalCredits)||model.totalCredits<=0||model.totalCredits>500||!validProvenance)throw Error('This private audit is invalid. Import and review it again.');
  if(!Array.isArray(model.requirements)||!model.requirements.length||model.requirements.length>MAX_ROWS||!Array.isArray(model.sources))throw Error('This private audit has invalid requirements.');const sources=new Map();for(const s of model.sources){if(typeof s.id!=='string'||sources.has(s.id)||!https(s.url))throw Error('This private audit has an invalid source reference.');sources.set(s.id,s);}
  const seen=new Set();let total=0;for(const r of model.requirements){if(typeof r.id!=='string'||!r.id||seen.has(r.id)||typeof r.title!=='string'||!r.title||r.title.length>200||!Number.isFinite(r.credits)||r.credits<=0||r.credits>200||!Array.isArray(r.options))throw Error('This private audit has invalid requirement rows.');seen.add(r.id);total+=r.credits;for(const o of r.options){if(typeof o.id!=='string'||!o.id||typeof o.provider!=='string'||!o.provider||!(o.evidence==='conditional'||reviewedPublishedOption(model,r,o,sources))||!Number.isFinite(o.credits)||Math.abs(o.credits-r.credits)>0.001||!Array.isArray(o.sourceIds)||!o.sourceIds.length||o.sourceIds.some(id=>!sources.has(id)))throw Error('Imported course choices need conditional evidence or a reviewed, source-linked public template.');if(r.institutionalOnly&&o.provider!=='University')throw Error('A university-only requirement cannot use outside credit.');}}
  if(Math.abs(total-model.totalCredits)>0.001)throw Error('The imported requirement credits do not match the degree total.');if(model.completeExecutablePathway!==false)throw Error('A student-provided audit cannot claim verified execution.');return copy(model);
 }
 function validateEntry(entry){if(!entry?.route||entry.route.id!==entry.model?.id||entry.route.modelId!==entry.model?.id||entry.route.sourceStatus!=='student-provided'||entry.route.school!==entry.model.school||entry.route.title!==entry.model.title||!https(entry.route.url)||!levels.includes(entry.route.level)||list(entry.route.modalities).some(m=>!['online','campus'].includes(m)&&!(m==='hybrid'&&entry.model.auditProvenance?.status==='ai-research')))throw Error('The private audit does not match its degree.');validateModel(entry.model);return copy(entry);}
 function entries(state){if(state?.customCurricula!==undefined&&!Array.isArray(state.customCurricula))throw Error('Private audit storage could not be read. It has not been changed.');const all=list(state?.customCurricula);if(all.length>MAX_ENTRIES||bytes(all)>MAX_BYTES)throw Error('Private audit storage exceeds its limit. Export a backup before removing old imports.');return all.map(validateEntry);}
 function models(state){return entries(state).map(e=>e.model);}
 function attach(catalog,state){const found=entries(state),ids=new Set(list(catalog?.pathways).map(r=>r.id));return{...catalog,pathways:[...list(catalog?.pathways),...found.filter(e=>!ids.has(e.route.id)).map(e=>e.route)]};}
 const degreeBand=level=>/^(?:associate|bachelor)/.test(norm(level))?'undergraduate':/^(?:master|doctor|specialist|graduate)/.test(norm(level))?'graduate':null;
 const alternativeProvider=provider=>['sophia','studycom','clep','dsst','saylor','straighterline','modernstates','davar','coopersmith','aleks','aleksindependentuse','upistudy','csm','seemore','seemorecorestrategiesformathematics'].includes(norm(provider));
 function inheritEquivalencies(model,reviewed){
  const next=validateModel(model),sources=new Map(next.sources.map(s=>[s.id,s])),canonicalSources=new Map(),originModels=list(next.importedSourceModels);let sourceSequence=0,inheritedAny=false;
  // Prefer the one exact official ledger before broader conditional candidates.
  // This retains its program-specific proof when several degrees share a course code.
  const pool=list(reviewed),ledger=requirements=>list(requirements).map(r=>[norm(r.code),r.credits,Boolean(r.institutionalOnly)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),targetLedger=JSON.stringify(ledger(next.requirements));
  const exact=pool.filter(original=>norm(original.school)===norm(next.school)&&(original.creditSystem||'semester')===next.creditSystem&&degreeBand(original.level)===degreeBand(next.level)&&norm(original.title)===norm(next.title)&&String(original.catalog||original.catalogYear||'')===String(next.catalog)&&norm(original.format)===norm(next.format)&&original.totalCredits===next.totalCredits&&JSON.stringify(ledger(original.requirements))===targetLedger);
  const ordered=exact.length===1?[exact[0],...pool.filter(original=>original!==exact[0])]:pool;
  if(next.importedSourceModels!==undefined&&(!Array.isArray(next.importedSourceModels)||originModels.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(originModels).size!==originModels.length))throw Error('The imported source provenance could not be read.');
  const sourceOrigin=(source,original,id)=>{const previous=source.privateImportOrigin,origin=typeof previous?.model==='string'?previous.model:Number.isInteger(previous?.modelIndex)?list(original.importedSourceModels)[previous.modelIndex]:original.id,identifier=typeof previous?.identifier==='string'?previous.identifier:id;if(typeof origin!=='string'||!origin)throw Error('The imported source provenance could not be read.');let modelIndex=originModels.indexOf(origin);if(modelIndex<0){modelIndex=originModels.length;originModels.push(origin);}return{modelIndex,identifier};};
  // Keep complete, immutable source evidence once. A source shared across
  // several degree models is not several independent pieces of evidence.
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  const sourceKey=value=>{const body={...value};delete body.id;delete body.privateImportOrigin;return JSON.stringify(stable(body));};
  for(const source of next.sources)canonicalSources.set(sourceKey(source),source.id);
  // Original and upstream-original labels name immutable parent-packet records,
  // not local citation edges. Real sourceIds and page-keyed citations still close locally.
  const invalidReference=Symbol('invalid-source-reference'),sourceReferenceKey=key=>/sourceIds?$/i.test(key)&&!/^(?:upstream)?originalSourceIds?$/i.test(key);
  const references=(value,found=new Set())=>{
   if(!value||typeof value!=='object')return found;
   for(const [key,entry]of Object.entries(value)){
    if(sourceReferenceKey(key)){
     const many=/sourceIds$/i.test(key);if(many?!Array.isArray(entry):typeof entry!=='string'){found.add(invalidReference);continue;}
     for(const id of many?entry:[entry])if(typeof id==='string'&&id)found.add(id);else found.add(invalidReference);
    }else if(key==='sourcePages'){
     if(!entry||typeof entry!=='object'||Array.isArray(entry)){found.add(invalidReference);continue;}
     for(const id of Object.keys(entry))if(id)found.add(id);else found.add(invalidReference);for(const page of Object.values(entry))if(page&&typeof page==='object')references(page,found);
    }else if(entry&&typeof entry==='object')references(entry,found);
   }
   return found;
  };
  const remap=(value,aliases)=>{
   if(Array.isArray(value))return value.map(entry=>remap(entry,aliases));if(!value||typeof value!=='object')return value;
   const out=Object.create(null);
   for(const[key,entry]of Object.entries(value)){
    if(sourceReferenceKey(key))out[key]=Array.isArray(entry)?entry.map(id=>aliases.get(id)):aliases.get(entry);
    else if(key==='sourcePages'){
     const pages=Object.create(null);for(const[id,page]of Object.entries(entry)){
      const local=aliases.get(id),mappedPage=remap(page,aliases);
      if(!Object.prototype.hasOwnProperty.call(pages,local))pages[local]=mappedPage;
      else if(JSON.stringify(pages[local])!==JSON.stringify(mappedPage)){const values=[...(Array.isArray(pages[local])?pages[local]:[pages[local]]),...(Array.isArray(mappedPage)?mappedPage:[mappedPage])];pages[local]=[...new Map(values.map(item=>[JSON.stringify(item),item])).values()];}
     }out[key]=pages;
    }else out[key]=remap(entry,aliases);
   }
   return out;
  };
  for(const r of next.requirements){
   if(r.institutionalOnly||!r.code)continue;
   for(const original of ordered){
    if(norm(original.school)!==norm(next.school)||(original.creditSystem||'semester')!==next.creditSystem||!degreeBand(original.level)||degreeBand(next.level)!==degreeBand(original.level))continue;
    const originalSources=new Map(list(original.sources).map(source=>[source.id,source]));
    for(const req of list(original.requirements))for(const option of list(req.options)){
     if(degreeBand(next.level)==='graduate'&&(!option.graduateCredit||!(option.creditOrigin==='institutional'||option.institutionalCredit===true||option.issuerType==='college')||alternativeProvider(option.provider)))continue;
     if(option.provider==='University'||!['published','conditional'].includes(option.evidence)||option.credits!==r.credits||norm(option.receivingCode||req.code)!==norm(r.code)||r.options.some(o=>o.provider===option.provider&&norm(o.code)===norm(option.code)))continue;
     const required=references(option),pending=[...required];let missingSource=!Array.isArray(option.sourceIds)||!option.sourceIds.length;
     // Preserve source dependencies, including page-keyed citations. A partial
     // source graph must never leave an apparently linked inherited option.
     for(let i=0;i<pending.length;i++){const source=originalSources.get(pending[i]);if(!source||!https(source.url)){missingSource=true;break;}for(const id of references(source))if(!required.has(id)){required.add(id);pending.push(id);}}
     if(missingSource)continue;
     const aliases=new Map();
     for(const id of required){const source=originalSources.get(id);if(!source)continue;const key=sourceKey(source);let local=canonicalSources.get(key);if(!local){do{local='ae-'+(++sourceSequence);}while(sources.has(local)||[...aliases.values()].includes(local));canonicalSources.set(key,local);}aliases.set(id,local);}
     for(const id of required){const source=originalSources.get(id),local=aliases.get(id);if(source&&local&&!sources.has(local))sources.set(local,{...remap(copy(source),aliases),id:local,privateImportOrigin:sourceOrigin(source,original,id)});}
     const added=remap(copy(option),aliases);added.evidence='conditional';added.conditions=list(added.conditions);r.options.push(added);inheritedAny=true;
    }
   }
  }
  next.sources=[...sources.values()];if(originModels.length)next.importedSourceModels=originModels;if(inheritedAny)next.unresolved=[...new Set([...list(next.unresolved),'Confirm this separately researched course equivalency applies to your student-provided degree requirements and catalog.'])];return validateModel(next);
 }
 const contextFields={school:120,degree:200,programId:200,level:40,modality:40,creditSystem:40,sourceUrl:1500,catalog:200};
 function contextFor(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('The private requirements target could not be read.');
  const out={};for(const [field,max] of Object.entries(contextFields)){const v=value[field]??(field==='degree'?value.title:undefined)??'';if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw Error('Check the '+field+' for this private requirements draft.');out[field]=v.trim();}return out;
 }
 const identityText=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
 function draftKey(context){if(!context.school||!(context.degree||context.programId))throw Error('Add the school and degree name before saving private requirements.');return JSON.stringify([identityText(context.school),identityText(context.degree),context.programId,identityText(context.catalog),context.creditSystem,context.level,context.modality]);}
 function launchURL(context){const value=contextFor(context),params=new URLSearchParams();for(const field of Object.keys(contextFields))if(value[field])params.set(field,value[field]);return'degree-audit.html'+(params.size?'?'+params.toString():'');}
 function plain(value){return value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
 function draftFields(value,label,maxFields=40){
  if(!plain(value)||Object.keys(value).length>maxFields)throw Error('The saved private requirements '+label+' could not be read.');
  const stringLimits=label==='row'?{section:100,code:100,title:200,credits:100,sourceUrl:1500}:{school:120,title:200,degree:200,programId:200,level:40,modality:40,creditSystem:40,sourceUrl:1500,catalog:200,totalCredits:100,institutionMinCredits:100,upperMinCredits:100};
  const out={};for(const [key,v] of Object.entries(value)){
   if(!key||key.length>80||['__proto__','prototype','constructor'].includes(key)||!(typeof v==='string'&&v.length<=(stringLimits[key]||2000)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'||v===null)||label==='row'&&['requiredAtUniversity','upperLevel'].includes(key)&&typeof v!=='boolean')throw Error('The private requirements '+label+' contains an unsupported or oversized value.');out[key]=v;
  }return out;
 }
 function validateDraft(value){
  if(!plain(value)||typeof value.key!=='string'||value.key.length>1500||typeof value.updatedAt!=='string'||value.updatedAt.length>30||!Number.isFinite(Date.parse(value.updatedAt))||new Date(value.updatedAt).toISOString()!==value.updatedAt||typeof value.mode!=='string'||!['manual','rows','paste'].includes(value.mode)||typeof value.csv!=='string'||value.csv.length>150000||!Array.isArray(value.rows)||value.rows.length>MAX_ROWS)throw Error('The saved private requirements draft could not be read. It has not been changed.');
  const context=contextFor(value.context);if(value.key!==draftKey(context))throw Error('The saved private requirements target does not match its draft.');
  const metadata=draftFields(value.metadata,'metadata'),rows=value.rows.map(row=>draftFields(row,'row',12));
  if(metadata.reviewedByStudent!==false)throw Error('Saved requirements must be reviewed again before building.');
  const candidate=contextFor(metadata);for(const field of Object.keys(contextFields)){
   const supplied=field==='degree'?(metadata.degree??metadata.title):metadata[field];if(supplied===undefined||field==='sourceUrl')continue;
   const equal=['school','degree','catalog'].includes(field)?identityText(candidate[field])===identityText(context[field]):candidate[field]===context[field];
   if(!equal)throw Error('The saved private requirements metadata does not match its target. It has not been changed.');
  }
  if(metadata.degree!==undefined&&metadata.title!==undefined&&identityText(metadata.degree)!==identityText(metadata.title))throw Error('The saved private requirements degree names do not match.');
  return{key:value.key,context,metadata,rows,csv:value.csv,mode:value.mode,updatedAt:value.updatedAt};
 }
 function draftEntries(state){
  if(state?.auditDrafts===undefined)return[];const store=state.auditDrafts;
  if(!plain(store)||store.version!==1||!Array.isArray(store.drafts)||store.drafts.length>MAX_DRAFTS||bytes(store)>MAX_DRAFT_BYTES)throw Error('Private requirements storage could not be read or exceeds its limit. It has not been changed.');
  const found=store.drafts.map(validateDraft);if(new Set(found.map(d=>d.key)).size!==found.length)throw Error('Private requirements storage contains duplicate targets. It has not been changed.');return found;
 }
 function validatePrivateWork(state){
  if(!plain(state)||state.version!==3||!plain(state.profile)||!Array.isArray(state.learning))throw Error('Your current private plan could not be read. It has not been replaced.');
  entries(state);draftEntries(state);if(bytes(state)>MAX_WORKSPACE_BYTES)throw Error('This device plan is too large for a private account copy. Export a backup before adding more requirements.');return true;
 }
 function readDraft(state,context){const all=draftEntries(state),value=contextFor(context);if(!value.school||!(value.degree||value.programId))return null;return copy(all.find(d=>d.key===draftKey(value))||null);}
 function saveDraft(state,context,payload={}){
  if(!plain(state)||state.version!==3||!plain(state.profile)||!Array.isArray(state.learning))throw Error('Your current private plan could not be read. It has not been replaced.');
  const previous=draftEntries(state),value=contextFor(context),key=draftKey(value);if(!plain(payload))throw Error('The private requirements draft could not be read.');
  const draft=validateDraft({key,context:value,metadata:{...draftFields(payload.metadata||{},'metadata'),reviewedByStudent:false},rows:payload.rows===undefined?[]:payload.rows,csv:payload.csv===undefined?'':payload.csv,mode:payload.mode===undefined?'manual':payload.mode,updatedAt:new Date().toISOString()}),all=[...previous.filter(d=>d.key!==key),draft];
  if(all.length>MAX_DRAFTS)throw Error('Keep up to '+MAX_DRAFTS+' private requirements drafts. Export a backup before removing an old draft.');const store={version:1,drafts:all};if(bytes(store)>MAX_DRAFT_BYTES)throw Error('These private requirements drafts are too large. Export a backup before shortening or removing an old draft.');const next=copy(state);next.auditDrafts=store;if(bytes(next)>MAX_WORKSPACE_BYTES)throw Error('This device plan is too large for a private account copy. Export a backup before adding more requirements.');return next;
 }
 function commit(state,entry,options={}){
  entry=validateEntry(entry);const next=copy(state||{});if(next.version!==3||!plain(next.profile)||!Array.isArray(next.learning))throw Error('Your current private plan could not be read. It has not been replaced.');draftEntries(next);const previous=entries(next),existing=previous.find(e=>e.route.id===entry.route.id);if(!existing&&previous.length>=MAX_ENTRIES)throw Error('Keep up to five private imported degree plans. Export a backup before removing an old import.');const additions=[...previous.filter(e=>e.route.id!==entry.route.id),entry];if(bytes(additions)>MAX_BYTES)throw Error('These imported audits are too large. Use fewer requirement rows or keep fewer imported plans.');
  if(existing&&JSON.stringify(existing.model)!==JSON.stringify(entry.model))throw Error('Build a new private requirements version instead of replacing existing requirement rows.');
  const oldId=next.selectedPathwayId||next.profile.pathwayId,oldEntry=[...previous,...list(next.sourceCurricula)].find(e=>e.route?.id===oldId),oldRoute=list(options.catalog?.pathways).find(r=>r.id===oldId)||oldEntry?.route;
  if(oldId&&oldId!==entry.route.id&&!next.sheet?.isExample){
   if(typeof ProgramCatalog?.planSnapshot!=='function'||typeof ProgramCatalog?.planHistoryId!=='function')throw Error('Your previous degree could not be saved for comparison. Keep this page open and try again.');
   if(next.whatIf?.snapshots!==undefined&&!Array.isArray(next.whatIf.snapshots))throw Error('Your saved comparisons could not be read. Your current degree has not been replaced.');
   const draft={pathway:oldRoute||{id:oldId},program:oldEntry?.model},rows=list(next.whatIf?.snapshots),id=ProgramCatalog.planHistoryId(next,draft,'before-audit:'),old=rows.find(r=>r.id===id);
   if(rows.length>=20&&!old)throw Error('Save or remove an old comparison before importing another degree plan.');
   const snapshot=ProgramCatalog.planSnapshot(next,draft,{id});next.whatIf={...next.whatIf,version:1,snapshots:[...rows.filter(r=>r.id!==id),snapshot]};
  }
  next.customCurricula=additions;next.selectedPathwayId=entry.route.id;delete next.targetIdentity;next.profile={...next.profile,entry:'target',school:entry.route.school,schoolChoice:entry.route.school,degree:entry.route.title,degreeLevel:entry.route.level,pathwayId:entry.route.id,field:'any',...(entry.route.modalities.length===1?{modality:entry.route.modalities[0]}:{})};next.sheet={...next.sheet,isExample:false};next.journey={...next.journey,version:1,completed:true,view:'home',planReviewed:false,schoolContacted:false};if(bytes(next)>MAX_WORKSPACE_BYTES)throw Error('This device plan is too large for a private account copy. Export a backup and remove unused imports before adding another.');return next;
 }
 const template='section,code,title,credits,sourceUrl,requiredAtUniversity\nGeneral education,ENG101,EXAMPLE: Written communication,3,,no\nMajor requirements,BUS300,EXAMPLE: Major course,3,,no\nUniversity requirements,CAP400,EXAMPLE: University capstone,3,,yes\n';
 return Object.freeze({parseCSV,parseTable,create,createResearch,validateModel,validateEntry,reviewedFreeElectiveChoice,models,attach,commit,inheritEquivalencies,readDraft,saveDraft,launchURL,validatePrivateWork,template,limits:Object.freeze({maxEntries:MAX_ENTRIES,maxRows:MAX_ROWS,maxBytes:MAX_BYTES,maxDrafts:MAX_DRAFTS,maxDraftBytes:MAX_DRAFT_BYTES})});
}));
