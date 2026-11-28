/** Specific private review actions. This is not an accuracy/confidence score.
 * Callers must still enforce source policy and artifact validation themselves.
 */
const MAX_TEXT=100000,MAX_FLAGS=8;
const clean=(value,max=260)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,max):'';
const sourceId=value=>typeof value==='string'&&/^S[1-9]\d{0,3}$/i.test(value)?value.toUpperCase():null;
const list=value=>Array.isArray(value)?value:[];
const NUM='(?:\\d{1,3}(?:,\\d{3})+|\\d{1,6})';
const number=value=>Number(String(value).replaceAll(',',''));
const show=value=>String(value).replace(/\B(?=(\d{3})+(?!\d))/g,',');

function hash(value){let out=2166136261;for(const char of value){out^=char.charCodeAt(0);out=Math.imul(out,16777619);}return(out>>>0).toString(16);}
function citationIds(text){const found=new Set();for(const match of text.matchAll(/\[\s*S\d{1,4}(?:\s*[,;]\s*S\d{1,4})*\s*\]/gi))for(const item of match[0].match(/S\d{1,4}/gi)||[]){const id=sourceId(item);if(id)found.add(id);}return found;}
function unprotected(text){return text.replace(/```[^\n]*\n[\s\S]*?```/g,' ').replace(/`[^`\n]*`/g,' ').replace(/^\s*>[^\n]*(?:\n\s*>[^\n]*)*/gm,' ').replace(/“[^”\n]*”|"[^"\n]*"/g,' ');}
function bodyText(text){
  const marker=/^\s*(?:#{1,6}\s*)?(?:references|works cited|bibliography)\s*:?\s*$/im.exec(text);
  return marker?text.slice(0,marker.index):text;
}
function wordCount(text){return(bodyText(text).replace(/\[\s*S\d{1,4}(?:\s*[,;]\s*S\d{1,4})*\s*\]/gi,'').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length;}

function wordRequirement(text,source){
  if(typeof text!=='string')return null;
  const value=text.slice(0,24000),candidates=[],ranges=[];
  const add=(match,min,max)=>{
    const before=value.slice(Math.max(0,match.index-100),match.index),after=value.slice(match.index+match[0].length,match.index+match[0].length+75);
    // Input readings and per-section limits are not a whole-response target.
    if(/^\s+(?:article|reading|passage|source|book|chapter|case study)\b/i.test(after)||/^\s+(?:per|for each|each|in each)\b/i.test(after))return;
    if(/\b(?:abstract|title page)\s*:?\s*$/i.test(before)&&!/^\s+(?:body|paper|essay)\b/i.test(after))return;
    const latestOutput=Math.max(...[...before.matchAll(/\b(?:write|draft|compose|submit|produce|response|essay|paper|body|word count|length|minimum|maximum|limit|at least|up to|between)\b/gi)].map(m=>m.index),-1);
    const latestInput=Math.max(...[...before.matchAll(/\b(?:read|article|reading|passage|source|chapter|book)\b/gi)].map(m=>m.index),-1);
    const outputAfter=/^\s+(?:paper|essay|response|report|post|answer|summary|analysis|reflection|body)\b/i.test(after);
    if(latestInput>latestOutput&&!outputAfter)return;
    const upperOnly=/\b(?:at most|up to|no more than|maximum(?: of)?|not exceed)\s*$/i.test(before)||/^\s+(?:or (?:less|fewer)|maximum|max\b)/i.test(after);
    const minimum=/\b(?:at least|no fewer than|minimum(?: of)?|not less than)\s*$/i.test(before)||/^\s+(?:minimum|min\b|or more)\b/i.test(after);
    const exact=/\bexactly\s*$/i.test(before);
    if(!(min>0&&min<=999999)||max!==null&&(!(max>0)||max<min))return;
    const kind=upperOnly?'maximum':max!==null?'range':minimum?'minimum':exact?'exact':'target';
    candidates.push({min:upperOnly?0:min,max:upperOnly?min:exact?min:max,source,kind,approximate:/\b(?:about|approximately|roughly|around)\s*$/i.test(before),index:match.index,score:/\b(?:body|paper|essay|response)\b/i.test(before.slice(-35)+' '+after.slice(0,35))?2:1});
  };
  for(const pattern of[new RegExp('\\bbetween\\s+('+NUM+')\\s+and\\s+('+NUM+')\\s*(?:[-–—]\\s*)?words?\\b','gi'),new RegExp('(?<![\\d.,])('+NUM+')\\s*(?:[-–—]|to)\\s*('+NUM+')\\s*(?:[-–—]\\s*)?words?\\b','gi')])for(const match of value.matchAll(pattern)){ranges.push([match.index,match.index+match[0].length]);add(match,number(match[1]),number(match[2]));}
  for(const match of value.matchAll(new RegExp('(?<![\\d.,])('+NUM+')\\s*(?:[-–—]\\s*)?words?\\b','gi')))if(!ranges.some(([start,end])=>match.index>=start&&match.index<end))add(match,number(match[1]),null);
  candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
  return candidates[0]||null;
}

function requiresPersonalExperience(project){
  const input=[project?.rubric,project?.prompt].filter(value=>typeof value==='string').join('\n').slice(0,24000);
  for(const match of input.matchAll(/\b(?:include|describe|discuss|reflect on|draw on|draw upon|share|use|using|based on|grounded in|relate|give|provide|explain)\s+(?:(?:an?|one)\s+example\s+from\s+)?(?:your(?: own)?(?: (?:personal|professional|work|life|academic|clinical|leadership|military|learning|real-world)){0,2}\s+(?:experience|experiences|life|work)|(?:an?|one) personal experience)\b/gi)){
    const before=input.slice(Math.max(0,match.index-45),match.index),after=input.slice(match.index+match[0].length,match.index+match[0].length+35);
    if(/\b(?:do not|don't|not required to|no need to|may|can|could|might|optionally|optional to)\s*$/i.test(before)||/^\s+(?:if (?:you (?:wish|want)|desired)|is optional|is not required)\b/i.test(after))continue;
    return true;
  }
  return false;
}

function specificModelCheck(check){
  if(!check||!['review','missing'].includes(check.status))return null;
  const label=clean(check.label,100),detail=clean(check.detail,260);
  if(!detail||detail.length<12)return null;
  // A learner need not complete a newly offered practice exercise before the
  // already answered assignment can be useful or ready for their review.
  if(/^student(?:'s)? (?:attempt|answer|response)/i.test(label)&&/\bpractice\b/i.test(label+' '+detail))return null;
  if(/\b(?:optional|new|extra|additional|follow[- ]?up)\s+(?:practice|exercise|problem|question|challenge)\b|\b(?:practice|exercise) (?:extension|opportunity)\b/i.test(label+' '+detail))return null;
  if(/^(?:source coverage|source checks?|citation checks?|originality|plagiarism|workflow|status|word count|format(?:ting)?)$/i.test(label))return null;
  if(/(?:not a comprehensive|limited source and citation|claim support is not verified|verify (?:all|every)|review (?:all|every)|AI[- ]detect|guaranteed (?:accuracy|originality)|supplied excerpts were compared)/i.test(detail))return null;
  if(/^(?:(?:please )?(?:verify|check|review) (?:the |your |all )?(?:sources|citations|facts|information|content|work|answer)(?: before (?:submission|submitting|use))?[.!]?|(?:needs?|requires?) (?:review|verification|confirmation)[.!]?)$/i.test(detail))return null;
  return{label,detail};
}

export function buildLearningReview({artifact={},project={},course={},format={},verifiedResourceIds=[],reviewedArtifact}={}){
  const flags=[],seen=new Set();
  const add=(kind,severity,message,nextAction,target='result',ids=[],suffix='')=>{
    const sourceIds=[...new Set(ids.map(sourceId).filter(Boolean))].slice(0,12),text=clean(message),action=clean(nextAction,180);
    if(!text||!action)return;
    const key=[kind,target,...sourceIds,text.toLowerCase()].join('|');if(seen.has(key))return;seen.add(key);
    flags.push({id:(kind+'-'+(suffix||hash(key))).slice(0,80),kind,severity,message:text,nextAction:action,target,...(sourceIds.length?{sourceIds}:{})});
  };
  // Review reports are not the paper. The backend can pass the actual historical
  // draft explicitly; an immediately preceding draft is a safe fallback.
  const prior=reviewedArtifact&&typeof reviewedArtifact.content==='string'?reviewedArtifact:project.artifact;
  const review=artifact.action==='review';
  const material=review?prior&&['draft','discussion','presentation'].includes(prior.action)?prior:null:artifact;
  const content=typeof material?.content==='string'?material.content.slice(0,MAX_TEXT):'',editable=unprotected(content);
  const count=material?wordCount(content):null,requirement=wordRequirement(project.rubric,'rubric')||wordRequirement(project.prompt,'prompt');

  const sourceRows=list(material?.sources),checks=material?.sourceChecks||{},known=new Set(sourceRows.map(s=>sourceId(s?.id)).filter(Boolean)),used=citationIds(content);
  for(const row of list(checks.checkedSources))if(row?.cited&&sourceId(row.id))used.add(sourceId(row.id));
  const unknown=[...new Set([...used].filter(id=>!known.has(id)).concat(list(checks.unknownCitations).map(sourceId).filter(Boolean)))];
  if(unknown.length)add('unknown-citation','blocking','This draft refers to '+unknown.slice(0,6).join(', ')+', but those labels have no matching project source.','Replace the unsupported labels with established sources, or remove the unsupported claims.','sources',unknown,'labels');
  if(list(checks.unknownSourceURLs).length)add('unknown-source-link','blocking','A link in this draft has no matching source in the project.','Replace the link with an established source before relying on its claims.','sources',[],'link');

  if(format?.needsClarification===true){
    const names=[...new Set(list(format.conflicts).filter(c=>c?.overridden!==true).flatMap(c=>list(c.requested)).map(r=>r?.style==='apa'?'APA':r?.style==='mla'?'MLA':clean(r?.name,30)).filter(Boolean))];
    add('format-conflict','input',names.length>1?'The assignment contains conflicting '+names.join(' and ')+' instructions.':'The assignment contains conflicting format instructions.','Choose the instructor’s required format in the assignment details.','format',[],'instructions');
  }
  const formal=['apa','mla'].includes(format?.style)||['apa7','mla9'].includes(format?.profile);
  const markers=[...citationIds(editable)];
  if(formal&&markers.length)add('citation-format','review','The body still uses internal source labels instead of '+(format.style==='mla'||format.profile==='mla9'?'MLA':'APA')+' in-text citations.','Format these citations from the actual source details; keep internal labels in the source notes.','format',markers,'labels');
  if(formal&&/\[(?:insert\s+)?(?:author|year|date|page(?: number)?|citation)(?:\s+here)?\]|\(Author,?\s*Year\)/i.test(editable))add('citation-placeholder','review','The draft contains an unfinished author, date, page or citation placeholder.','Replace each placeholder with established source details, or use the required style’s rule for genuinely absent information.','sources',[],'placeholder');
  const bibliography=format?.bibliography||artifact?.bibliography;
  for(const missing of list(bibliography?.missingFields)){
    const id=sourceId(missing?.sourceId);if(!id||!used.has(id))continue;
    const fields=list(missing.fields).filter(f=>['author','publicationdate','publicationDate','date','title','page','pages','publisher','url'].includes(f));if(!fields.length)continue;
    add('citation-metadata','review',id+' has citation details explicitly marked missing: '+fields.map(f=>/publication/i.test(f)?'publication date':f).join(', ')+'.','Supply established citation details, or record that the source genuinely omits them. Do not invent missing information.','sources',[id],id.toLowerCase());
  }

  const verified=new Set(list(verifiedResourceIds).map(sourceId).filter(Boolean));
  const research=artifact.sourceChecks?.research||checks.research||{};
  const comparable=value=>{try{const u=new URL(value);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key))u.searchParams.delete(key);return u.href;}catch{return null;}};
  const requestedLinks=new Set(list(project.sources).map(s=>comparable(s?.url)).filter(Boolean));
  const excluded=list(research.excludedSources).filter(s=>s&&(s.requested===true||requestedLinks.has(comparable(s.url))));
  const excludedIds=new Set(excluded.map(s=>sourceId(s.id)).filter(Boolean));
  const missingRequiredEvidence=research.required===true&&research.retrievedSources===0;
  if(excluded.length){
    const first=excluded[0],name=clean(first.title,90),label=excluded.length===1?(name?'The requested reading “'+name+'”':'A source link you supplied'):show(excluded.length)+' source links you supplied';
    add('requested-source-unreadable',missingRequiredEvidence?'blocking':'review',label+(excluded.length===1?' did not return a readable source passage.':' did not return readable source passages.'),'Retry research or replace the unreadable link with an accessible public reading.','sources',[...excludedIds],'requested');
  }
  const writing=['writing','discussion','presentation'].includes(project.kind)||['draft','discussion','presentation'].includes(material?.action);
  const evidenceRequested=/\b(?:research|sources?|citations?|cite|references?|scholarly|peer[- ]reviewed|evidence|literature review)\b/i.test([project.rubric,project.prompt].filter(v=>typeof v==='string').join('\n'))||used.size>0||requestedLinks.size>0||research.required===true;
  if(!excluded.length&&(missingRequiredEvidence||writing&&evidenceRequested&&research.performed===true&&research.retrievedSources===0))add('research-evidence',missingRequiredEvidence?'blocking':'review',research.performed===true?'This research step returned no verified source passages for the requested evidence.':'This answer has no verified source passages for its required research.','Run research again with accessible public sources before treating the answer’s factual claims as sourced.','sources',[],'empty');
  for(const row of sourceRows){
    const id=sourceId(row?.id);if(!id||!used.has(id)||excludedIds.has(id))continue;
    const checked=list(checks.checkedSources).find(s=>sourceId(s?.id)===id),state=row.verificationStatus||checked?.verificationStatus;
    const explicitlyUnverified=['unverified','rejected','unsupported','failed'].includes(state)||(row.verified===false&&typeof row.verificationReason==='string');
    const unreadable=checked?.status==='unavailable'&&(!checked.evidenceOrigin||checked.evidenceOrigin==='none')&&!row.excerpt;
    if(!verified.has(id)&&(explicitlyUnverified||unreadable))add('source-evidence','review',explicitlyUnverified?'The draft uses '+id+', whose evidence is explicitly marked unverified.':'The draft uses '+id+', but no readable source passage was available.','Retry research with an accessible public source, or replace it; confirm that the relevant passage supports the claim.','sources',[id],id.toLowerCase());
  }
  for(const overlap of list(checks.overlaps))if(overlap?.needsAttribution===true&&sourceId(overlap.sourceId)){
    const id=sourceId(overlap.sourceId),missing=overlap.needsQuotation&&overlap.needsCitation?'quotation marks and a nearby citation':overlap.needsCitation?'a nearby citation':'quotation marks or a substantive rewrite';
    add('matching-passage','review','A compared passage matches '+id+' and needs '+missing+'.','Inspect the matched wording, then quote it with attribution or rewrite the idea in your own words and cite it.','sources',[id],id.toLowerCase());
  }

  if(requiresPersonalExperience(project)&&!clean(project.studentNotes,12000))add('personal-experience','input','The assignment asks for your own experience, but your notes are still blank.','Add your actual example or viewpoint in your notes so the work can reflect it without inventing a biography.','notes',[],'notes');
  if(requirement&&count!==null&&artifact.action!=='plan'){
    const lowerBound=requirement.approximate&&requirement.kind==='target'?Math.ceil(requirement.min*0.95):requirement.min;
    if(count<lowerBound){const target=requirement.max!==null&&requirement.kind==='range'?show(requirement.min)+'–'+show(requirement.max):show(requirement.min);
      add('word-count','review','The draft has '+show(count)+' words; the '+requirement.source+' '+(requirement.approximate?'targets about ':requirement.kind==='target'?'asks for ':'requires ')+target+' words.','Expand the main draft by at least '+show(requirement.min-count)+' words to reach '+show(requirement.min)+'.','result',[],'short');}
    if(requirement.max!==null&&['maximum','range','exact'].includes(requirement.kind)&&count>requirement.max)add('word-count','review','The draft has '+show(count)+' words; the '+requirement.source+' sets a '+show(requirement.max)+'-word upper limit.','Shorten the main draft by at least '+show(count-requirement.max)+' words.','result',[],'long');
  }
  for(const check of list(artifact.checks)){const specific=specificModelCheck(check);if(specific)add('human-judgment','review','Review note: '+specific.detail,'Address this specific point in the draft or add the missing information, then review it again.','result',[],hash(specific.label+'|'+specific.detail));}
  const rank={blocking:0,input:1,review:2};flags.sort((a,b)=>rank[a.severity]-rank[b.severity]);
  const visible=flags.slice(0,MAX_FLAGS);
  return{status:visible.length?'needs-review':'ready-for-student-review',flags:visible,...(count!==null?{wordCount:count}:{}),...(requirement?{expectedWordCount:{min:requirement.min,max:requirement.max,source:requirement.source}}:{})};
}
