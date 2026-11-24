/** Exact current CLI religion awards remain optional research choices. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const list=value=>Array.isArray(value)?value:[],key=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const catalog=value=>String(value||'').replace(/[–—]/g,'-');
const level=value=>({associate:'associate',associates:'associate',bachelor:'bachelor',bachelors:'bachelor'})[String(value||'').toLowerCase().replace(/[^a-z]/g,'')];
const modes={Online:'online',Residential:'campus'};
const expected=new Map([
 ['BIB 111',['BIBL 105',2]],['BIB 112',['BIBL 110',2]],['MIN 310',['EVAN 101',2]],
 ['THE 101',['THEO 104',4]],['THE 210',['THEO 201',2]],['THE 310',['THEO 202',2]]
]);
const legacyFiles=['liberty.json','liberty-criminal-justice-online.json','liberty-criminal-justice-residential.json'];

export function validateLibertyCLIReligionAwards(document,calculatorRows){
 assert(document?.version===1&&document.checkedOn==='2026-11-24'&&document.school==='Liberty University'&&document.provider==='Christian Leaders Institute','Use the exact current CLI religion review.');
 assert(document.calculatorRequest?.institution==='M12424'&&document.calculatorRequest.rowCount===124&&/^[a-f0-9]{64}$/.test(document.calculatorRequest.sha256||''),'Retain the complete current calculator capture and digest.');
 assert.equal(document.calculatorRequest.sourceSnapshot,'content/transfer-awards/snapshots/liberty-cli-calculator-2026-11-24.json','Use the independently retained current calculator capture.');
 const endpoint=new URL(document.calculatorRequest.url);
 assert(endpoint.protocol==='https:'&&endpoint.hostname==='webapi.liberty.edu'&&endpoint.pathname==='/transfer-credits/'&&endpoint.searchParams.get('institution')==='M12424'&&endpoint.searchParams.get('term')==='NULL'&&!endpoint.username&&!endpoint.password,'Use the receiving university calculator, not a provider claim.');
 assert(Array.isArray(document.sources)&&Array.isArray(document.awards)&&document.awards.length===expected.size,'Exactly six reviewed fixed religion awards are admitted.');
 const sources=new Map(document.sources.map(source=>[source.id,source])),ids=new Set(),codes=new Set();
 assert.equal(sources.size,document.sources.length,'Source IDs must be unique.');
 for(const award of document.awards){
  const tuple=expected.get(award.code);
  assert(tuple&&award.provider===document.provider&&typeof award.id==='string'&&award.id&&!ids.has(award.id)&&!codes.has(award.code),'Each current coded source is admitted once; alternate evangelism sources are excluded.');
  ids.add(award.id);codes.add(award.code);
  assert(award.receivingCode===tuple[0]&&award.credits===tuple[1]&&award.creditSystem==='semester'&&award.upper===false,'Preserve each exact lower-level receiving code and quantity.');
  assert(award.calculatorAwardRange?.low===tuple[1]&&award.calculatorAwardRange.high===tuple[1],'Ranged awards cannot become fixed credits.');
  assert(award.creditOrigin==='institutional'&&award.evidence==='conditional'&&award.sourceCreditStatus==='unknown'&&award.sourceCredits===undefined&&award.sourceCreditSystem===undefined,'Institutional CLI credit is conditional; independent source units remain unknown.');
  assert([3,4].includes(award.providerListedCreditQuantity)&&award.costStatus==='unpriced-academic-pathway'&&award.price===undefined&&award.cost===undefined,'Listed provider credits and unknown academic-pathway prices must remain separate.');
  assert(award.sourceType===undefined&&!award.aceId&&!award.recommendationStart&&!award.recommendationEnd,'No ACE or recommendation-period claim is established by this institutional review.');
  assert.deepEqual(award.degreeLevels,['associate','bachelor']);assert.deepEqual(award.modalities,['online','campus']);assert.deepEqual(award.catalogs,['2026-2027']);
  const receivingIds=list(award.sourceIds),identityIds=list(award.identitySourceIds);
  assert(receivingIds.length&&receivingIds.every(id=>{const source=sources.get(id);return source?.kind==='university'&&source.url===document.calculatorRequest.url&&list(source.roles).includes('receiving-map');}),'Every award needs receiving-university evidence.');
  assert(identityIds.length&&identityIds.every(id=>{const source=sources.get(id);return source?.kind==='provider'&&source.provider===document.provider&&list(source.roles).includes('provider-identity')&&list(source.courseCodes).includes(award.code)&&!receivingIds.includes(id);}),'Original coded provider identity must be independent from the receiving award.');
  const course=new URL(award.providerCourseUrl);
  assert(course.protocol==='https:'&&course.hostname==='christianleaders.org'&&course.pathname==='/course/view.php'&&/^\d+$/.test(course.searchParams.get('id')||'')&&!course.username&&!course.password,'A religion choice needs its exact current coded provider course.');
  assert(identityIds.some(id=>{const source=sources.get(id);return source.url===award.providerCourseUrl&&source.courseCodes?.includes(award.code)&&source.listedCreditQuantity===award.providerListedCreditQuantity&&source.listedCreditUnit===award.providerListedCreditUnit;}),'The provider-listed quantity must retain its exact coded identity.');
  if(calculatorRows){
   const rows=calculatorRows.filter(row=>row.SHBTATC_SBGI_CODE==='M12424'&&key(row.SHBTATC_SUBJ_CODE_TRNS+' '+row.SHBTATC_CRSE_NUMB_TRNS)===key(award.code));
   assert.equal(rows.length,1,'The captured source course must be unambiguous.');const row=rows[0];
   assert(/^[A-Z]{2,6}\d{3}$/.test(row.INST_CRSE_EQUIV)&&key(row.INST_CRSE_EQUIV)===key(award.receivingCode)&&row.STVLEVL_DESC==='Undergraduate'&&Number(row.CREDIT_HRS_LOW)===award.credits&&Number(row.CREDIT_HRS_HIGH)===award.credits,'Only the captured exact, fixed undergraduate award is admitted.');
  }
 }
 if(calculatorRows)assert.equal(calculatorRows.length,document.calculatorRequest.rowCount);
 assert(document.issuerReview?.freeLearningAloneIsCredit===false&&document.issuerReview.totalAcademicPathwayCostUSD===null,'Free learning is not a priced, eligible academic transcript.');
 assert(list(document.issuerReview.sourceIds).length&&document.issuerReview.sourceIds.every(id=>sources.get(id)?.kind==='provider'),'The academic transcript and admission conditions need their independent provider sources.');
 assert(document.paceReview?.maximumActiveCredits===18&&document.paceReview.maximumCompletedCreditsPerTerm===21&&document.paceReview.termMonths===4,'Preserve the documented provider workload limits.');
 return copy(document);
}

export async function readLibertyCLIReligionReview(){
 const review=JSON.parse(await readFile(resolve(root,'content/transfer-awards/liberty-cli-religion-reviewed-2026-11-24.json'),'utf8'));
 validateLibertyCLIReligionAwards(review);
 const bytes=await readFile(resolve(root,review.calculatorRequest.sourceSnapshot));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),review.calculatorRequest.sha256,'The retained current CLI calculator source changed.');
 await Promise.all(list(review.sources).filter(source=>source.capture).map(async source=>{
  const capture=source.capture;
  assert(typeof capture.path==='string'&&/^content\/(?:source-captures|transfer-awards\/snapshots)\/[a-zA-Z0-9_.-]+$/.test(capture.path)&&/^[a-f0-9]{64}$/.test(capture.sha256||''),'A retained primary source needs a local immutable capture and digest.');
  assert.equal(createHash('sha256').update(await readFile(resolve(root,capture.path))).digest('hex'),capture.sha256,'The retained CLI primary source changed: '+source.id);
 }));
 return validateLibertyCLIReligionAwards(review,JSON.parse(bytes));
}

export function applicableLibertyCLIReligionAwards(document,scope){
 if(!scope||scope.school!=='Liberty University'||!level(scope.level)||catalog(scope.catalogYear||scope.catalog)!=='2026-2027'||scope.creditSystem!=='semester'||scope.requiredAtUniversity||scope.institutionalOnly||!Number.isFinite(scope.credits)||!key(scope.receivingCode))return[];
 const mode=scope.modality||modes[scope.format];
 if(!['online','campus'].includes(mode)||scope.format&&modes[scope.format]!==mode)return[];
 return validateLibertyCLIReligionAwards(document).awards.filter(award=>key(award.receivingCode)===key(scope.receivingCode)&&award.credits===scope.credits&&award.modalities.includes(mode)).map(copy);
}

function retainReviewedBaseline(model,review){
 if(model.reviewedBaselineChoices!==undefined)return;
 const baseline=review.retainedBaselines?.[model.id];
 if(!baseline||baseline.version!==1||baseline.modelId!==model.id||baseline.format!==model.format||catalog(baseline.catalogYear)!==catalog(model.catalogYear||model.catalog)||baseline.creditSystem!==model.creditSystem||baseline.totalCredits!==model.totalCredits)return;
 const selections=baseline.optionSelections,requirements=list(model.requirements),sources=new Set(list(model.sources).map(source=>source.id));
 assert(selections&&typeof selections==='object'&&!Array.isArray(selections)&&Object.keys(selections).length===requirements.length&&requirements.reduce((sum,row)=>sum+row.credits,0)===model.totalCredits,'The retained baseline must describe this complete unchanged degree ledger.');
 assert(list(baseline.sourceIds).length&&baseline.sourceIds.every(id=>sources.has(id)),'Retained baseline evidence must resolve in this exact model.');
 for(const row of requirements)assert(list(row.options).some(option=>option.id===selections[row.id]&&option.evidence==='published'&&option.credits===row.credits),'Only existing documented choices may become retained defaults.');
 model.reviewedBaselineChoices=copy(baseline);
}

export function addLibertyCLIReligionOptions(input,review){
 if(input?.school!=='Liberty University'||!level(input.level)||catalog(input.catalogYear||input.catalog)!=='2026-2027'||input.creditSystem!=='semester'||!modes[input.format]||input.auditProvenance?.status==='student-provided')return input;
 validateLibertyCLIReligionAwards(review);
 const model=copy(input),used=new Set();let placements=0;
 for(const row of list(model.requirements)){
  const awards=applicableLibertyCLIReligionAwards(review,{school:model.school,level:model.level,catalogYear:model.catalogYear||model.catalog,format:model.format,creditSystem:model.creditSystem,credits:row.credits,receivingCode:row.code,institutionalOnly:row.institutionalOnly,requiredAtUniversity:row.requiredAtUniversity});
  for(const award of awards){
   const option={...award,courseUrl:award.providerCourseUrl,preapprovalRequired:true,receivingMapStatus:'published-university-calculator',issuerReview:copy(review.issuerReview),providerPacePolicy:copy(review.paceReview)};
   row.options=list(row.options);const existing=row.options.findIndex(value=>value.id===option.id);
   if(existing<0)row.options.push(option);else row.options[existing]=option;
   for(const id of [...option.sourceIds,...option.identitySourceIds])used.add(id);
   placements++;
  }
 }
 if(!placements)return input;
 for(const id of review.issuerReview.sourceIds)used.add(id);
 const sources=new Map(list(model.sources).map(source=>[source.id,source]));
 for(const source of review.sources.filter(source=>used.has(source.id))){
  const old=sources.get(source.id);assert(!old||old.url===source.url&&(!old.sha256||!source.sha256||old.sha256===source.sha256),'A conflicting source identity needs separate review.');
  sources.set(source.id,copy(source));
 }
 model.sources=[...sources.values()];
 retainReviewedBaseline(model,review);
 model.cliReligionMappingReview={checkedOn:review.checkedOn,sourceSnapshot:review.calculatorRequest.sourceSnapshot,receivingAwardSource:review.calculatorRequest.url,scope:'Exact fixed named undergraduate religion receiving awards. Current catalog, delivery format, academic transcript and personal approval remain explicit conditions.'};
 return model;
}

export async function run({check=false}={}){
 const review=await readLibertyCLIReligionReview();let placements=0;
 const ids=new Set(review.awards.map(award=>award.id));
 for(const file of legacyFiles){
  const path=resolve(root,'dist/data',file),before=JSON.parse(await readFile(path,'utf8')),after=addLibertyCLIReligionOptions(before,review);
  placements+=list(after.requirements).reduce((sum,row)=>sum+list(row.options).filter(option=>ids.has(option.id)).length,0);
  if(check)assert.deepEqual(before,after,file+' needs current CLI religion research choices');else await writeFile(path,JSON.stringify(after,null,2)+'\n');
 }
 return {check,files:legacyFiles.length,placements,distinctReceivingAwards:review.awards.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
