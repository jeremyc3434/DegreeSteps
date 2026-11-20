/** Exact, shared university agreement ingestion; no network or student records. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const common=`import sys,json,copy
from pathlib import Path
sys.path.insert(0,str(Path('scripts').resolve()))
from wgu_business_batch import apply_business_awards,validate_batch,reviewed_provider_identities,PRESERVED_MODELS,PROVIDERS,source_expression
packet=json.loads(Path('content/reuse/wgu-business-awards.json').read_text())
document=json.loads(Path('content/curricula/wgu.json').read_text())
def rejected(fn):
 try:fn()
 except (AssertionError,KeyError,ValueError,StopIteration):return
 raise AssertionError('The invalid review was accepted')
`;
function check(code){const result=spawnSync('python',['-c',common+code],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);}

test('one university agreement batch composes several exact ledgers with shared provider identities and no input mutations',()=>check(`
before=copy.deepcopy(document)
result,report=apply_business_awards(document,packet)
assert document==before and result is not document
assert len(report['programs'])>=2 and report['studentCreditsAwarded']==0
assert all(row['reusedProviderPlacements']>0 for row in report['programs'] if row['modelId']not in PRESERVED_MODELS)
for model in before['models']:
 revised=next(m for m in result['models'] if m['id']==model['id'])
 if model['id'] not in {p['modelId'] for p in packet['programs']+packet.get('existingPrograms',[])}:assert revised==model
 else:
  assert sum(r['credits'] for r in revised['requirements'])==model['totalCredits']
  assert revised.get('curriculumReview')==model.get('curriculumReview')
  assert revised.get('residencyPolicy')==model.get('residencyPolicy')
  assert revised['unresolved']==model['unresolved'], 'Review closure belongs to typed facts, not this award adapter'
  if model['id']in PRESERVED_MODELS:
   for row in model['requirements']:
    actual=next(r for r in revised['requirements']if r['id']==row['id'])
    assert (actual['code'],actual['title'],actual['credits'])==(row['code'],row['title'],row['credits'])
    for option in row['options']:assert option==next(o for o in actual['options']if o['id']==option['id']), 'Every existing option ID and pin remains intact'
assert apply_business_awards(result,packet)[0]==result
`));

test('every generated course award retains its exact program, catalog, university CU quantity and separate source semester quantity',()=>check(`
result,report=apply_business_awards(document,packet)
for review in packet['programs']:
 model=next(m for m in result['models'] if m['id']==review['modelId'])
 claims={(c['provider'],c['receivingCode']):c for c in review['receivingClaims']}
 for row in model['requirements']:
  for option in row['options']:
   if option.get('mappingReviewId')!=packet['id']:continue
   claim=claims[(option['provider'],row['code'])]
   assert option['code'] in claim['approvedSourceCodes']
   assert option['mappingEvidence']['programId']==review['programId']
   assert option['mappingEvidence']['catalogYear']==review['catalogTerm']
   assert option['credits']==claim['credits']==row['credits']
   assert option['creditSystem']=='competency-unit' and option['sourceCreditSystem']=='semester'
   assert option['sourceCreditStatus']=='verified' and option['identitySourceIds']
   assert option['sourceCreditVerification']['credits']==option['sourceCredits']
   assert not set(option['identitySourceIds']) & set(option['sourceIds'])
`));

test('cross-program, catalog, quantity, approved-state, capture and source-code mutations fail closed',()=>check(`
mutations=[
 lambda p:p.update(school='Different University'),
 lambda p:p.update(level='master'),
 lambda p:p.update(modality='campus'),
 lambda p:p.update(creditSystem='semester'),
 lambda p:p['agreements'][0].update(published=False),
 lambda p:p['agreements'][0].update(status='PENDING'),
 lambda p:p['captureIntegrity'][0].update(sha256='not-a-hash'),
 lambda p:p['programs'][0].update(active=False),
 lambda p:p['programs'][0].update(catalogTerm='202001'),
 lambda p:p['programs'][0].update(programId=True),
 lambda p:p['programs'][0]['receivingClaims'][0].update(programId=999999),
 lambda p:p['programs'][0]['receivingClaims'][0].update(credits=99),
 lambda p:p['programs'][0]['receivingClaims'][0].update(creditSystem='semester'),
 lambda p:p['programs'][0]['receivingClaims'][0].update(agreementRecordVersion=-1),
 lambda p:p['programs'][0]['receivingClaims'][0].update(approvedSourceCodes=['SOPH-9999']),
 lambda p:p['programs'][0]['receivingClaims'][0].update(mappingId=True),
 lambda p:p['programs'][0].update(createdBy='private-staff-field')]
for change in mutations:
 p=copy.deepcopy(packet);change(p);rejected(lambda:apply_business_awards(document,p))
`));

test('university-only coursework and altered receiving ledgers cannot inherit external awards',()=>check(`
review=packet['programs'][0];claim=review['receivingClaims'][0]
for field,value in [('institutionalOnly',True),('credits',99),('title','Another course')]:
 d=copy.deepcopy(document);model=next(m for m in d['models'] if m['id']==review['modelId']);row=next(r for r in model['requirements'] if r['code']==claim['receivingCode']);row[field]=value
 rejected(lambda:apply_business_awards(d,packet))
d=copy.deepcopy(document);model=next(m for m in d['models'] if m['id']==review['modelId']);model['catalog']='202001';rejected(lambda:apply_business_awards(d,packet))
`));

test('unknown provider identities are omitted and reported rather than borrowing a receiving credit quantity',()=>check(`
p=copy.deepcopy(packet);review=p['programs'][0];claim=review['receivingClaims'][0];provider=claim['provider'];code=PROVIDERS[provider]['prefix']+'-9999';claim['approvedSourceCodes']=[code];claim['originalPartnerCourseText']=code;claim['sourceExpression']=source_expression(provider,code)
result,report=apply_business_awards(document,p)
assert provider+':'+code in report['programs'][0]['unavailableProviderIdentities']
model=next(m for m in result['models'] if m['id']==review['modelId']);assert not any(o['code']==code for r in model['requirements'] for o in r['options'])
`));

test('shared source identities require independently reviewed original quantities and original source references',()=>check(`
for mutate in [lambda o:o.update(sourceCredits=-1),lambda o:o.update(sourceCreditSystem='competency-unit'),lambda o:o.update(identitySourceIds=['unknown-source']),lambda o:o['sourceCreditVerification'].update(credits=99)]:
 d=copy.deepcopy(document);model=next(m for m in d['models'] if m['id']=='curriculum-wgu-catalog-ecceaa488637ac83');option=next(o for r in model['requirements'] for o in r['options'] if o['evidence']=='published');mutate(option)
 rejected(lambda:apply_business_awards(d,packet))
`));

test('official receiving areas place all six ledgers once and bind named recency restrictions to the original requirement',()=>check(`
result,report=apply_business_awards(document,packet)
for review in packet['programs']:
 model=next(m for m in result['models'] if m['id']==review['modelId']);areas={r['code']:r['areaOfStudy'] for r in review['requirements']};caps=set(model.get('residencyPolicy',{}).get('capstoneRequirementIds',[]))
 sections=model['curriculumSections'];ids=[rid for s in sections for rid in s['requirementIds']]
 assert len(ids)==len(set(ids))==len(model['requirements'])
 assert sum(s['credits'] for s in sections)==model['totalCredits']
 for row in model['requirements']:
  expected='capstone' if row['id'] in caps else 'general' if areas[row['code']]=='General Education' else 'core'
  assert row['category']==expected
  assert row['curriculumAreaEvidence']['areaOfStudy']==areas[row['code']]
  section=next(s for s in sections if row['id']in s['requirementIds']);assert section['parentId']==expected and section['title']==areas[row['code']]
 for rule in review['recencyRules']:
  row=next(r for r in model['requirements']if r['code']==rule['receivingCode'])
  assert row['transferRecencyYears']==rule['years']
  assert model['transferRules']['courseSpecificRecencyYears'][row['code']]==rule['years']
  assert row['transferRecencySourceIds']==model['transferRules']['recencySourceIds']
  source=next(s for s in result['sources']if s['id']==row['transferRecencySourceIds'][0]);assert source['scope']['programId']==review['programId'] and source['notes'][rule['sourceField']]==rule['sourceText']
finance=next(p for p in packet['programs']if p['programCode']=='BSFIN');specific={r['receivingCode']:r['years']for r in finance['recencyRules']}
assert any(years==10 for years in specific.values()) and any(years==5 for years in specific.values())
`));

test('unbound or changed restrictive notes cannot silently become an unrestricted award',()=>check(`
for change in [lambda p:p['programs'][0]['transferNotes'].update(notesFinal='New unreviewed restriction'),lambda p:p['programs'][0]['transferNotes'].update(notesCore='A new course requires a B grade.'),lambda p:p['programs'][0]['recencyRules'].append({'receivingCode':'missing','years':1,'sourceField':'notesCore','sourceText':'invented'})]:
 p=copy.deepcopy(packet);change(p);rejected(lambda:apply_business_awards(document,p))
`));

test('the four new ready WGU plans render the exact published section hierarchy without worksheet issues or repeated credits',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),View=require('./dist/course-plan-view.js');
 const py=common+`result,report=apply_business_awards(document,packet)
models=[]
for review in packet['programs']:
 model=next(m for m in result['models']if m['id']==review['modelId'])
 if not model.get('residencyPolicy',{}).get('interpretationStatus')=='verified-additional-capstone':continue
 model['sources']=result['sources']
 for row in model['requirements']:
  if not any(o['provider']=='University' for o in row['options']):row['options'].append({'id':'university-'+row['id'],'provider':'University','code':row['code'],'title':row['title'],'credits':row['credits'],'creditSystem':'competency-unit','creditOrigin':'institutional','evidence':'published','sourceIds':row['sourceIds']})
 models.append(model)
print(json.dumps(models))`;
 const output=spawnSync('python',['-c',py],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(output.status,0,output.stderr);const models=JSON.parse(output.stdout);assert.equal(models.length,4);
 for(const program of models){const plan=Planner.generate(program,{providers:['Sophia','Study.com'],allowConditional:true,priority:'transfer',completed:[]});const view=View.build({program,plan,state:{learning:[]},match:{completed:[]}},{});assert.deepEqual(view.curriculumIssues,[],program.title);const leaves=[];function visit(section){if(section.children.length)section.children.forEach(visit);else leaves.push(section);}view.sections.forEach(visit);const ids=leaves.flatMap(s=>s.requirementIds);assert.equal(new Set(ids).size,program.requirements.length);assert.equal(ids.length,program.requirements.length);assert.equal(leaves.reduce((sum,s)=>sum+s.credits,0),program.totalCredits);}
});

test('independent provider facts are reusable from a conditional award at another school without inheriting that school award',()=>check(`
bundle=json.loads(Path('content/reuse/wgu-provider-identities.json').read_text());course=next(c for c in bundle['courses']if c['code']=='SDCM-0013');d=copy.deepcopy(document)
known_sources={s['id']for s in d['sources']}
d['sources'] += [s for s in bundle['sources']if s['id']not in known_sources]
foreign={'id':'different-school-model','school':'Different College','requirements':[{'id':'unrelated-requirement','code':'OTHER999','credits':99,'options':[{**course,'id':'conditional-foreign-placement','provider':'Study.com','credits':99,'evidence':'conditional','receivingCode':'OTHER999'}]}]}
d['models'].append(foreign)
identity=reviewed_provider_identities(d)[('Study.com','SDCM-0013')]
assert identity['sourceCredits']==3 and identity['sourceCreditSystem']=='semester'
assert 'credits'not in identity and 'receivingCode'not in identity and 'mappingEvidence'not in identity
`));

test('AND clauses retain every required source group and cannot award one component as the full university course',()=>check(`
from wgu_business_batch import source_expression
clauses=[c for p in packet['programs']+packet['existingPrograms']for c in p['receivingClaims']if not c['sourceExpression']['executableAsSingleCourse']]
assert len(clauses)==8
assert all(c['receivingCode']=='D196' and c['sourceExpression']['kind']=='multiple-required-source-groups' and len(c['sourceExpression']['groups'])==2 for c in clauses)
bundles=[json.loads(Path('content/reuse',name).read_text())for name in ['wgu-provider-identities.json','wgu-saylor-provider-identities.json','wgu-straighterline-provider-identities.json']]
d=copy.deepcopy(document);saylor=next(b for b in bundles if b['provider']=='Saylor');course=next(c for c in saylor['courses']if c['code']=='SAYA-0009');known={s['id']for s in d['sources']};d['sources'] += [s for s in saylor['sources']if s['id']not in known]
finance=next(m for m in d['models']if m['id']=='curriculum-wgu-catalog-d6925a8fbb6e8d9a');row=next(r for r in finance['requirements']if r['code']=='D196');row['options'].append({**course,'id':'invalid-old-single-accounting-constituent','credits':row['credits'],'creditSystem':'competency-unit','receivingCode':'D196','evidence':'published','sourceIds':row['sourceIds']})
result,report=apply_business_awards(d,packet,bundles);model=next(m for m in result['models']if m['id']==finance['id']);actual=next(r for r in model['requirements']if r['code']=='D196')
assert not any(o['provider']in PROVIDERS for o in actual['options']), 'Both original source actions are mandatory; no single original course receives the entire award'
assert any(item['optionId']=='invalid-old-single-accounting-constituent'for item in model['transferEvidenceReview']['retiredInvalidSingleCourseOptions'])
assert all(provider['multiSourceRequirementsHeld']for provider in model['transferEvidenceReview']['providerCoverage'].values())
assert apply_business_awards(result,packet,bundles)[0]==result
`));

test('all four captured providers have explicit selectable versus unknown and multi-source coverage accounting',()=>check(`
bundles=[json.loads(Path('content/reuse',name).read_text())for name in ['wgu-provider-identities.json','wgu-sophia-provider-identities.json','wgu-saylor-provider-identities.json','wgu-straighterline-provider-identities.json']]
result,report=apply_business_awards(document,packet,bundles)
assert len(report['programs'])==8
for item in report['programs']:
 assert item['allPossibleSourcesGloballyReviewed']is False
 review=next(p for p in packet['programs']+packet['existingPrograms']if p['modelId']==item['modelId'])
 for provider,coverage in item['providerCoverage'].items():
  approved={code for c in review['receivingClaims']if c['provider']==provider for code in c['approvedSourceCodes']}
  assert coverage['approvedSourceCodeCount']==len(approved)
  assert approved==set(coverage['independentlyVerifiedSourceCodes'])|set(coverage['unknownSourceIdentityCodesHeld'])
  assert set(coverage['independentlyVerifiedSelectableSourceCodes'])<=set(coverage['independentlyVerifiedSourceCodes'])
  assert coverage['agreementId']>0 and coverage['agreementRecordVersion']>0
`));

test('all four static identity bundles compose without inherited provider awards or runtime file reads',()=>check(`
from unittest.mock import patch
bundles=[json.loads(Path('content/reuse',name).read_text())for name in ['wgu-provider-identities.json','wgu-sophia-provider-identities.json','wgu-saylor-provider-identities.json','wgu-straighterline-provider-identities.json']]
assert {b['provider']:len(b['courses'])for b in bundles}=={'Study.com':23,'Sophia':18,'Saylor':29,'StraighterLine':2}
d=copy.deepcopy(document)
for model in d['models']:
 for row in model['requirements']:
  row['options']=[o for o in row['options']if o['provider']not in PROVIDERS]
assert reviewed_provider_identities(d)=={}
before=copy.deepcopy(d);bundles_before=copy.deepcopy(bundles)
with patch.object(Path,'read_text',side_effect=AssertionError('Compilation cannot read generated models')),patch.object(Path,'read_bytes',side_effect=AssertionError('Compilation cannot read generated models')):
 result,report=apply_business_awards(d,packet,bundles)
 assert apply_business_awards(result,packet,bundles)[0]==result
assert d==before and bundles==bundles_before
identities={(c['provider'],c['code']):c for bundle in bundles for c in bundle['courses']}
seen=set()
for review in packet['programs']+packet['existingPrograms']:
 model=next(m for m in result['models']if m['id']==review['modelId'])
 for row in model['requirements']:
  for option in row['options']:
   if option['provider']not in PROVIDERS:continue
   identity=identities[(option['provider'],option['code'])];seen.add(option['provider'])
   assert option['mappingReviewId']==packet['id']
   assert option['mappingEvidence']['programId']==review['programId']
   assert option['sourceCredits']==identity['sourceCredits'] and option['sourceCreditSystem']==identity['sourceCreditSystem']
   assert option['identitySourceIds']==identity['identitySourceIds']
   assert option['credits']==row['credits'] and option['creditSystem']=='competency-unit'
   assert row['code']!='D196' or review['programCode']not in {'BSACC','BSFIN'}
assert seen==set(PROVIDERS) and len(report['programs'])==8
`));
