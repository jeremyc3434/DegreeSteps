(function(){
'use strict';
const E=window.DegreeTemplateImport,W=window.DegreeTemplateImportWorkflow,$=id=>document.getElementById(id),form=$('ti-form');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let file=null,result=null,parsed=null,worker=null,workerReject=null,timeout=null,epoch=0,busy=false,registryPromise=null,draftId='';
const say=value=>$('ti-status').textContent=value;
function fail(error){$('ti-error').textContent=error.message||String(error);$('ti-error').hidden=false;}
function clearError(){$('ti-error').hidden=true;$('ti-error').textContent='';}
function setBusy(value){busy=value;for(const id of ['ti-review','ti-continue','ti-download','ti-sheet'])$(id).disabled=value;}
function stop(){epoch++;clearTimeout(timeout);worker?.terminate();worker=null;workerReject?.(Object.assign(Error('Reading cancelled.'),{cancelled:true}));workerReject=null;}
function values(){return Object.fromEntries(new FormData(form));}
function selectedTotal(){return(parsed?.rows||[]).filter(r=>r.selected!==false).reduce((sum,r)=>sum+r.credits,0);}
function renderRows(){
 $('ti-rows').innerHTML=parsed.rows.map(row=>'<tr><td><input type="checkbox" data-row="'+esc(row.id)+'" aria-label="Keep '+esc(row.code||row.title)+'"'+(row.selected?' checked':'')+'></td><td><strong>'+esc(row.title)+'</strong><span class="ti-code">'+esc(row.code||'No course code')+' · '+esc(row.section)+'</span>'+row.issues.map(x=>'<span class="ti-row-note">'+esc(x)+'</span>').join('')+'</td><td>'+row.credits+'</td><td>'+row.alternatives.map(a=>'<p class="ti-option">'+esc(a.provider)+': '+esc(a.text)+'<span>'+(a.logic==='sequence'?'Sequence to review':a.logic==='bundle'?'Course bundle to review':a.logic==='one-of'?'Alternative choices':'Proposed match')+'</span></p>').join('')+row.credentials.map(c=>'<p class="ti-option">'+esc(c.text)+'<span>Credential suggestion · transfer eligibility not established</span></p>').join('')+(!row.alternatives.length&&!row.credentials.length?'—':'')+'</td></tr>').join('');
 updateCount();
}
function updateCount(){const kept=parsed.rows.filter(r=>r.selected!==false).length;$('ti-count').textContent=kept+' selected requirements · '+selectedTotal()+' total '+(form.elements.creditSystem.value==='competency-unit'?'competency units':'credits');if(kept!==parsed.rows.length)$('ti-match').hidden=true;$('ti-confirm').checked=false;}
function readExcel(input,sheet){return new Promise((resolve,reject)=>{
 worker=new Worker('template-import-worker.js');workerReject=reject;const id=epoch;
 const finish=()=>{clearTimeout(timeout);worker?.terminate();worker=null;workerReject=null;};
 timeout=setTimeout(()=>{finish();reject(Error('This workbook took too long to read. Save just the degree tabs in a smaller file and try again.'));},30000);
 worker.onmessage=event=>{if(event.data?.id!==id)return;finish();event.data.ok?resolve(event.data.value):reject(Error(event.data.error));};
 worker.onerror=event=>{event.preventDefault?.();finish();reject(Error('The local Excel reader could not load. Reload this page or export the degree tab as CSV.'));};
 worker.postMessage({id,buffer:input,sheet},[input]);
 });}
async function readFile(sheet){
 stop();const ticket=epoch;clearError();setBusy(true);say('Reading your spreadsheet in this browser…');
 try{
  if(!file||file.size>E.limits.maxBytes)throw Error('Choose a plan workbook smaller than 10 MB.');
  let next;if(/\.xlsx$/i.test(file.name)){if(typeof Worker!=='function')throw Error('This browser cannot read Excel locally. Use a current browser or export the degree tab as CSV.');const bytes=await file.arrayBuffer();if(ticket!==epoch)return;if(bytes.byteLength>E.limits.maxBytes)throw Error('Choose a file smaller than 10 MB.');next=await readExcel(bytes,sheet);}
  else if(/\.(?:csv|tsv)$/i.test(file.name)){const text=await file.text();if(ticket!==epoch)return;const p=E.parseDelimited(text,{sheetName:file.name.replace(/\.[^.]+$/,''),fileName:file.name});next={sheets:[{index:0,name:p.sheetName,hidden:false,requirements:p.rows.length,totalCredits:p.totalCredits}],selectedSheet:{index:0,name:p.sheetName},parsed:p};}
  else throw Error('Choose an Excel .xlsx, CSV or TSV file.');
  if(ticket!==epoch)return;result=next;parsed={...next.parsed,fileName:file.name};
  $('ti-sheet').innerHTML=next.sheets.filter(s=>!s.hidden).map(s=>'<option value="'+s.index+'"'+(s.index===next.selectedSheet.index?' selected':'')+(s.requirements?'':' disabled')+'>'+esc(s.name)+(s.requirements?' · '+s.requirements+' requirements':' · no requirement table')+'</option>').join('');
  $('ti-sheet-panel').hidden=false;$('ti-review-panel').hidden=true;$('ti-sheet-help').textContent=next.sheets.filter(s=>!s.hidden&&s.requirements).length+' degree tabs found. Choose the one you want to use.';say('Spreadsheet ready. Nothing has been saved.');
  if(!parsed.rows.length)throw Error('No requirements were found. Choose a degree sheet with course names and credit amounts.');
 }catch(error){if(ticket===epoch&&!error.cancelled){fail(error);say('Nothing has been saved.');}}
 finally{if(ticket===epoch)setBusy(false);}
}
async function publicJSON(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(path,{credentials:'omit',redirect:'error',signal:controller.signal});return response.ok?await response.json():null;}catch{return null;}finally{clearTimeout(timer);}}
async function registry(){if(!registryPromise)registryPromise=publicJSON('data/curriculum-registry.json');return registryPromise;}
async function findMatch(ticket){
 const index=await registry();if(ticket!==epoch||!index?.models)return null;
 const names=parsed.sheetName.toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(w=>w.length>3&&!['bachelor','science','degree','university','track'].includes(w));
 const candidates=index.models.filter(m=>m.school===parsed.metadata.school&&names.some(w=>m.title.toLowerCase().includes(w))),paths=[...new Set(candidates.map(m=>m.path))].filter(p=>/^data\/curricula\/[a-z0-9-]+\.json$/.test(p)).slice(0,4);
 const documents=await Promise.all(paths.map(publicJSON));if(ticket!==epoch)return null;
 const models=documents.flatMap(d=>d?.models||(d?.requirements?[d]:[])),matches=E.exactModelMatches(parsed,models);return matches.length===1?matches[0]:null;
}
function fill(metadata){for(const[name,value]of Object.entries(metadata))if(form.elements[name]&&value!==undefined&&value!==null)form.elements[name].value=String(value);}
async function review(){
 if(busy||!parsed?.rows.length)return;clearError();setBusy(true);const ticket=epoch;
 try{
  form.reset();draftId='workbook-import-'+(crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));fill({...parsed.metadata,programId:draftId});
  $('ti-match').hidden=true;say('Checking the requirement rows against the current degree library…');
  const match=await findMatch(ticket);if(ticket!==epoch)return;
  if(match){const sourceUrl=E.safeURL(match.sources?.find(s=>s.kind==='university'||s.evidenceType?.startsWith('official-university'))?.url)||E.safeURL(match.pricing?.sourceUrl);fill({school:match.school,title:match.title,level:match.level,creditSystem:match.creditSystem,modality:match.format==='Online'?'online':match.format==='Residential'?'campus':'',totalCredits:match.totalCredits,catalog:match.catalog,sourceUrl});parsed=E.bindMatchingModel(parsed,match,{sourceUrl});$('ti-match').textContent=parsed.rows.length+' requirement codes and credit amounts match '+match.title+' ('+match.catalog+'). The spreadsheet’s outside-course suggestions are still proposed.';$('ti-match').hidden=false;}
  $('ti-issues').hidden=!parsed.issues.length;$('ti-issue-list').innerHTML=parsed.issues.slice(0,30).map(x=>'<li>'+esc(x)+'</li>').join('');renderRows();$('ti-sheet-panel').hidden=true;$('ti-review-panel').hidden=false;say('Review the requirements, then continue to edit your own copy.');$('ti-review-panel').scrollIntoView?.({block:'start'});
 }catch(error){fail(error);}finally{if(ticket===epoch)setBusy(false);}
}
$('ti-file').addEventListener('change',event=>{const chosen=event.target.files?.[0];if(!chosen)return;if(parsed&&!$('ti-review-panel').hidden&&!confirm('Replace this import review with another file? Your saved plans and courses will stay unchanged.')){event.target.value='';return;}file=chosen;readFile();});
$('ti-sheet').addEventListener('change',event=>{if(!busy)readFile(Number(event.target.value));});
$('ti-review').addEventListener('click',review);
$('ti-change-sheet').addEventListener('click',()=>{if(busy)return;$('ti-review-panel').hidden=true;$('ti-sheet-panel').hidden=false;$('ti-sheet').focus();});
$('ti-cancel').addEventListener('click',()=>{stop();setBusy(false);file=result=parsed=null;$('ti-file').value='';$('ti-sheet-panel').hidden=true;$('ti-review-panel').hidden=true;clearError();say('Import cancelled. Your plans and courses are unchanged.');$('ti-file').focus();});
$('ti-rows').addEventListener('change',event=>{const row=parsed?.rows.find(r=>r.id===event.target.dataset.row);if(row){row.selected=event.target.checked;updateCount();}});
form.addEventListener('input',event=>{if(event.target.id!=='ti-confirm'){$('ti-confirm').checked=false;$('ti-match').hidden=true;}});
form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;clearError();setBusy(true);try{const response=W.save(localStorage,parsed,values(),{confirmed:$('ti-confirm').checked});dispatchEvent(new CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));location.assign(response.href);}catch(error){fail(error);setBusy(false);}});
$('ti-download').addEventListener('click',()=>{if(!parsed||busy)return;const body=JSON.stringify(E.exportTemplate(parsed,values()),null,2),url=URL.createObjectURL(new Blob([body],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='degreesteps-draft-template.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Draft downloaded with its proposed course suggestions. Nothing was published.');});
addEventListener('pagehide',stop);
try{if(!E||!W)throw Error('The template reader could not load. Reload to try again.');W.load(localStorage);}catch(error){fail(error);$('ti-file').disabled=true;}
}());
