/* Local source-record proposals. Parsing never creates a school evaluation. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeRecordImport=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_ROWS=500,MAX_TEXT=1500000,MAX_COLUMNS=80;
 const list=value=>Array.isArray(value)?value:[],text=value=>value==null?'':String(value).trim(),norm=value=>text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
 const fields=['provider','institution','code','title','credits','creditSystem','status','completedOn','grade','score'];
 const units=value=>({semester:'semester',semesters:'semester',semestercredit:'semester',semestercredits:'semester',semesterhour:'semester',semesterhours:'semester',sh:'semester',sch:'semester',quarter:'quarter',quarters:'quarter',quartercredit:'quarter',quartercredits:'quarter',quarterhour:'quarter',quarterhours:'quarter',qh:'quarter',competencyunit:'competency-unit',competencyunits:'competency-unit',competency:'competency-unit',cu:'competency-unit',cus:'competency-unit'}[norm(value)]||null);
 const statuses=value=>({earned:'earned',complete:'earned',completed:'earned',finished:'earned',passed:'earned',inprogress:'in-progress',taking:'in-progress',takingnow:'in-progress',ongoing:'in-progress',current:'in-progress',ip:'in-progress',planned:'planned',plan:'planned',proposed:'planned',notstarted:'planned',saved:'saved',interested:'saved',considering:'saved'}[norm(value)]||null);
 const aliases={
  provider:['provider','schoolprovider','providerschool','courseprovider','creditprovider','creditsource','sourceprovider','issuer'],
  institution:['institution','school','college','university','sourceinstitution','originalinstitution','institutionschool','schoolname','collegename'],
  code:['code','course','coursecode','courseid','coursenumber','courseno','classcode','catalognumber','catalogno','originalcourse','originalcoursecode','sourcecoursecode','subjectcoursenumber','subjno'],
  subject:['subject','subj','department','dept'],number:['number','no','catalog','catalognum'],
  title:['title','coursetitle','coursename','description','coursedescription','class','classname'],
  credits:['credits','credit','cred','cr','crhrs','credithours','creditsearned','earnedcredits','earnedhours','earnedhrs','earned','sourcecredits','originalcredits','sourcecredithours','sourcecreditquantity','units','hours','semestercredits','semesterhours','quartercredits','quarterhours','competencyunits'],
  attemptedCredits:['attempted','attemptedcredits','creditsattempted','attemptedhours','attemptedhrs','ahrs'],
  creditSystem:['creditsystem','creditunits','unitstype','unittype','unitsystem','semestorquarter','semesterorquarter','semesterquarter','sourcecreditsystem','originalcreditsystem','sourceunits'],
  status:['status','progress','coursestatus','completionstatus','courseprogress'],
  completedOn:['completedon','completiondate','datecompleted','completeddate','finishedon','datefinished','enddate','coursedate'],
  grade:['grade','grd','gr','finalgrade','lettergrade','coursegrade','sourcegrade','originalgrade'],score:['score','examscore','testscore','originalscore'],term:['term','semester','session','academicterm','year','academicyear']
 };
 const headerField=value=>{const key=norm(value);return Object.keys(aliases).find(field=>aliases[field].includes(key))||null;};
 function clone(value){if(Array.isArray(value))return value.map(clone);if(value instanceof Date)return new Date(value.getTime());if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value))Object.defineProperty(out,key,{value:clone(value[key]),enumerable:true,writable:true,configurable:true});return out;}return value;}
 function stable(value){if(value===undefined)return'u';if(value===null)return'n';if(value instanceof Date)return'd'+value.toISOString();if(Array.isArray(value))return'['+value.map(stable).join(',')+']';if(typeof value==='object')return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';return typeof value+':'+JSON.stringify(value);}
 const revision=records=>'record-import-v1:'+stable(list(records));
 const issue=(code,message,field='',severity='error')=>({code,message,field,severity});
 function kind(value){const key=norm(value);return['completedtranscript','transcript','officialtranscript','unofficialtranscript','academicrecord'].includes(key)?'completed-transcript':['degreeaudit','degreeplan','requirements','whatif','academicaudit'].includes(key)?'degree-audit':['courselist','spreadsheet','csv'].includes(key)?'course-list':'unknown';}
 function detectKind(raw,requested){if(/degree\s+(?:audit|plan|requirements)|academic\s+(?:audit|advising\s+report)|what[ -]?if\s+(?:audit|analysis)|requirements?\s+(?:remaining|not satisfied)/i.test(raw))return'degree-audit';return kind(requested)!=='unknown'?kind(requested):/(?:official|unofficial|academic|student)\s+transcript|transcript\s+of\s+(?:academic|college)/i.test(raw)?'completed-transcript':'unknown';}
 function day(value,options={}){
  if(value==null||value==='')return{value:''};
  if(value instanceof Date)return Number.isFinite(value.getTime())?{value:value.toISOString().slice(0,10)}:{value:'',error:'The spreadsheet contains an invalid date.'};
  const raw=text(value);let result='';
  if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)){const p=raw.split(/[-/]/);result=p[0]+'-'+p[1].padStart(2,'0')+'-'+p[2].padStart(2,'0');}
  else if(/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(raw)){const[a,b,y]=raw.split(/[/-]/).map(Number),order=options.dateOrder||(a>12?'dmy':b>12?'mdy':null);if(!order)return{value:'',error:'Choose the date order or enter this date as YYYY-MM-DD.'};result=y+'-'+String(order==='dmy'?b:a).padStart(2,'0')+'-'+String(order==='dmy'?a:b).padStart(2,'0');}
  else if(/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(raw)||/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(raw)){
   const parts=raw.replace(',','').split(/\s+/),monthFirst=/^[A-Za-z]/.test(parts[0]),name=(monthFirst?parts[0]:parts[1]).toLowerCase(),months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
   if(months[name])result=parts[2]+'-'+String(months[name]).padStart(2,'0')+'-'+String(monthFirst?parts[1]:parts[0]).padStart(2,'0');
  }
  else if(/^\d{4}$/.test(raw)||/^(?:spring|summer|fall|autumn|winter)\s+\d{4}$/i.test(raw))return{value:'',partial:raw};
  else return{value:'',error:typeof value==='number'?'Review the spreadsheet date format; a numeric date is not assumed to use a particular calendar.':'Use the original completion date in YYYY-MM-DD format, or leave it blank.'};
  const date=new Date(result+'T00:00:00Z');return result&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===result?{value:result}:{value:'',error:'Use a real calendar date.'};
 }
 function quantity(value){if(value==null||text(value)==='')return{value:null,unit:null};if(typeof value==='boolean')return{value:null,error:'Use a numeric source-credit amount.'};const match=text(value).match(/^(\d+(?:\.\d+)?)\s*(SH|SCH|QH|CU|CUs|semester(?:\s+(?:credits?|hours?))?|quarter(?:\s+(?:credits?|hours?))?|competency\s+units?)?$/i);if(!match)return{value:null,error:'Use one exact original credit amount; ranges and combined quantities need review.'};const amount=Number(match[1]);return Number.isFinite(amount)&&amount>0&&amount<=200?{value:amount,unit:units(match[2])}:{value:amount,error:amount===0?'This row reports no earned credit; keep it excluded from the credit import.':'Source credits must be greater than zero and no more than 200.'};}
 function summaryRow(values){const code=text(values.code||values.subject),title=text(values.title),label=(code+' '+title).trim();return /^(?:cumulative|term|semester|session|overall|institution|transfer|program|degree|career|grand)?\s*(?:total(?:s|\s+(?:credits|hours|units))?|gpa|grade point average|quality points|academic standing)(?:\s|:|$)/i.test(label)||/^(?:(?:cumulative|term|semester|session|overall|institution|grand)\s+)?(?:transfer\s+(?:credit|credits|summary)|credits?\s+(?:attempted|earned)|attempted\s+(?:credits|hours)|earned\s+(?:credits|hours))\s*[:\d.]*$/i.test(label);}
 function codeCount(value){return(text(value).match(/\b(?:SOPH|SDCM|OOSL|CLEP|DSST)-\d{4}\b|\b[A-Z]{1,8}[ -]?\d{2,5}[A-Z]{0,2}\b/gi)||[]).length;}
 function originalFields(input){const out={};for(const field of fields)if(own(input,field))out[field]=input[field];return out;}
 function validateRecord(input,context={}){
  const raw=originalFields(input||{}),record={provider:text(raw.provider),institution:text(raw.institution),code:text(raw.code),title:text(raw.title),credits:raw.credits==null||raw.credits===''?null:raw.credits,creditSystem:raw.creditSystem==null||raw.creditSystem===''?null:raw.creditSystem,status:raw.status||null,completedOn:raw.completedOn==null?'':raw.completedOn,grade:raw.grade==null?'':text(raw.grade).toUpperCase(),score:raw.score==null||raw.score===''?null:raw.score,evaluations:[]},issues=[];
  for(const[field,max]of[['provider',120],['institution',120],['code',100],['title',160]])if(record[field].length>max)issues.push(issue('field-too-long','Shorten the '+field+' shown in the course record; the original text remains in the preview.',field));
  if(!record.provider)issues.push(issue('provider-required','Choose the original course provider or college.','provider'));
  if(!record.title)issues.push(issue('title-required','Add the course title from the original record.','title'));
  if(!record.code)issues.push(issue('code-unknown','Course code is unknown; this record will need an exact identity before automatic degree matching.','code','warning'));
  if(record.credits!==null&&(typeof record.credits!=='number'||!Number.isFinite(record.credits)||record.credits<=0||record.credits>200))issues.push(issue('invalid-credits','Use a positive original credit amount, or leave it unknown.','credits'));
  if(record.credits===null)issues.push(issue('credits-unknown','Original source credits remain unknown; no credit quantity will be invented.','credits','warning'));
  if(record.creditSystem!==null&&!['semester','quarter','competency-unit'].includes(record.creditSystem))issues.push(issue('invalid-credit-system','Choose semester credits, quarter credits or competency units, or leave the units unknown.','creditSystem'));
  if(record.creditSystem===null)issues.push(issue('units-unknown','Original credit units remain unknown.','creditSystem','warning'));
  if(!['earned','in-progress','planned','saved'].includes(record.status))issues.push(issue('status-required','Choose whether this course is finished, in progress or planned.','status'));
  const checkedDate=day(record.completedOn,context);record.completedOn=checkedDate.value;if(checkedDate.error)issues.push(issue('invalid-date',checkedDate.error,'completedOn'));if(checkedDate.partial)issues.push(issue('partial-date','The printed term/year is retained; an exact completion date has not been guessed.','completedOn','warning'));
  if(record.grade&&!/^(?:[ABCDF][+-]?|P|PASS|S|W|WF|I|INCOMPLETE)$/.test(record.grade))issues.push(issue('grade-needs-review','Keep the original grade visible and review its format; no grade conversion is assumed.','grade'));
  if(['F','W','WF'].includes(record.grade))issues.push(issue('no-earned-credit','This failed or withdrawn attempt must not be imported as positive earned credit.','grade'));
  if(['I','INCOMPLETE'].includes(record.grade)&&record.status==='earned')issues.push(issue('incomplete-course','An incomplete course cannot be marked finished.','status'));
  if(record.score!==null&&(typeof record.score!=='number'||!Number.isFinite(record.score)||record.score<0||record.score>1000))issues.push(issue('invalid-score','Use the original numeric exam score, or leave it blank.','score'));
  if(codeCount(record.code)>1||/[;,|]|\s(?:and|or)\s/i.test(record.code)||/\//.test(record.code)||codeCount(record.code+' '+record.title)>1)issues.push(issue('combined-courses','This row may combine more than one course. Separate the original course records before importing.','code'));
  if(/\b(?:repeat(?:ed)?\s*(?:excluded|credit|summary)?|transfer\s+summary|credit\s+summary|duplicate\s+credit|excluded\s+credit)\b/i.test(record.title))issues.push(issue('repeat-transfer-ambiguity','A repeat or transfer summary is not an unambiguous original course record.','title'));
  if(summaryRow(record))issues.push(issue('summary-row','Totals, GPA and summary lines are not courses.','title'));
  if(context.documentKind==='degree-audit'&&record.status==='earned')issues.push(issue('audit-not-completion','A degree audit or plan does not establish original course completion.','status'));
  return{record,issues:issues.map(item=>({...item,origin:'validation'}))};
 }
 function makeRow(values,source,context={},index=0){
  const raw={...values},issues=[],documentKind=context.documentKind||'unknown';
  const amount=quantity(raw.credits),explicitUnits=units(raw.creditSystem),headerUnits=source.headerUnits||null,defaultUnits=units(context.creditSystem);
  if(amount.error)issues.push(issue('source-quantity-review',amount.error,'credits'));
  if(text(raw.creditSystem)&&!explicitUnits)issues.push(issue('unknown-credit-label','The printed unit label is not enough to establish semester, quarter or competency units.','creditSystem','warning'));
  if(amount.unit&&explicitUnits&&amount.unit!==explicitUnits)issues.push(issue('conflicting-units','The credit amount and unit column disagree. Review the original row.','creditSystem'));
  let creditSystem=explicitUnits||amount.unit||headerUnits||defaultUnits||null,credits=amount.value;
  const parsedDate=day(raw.completedOn,context);if(parsedDate.error)issues.push(issue('invalid-date',parsedDate.error,'completedOn'));if(parsedDate.partial)source={...source,term:source.term||parsedDate.partial};
  const grade=text(raw.grade).toUpperCase(),providedStatus=statuses(raw.status),defaultStatus=statuses(context.defaultStatus);
  let sourceCode=text(raw.code)||(text(raw.subject)&&text(raw.number)?text(raw.subject)+' '+text(raw.number):'');
  let status=text(raw.status)?providedStatus:defaultStatus;
  if(!text(raw.status)&&!status&&documentKind==='completed-transcript'&&/^(?:[ABCD][+-]?|P|PASS|S)$/.test(grade)&&!source.transferSection)status='earned';
  if(!text(raw.status)&&!status&&['I','INCOMPLETE','IP','IN PROGRESS'].includes(grade))status='in-progress';
  if(documentKind==='degree-audit'){
   status='planned';
   if(!source.explicitSourceCredits)credits=null;
   if(!source.explicitSourceUnits)creditSystem=null;
   issues.push(issue('audit-planning-only','These are planning rows. Printed degree-award quantities do not establish original source credits or completed learning.','','warning'));
  }
  if(source.transferSection||/^(?:T|TR|TA|TB|TC|TD|TE|TRANSFER)$/.test(grade)){
   source={...source,isTransfer:true,awardedCode:sourceCode,awardedCredits:amount.value,awardedCreditSystem:explicitUnits||amount.unit||headerUnits||null,awardedGrade:grade};
   if(!source.explicitSourceCode)sourceCode='';if(!source.explicitSourceCredits)credits=null;if(!source.explicitSourceUnits)creditSystem=null;
   if(documentKind!=='degree-audit')status=null;
   issues.push(issue('receiving-transfer-row','This is a receiving-school transfer award or summary. Upload the original school or provider record; its code, credits and units are not inferred from this award.','grade'));
  }
  if(own(raw,'attemptedCredits')&&!own(raw,'credits'))issues.push(issue('attempted-not-earned','Attempted hours are retained in the source row, not substituted for earned source credits.','credits','warning'));
  if(source.partial)issues.push(issue('partial-reading','This course-shaped line was only partly read. Review its original line and the proposed fields.','','warning'));
  const provider=text(raw.provider)||text(context.provider)||(text(raw.institution)||text(context.institution)?'University':'');
  const institution=text(raw.institution)||(providerKey(provider)==='university'?text(context.institution):'');
  const score=text(raw.score)===''?null:/^\d+(?:\.\d+)?$/.test(text(raw.score))?Number(raw.score):raw.score;
  if(text(raw.subject)&&/^\d{2,5}[A-Za-z]{0,3}$/.test(sourceCode))sourceCode=text(raw.subject)+' '+sourceCode;
  const checked=validateRecord({provider,institution,code:sourceCode,title:raw.title,credits,creditSystem,status,completedOn:parsedDate.value,grade,score},context);
  if(parsedDate.partial&&!issues.some(item=>item.code==='partial-date'))issues.push(issue('partial-date','The printed term/year is retained; no exact completion date is assumed.','completedOn','warning'));
  if(context.extraction==='ai'||raw.requiresReview===true)issues.push(issue('assisted-reading','Review this extracted row against the original document before adding it.','','warning'));
  for(const warning of list(raw.warnings).filter(value=>typeof value==='string'))issues.push(issue('source-warning',warning.slice(0,300),'','warning'));
  const all=[...issues.map(item=>({...item,origin:'parser'})),...checked.issues];
  const unique=[...new Map(all.map(item=>[item.code+'|'+item.field+'|'+item.message,item])).values()];
  return{id:'import-row-'+(index+1),record:checked.record,issues:unique,source:{...source,rawValues:clone(raw)},selected:!unique.some(item=>item.severity==='error'),documentKind};
 }
 function counts(rows){return{rows:rows.length,selected:rows.filter(row=>row.selected).length,needsAttention:rows.filter(row=>row.issues.some(item=>item.severity==='error')).length,warnings:rows.filter(row=>row.issues.some(item=>item.severity==='warning')).length};}
 function batch(rows,documentKind,issues=[],extra={}){return{version:1,documentKind,rows,issues,counts:counts(rows),...extra};}
 function headerInfo(headers,data=[]){
  const mapping=headers.map(headerField),issues=[];
  for(let i=0;i<headers.length;i++)if(norm(headers[i])==='units'&&data.slice(0,10).some(row=>text(row[i]))&&data.slice(0,10).filter(row=>text(row[i])).every(row=>units(row[i])))mapping[i]='creditSystem';
  for(const field of ['credits','code','grade']){
   const indexes=mapping.map((value,index)=>value===field?index:-1).filter(index=>index>=0);
   if(indexes.length<2)continue;
   const priority=index=>/^(?:original|source)/.test(norm(headers[index]))?3:field==='credits'&&/earned/.test(norm(headers[index]))?2:1;
   const best=Math.max(...indexes.map(priority)),preferred=indexes.filter(index=>priority(index)===best);
   if(preferred.length===1)for(const index of indexes)if(index!==preferred[0])mapping[index]=null;
  }
  const targets=mapping.filter(Boolean);for(const field of new Set(targets))if(targets.filter(value=>value===field).length>1)issues.push(issue('duplicate-column','More than one column maps to '+field+'. Choose one original-source column.',field));
  return{mapping,issues,headerUnits:headers.map(value=>/semester/i.test(text(value))&&headerField(value)==='credits'?'semester':/quarter/i.test(text(value))&&headerField(value)==='credits'?'quarter':/competency/i.test(text(value))&&headerField(value)==='credits'?'competency-unit':null).find(Boolean)||null,explicitSourceCredits:headers.some(value=>/^(?:source|original)credits?|^(?:source|original)\s+credits?/i.test(text(value))),explicitSourceUnits:headers.some(value=>/^(?:source|original)(?:creditsystem|units)|^(?:source|original)\s+(?:credit\s*)?(?:units|system)/i.test(text(value))),explicitSourceCode:headers.some(value=>/^(?:source|original)(?:coursecode|course)|^(?:source|original)\s+course/i.test(text(value)))};
 }
 function headerCandidate(row){const mapped=row.map(headerField);return mapped.filter(Boolean).length>=2&&(mapped.includes('title')||mapped.includes('code')||mapped.includes('subject')&&mapped.includes('number'));}
 function fromRows(input,options={}){
  if(!Array.isArray(input))throw new TypeError('Pass spreadsheet rows as an array.');if(input.length>MAX_ROWS+30)throw new RangeError('Import at most 500 course rows at a time.');
  if(input.some(row=>row&&typeof row==='object'&&!Array.isArray(row)&&!(row instanceof Date)))return fromRecords(input,options);
  const rows=input.map(row=>Array.isArray(row)?row:[row]),sourceText=rows.slice(0,25).map(row=>row.map(text).join(' ')).join('\n'),documentKind=detectKind(sourceText,options.documentKind),header=options.headers? -1:rows.findIndex((row,index)=>index<25&&headerCandidate(row));
  if(header<0&&!options.headers)return batch([],documentKind,[issue('headers-not-found','Choose or add column labels for course code, title, original credits and progress.')]);
  const headers=options.headers||rows[header],data=options.headers?rows:rows.slice(header+1);if(headers.length>MAX_COLUMNS)throw new RangeError('Use at most 80 columns.');
  const info=headerInfo(headers,data),out=[],issues=[...info.issues];let ignored=0;
  for(let index=0;index<data.length;index++){
   const cells=data[index];if(!cells.some(value=>text(value)))continue;if(headerCandidate(cells)){ignored++;continue;}
   const values={};info.mapping.forEach((field,i)=>{if(field&&i<cells.length)values[field]=cells[i];});
   if(summaryRow(values)){ignored++;continue;}
   if(!text(values.code)&&!text(values.title)&&!text(values.subject)){ignored++;continue;}
   const source={format:options.format||'spreadsheet',name:options.sourceName||'',sheet:options.sheetName||'',row:index+(options.headers?1:header+2),rawCells:clone(cells),rawLine:cells.map(text).join('\t'),headerUnits:info.headerUnits,explicitSourceCredits:info.explicitSourceCredits,explicitSourceUnits:info.explicitSourceUnits,explicitSourceCode:info.explicitSourceCode,term:text(values.term)};
   const row=makeRow(values,source,{...options,documentKind},out.length);
   if(info.issues.length){row.issues.push(...info.issues.map(item=>({...item,origin:'parser'})));row.selected=false;}
   if(cells.length>headers.length){row.issues.push({...issue('column-count','This row contains more values than the header labels. Review the original columns.'),origin:'parser'});row.selected=false;}
   out.push(row);if(out.length>MAX_ROWS)throw new RangeError('Import at most 500 course rows at a time.');
  }
  if(!out.length)issues.push(issue('no-courses','No course rows were found below the column labels.'));
  return batch(out,documentKind,issues,{ignoredRows:ignored,headers:headers.map(text)});
 }
 function fromRecords(input,options={}){
  if(!Array.isArray(input)||input.length>MAX_ROWS)throw new RangeError('Import at most 500 course rows at a time.');
  const documentKind=detectKind('',options.documentKind),out=[];let ignored=0;
  for(const raw of input){if(!raw||typeof raw!=='object'||Array.isArray(raw)){ignored++;continue;}const values={},keys=Object.keys(raw),info=headerInfo(keys,[keys.map(key=>raw[key])]);info.mapping.forEach((field,index)=>{if(field)values[field]=raw[keys[index]];});
   if(summaryRow(values)){ignored++;continue;}
   const source={format:options.format||'records',name:options.sourceName||'',sheet:options.sheetName||'',row:out.length+1,page:Number.isInteger(raw.page)&&raw.page>0?raw.page:null,rawLine:text(raw.sourceText||raw.rawLine),term:text(raw.term||raw.year),transferSection:raw.isTransfer===true||/transfer\s+(?:credits?\s+awarded|summary|work\s+accepted)/i.test(text(raw.sourceText)),explicitSourceCredits:keys.some(key=>/^(?:source|original)credits?/i.test(key)),explicitSourceUnits:keys.some(key=>/^(?:source|original)(?:creditsystem|units)/i.test(key)),explicitSourceCode:keys.some(key=>/^(?:source|original)coursecode/i.test(key))};
   values.requiresReview=raw.requiresReview;values.warnings=raw.warnings;
   const row=makeRow(values,source,{...options,documentKind},out.length);if(info.issues.length){row.issues.push(...info.issues.map(item=>({...item,origin:'parser'})));row.selected=false;}out.push(row);
  }
  return batch(out,documentKind,out.length?[]:[issue('no-courses','No course rows were found.')],{ignoredRows:ignored});
 }
 function csvCells(raw){
  if(typeof raw!=='string'||raw.length>MAX_TEXT)throw new RangeError('Use a CSV smaller than 1.5 million characters.');
  const sample=raw.split(/\r?\n/,1)[0],delimiter=sample.includes('\t')&&!sample.includes(',')?'\t':sample.includes(';')&&!sample.includes(',')?';':',',rows=[];let cells=[],cell='',quoted=false,closed=false;
  for(let i=0;i<raw.length;i++){const char=raw[i];if(quoted){if(char==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=char;continue;}if(char==='"'){if(cell.trim()||closed)throw new Error('A CSV quote must start a field.');quoted=true;continue;}if(char===delimiter||char==='\n'||char==='\r'){cells.push(cell);cell='';closed=false;if(char!==delimiter){if(char==='\r'&&raw[i+1]==='\n')i++;rows.push(cells);cells=[];}}else{if(closed&&!/\s/.test(char))throw new Error('Separate quoted values with a column delimiter.');if(!closed)cell+=char;}}
  if(quoted)throw new Error('A quoted CSV value is unfinished.');cells.push(cell);if(cells.some(value=>text(value)))rows.push(cells);if(rows[0]?.[0])rows[0][0]=rows[0][0].replace(/^\uFEFF/,'');return rows;
 }
 const parseCSV=(raw,options={})=>fromRows(csvCells(raw),{...options,format:'csv'});
 function parseTranscript(input,options={}){
  const pages=typeof input==='string'?[{page:1,text:input}]:list(input).map((page,index)=>typeof page==='string'?{page:index+1,text:page}:page),raw=pages.map(page=>text(page?.text)||list(page?.lines).join('\n')).join('\n');
  if(raw.length>MAX_TEXT)throw new RangeError('Review a transcript section smaller than 1.5 million characters.');
  const documentKind=detectKind(raw,options.documentKind),out=[],issues=[];let ignored=0,partial=0,transferSection=false,term='',unit=null,table=null;
  if(!raw.trim())return batch([],documentKind,[issue('no-readable-text','No native PDF text was found. A scanned or encrypted document needs a different reading method.')],{partialReading:true});
  const provider=options.provider||(/\bSophia(?:\s+Learning)?\b/i.test(raw)?'Sophia':/\bStudy\.com\b/i.test(raw)?'Study.com':/\bCLEP\b|College.Level Examination/i.test(raw)?'CLEP':'');
  const codePattern='([A-Z][A-Z&]{0,9}\\s*-?\\s*\\d{2,5}[A-Z]{0,3})';
  const gradePattern='([ABCDF][+-]?|PASS|P|S|W|WF|I|IP|INCOMPLETE|TR|T)';
  const direct=new RegExp('^\\s*'+codePattern+'\\s+(.+?)\\s+(\\d{1,3}(?:\\.\\d{1,3})?)\\s*'+ '(SH|SCH|QH|CU|CUs)?' +'\\s+'+gradePattern+'\\s*$','i');
  const reversed=new RegExp('^\\s*'+codePattern+'\\s+(.+?)\\s+'+gradePattern+'\\s+(\\d{1,3}(?:\\.\\d{1,3})?)\\s*(SH|SCH|QH|CU|CUs)?\\s*$','i');
  const shaped=new RegExp('^\\s*'+codePattern+'\\s+(.+)$','i');
  for(let p=0;p<pages.length;p++){
   const page=pages[p],lines=Array.isArray(page.lines)?page.lines.map(value=>typeof value==='string'?value:text(value?.text||value?.str)):text(page.text).split(/\r?\n/);
   for(let line=0;line<lines.length;line++){
    const rawLine=lines[line];let value=rawLine.trim();if(!value){ignored++;continue;}
    const termLine=value.match(/^((?:fall|spring|summer|winter|autumn)\s+\d{4}|\d{4}\s+(?:fall|spring|summer|winter|autumn))(.*)$/i);
    if(termLine){term=termLine[1];value=termLine[2].trim();if(!value||/^(?:term|semester|gpa|academic|credits|total)/i.test(value)){ignored++;continue;}}
    if(!shaped.test(value)){if(/semester\s+(?:credit|hour)|credit\s+system\s*:?\s*semester/i.test(value))unit='semester';else if(/quarter\s+(?:credit|hour)|credit\s+system\s*:?\s*quarter/i.test(value))unit='quarter';else if(/competency\s+units?|credit\s+system\s*:?\s*CU\b/i.test(value))unit='competency-unit';}
    if(/^(?:transfer\s+(?:credit|work|courses)|external\s+credit)/i.test(value))transferSection=true;
    if(/^(?:institution(?:al)?\s+credit|resident\s+credit|courses\s+taken)/i.test(value))transferSection=false;
    const cells=value.split(/\t|\s*\|\s*| {2,}/).map(text);
    if(headerCandidate(cells)){const info=headerInfo(cells);if(info.issues.length){issues.push(...info.issues);table=null;}else table={headers:cells,...info};ignored++;continue;}
    let values=null,part=false;
    if(table&&cells.length>=2){const candidate={};table.mapping.forEach((field,index)=>{if(field&&index<cells.length)candidate[field]=cells[index];});if(text(candidate.code)||text(candidate.subject)&&text(candidate.number))values=candidate;}
    if(!values){let match=value.match(direct);if(match){values={code:match[1],title:match[2],credits:match[3]+(match[4]?' '+match[4]:''),grade:match[5]};}else if((match=value.match(reversed))){values={code:match[1],title:match[2],grade:match[3],credits:match[4]+(match[5]?' '+match[5]:'')};}else if((match=value.match(shaped))){values={code:match[1],title:match[2]};part=true;}
     if(values&&/(?:^|\s)\d+(?:\.\d+)?\s*$/.test(text(values.title))&&(match=value.match(shaped))){values={code:match[1],title:match[2]};part=true;}
    }
    if(!values||summaryRow(values)){ignored++;continue;}
    if(part)partial++;
    const source={format:'pdf-text',name:options.sourceName||'',page:Number.isInteger(page.page)?page.page:Number.isInteger(page.pageNumber)?page.pageNumber:p+1,line:line+1,rawLine,term:text(values.term)||term,transferSection,partial:part,headerUnits:table?.headerUnits||unit,explicitSourceCredits:table?.explicitSourceCredits||false,explicitSourceUnits:table?.explicitSourceUnits||false,explicitSourceCode:table?.explicitSourceCode||false};
    out.push(makeRow(values,source,{...options,provider,documentKind},out.length));if(out.length>MAX_ROWS)throw new RangeError('Review at most 500 course rows at a time.');
   }
  }
  if(partial)issues.push(issue('partial-reading',partial+' course-shaped line'+(partial===1?' was':'s were')+' only partly read. Review the highlighted rows.','','warning'));
  if(!out.length)issues.push(issue('no-courses','Readable text was found, but no unambiguous course rows were identified. Review the layout or use a spreadsheet.'));
  return batch(out,documentKind,issues,{ignoredLines:ignored,partialReading:partial>0||!out.length});
 }
 function validateRows(rows,options={}){
  return list(rows).map((row,index)=>{const documentKind=row.documentKind||options.documentKind||'unknown',value={...(row.record||row)};
   if(!text(value.provider)&&text(options.provider))value.provider=options.provider;
   if(!text(value.institution)&&providerKey(value.provider)==='university'&&text(options.institution))value.institution=options.institution;
   if(value.creditSystem==null&&units(options.creditSystem))value.creditSystem=units(options.creditSystem);
   if(!value.status&&statuses(options.defaultStatus))value.status=statuses(options.defaultStatus);
   const checked=validateRecord(value,{...options,documentKind}),preserved=list(row.issues).filter(item=>item.origin==='parser'||['receiving-transfer-row','column-count','duplicate-column'].includes(item.code));
   if((row.source?.isTransfer||row.source?.transferSection)&&!preserved.some(item=>item.code==='receiving-transfer-row'))preserved.push({...issue('receiving-transfer-row','This is a receiving-school transfer award. Upload the original school or provider record.','grade'),origin:'parser'});
   const issues=[...new Map([...preserved,...checked.issues].map(item=>[item.code+'|'+item.field+'|'+item.message,item])).values()];return{...clone(row),id:row.id||'import-row-'+(index+1),record:checked.record,documentKind,issues,selected:row.selected!==false&&!issues.some(item=>item.severity==='error')};});
 }
 const providerKey=value=>({sophialearning:'sophia',studycom:'studycom',collegelevelexaminationprogram:'clep'}[norm(value)]||norm(value));
 const identity=record=>providerKey(record.provider)+'|'+norm(record.institution)+'|'+(norm(record.code)||'title:'+norm(record.title));
 const detail=record=>stable(Object.fromEntries(fields.map(field=>[field,record[field]==null?'':record[field]])));
 function hash(value){let out=2166136261;for(let i=0;i<value.length;i++){out^=value.charCodeAt(i);out=Math.imul(out,16777619);}return(out>>>0).toString(16).padStart(8,'0');}
 function prepareImport(existingLearning,selectedRows){
  if(!Array.isArray(existingLearning)||!Array.isArray(selectedRows)||selectedRows.length>MAX_ROWS)throw new TypeError('Review between 1 and 500 selected course rows.');
  const requested=selectedRows.filter(row=>row.selected!==false),baseRevision=revision(existingLearning),rows=validateRows(requested),issues=[],conflicts=[],duplicates=[],additions=[],records=clone(existingLearning),seen=new Map(),ids=new Set(existingLearning.map(record=>record.id));
  for(const row of rows){if(row.selected===false){if(row.issues.some(item=>item.severity==='error'))issues.push(...row.issues.filter(item=>item.severity==='error').map(item=>({...item,rowId:row.id})));continue;}const errors=row.issues.filter(item=>item.severity==='error');if(errors.length){issues.push(...errors.map(item=>({...item,rowId:row.id})));continue;}
   const value=row.record,key=identity(value),prior=[...existingLearning,...additions].filter(record=>identity(record)===key),exact=prior.find(record=>detail(record)===detail(value));
   if(exact){duplicates.push({rowId:row.id,existingId:exact.id,reason:'The original source facts are already saved.'});continue;}
   if(prior.length||seen.has(key)){conflicts.push({rowId:row.id,existingIds:prior.map(record=>record.id),record:clone(value),reason:'This source identity already has different facts. The saved record and its evaluations have not been changed.'});continue;}
   let id='import-'+hash(key+'|'+detail(value)),suffix=1;while(ids.has(id))id='import-'+hash(key+'|'+detail(value))+'-'+(++suffix);ids.add(id);
   const record={...originalFields(value),id,evaluations:[],codeBasis:value.code?'student-record':'not-yet-known',creditBasis:value.credits!==null?'student-record':'not-yet-known',importProvenance:{format:row.source?.format||'reviewed-import',name:text(row.source?.name).slice(0,200),page:row.source?.page||null,row:row.source?.row||null,line:row.source?.line||null,term:text(row.source?.term).slice(0,120),sourceText:text(row.source?.rawLine).slice(0,2000),reviewed:true}};
   additions.push(record);seen.set(key,record);
  }
  if(!requested.length)issues.push(issue('nothing-selected','Select at least one course row to add.'));
  const ok=!issues.length&&!conflicts.length;if(ok)records.push(...additions);
  return{ok,baseRevision,proposalRevision:stable(rows),rows:clone(rows),records:ok?records:clone(existingLearning),additions:ok?additions:[],duplicates,conflicts,issues,counts:{selected:requested.length,added:ok?additions.length:0,duplicates:duplicates.length,conflicts:conflicts.length,errors:issues.length}};
 }
 function commit(state,prepared,options={}){
  const learning=list(state?.learning),current=revision(learning),issues=[];
  if(options.reviewed!==true)issues.push(issue('review-required','Review the proposed course rows before adding them.'));
  if(!prepared||prepared.ok!==true)issues.push(issue('import-not-ready','Resolve the selected rows and conflicts before adding courses.'));
  if(typeof options.expectedRevision!=='string'||options.expectedRevision!==prepared?.baseRevision||current!==prepared?.baseRevision)issues.push(issue('stale-preview','Your saved course collection changed. Review the import against the latest records.'));
  if(!Array.isArray(prepared?.rows)||stable(prepared.rows)!==prepared.proposalRevision)issues.push(issue('changed-proposals','The proposed rows changed after preparation. Review the current rows again.'));
  if(issues.length)return{ok:false,state:clone(state),issues,counts:prepared?.counts||{added:0}};
  const checked=prepareImport(learning,prepared.rows);if(!checked.ok)return{ok:false,state:clone(state),issues:checked.issues,counts:checked.counts};
  const next=clone(state);next.learning=checked.records;if(next.learning.some(record=>record.status==='earned'))next.profile={...(next.profile||{}),hasPrior:next.profile?.hasPrior==='degree'?'degree':'some'};
  return{ok:true,state:next,issues:[],counts:checked.counts};
 }
 return Object.freeze({parseCSV,fromRows,fromRecords,parseTranscript,validateRows,validateRecord,prepareImport,commit,revision});
}));
