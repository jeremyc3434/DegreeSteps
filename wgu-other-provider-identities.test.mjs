/** Receiving-school awards cannot substitute for independent source credits. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const setup=`import sys,json,copy,hashlib,tempfile
from pathlib import Path
sys.path.insert(0,str(Path('scripts').resolve()))
from wgu_other_provider_identities import validate_bundle,read_capture,normalize_saylor,normalize_straighterline
saylor=json.loads(Path('content/reuse/wgu-saylor-provider-identities.json').read_text())
sl=json.loads(Path('content/reuse/wgu-straighterline-provider-identities.json').read_text())
def validate(p):return validate_bundle(p,'2026-11-20')
def rejected(fn):
 try:fn()
 except (AssertionError,KeyError,ValueError,TypeError):return
 raise AssertionError('An invalid original source identity was accepted')
`;
function check(code){const result=spawnSync('python',['-c',setup+code],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stdout+result.stderr);}

test('current Saylor original credits retain the one-credit exception and expirations independently of WGU receiving quantities',()=>check(`
assert validate(saylor)==saylor
courses={c['code']:c for c in saylor['courses']}
assert len(courses)==29 and courses['SAYA-0040']['sourceCredits']==1
assert sum(c['sourceCredits'] for c in courses.values())==85
assert courses['SAYA-0013']['providerCourseCode']=='BUS206' and courses['SAYA-0038']['providerCourseCode']=='BUS300'
assert courses['SAYA-0013']['recommendationEnd']=='2027-01-31' and courses['SAYA-0038']['recommendationEnd']=='2028-05-31'
assert all('courseVersion' not in c and 'recommendationStart' not in c for c in courses.values())
assert all(c['url'].startswith('https://www.acenet.edu/National-Guide/Pages/Course.aspx?') for c in courses.values())
assert all('providerCourseUrl' not in c for c in courses.values()), 'An evidence URL must not become a guessed enrollment URL'
`));

test('StraighterLine current offerings and separate exact ACE exhibits both support original semester-hour quantities',()=>check(`
assert validate(sl)==sl and len(sl['courses'])==2 and len(sl['sources'])==4
courses={c['code']:c for c in sl['courses']}
assert courses['OOSL-0036']['providerCourseCode']=='FIN101' and courses['OOSL-0002']['providerCourseCode']=='MAT101'
assert courses['OOSL-0036']['recommendationStart']=='2024-02-01' and courses['OOSL-0036']['recommendationEnd']=='2027-01-31'
assert courses['OOSL-0002']['recommendationStart']=='2024-06-01' and courses['OOSL-0002']['recommendationEnd']=='2027-05-31'
sources={s['id']:s for s in sl['sources']}
for c in courses.values():
 assert c['sourceCredits']==3 and c['sourceCreditSystem']=='semester' and c['courseVersion']==5
 assert len(c['identitySourceIds'])==2 and set(c['identitySourceIds'])==set(c['sourceCreditVerification']['sourceIds'])
 assert {sources[s]['kind'] for s in c['identitySourceIds']}=={'provider','ace'}
 assert all(sources[s]['url'].startswith('https://www.acenet.edu/') for s in c['recommendationPeriodSourceIds'])
`));

test('wrong providers, receiving awards, shifted units, changed quantities, unrelated sources, expired recommendations and unobserved claims are rejected',()=>check(`
for original in [saylor,sl]:
 mutations=[lambda p:p.update(school='Western Governors University'),lambda p:p.update(studentCreditsAwarded=3),lambda p:p.update(provider='Study.com'),lambda p:p.update(checkedOn='2026-11-21'),lambda p:p['courses'][0].update(receivingCode='D198'),lambda p:p['courses'][0].update(sourceCreditSystem='competency-unit'),lambda p:p['courses'][0].update(sourceCredits=True),lambda p:p['courses'][0]['sourceCreditVerification'].update(credits=99),lambda p:p['courses'][0].update(identitySourceIds=['unknown-source']),lambda p:p['sources'][0].update(url='https://partners.wgu.edu/'),lambda p:p['sources'][0].update(sha256='not-an-origin-hash'),lambda p:p['courses'][0].update(proctoringRequired=False),lambda p:p['courses'][0].update(price=0),lambda p:p['courses'].append(copy.deepcopy(p['courses'][0]))]
 for change in mutations:
  p=copy.deepcopy(original);change(p);rejected(lambda:validate(p))
 p=copy.deepcopy(original);p['courses'][0]['sourceCredits']=99;p['courses'][0]['sourceCreditVerification']['credits']=99;rejected(lambda:validate(p))
p=copy.deepcopy(saylor);p['courses'][0]['recommendationEnd']='2026-11-19';p['courses'][0]['identityEvidence']['providerTableRow']['expirationDate']='2026-11-19';rejected(lambda:validate(p))
p=copy.deepcopy(saylor);p['courses'][0]['courseVersion']=1;rejected(lambda:validate(p))
p=copy.deepcopy(sl);p['courses'][0]['recommendationEnd']='2026-11-19';p['courses'][0]['identityEvidence']['aceExhibit']['recommendationEnd']='2026-11-19';rejected(lambda:validate(p))
`));

test('capture readers reject changed bodies and provider inventories cannot silently shrink',()=>check(`
with tempfile.TemporaryDirectory() as folder:
 path=Path(folder)/'course.html';body=b'current official course body';path.write_bytes(body)
 receipt={'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'url':'https://www.straighterline.com/online-college-courses/college-algebra/','status':200}
 path.with_suffix('.receipt.json').write_text(json.dumps(receipt));assert read_capture(folder,'course.html')[0]==body
 path.write_bytes(body+b' altered');rejected(lambda:read_capture(folder,'course.html'))
 rejected(lambda:normalize_saylor(json.dumps({'article':{'id':24821523422484,'draft':False,'outdated':False,'body':'current ACE recommendations Credits <table></table>'}}).encode(),{'url':'https://support.saylor.org/api/v2/help_center/en-us/articles/24821523422484.json','capturedAt':'2026-11-20'}))
 rejected(lambda:normalize_saylor(json.dumps({'article':{'id':24821523422484,'draft':True,'outdated':False}}).encode(),{'url':'https://support.saylor.org/api/v2/help_center/en-us/articles/24821523422484.json','capturedAt':'2026-11-20'}))
`));

test('the provider normalizers do not import WGU documents or turn price and enrollment URLs into guessed source facts',()=>check(`
source=Path('scripts/wgu_other_provider_identities.py').read_text()
assert 'content/curricula/wgu.json' not in source and 'partner-agreement/' not in source
for bundle in [saylor,sl]:
 assert bundle['studentCreditsAwarded']==0 and bundle['publicationDecisionsMade']==0
 assert all(not {'price','cost','proctoringRequired','modelId','programId','receivingCredits'}.intersection(c) for c in bundle['courses'])
`));
