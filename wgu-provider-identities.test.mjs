/** Independent source facts must never be manufactured from university awards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const setup = `import sys,json,copy
from pathlib import Path
sys.path.insert(0,str(Path('scripts').resolve()))
from wgu_provider_identities import validate_provider_bundle
bundle=json.loads(Path('content/reuse/wgu-provider-identities.json').read_text())
def validate(p):return validate_provider_bundle(p,'2026-11-20')
def rejected(fn):
 try:fn()
 except (AssertionError,KeyError,ValueError):return
 raise AssertionError('The invalid independent source review was accepted')
`;
function check(code) {
  const result=spawnSync('python3',['-c',setup+code],{encoding:'utf8',maxBuffer:1024*1024});
  assert.equal(result.status,0,result.stdout+result.stderr);
}

test('shared Study identities retain exact original quantities and previous review dates without importing any university award',()=>check(`
assert validate(bundle)==bundle
courses={c['code']:c for c in bundle['courses']}
assert len(courses)>=23
assert courses['SDCM-0016']['sourceCredits']==4, 'Current Math104 is four semester hours, not the stale six-credit support-table entry'
assert 'sourceUpper' not in courses['SDCM-0142'], 'Business318 conflicting level descriptions cannot be guessed'
assert courses['SDCM-0001']['identityCheckedOn']=='2026-11-18'
for code in ['SDCM-0086','SDCM-0085','SDCM-0123','SDCM-0151','SDCM-0057']:
 assert courses[code]['identityCheckedOn']=='2026-11-20'
 assert courses[code]['sourceCredits']==3 and courses[code]['sourceCreditSystem']=='semester'
`));

test('unknown, receiving-unit, changed-quantity, wrong-course, and receiving-school-source identities are rejected',()=>check(`
mutations=[
 lambda p:p['courses'][0].update(sourceCredits=None),
 lambda p:p['courses'][0].update(sourceCreditSystem='competency-unit'),
 lambda p:p['courses'][0].update(receivingCredits=3),
 lambda p:p['courses'][0].update(receivingCode='D196'),
 lambda p:p.update(school='Western Governors University'),
 lambda p:p['courses'][0].update(identitySourceIds=['unknown-source']),
 lambda p:p['courses'][0]['sourceCreditVerification'].update(credits=4),
 lambda p:p['sources'][0].update(url='https://partners.wgu.edu/provider-awards'),
 lambda p:p['sources'][0].update(aceId='SDCM-9999'),
 lambda p:p['courses'].append(copy.deepcopy(p['courses'][0])),
 lambda p:p.update(checkedOn='2026-11-21'),
]
for mutate in mutations:
 p=copy.deepcopy(bundle);mutate(p);rejected(lambda:validate(p))
p=copy.deepcopy(bundle)
c=next(c for c in p['courses']if c['code']=='SDCM-0016')
c['sourceCredits']=6;c['sourceCreditVerification']['credits']=6
rejected(lambda:validate(p))
`));

test('rendered extraction evidence cannot be relabeled as an origin-body capture and recommendation windows remain current',()=>check(`
for mutate in [lambda s:s.update(rawBodyCaptured=True),lambda s:s.update(captureMethod='origin-body'),lambda s:s.update(extractedTextSha256='not-a-hash'),lambda s:s.update(checkedOn='2026-11-21'),lambda s:s['observed'].update(aceId='SDCM-9999'),lambda s:s['observed'].update(offered=False)]:
 p=copy.deepcopy(bundle);s=next(s for s in p['sources']if s.get('extractedTextSha256'));mutate(s);rejected(lambda:validate(p))
for mutate in [lambda c:c.update(recommendationEnd='2026-11-19'),lambda c:c.update(recommendationStart='2026-11-21'),lambda c:c.update(recommendationPeriodSourceIds=[]),lambda c:c.update(recommendationPeriodSourceIds=['unknown-source'])]:
 p=copy.deepcopy(bundle);c=next(c for c in p['courses']if c.get('recommendationStart'));mutate(c);rejected(lambda:validate(p))
`));
