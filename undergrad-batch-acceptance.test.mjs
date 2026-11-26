/** Read-only expansion acceptance. Golden values were recorded from released
 * main b43a85a before the undergraduate batch; generated output cannot redefine
 * which existing degrees or outside-credit gains must be preserved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import Catalog from './dist/program-catalog.js';
import {loadKit,kitsRoot,root,clone,list,courseCodeKey,institutionChoicesFor,programUnits,today} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [quality,registry,publication,baselineIndex,library,pathways,directory]=await Promise.all([
  read('./dist/data/pathway-quality-report.json'),read('./dist/data/curriculum-registry.json'),
  read('./dist/data/publication-index.json'),read('./dist/data/baseline-index.json'),
  read('./dist/data/plan-library-index.json'),read('./dist/data/pathways.json'),read('./dist/data/program-catalog.json')
]);
const catalog=Catalog.attachRegistry(Catalog.merge(pathways,directory),registry);
const routes=new Map(catalog.pathways.map(route=>[route.id,route]));
const reports=new Map(quality.programs.map(program=>[program.modelId,program]));
const baselines=Object.values(baselineIndex.baselines);
const packs=new Map();
async function modelFor(id){
  const entry=registry.models.find(model=>model.id===id);assert(entry,id+' remains in the registry');
  if(!packs.has(entry.path))packs.set(entry.path,await read('./dist/'+entry.path));
  const document=packs.get(entry.path),model=(document.models||[document]).find(model=>model.id===id);
  assert(model,id+' remains in its actual published document');return model;
}
const edition=value=>String(value||'').replace(/[–—]/g,'-');
const academicLevel=value=>{
  const label=String(value||'').trim().toLowerCase(),degree=/^(associate|bachelor|master)(?:['’]s)?(?: degree)?$/.exec(label);
  return degree?degree[1]:/^doctor(?:ate|al)?(?: degree)?$/.test(label)?'doctorate':null;
};

// id, exact receiving degree total, minimum published outside credits, units,
// exact program edition/current-map identity. The two 37/29-CU WGU gains from
// the last release are deliberately stronger than the older 34/26-CU snapshot.
const preserved=[
 ['curriculum-liberty-healthcare-administration-bs-online',120,72,'semester','2026-2027'],
 ['curriculum-liberty-history-bs-online',120,69,'semester','2026-2027'],
 ['curriculum-liberty-human-services-bs-online',120,60,'semester','2026-2027'],
 ['curriculum-liberty-interdisciplinary-aa-online',60,39,'semester','2026-2027'],
 ['curriculum-liberty-psychology-addictions-online',120,69,'semester','2026-2027'],
 ['curriculum-liberty-psychology-bs-online',120,78,'semester','2026-2027'],
 ['curriculum-liberty-psychology-bs-residential',120,60,'semester','2026-2027'],
 ['curriculum-umpi-maol-yourpace',36,0,'semester','Current official MAOL academic map (reviewed 2026-11-25)'],
 ['curriculum-wgu-bs-cloud-network-engineering-aws-reviewed',112,34,'competency-unit','202608'],
 ['curriculum-wgu-bs-cloud-network-engineering-azure-reviewed',112,34,'competency-unit','202608'],
 ['curriculum-wgu-bs-cloud-network-engineering-cisco-reviewed',112,34,'competency-unit','202608'],
 ['curriculum-wgu-bs-cloud-network-engineering-general-reviewed',109,34,'competency-unit','202608'],
 ['curriculum-wgu-bs-data-analytics-reviewed',122,62,'competency-unit','202309'],
 ['curriculum-wgu-catalog-19be0ad2d1922f49',106,37,'competency-unit','202404'],
 ['curriculum-wgu-catalog-1d1cb06c2d479685',104,29,'competency-unit','202409'],
 ['curriculum-wgu-catalog-2e49db64c32dfc79',117,78,'competency-unit','202509'],
 ['curriculum-wgu-catalog-4431e5205a7d441a',110,58,'competency-unit','202605'],
 ['curriculum-wgu-catalog-689e417cff765fc9',112,69,'competency-unit','202607'],
 ['curriculum-wgu-catalog-93e0bd6d0c7171ac',120,60,'competency-unit','202607'],
 ['curriculum-wgu-catalog-94e68cf7b91dec17',110,60,'competency-unit','202509'],
 ['curriculum-wgu-catalog-995901539a30b649',91,38,'competency-unit','202406'],
 ['curriculum-wgu-catalog-a4bbd78b1b3233b7',122,37,'competency-unit','202610'],
 ['curriculum-wgu-catalog-bc26f6f5019c6ee3',122,28,'competency-unit','202612'],
 ['curriculum-wgu-catalog-c023977432f945c3',115,60,'competency-unit','202510'],
 ['curriculum-wgu-catalog-d6925a8fbb6e8d9a',121,78,'competency-unit','202608'],
 ['curriculum-wgu-catalog-ecceaa488637ac83',110,69,'competency-unit','202605'],
 ['curriculum-wgu-catalog-f5987d0b65c06f56',115,60,'competency-unit','202510'],
 ['liberty-business-residential',120,83,'semester','2026-2027'],
 ['liberty-criminal-justice-online',120,72,'semester','2026-2027'],
 ['liberty-criminal-justice-residential',120,74,'semester','2026-2027']
];
const unknownOriginalExamQuantities=new Set([
  'liberty-business-residential|CLEP-0039'
]);
// These pre-factory documents use their model's explicit semester units for
// receiving awards. Original provider quantities remain independently typed.
const legacyReceivingUnits=new Set(['liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential']);
const expandedIds=[
 'curriculum-tesu-ba-english','curriculum-tesu-ba-liberal-studies','curriculum-tesu-ba-psychology',
 'curriculum-tesu-bsba-accounting','curriculum-tesu-bsba-finance',
 'curriculum-wgu-catalog-358f1e10651bf3d8','curriculum-wgu-catalog-bf14bd14e87ae7aa',
 'curriculum-wgu-bs-computer-science-reviewed','curriculum-wgu-catalog-d734fb4b04eded7c',
 'curriculum-wgu-catalog-3a9fedcacbfcccae','curriculum-wgu-catalog-b2a8a37d4fbedabd',
 'curriculum-wgu-catalog-b83ee97289a0732a','curriculum-wgu-catalog-c4a7efe739d67a5c'
];

function readyReport(id,total,minimumOutside){
  const report=reports.get(id);assert(report,id+' remains in the quality report');
  assert.equal(report.publication.ready,true,id+': '+JSON.stringify(report.publication.reasonCodes));
  assert.equal(report.research.completeRequirementLedger,true,id);
  assert.equal(report.research.completeNamedBaseline,true,id);
  assert.equal(report.research.academicCountsValid,true,id);
  assert.equal(report.research.blockingFindings,0,id);
  assert.equal(report.metrics.degreeCredits,total,id);
  assert(report.metrics.publishedOutsideCredits>=minimumOutside,id+' loses reviewed outside credits');
  assert.equal(report.metrics.conditionalOutsideCredits,0,id);
  for(const field of ['reportedRecordsCount','confirmedRecordsCount','awardedCreditsInBaseline'])assert.equal(report.execution[field],0,id+' '+field);
  return report;
}

test('all 30 released degrees preserve their exact edition, units, full credit total and outside-credit gains',async()=>{
  assert.equal(preserved.length,30);assert.equal(new Set(preserved.map(row=>row[0])).size,30);
  assert.equal(publication.curriculumFingerprint,Catalog.publicationFingerprint(registry));
  assert.equal(baselineIndex.privateRecordsIncluded,false);
  for(const [id,total,outside,units,catalogIdentity]of preserved){
    readyReport(id,total,outside);
    const model=await modelFor(id);
    assert.equal(model.creditSystem,units,id);assert.equal(edition(model.catalogYear||model.catalog),catalogIdentity,id);
    assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),total,id+' exact requirement ledger');
    const published=publication.plans.find(plan=>plan.publicationReady&&plan.modelId===id);assert(published?.routeIds.length,id);
    for(const routeId of published.routeIds){
      assert.equal(routes.get(routeId)?.modelId,id,routeId+' correct model');
      assert.equal(library.plans[routeId]?.modelId,id,routeId+' library model');
      assert.equal(library.plans[routeId]?.tier,'reviewed',routeId+' reviewed library tier');
    }
    const startingPlans=baselines.filter(plan=>plan.modelId===id&&published.routeIds.includes(plan.pathwayId));assert(startingPlans.length,id);
    for(const plan of startingPlans){
      assert.equal(plan.qualityReady,true,id);assert.equal(plan.validation.academicCountsValid,true,id);assert.equal(plan.validation.policyChecksComplete,true,id);
      assert.equal(plan.summary.totalCredits,total,id);assert(plan.summary.transferCredits>=outside,id);
      assert.equal(plan.summary.transferCredits+plan.summary.universityCredits,total,id);
      assert.equal(plan.rows.reduce((sum,row)=>sum+row.credits,0),total,id);
      assert(plan.rows.every(row=>row.status==='planned'&&row.provider&&courseCodeKey(row.code)),id+' named proposed choices, without invented personal awards');
      const courses=plan.rows.map(row=>row.provider+'|'+courseCodeKey(row.code));assert.equal(new Set(courses).size,courses.length,id+' never counts an original course twice');
    }
  }
});

test('existing selected outside awards retain receiving evidence and original quantities independently',async()=>{
  let checked=0;const unknowns=new Set();
  for(const[id]of preserved){
    const model=await modelFor(id),sources=new Map(model.sources.map(source=>[source.id,source]));
    for(const plan of baselines.filter(plan=>plan.modelId===id))for(const selected of plan.rows.filter(row=>row.provider!=='University')){
      const requirement=model.requirements.find(row=>row.id===selected.requirementId),option=requirement?.options.find(option=>option.id===selected.optionId);assert(option,id+' selected option remains available');checked++;
      assert.equal(option.evidence,'published',id+' '+option.code);assert.equal(option.credits,selected.credits,id);assert.equal(option.credits,requirement.credits,id);assert.equal(option.creditSystem??(legacyReceivingUnits.has(id)?model.creditSystem:undefined),model.creditSystem,id+' receiving units');
      assert(option.sourceIds?.length&&option.identitySourceIds?.length,id+' '+option.code+' retains both claim bindings');
      for(const sourceId of [...option.sourceIds,...option.identitySourceIds])assert.match(sources.get(sourceId)?.url||'',/^https:\/\//,id+' '+sourceId);
      assert.notEqual(option.individualApproval,true,id+' a source review is not an individual award');
      assert.notEqual(option.receivingMapStatus,'provider-published-candidate',id+' a draft provider match cannot enter a released baseline');
      if(Number.isFinite(option.sourceCredits)&&option.sourceCredits>0){
        assert(['semester','quarter','competency-unit'].includes(option.sourceCreditSystem),id+' original units are explicit');
        if(id==='curriculum-liberty-healthcare-administration-bs-online'&&option.code==='CLEP-0039'){
          // This batch genuinely resolves one old unknown quantity. Preserve the
          // exact independently captured original recommendation, not a copy of
          // Liberty's numerically equal receiving-school award.
          assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');
          assert.equal(option.courseVersion,2);assert.equal(option.recommendationStart,'2023-01-01');assert.equal(option.recommendationEnd,'2028-12-31');
          assert.deepEqual(option.sourceCreditVerification,{credits:3,creditSystem:'semester',sourceIds:['shared-clep-clep-0039-current-exhibit-20261126']});
          const source=sources.get(option.sourceCreditVerification.sourceIds[0]);assert.equal(source?.kind,'ace');
          const body=await readFile(join(root,source.capture),'utf8');
          assert.equal(createHash('sha256').update(body).digest('hex'),'cc1a0ecd1b1c804ce399617f1def37fea4634753c3fa9e6e76a79915822d8693');
          assert.equal(source.sha256,'cc1a0ecd1b1c804ce399617f1def37fea4634753c3fa9e6e76a79915822d8693');
          assert.match(body,/ACE ID:\s*CLEP-0039\s*Version:\s*2/);assert.match(body,/Lower-Division Baccalaureate\s*3\s*Financial Accounting/);
        }
      }
      else{
        const key=id+'|'+option.code;assert(unknownOriginalExamQuantities.has(key),key+' newly loses known original quantities');unknowns.add(key);
        assert(option.sourceCredits==null&&option.sourceCreditSystem==null,key+' an unknown original exam recommendation is never copied from receiving credit');
      }
    }
  }
  assert(checked>0,'The source-quality audit inspects actual released outside choices');
  assert.deepEqual([...unknowns].sort(),[...unknownOriginalExamQuantities].sort());
  const analytics=await modelFor('curriculum-wgu-bs-data-analytics-reviewed');
  const database=analytics.requirements.find(row=>row.code==='D427').options.find(option=>option.code==='SDCM-0218');
  assert.equal(database.sourceCredits,3);assert.equal(database.sourceCreditSystem,'semester');assert.equal(database.credits,4);assert.equal(database.creditSystem,'competency-unit');
});

test('every ready degree stays visible in its actual associate, bachelor or master library filter',async()=>{
  const ready=publication.plans.filter(plan=>plan.publicationReady),readyIds=new Set(ready.map(plan=>plan.modelId));
  for(const id of [...preserved.map(row=>row[0]),...expandedIds])assert(readyIds.has(id),id+' retains a ready, discoverable starting plan');
  const expectedRoutes=new Map();
  for(const published of ready){
    const model=await modelFor(published.modelId),entry=registry.models.find(entry=>entry.id===model.id),level=academicLevel(model.level);
    assert(['associate','bachelor','master'].includes(level),model.id+' actual degree level is explicit and recognized');
    assert.equal(entry.level,level,model.id+' registry carries the compiled academic level');
    if(!expectedRoutes.has(level))expectedRoutes.set(level,new Set());
    for(const routeId of published.routeIds){
      const listing=library.plans[routeId];assert(listing,routeId+' library listing');
      assert.equal(listing.modelId,model.id);assert.equal(listing.published,true);assert.equal(listing.tier,'reviewed');
      assert.equal(listing.level,level,routeId+' cannot disappear from or enter the wrong degree-level filter');
      expectedRoutes.get(level).add(routeId);
    }
  }
  assert.deepEqual([...expectedRoutes.keys()].sort(),['associate','bachelor','master'],'The audit exercises all three actual published degree levels');
  for(const [level,expected]of expectedRoutes){
    const visible=Object.entries(library.plans).filter(([,listing])=>listing.published&&listing.level===level).map(([routeId])=>routeId);
    assert.deepEqual(visible.sort(),[...expected].sort(),level+' filter has every exact ready route and no courses from another degree level');
  }
});

test('undergraduate expansion cannot apply ACE, minor or undergraduate residency rules to the existing UMPI master’s',async()=>{
  const model=await modelFor('curriculum-umpi-maol-yourpace');
  assert.equal(model.level,'master');assert.equal(model.externalMaxCredits,6);assert.equal(model.institutionMinCredits,30);
  for(const field of ['alternativeMaxCredits','majorMinInstitutionCredits','majorInstitutionFraction'])assert.equal(model[field],undefined,field+' stays out of the graduate model');
  assert.equal(model.requirements.length,12);assert(model.requirements.every(row=>row.credits===3&&row.options.every(option=>option.provider==='University')));
  assert.equal(model.pricing.amount,2450);assert.equal(model.pricing.period,'8 weeks');
  assert.equal(reports.get(model.id).acceleration.mechanism,'self-paced');
});

test('real shared university-choice pools stay source-bound, scoped and distinct from transfer awards',async t=>{
  const kits=await Promise.all(['umpi','tesu'].map(school=>loadKit(join(kitsRoot,school))));
  const adopted=kits.filter(kit=>list(kit.school.institutionChoicePools).length);
  if(!adopted.length){t.skip('No production UMPI/TESU named choice pool has been adopted; no pool coverage is claimed.');return;}
  for(const kit of adopted){
    const result=await verifyKit(kit,{asOf:today()});assert.deepEqual(result.errors,[],kit.school.id+' current kit must verify before pooled choices are accepted');
    const sources=new Map(kit.school.sources.map(source=>[source.id,source]));
    for(const pool of kit.school.institutionChoicePools){
      assert.equal(pool.review.status,'reviewed');assert.notEqual(pool.scope.all,true);
      for(const key of ['programs','catalogs','levels','modalities'])assert(pool.scope[key]?.length,pool.id+' exact '+key);
      for(const claim of [pool,...pool.courses])for(const sourceId of claim.sourceIds){
        const source=sources.get(sourceId);assert.equal(source?.kind,'university',pool.id+' receiving-school primary evidence');
        assert(source.capture,pool.id+' captured evidence');
        const body=await readFile(join(root,source.capture),'utf8'),digest=createHash('sha256').update(body).digest('hex');
        const sidecar=JSON.parse(await readFile(join(root,source.capture.replace(/\.txt$/,'.json')),'utf8'));
        assert.equal(sidecar.sha256,digest,pool.id+' immutable retained source body');
        if(source.sourceContentHash)assert.equal(source.sourceContentHash,'sha256:'+digest,pool.id);
      }
    }
    for(const program of kit.programs){
      const participating=program.requirements.filter(row=>row.slot?.institutionChoicePoolIds?.length);if(!participating.length)continue;
      const raw=compileProgram(kit,program),offered=[];
      for(const requirement of participating){
        const rows=raw.requirements.filter(row=>row.id===requirement.id||row.allocationOf===requirement.id);
        for(const row of rows)for(const option of row.options.filter(option=>option.provider==='University')){
          const eligible=institutionChoicesFor(kit,program,requirement,{credits:row.credits});
          const choice=eligible.find(course=>courseCodeKey(course.code)===courseCodeKey(option.code));assert(choice,program.slug+' '+option.code+' eligible for this exact slot');
          assert.equal(option.creditOrigin,'institutional');assert.equal(option.evidence,'published');assert.equal(option.creditSystem,programUnits(kit,program));assert.equal(option.credits,row.credits);assert.deepEqual(option.sourceIds,choice.sourceIds);
          assert.equal(option.mappingEvidence,undefined);assert.equal(option.receivingCode,undefined);assert.equal(option.sourceCredits,undefined,'A university fallback cannot invent outside source credit');
          offered.push(courseCodeKey(option.code));
        }
        const changed=clone(program);changed.catalog='UNREVIEWED-ACCEPTANCE-CATALOG';changed.catalogYear='UNREVIEWED-ACCEPTANCE-CATALOG';
        assert.deepEqual(institutionChoicesFor(kit,changed,changed.requirements.find(row=>row.id===requirement.id),{credits:rows[0].credits}),[],'A shared pool cannot leak to an unreviewed catalog');
      }
      assert.equal(new Set(offered).size,offered.length,program.slug+' shares each pooled course at most once');
    }
    const altered={...clone({...kit,providers:undefined}),providers:kit.providers},firstPool=altered.school.institutionChoicePools[0];
    firstPool.quotes[0].text+=' [ACCEPTANCE FABRICATED QUOTE]';
    const rejected=await verifyKit(altered,{asOf:today()});
    assert(rejected.errors.some(error=>error.code==='quote-not-found'),'A forged pool-eligibility quote must fail real capture verification');
  }
});
