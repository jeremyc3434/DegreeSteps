/** Curated degree facts guide research; they never establish an approved student plan. */
const DegreeResearchReferences = (() => {
  'use strict';
  const DAY=86400000,MAX_AGE_DAYS=45;
  const levels=new Set(['associate','bachelor','master','doctorate','specialist']);
  const modalities=new Set(['online','campus','hybrid']);
  const learningFormats=new Set(['course-based','competency-based','self-paced']);
  const units=new Set(['semester','quarter','competency-unit']);
  const creditFields=new Set(['totalCredits','institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','majorMinInstitutionCredits','majorResidencyBasisCredits']);
  const fields=new Set([...creditFields,'majorInstitutionFraction']);
  const tracking=/^(?:utm_.*|fbclid|gclid|dclid|msclkid|gbraid|wbraid|mc_cid|mc_eid|_ga|_gl|ref|referrer|email|student_id|lead_id|prospect_id|user_id|contact_id)$/i;
  const personalParameter=/^(?:email|student_id|lead_id|prospect_id|user_id|contact_id)(?:\[\])?$/i;
  const secretParameter=/^(?:access_token|refresh_token|api_key|apikey|authorization|password|session|session_id|sessionid)$/i;
  const idPattern=/^[a-z0-9][a-z0-9_-]{0,99}$/;
  const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&!/[\u0000-\u001f\u007f]/.test(value);
  const array=value=>Array.isArray(value)?value:[];
  const copy=value=>JSON.parse(JSON.stringify(value));
  const norm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  function titleKey(value){
    let title=String(value||'').normalize('NFKC').toLowerCase().trim().replace(/\s*[—–-]\s*(?:online|residential)\s*$/u,'').replace(/\((?:online|residential)\)\s*$/u,'');
    const phrases=[[/bachelor(?:’s|'s)? of science in business administration/gu,'bsba'],[/bachelor(?:’s|'s)? of business administration/gu,'bba'],[/bachelor(?:’s|'s)? of science/gu,'bs'],[/bachelor(?:’s|'s)? of arts/gu,'ba'],[/master of business administration/gu,'mba'],[/master of science/gu,'ms'],[/master of arts/gu,'ma'],[/associate of applied science/gu,'aas'],[/associate of science/gu,'as'],[/associate of arts/gu,'aa'],[/doctor of business administration/gu,'dba'],[/doctor of philosophy/gu,'phd']];
    for(const [pattern,award]of phrases)title=title.replace(pattern,' '+award+' ');
    title=title.replace(/\bb\.\s*s\.\s*b\.\s*a\./gu,'bsba').replace(/\bb\.\s*s\./gu,'bs').replace(/\bb\.\s*a\./gu,'ba').replace(/\bm\.\s*b\.\s*a\./gu,'mba').replace(/\bm\.\s*s\./gu,'ms').replace(/\ba\.\s*a\./gu,'aa').replace(/\ba\.\s*s\./gu,'as').replace(/\bp\.?h\.?d\./gu,'phd');
    const words=title.replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/u).filter(Boolean),awards=new Set(['bsba','bba','bs','ba','mba','ms','ma','aas','as','aa','dba','phd','edd','jd','mfa','bsn']),positions=words.map((word,index)=>awards.has(word)?index:-1).filter(index=>index>=0);
    if(!positions.length||new Set(positions.map(index=>words[index])).size!==1)return words.join(' ');
    const award=words[positions[0]],rest=words.filter((word,index)=>!positions.includes(index));if(['major','degree'].includes(rest.at(-1)))rest.pop();if(rest[0]==='in')rest.shift();return award+'|'+rest.join(' ');
  }
  function programIdentity(value){
    const tracks=[];const qualifier=value=>{
      const label=norm(value);if(['online','residential','oncampus','campus'].includes(label))return true;
      const track=/^tempolearning$|^tempo$/.test(label)?'tempo':/^mypath(?:selfpaced)?$/.test(label)?'mypath':/^coursebased$/.test(label)?'course-based':/^(?:cbe|competencybased(?:learning|education)?)$/.test(label)?'competency':/^selfpaced$/.test(label)?'self-paced':null;
      if(track){tracks.push(track);return true;}return false;
    };
    let title=String(value||'').replace(/\(([^)]*)\)/g,(whole,inside)=>{const remaining=inside.split(',').map(part=>part.trim()).filter(part=>!qualifier(part));return remaining.length?'('+remaining.join(', ')+')':'';});
    title=title.replace(/\s*[—–]\s*([^—–]+)\s*$/u,(whole,tail)=>qualifier(tail)?'':whole);
    title=title.replace(/\s+(Tempo Learning|MyPath Self-Paced|Course-Based|Competency-Based|Self-Paced)\s*$/i,(whole,tail)=>qualifier(tail)?'':whole);
    return{key:titleKey(title),tracks:[...new Set(tracks)].sort()};
  }
  function sameProgram(actual,expected){const left=programIdentity(actual),right=programIdentity(expected);if(left.key!==right.key)return false;if(!left.tracks.length)return true;return left.tracks.join('|')===right.tracks.join('|');}
  function canonicalURL(value){
    if(typeof value!=='string'||value.length>2000)return null;
    try{
      const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!url.hostname.includes('.')||/^(?:\d|\[)/.test(url.hostname)||/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(url.hostname))return null;
      for(const key of [...url.searchParams.keys()]){if(secretParameter.test(key))return null;if(tracking.test(key))url.searchParams.delete(key);}
      url.searchParams.sort();url.pathname=url.pathname.replace(/\/+$/,'')||'/';
      // A PDF page or degree anchor can select a specific program. It remains identity-bearing.
      return url.href;
    }catch{return null;}
  }
  function domain(value){
    try{const labels=new URL(value).hostname.toLowerCase().replace(/\.$/,'').split('.'),tail=labels.slice(-2).join('.');return /^(?:ac|co|com|edu|org|gov)\.[a-z]{2}$/.test(tail)?labels.slice(-3).join('.'):tail;}catch{return null;}
  }
  function governmentURL(value){try{const host=new URL(value).hostname.toLowerCase();return /(?:^|\.)(?:gov|mil)$/.test(host)||host==='airuniversity.af.edu'||host.endsWith('.airuniversity.af.edu');}catch{return false;}}
  function personalURL(value){try{return [...new URL(value).searchParams.keys()].some(key=>personalParameter.test(key));}catch{return false;}}
  const dateValue=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?Date.parse(value):null;
  const yearKey=value=>typeof value==='string'?value.replace(/[–—]/g,'-').trim():null;
  const ambiguityFields=new Set([...fields,'schoolName','programName','level','modality','catalogYear','learningFormat','creditSystem','courseCount','requirements','price','pricing','pace','degreeUrls','all']);
  function affectedFields(packet){const affected=new Set();for(const ambiguity of array(packet.ambiguities)){if(!Array.isArray(ambiguity.affects))affected.add('all');else for(const field of ambiguity.affects)affected.add(field);}return affected;}
  const scopeAmbiguous=affected=>['all','schoolName','programName','level','modality','learningFormat'].some(field=>affected.has(field));
  const fieldAmbiguous=(field,affected)=>affected.has(field)||creditFields.has(field)&&affected.has('creditSystem');
  function outsideUnspecifiedCatalog(packet,value){
    if(!value)return false;const years=yearKey(value)?.match(/20\d\d/g);if(!years?.length)return false;
    const checked=new Date(packet.checkedOn+'T00:00:00Z'),start=Number(years[0]),end=Number(years.at(-1)),year=checked.getUTCFullYear();
    return start>year||end<year||years.length>1&&end===year&&checked.getUTCMonth()>=6;
  }
  function validate(data,{now=Date.now()}={}){
    const fail=message=>{throw new Error('Research references: '+message);};
    if(!data||data.version!==1||!Array.isArray(data.packets)||data.packets.length>100)fail('use version 1 with at most 100 packets.');
    const packetIds=new Set();
    for(const packet of data.packets){
      if(!packet||!idPattern.test(packet.id||'')||packetIds.has(packet.id))fail('packet IDs must be valid and unique.');packetIds.add(packet.id);
      if(!text(packet.schoolName)||packet.schoolName.length>120||!text(packet.programName)||packet.programName.length>200||!levels.has(packet.level))fail('each packet needs its exact school, degree and supported level.');
      if(packet.modality!==null&&!modalities.has(packet.modality))fail('study format must be explicit or null.');
      if(packet.catalogYear!==null&&!/^20\d\d(?:(?:0[1-9]|1[0-2])|-20\d\d)?$/.test(yearKey(packet.catalogYear)||''))fail('catalog year must be a supported published year or null.');
      const checked=dateValue(packet.checkedOn);if(checked===null||checked>now+DAY)fail('packet checked dates must be valid and not in the future.');
      if(!Array.isArray(packet.degreeUrls)||!packet.degreeUrls.length||packet.degreeUrls.length>20)fail('each packet needs one to 20 exact public degree URLs.');
      if(packet.degreeUrls.some(personalURL))fail('public degree URLs cannot include personal query parameters.');
      const urls=packet.degreeUrls.map(canonicalURL);if(urls.some(url=>!url)||new Set(urls).size!==urls.length)fail('degree URLs must be safe, exact and unique within a packet.');
      const schoolDomains=new Set(urls.map(domain));if(schoolDomains.size!==1)fail('a packet cannot combine unrelated institutions.');
      if(!Array.isArray(packet.sources)||!packet.sources.length||packet.sources.length>100)fail('each packet needs bounded official sources.');
      const sources=new Map();
      for(const source of packet.sources){
        if(personalURL(source?.url))fail('public source URLs cannot include personal query parameters.');
        if(!source||!idPattern.test(source.id||'')||sources.has(source.id)||!text(source.title)||source.title.length>300||!canonicalURL(source.url))fail('sources need unique IDs, public URLs and titles.');
        const stamp=dateValue(source.checkedOn);if(stamp===null||stamp>now+DAY||stamp>checked+DAY||checked-stamp>MAX_AGE_DAYS*DAY)fail('source checked dates must be valid, current and match the review period.');
        if(source.kind==='university'){if(!schoolDomains.has(domain(source.url)))fail('university sources must belong to the degree institution.');}
        else if(source.kind==='government'){if(!governmentURL(source.url))fail('government sources require an official government or military domain.');}
        else fail('source kind must be university or government.');
        sources.set(source.id,source);
      }
      const refs=ids=>Array.isArray(ids)&&ids.length>0&&ids.length<=20&&new Set(ids).size===ids.length&&ids.every(id=>sources.has(id));
      if(packet.choices!==undefined){
        if(!Array.isArray(packet.choices)||!packet.choices.length||packet.choices.length>20)fail('learning choices must be a bounded, nonempty list.');
        const choiceIds=new Set();for(const choice of packet.choices){
          if(!choice||!idPattern.test(choice.id||'')||choiceIds.has(choice.id)||!text(choice.label)||choice.label.length>160||!text(choice.programName)||choice.programName.length>200||!learningFormats.has(choice.learningFormat)||!modalities.has(choice.modality)||packet.modality!==null&&choice.modality!==packet.modality||!refs(choice.sourceIds)||choice.sourceIds.some(id=>sources.get(id).kind!=='university'))fail('learning choices need unique IDs, exact format, degree and university source references.');
          choiceIds.add(choice.id);
        }
      }
      if(!Array.isArray(packet.facts)||packet.facts.length>30)fail('facts must be a bounded list.');
      const factIds=new Set(),factFields=new Set();
      for(const fact of packet.facts){
        if(!fact||!idPattern.test(fact.id||'')||factIds.has(fact.id)||!fields.has(fact.field)||factFields.has(fact.field)||!Number.isFinite(fact.value)||fact.value<0||fact.value>(fact.field==='majorInstitutionFraction'?1:500)||fact.field==='totalCredits'&&fact.value===0||!refs(fact.sourceIds))fail('facts need unique fields, valid quantities and exact source references.');
        if(fact.creditSystem!==null&&!units.has(fact.creditSystem))fail('credit units must be explicit or null; never infer them.');
        if(fact.field==='majorInstitutionFraction'&&fact.creditSystem!==null)fail('a major residency fraction is dimensionless.');
        if(fact.sourceIds.some(id=>sources.get(id).kind!=='university'))fail('numeric degree policies require university sources.');
        factIds.add(fact.id);factFields.add(fact.field);
      }
      const total=packet.facts.find(fact=>fact.field==='totalCredits');
      if(total)for(const fact of packet.facts)if(creditFields.has(fact.field)&&fact.creditSystem&&fact.creditSystem===total.creditSystem&&fact.value>total.value)fail('a policy credit quantity cannot exceed the same-unit degree total.');
      for(const name of ['studentCautions','ambiguities']){
        if(!Array.isArray(packet[name])||packet[name].length>30)fail(name+' must be a bounded list.');
        for(const item of packet[name]){if(!item||!text(item.text)||item.text.length>1600||!refs(item.sourceIds))fail(name+' need plain text and official source references.');if(item.affects!==undefined&&(!Array.isArray(item.affects)||new Set(item.affects).size!==item.affects.length||item.affects.some(field=>!ambiguityFields.has(field))))fail('ambiguity affects must identify supported fields.');}
      }
    }
    return copy(data);
  }
  function find(data,url,{now=Date.now(),maxAgeDays=MAX_AGE_DAYS,includeStaleChoiceIdentity=false}={}){
    const target=canonicalURL(url);if(!target||data?.version!==1||!Array.isArray(data.packets))return null;
    const maximumAge=Math.min(MAX_AGE_DAYS,Math.max(0,Number(maxAgeDays)||0))*DAY;
    const packets=[];let expiredChoices=false;for(const packet of data.packets){
      const checked=dateValue(packet?.checkedOn);if(checked===null||checked>now+DAY||!array(packet.degreeUrls).some(value=>canonicalURL(value)===target))continue;
      try{const validated=validate({version:1,packets:[packet]},{now}).packets[0],fresh=now-checked<=maximumAge&&validated.sources.every(source=>now-dateValue(source.checkedOn)<=maximumAge);if(fresh)packets.push(validated);else if(includeStaleChoiceIdentity===true&&array(validated.choices).length)expiredChoices=true;}catch{/* Corrupt or stale source data must not affect a research request. */}
    }
    if(!packets.length)return expiredChoices?{version:1,matchedUrl:target,requiresRefresh:true,packets:[],choices:[],facts:[],checks:[],hints:''}:null;
    const affected=packets.length===1?affectedFields(packets[0]):new Set(['all']);
    const bound=packets.length===1&&packets[0].modality!==null&&!scopeAmbiguous(affected);
    const facts=bound?packets[0].facts.filter(fact=>!fieldAmbiguous(fact.field,affected)).map(fact=>({...copy(fact),packetId:packets[0].id})):[];
    const caution=packets.flatMap(packet=>packet.studentCautions.map(item=>({...copy(item),packetId:packet.id}))),ambiguities=packets.flatMap(packet=>packet.ambiguities.map(item=>({...copy(item),packetId:packet.id})));
    const choices=packets.flatMap(packet=>array(packet.choices).map(choice=>({...copy(choice),packetId:packet.id,schoolName:packet.schoolName,level:packet.level,catalogYear:packet.catalogYear})));
    const hints='Curated reference data for this exact degree URL. These are research hints, not an approved or complete student plan. Confirm the selected degree, catalog and learning format; do not represent these references as newly fetched search results. A listed learning choice must be selected through trusted student context; the model must not choose one by itself.\n'+JSON.stringify({packets});
    return{version:1,matchedUrl:target,packets,facts,checks:facts.map(copy),studentCautions:caution,ambiguities,choices,hints};
  }
  function check(artifact,reference,{choiceId}={}){
    if(reference?.requiresRefresh===true)return['The verified learning options for this degree link need a source refresh before we can build its plan.'];
    const packets=Array.isArray(reference?.packets)?reference.packets:reference?[reference]:[];
    if(!packets.length)return[];
    if(packets.length!==1)return['This link includes more than one degree pathway. Choose the exact degree and learning format before using a plan.'];
    const packet=packets[0],issues=[],add=message=>{if(!issues.includes(message))issues.push(message);};
    const affected=affectedFields(packet);
    const selectedId=choiceId??reference.selectedChoiceId,choices=array(packet.choices),selected=typeof selectedId==='string'?choices.find(choice=>choice.id===selectedId):null;
    if(selectedId!==undefined&&selectedId!==null&&!selected)return['The selected learning format is not available for this degree link. Choose one of the verified options.'];
    if(choices.length&&!selected)return['Choose the learning format you want before we build this degree plan.'];
    if(selected){affected.delete('learningFormat');affected.delete('modality');}
    if(scopeAmbiguous(affected)||!modalities.has(selected?.modality||packet.modality))return['Confirm the exact degree and study format from the university before using this plan.'];
    if(!artifact||typeof artifact!=='object'||Array.isArray(artifact))return issues;
    const expected=selected?{...packet,programName:selected.programName,modality:selected.modality}:packet;
    if(selected){
      const actualProgram=programIdentity(artifact.programName),selectedProgram=programIdentity(selected.programName),explicitVariant=actualProgram.tracks.length>0&&selectedProgram.tracks.length>0&&actualProgram.tracks.join('|')===selectedProgram.tracks.join('|');
      if(artifact.learningFormat!==undefined&&artifact.learningFormat!==selected.learningFormat||actualProgram.tracks.length&&!sameProgram(artifact.programName,selected.programName)||!explicitVariant&&artifact.learningFormat!==selected.learningFormat)return['Use the student’s selected '+selected.label+' learning format for this plan; do not substitute another route.'];
    }
    const scope=[['schoolName','school',norm],['programName','degree',null],['level','degree level',value=>value],['modality','study format',value=>value]];
    for(const [field,label,key]of scope){const actual=artifact[field];if(typeof actual!=='string'||!actual.trim())return[];if(field==='programName'?!sameProgram(actual,expected[field]):key(actual)!==key(expected[field]))add('The reference is for '+expected[field]+'; confirm the exact '+label+' before using this plan.');}
    if(issues.length)return issues;
    if(packet.catalogYear&&(affected.has('catalogYear')||!artifact.catalogYear)||outsideUnspecifiedCatalog(packet,artifact.catalogYear))return[];
    if(packet.catalogYear&&yearKey(packet.catalogYear)!==yearKey(artifact.catalogYear))add('The official reference covers catalog '+yearKey(packet.catalogYear)+'; the proposed plan names '+yearKey(artifact.catalogYear)+'. Confirm the applicable catalog rather than substituting a new year label.');
    for(const fact of array(packet.facts)){
      if(fieldAmbiguous(fact.field,affected))continue;
      const value=artifact[fact.field];if(!Number.isFinite(value))continue;
      if(creditFields.has(fact.field)){
        if(!units.has(fact.creditSystem)||!units.has(artifact.creditSystem))continue;
        if(fact.creditSystem!==artifact.creditSystem){add('The official reference uses '+fact.creditSystem+' credits; this plan uses '+artifact.creditSystem+' credits. Confirm the degree’s credit units without substituting one unit for another.');continue;}
      }
      if(Math.abs(value-fact.value)>.001)add('The university reference states '+fact.field+' = '+fact.value+(fact.creditSystem?' '+fact.creditSystem+' credits':'')+'; the proposed plan states '+value+'. Check the cited policy for this exact degree.');
    }
    return issues;
  }
  return{validate,find,check,canonicalURL};
})();
export function validateResearchReferences(data,options){return DegreeResearchReferences.validate(data,options);}
export function findResearchReference(data,url,options){return DegreeResearchReferences.find(data,url,options);}
export function checkResearchReference(artifact,reference,options){return DegreeResearchReferences.check(artifact,reference,options);}
export function canonicalResearchReferenceURL(value){return DegreeResearchReferences.canonicalURL(value);}
