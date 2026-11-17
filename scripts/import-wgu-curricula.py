"""Compile reviewed WGU standard-path tables and current Sophia partnership facts.

Inputs are retained native-web extracts of official sources, not guessed curricula.
The compiler checks row totals against an explicitly published total where present.
No network request, student record or runtime AI is needed.
"""
from pathlib import Path
import json,re,sys
from wgu_undergraduate_policies import apply_reviewed_undergraduate_policies

ROOT=Path(__file__).resolve().parents[1]
SNAP=ROOT/'content/curricula/snapshots/wgu'
CHECKED='2026-11-09'
def norm(v):return re.sub('[^a-z0-9]','',str(v).lower())
def slug(v):return re.sub('[^a-z0-9]+','-',str(v).lower()).strip('-')

def validate_reviewed_model_updates(model,updates,refs):
 """Bind the conservative policy check to its exact CU ledger and primary sources."""
 assert model['id']=='curriculum-wgu-catalog-ecceaa488637ac83'and model['catalog']=='202605'and model['creditSystem']=='competency-unit'and model['totalCredits']==110,'Policy update needs the reviewed WGU Business Management ledger'
 assert updates.get('policySourceIds')and set(updates['policySourceIds'])<=set(refs),'Policy updates need known university sources'
 assert updates['externalMaxCredits']==updates['alternativeMaxCredits']==model['totalCredits']*0.75,'Do not replace the 110-CU program ceiling with an old 120-credit cap'
 policy=updates['residencyPolicy'];assert policy['type']=='institution-fraction-with-capstone-exclusion'and policy['creditSystem']==model['creditSystem']and policy['fraction']==0.25 and policy['interpretationStatus']in['exact-floor-unresolved','verified-additional-capstone'],'Preserve the source-bound residency rule'
 capstones=[row for row in model['requirements']if row['id']in policy['capstoneRequirementIds']]
 assert len(capstones)==1 and capstones[0]['code']=='QGT1'and capstones[0]['institutionalOnly']is True and sum(row['credits']for row in capstones)==policy['capstoneCredits']==4,'The named 4-CU WGU capstone must remain institution-only'
 check=policy['conservativeSufficientCondition'];assert check['basisCredits']==model['totalCredits']and check['minimumNonCapstoneInstitutionCUs']==model['totalCredits']*policy['fraction'],'The sufficient condition uses total degree CUs and excludes capstone from credited WGU progress'
 assert policy['sourceIds']and set(policy['sourceIds'])<=set(refs),'Residency rule needs reviewed primary sources'
 if 'creditScope'in policy:assert policy['creditScope']=='active-program' and 'wgu-residency-policy-23797-20260918' in policy['sourceIds'],'Current-program residency needs the reviewed active-program policy scope'
 if policy['interpretationStatus']=='verified-additional-capstone':
  assert 'wgu-residency-policy-23797-20260918'in policy['sourceIds']and policy['calculatedMinimumInstitutionCUs']==check['minimumNonCapstoneInstitutionCUs']+policy['capstoneCredits']==31.5,'The verified residency floor requires the current primary handbook and additional capstone'
 price=updates['pricing'];assert price['model']=='subscription'and price['period']=='6 months'and price['amount']==price['tuitionPerTerm']+price['resourceFeePerTerm']==4050 and price['includesResourceFee']is True,'Keep tuition and mandatory resource fees in one six-month term basket'
 assert len(price['oneTimeFees'])==1 and price['oneTimeFees'][0]['amount']==65 and price['oneTimeFees'][0]['frequency']=='one-time','The application fee must not be charged each term'
 reviews=updates.get('policyReview',[])
 assert len(reviews)==1 and reviews[0]['field']=='upperMinCredits'and reviews[0]['status']=='resolved'and reviews[0]['resolution']=='covered-by-complete-named-curriculum'and set(reviews[0]['sourceIds'])=={'wgu-bsmgt-catalog-202611','wgu-bsmgt-guide'}and set(reviews[0]['sourceIds'])<=set(refs),'Resolve only the separate aggregate check with complete named-curriculum evidence'
 rules=updates.get('transferRules',{})
 if rules.get('gradeScopeSourceIds'):
  review=json.loads((SNAP/'bsmgt-202611-current-partner-api-reviewed-evidence.json').read_text())
  assert rules['gradeScopeSourceIds']==['wgu-bsmgt-transfer-guidelines-api-240-reviewed']and set(rules['gradeScopeSourceIds'])<=set(refs),'Grade scope needs the exact reviewed receiving-program guideline'
  assert rules['businessReceivingCourseCodes']==sorted(row['code']for row in review['requirements']if row['transferArea']in['Core','Additional Transfer'])and rules['otherReceivingCourseCodes']==sorted(row['code']for row in review['requirements']if row['transferArea']=='General Education'),'Grade scope must follow explicit university receiving areas, not legacy category, title or irregular group labels'

def apply_reviewed_supplements(out):
 """Retain separately reviewed provider facts; changed catalogs require review."""
 for file in sorted((ROOT/'content/curricula/overlays').glob('wgu-*.json')):
  patch=json.loads(file.read_text());model=next((m for m in out['models']if m['id']==patch['modelId']),None)
  assert patch['version']==1 and model and model['catalog']==patch['catalog'],f'{file.name}: review additions against the new program catalog before importing'
  refs={source['id']:source for source in out['sources']}
  for source in patch['sources']:
   assert source['id']not in refs or refs[source['id']]==source,f'{file.name}: conflicting source revision'
   if source['id']not in refs:out['sources'].append(source);refs[source['id']]=source
  for source in patch.get('refreshSources',[]):
   assert source['id']in refs and refs[source['id']]['url']==source['url'] and refs[source['id']]['title']==source['title'],f'{file.name}: reviewed primary source changed'
   if refs[source['id']].get('checked','')<=source.get('checked',''):refs[source['id']].update(source)
  receiving=None
  if patch.get('receivingReview'):
   assert patch['receivingReview']=='content/curricula/snapshots/wgu/bsmgt-202611-current-partner-api-reviewed-evidence.json',f'{file.name}: unknown receiving review'
   receiving=json.loads((ROOT/patch['receivingReview']).read_text())
   assert receiving['scope']['programId']==240 and receiving['scope']['catalog']==model['catalog']=='202605'and receiving['scope']['totalCredits']==model['totalCredits']==110,f'{file.name}: receiving review must match the exact current program'
   assert all(a['published']is True and a['status']=='APPROVED'for a in receiving['agreements']),f'{file.name}: only currently published approved receiving maps may be used'
  for revised in patch['requirements']:
   row=next((r for r in model['requirements']if r['id']==revised['id']),None)
   assert row and row['title']==revised['title'] and row['credits']==revised['credits'],f'{file.name}: requirement identity or receiving credits changed'
   assert not row.get('code')or row['code']==revised['code'],f'{file.name}: receiving course code changed'
   row['code']=revised['code'];row['sourceIds']=list(dict.fromkeys(row['sourceIds']+revised['sourceIds']))
   if 'institutionalOnly'in revised:
    assert revised['institutionalOnly']is True and not row['options'],f'{file.name}: a nontransferable course cannot retain outside alternatives'
    row['institutionalOnly']=True
   if 'transferEligibility'in revised:
    claim=revised['transferEligibility'];assert claim['status']in['transferable','nontransferable']and claim['sourceIds']and set(claim['sourceIds'])<=set(refs),f'{file.name}: transfer eligibility needs reviewed university evidence'
    assert claim['status']!='nontransferable'or row.get('institutionalOnly'),f'{file.name}: nontransferable course must stay at WGU'
    row['transferEligibility']=claim
   if 'transferRecencyYears'in revised:
    assert revised['transferRecencyYears']==5 and revised.get('transferEligibility',{}).get('status')=='transferable',f'{file.name}: unsupported course-recency rule'
    row['transferRecencyYears']=5
   if revised.get('replaceProviderOptions'):
    assert receiving and set(revised['replaceProviderOptions'])<=set(['Sophia','Study.com']),f'{file.name}: replacements need the exact current receiving review'
    row['options']=[option for option in row['options']if option['provider']not in revised['replaceProviderOptions']]
   for option in revised['options']:
    assert option['provider']in['Study.com','Sophia']and option['creditOrigin']in['ace','alternative']and option['credits']==row['credits']and set(option['sourceIds'])<=set(refs),f'{file.name}: unsupported reviewed addition'
    if option['evidence']=='published':
     assert receiving and option['creditSystem']=='competency-unit'and option['receivingCode']==row['code'],f'{file.name}: published award needs current exact receiving evidence'
     claims=[claim for claim in receiving['receivingClaims']if claim['provider']==option['provider']and claim['receivingCode']==row['code']and option['code']in claim['approvedSourceCodes']and claim['credits']==row['credits']]
     assert len(claims)==1 and option['universityMapRecord']['mappingId']==claims[0]['mappingId']and option['universityMapRecord']['agreementRecordVersion']==claims[0]['agreementRecordVersion'],f'{file.name}: mismatched provider, program, course or approval revision'
     assert all(refs[source]['kind']=='university'and 'receiving-map'in refs[source]['roles']and refs[source]['scope']['catalogYear']=='202605'for source in option['sourceIds']),f'{file.name}: published award needs scoped university sources'
     assert option['sourceCreditStatus']=='verified'and option['sourceCredits']>0 and option['sourceCreditSystem']=='semester'and option['identitySourceIds']and set(option['identitySourceIds'])<=set(refs),f'{file.name}: keep independently reviewed original source quantities separate'
    else:assert option['evidence']=='conditional'and option['creditOrigin']=='ace',f'{file.name}: unsupported evidence promotion'
    assert not any(o['id']==option['id']for o in row['options']),f'{file.name}: duplicate course option'
    row['options'].append(option)
  updates=patch.get('modelUpdates',{})
  allowed={'externalMaxCredits','alternativeMaxCredits','policySourceIds','policyEvidence','policyReview','residencyPolicy','pricing','pacePolicy','transferRules','personalEvaluationReminder','researchGaps','transferEvidenceReview'}
  assert set(updates)<=allowed,f'{file.name}: unsupported model policy update'
  if updates:
   validate_reviewed_model_updates(model,updates,refs)
   model.update(updates)
  removed=patch.get('removeUnresolved',[])
  model['unresolved']=[patch['replaceUnresolved'].get(note,note)for note in model['unresolved']if note not in removed]+patch['appendUnresolved']
  model['rulesNotes']+=patch.get('appendRulesNotes',[])
  model['rulesNotes']=[patch.get('replaceRulesNotes',{}).get(note,note)for note in model['rulesNotes']]
  model['mappingCheckedOn']=max(model.get('mappingCheckedOn',''),patch['mappingCheckedOn']);out['checkedOn']=max(out['checkedOn'],patch['checkedOn'])
 return out
catalog=json.loads((ROOT/'dist/data/program-catalog.json').read_text())['programs']
courses=json.loads((ROOT/'dist/data/course-catalog.json').read_text())['courses']
routes={norm(p['title']):p for p in catalog if p['school']=='Western Governors University'}
route_by_pdf={
 'BSMGT':'business-management-bachelors-program.html','BSACC':'accounting-bachelors-program.html',
 'BSHR':'human-resources-bachelors-program.html','BSMKT':'marketing-bachelors-program.html',
 'BSFIN':'finance-bachelors-program.html',
 'BSIT':'information-technology-bachelors-program.html',
 'BSCSIA':'cybersecurity-information-assurance-bachelors-program.html',
 'BSSWE':'software-engineering-bachelors-program.html',
 'BSPSY':'psychology-bachelors-program.html',
 'BSHA':'healthcare-administration-bachelors-program.html',
 'BSITM':'it-information-technology-management-bachelors-program.html',
 'BSSCOM':'supply-chain-operations-management-bachelors-program.html',
 'BSC':'communications-bachelors-program.html',
 'BSPM':'project-management-bachelors-program.html',
 'BSUXD':'user-experience-design-bachelors-program.html',
 'BSCS':'computer-science/program-guide.html',
 'BSHS':'health-science-bachelors-program.html',
 'BSPH':'public-health-bachelors-program.html',
 'BSHIM':'health-information-management-bachelors-program.html',
 'MBA':'mba-masters-business-administration-program.html',
}
versions={'BSMGT':'202605','BSACC':'202503','BSHR':'202509','BSMKT':'202607'}

def sections(text):
 return re.split(r'\n-{20,}\n',text)
def text_lines(part):
 return [re.sub(r'\s+',' ',re.sub(r'^L\d+@P[0-9-]+: ?','',x)).strip() for x in part.splitlines() if re.match(r'^L\d+@P',x)]
def table(part):
 lines=text_lines(part)
 headers=[i for i,x in enumerate(lines) if re.search(r'Course (Description|Title) CUs Term',x)]
 if not headers:return None
 rows=[];pending='';total=None;closed=False
 lines=[part for line in lines[headers[0]+1:]for part in re.split(r'(?<=\d)(?=[A-Z])',line)]
 for x in lines:
  x=re.sub(r'Standard Path for Bachelor of Science, Software Engineering','',x).strip()
  if x.startswith('Total CUs'):
   match=re.search(r'(\d+)\s*$',x)
   total=int(match[1])if match and int(match[1])<500 else None
   continue
  if x.startswith(('Changes to Curriculum','Prerequisites','WGU publishes an Institutional Catalog')):closed=True;break
  if re.match(r'^[A-Z]{2,12} \d{6}',x)and'WGU publishes'in x:closed=True;break
  if not x or re.search(r'Course (Description|Title) CUs Term',x) or re.match(r'^[A-Z]{2,12} \d{6}',x) or re.fullmatch(r'\d+',x):continue
  if re.fullmatch(r'\d+ \d+',x) and pending:
   a,b=x.split();rows.append((pending,int(a)));pending='';continue
  m=re.search(r' (?P<units>\d+) (?P<term>\d+)(?:$| (?P<rest>.+))',x)
  if not m:m=re.search(r' (?P<units>\d+)$',x)
  if m:
   title=(pending+' '+x[:m.start()]+(' '+m.groupdict().get('rest','') if m.groupdict().get('rest') else '')).strip()
   assert title and len(title)>4 and 0<int(m['units'])<=12,(title,m.groupdict())
   rows.append((title,int(m['units'])));pending=''
  else:pending=(pending+' '+x).strip()
 if total is not None and rows and sum(row[1]for row in rows)==total and not pending:closed=True
 if not closed or pending:return None
 assert rows and len({norm(x[0]) for x in rows})==len(rows),'Duplicate/malformed standard path'
 if total is not None:assert sum(x[1]for x in rows)==total,(rows,total)
 return rows,total or sum(x[1]for x in rows)

def sophia_rows(kind='business'):
 text=sophia_text(kind);result=[];category=''
 if '## Courses'in text:text=text.split('## Courses',1)[1]
 for raw in text.splitlines():
  line=re.sub(r'^L\d+: ?','',raw)
  if 'Sophia Courses Without Transfer Equivalency' in line:break
  if line in ['Business','English and Communication','Humanities','Math','Science','Social Science']:category=line
  clean=re.sub(r'【\d+†([^】]+)】',r'\1',line)
  fields=[part.strip()for part in clean.split('|')]
  index=next((i for i,value in enumerate(fields)if re.fullmatch(r'SOPH-\d+',value)),None)
  if index is None or index<2 or index+1>=len(fields)or not fields[index+1].isdigit():continue
  title,receiving,code,credits=fields[index-2:index+2]
  for target in receiving.split(';'):
   target=re.sub(r'\s*\(\d+ credits\)','',target).strip()
   result.append({'title':title,'receiving':target,'code':code,'sourceCredits':int(credits),'category':category})
 return result

def sophia_text(kind):
 for suffix in ['complete-current-web.txt','search-current-web.txt','current-web.txt']:
  candidate=SNAP/('sophia-'+kind+'-'+suffix)
  if candidate.exists():
   text=candidate.read_text()
   if '## Courses'in text and 'SOPH-0015'in text:return text
 raise AssertionError('Missing valid Sophia '+kind+' source table')

def main():
 models=[];sources=[]
 tuition={}
 for f in SNAP.glob('*tuition-current-web.txt'):
  for part in sections(f.read_text()):
   url_match=re.search(r'https://www\.wgu\.edu/[^\s)]+\.html',part)
   lines=[re.sub(r'^L\d+: ?','',line)for line in part.splitlines()if re.match(r'^L\d+:',line)]
   for i,line in enumerate(lines):
    if 'Tuition per six-month term'in line and url_match:
     price=re.search(r'\$([\d,]+)', ' '.join(lines[i+1:i+5]))
     if price:tuition[url_match[0]]=int(price[1].replace(',',''))
 partnership={'business':'wgucollegeofbusiness','technology':'wgucollegeofinformationtechnology','health':'wgucollegeofhealthprofessions'}
 for kind,domain in partnership.items():sources.append({'id':'wgu-sophia-'+kind+'-current','title':'Sophia WGU '+kind+' current partnership table and March2026 change notice','url':'https://'+domain+'.sophia.org/','checked':CHECKED})
 extracts=[]
 for f in sorted(SNAP.glob('*.txt')):
  if f.name.startswith('sophia-'):continue
  for part in sections(f.read_text()):
   u=re.search(r'https://www\.wgu\.edu/[^\s)]+/([A-Z0-9]+)\.pdf',part)
   if not u or u[1]not in route_by_pdf:continue
   try:parsed=table(part)
   except AssertionError as error:
    if not(SNAP/(u[1].lower()+'-reviewed-table.json')).exists():print('Skipped ambiguous table',u[1],str(error)[:200])
    continue
   if parsed:extracts.append((u[1],u[0],part,parsed))
 unique={code:(url,part,parsed)for code,url,part,parsed in extracts}
 general_titles={}
 for f in sorted(SNAP.glob('*.txt')):
  for part in sections(f.read_text()):
   pdf=re.search(r'https://www\.wgu\.edu/[^\s)]+/([A-Z0-9]+)\.pdf',part)
   if not pdf:continue
   active=False
   for line in text_lines(part):
    if line=='General Education':active=True;continue
    if active and line in ['Capstone','Business Core','Business Management','Finance','Accounting','Marketing','Healthcare Management','Human Resource Management','Information Technology','Health Information Management','Project Management','User Experience Design','Supply Chain and Operations Management']:break
    if active:general_titles.setdefault(pdf[1],set()).add(norm(line))
 reviewed_cs=SNAP/'bscs-202611-reviewed-table.json'
 declared=[]
 if reviewed_cs.exists():
  cs=json.loads(reviewed_cs.read_text());assert sum(row[1]for row in cs['rows'])==cs['totalCredits']==121
  declared.append({'id':'wgu-bs-computer-science-reviewed','school':'Western Governors University','title':'Computer Science – B.S.','level':'bachelor','modalities':['online'],'url':'https://www.wgu.edu/online-it-degrees/computer-science/program-guide.html'})
  unique['BSCS']=(cs['sourceUrl'],'Catalog Version: 202611',(cs['rows'],cs['totalCredits']))
 for code in ['BSC','BSHIM']:
  reviewed=SNAP/(code.lower()+'-reviewed-table.json')
  if reviewed.exists():
   entry=json.loads(reviewed.read_text());assert sum(row[1]for row in entry['rows'])==entry['totalCredits']
   unique[code]=(entry['sourceUrl'],'Reviewed printed standard-path table',(entry['rows'],entry['totalCredits']))
 for code,(url,part,(rows,total)) in unique.items():
  route=next(p for p in catalog+declared if p['school']=='Western Governors University'and p['url'].endswith(route_by_pdf[code]))
  source_id='wgu-'+code.lower()+'-guide';sources.append({'id':source_id,'title':route['title']+' official standard path','url':url,'checked':CHECKED})
  kind='technology'if code in ['BSIT','BSCSIA','BSSWE','BSCS']else'health'if code in ['BSPSY','BSHS','BSPH','BSHIM']else'business'
  sophia=sophia_rows(kind)if route['level']=='bachelor'else[];sophia_source='wgu-sophia-'+kind+'-current'
  version=re.search(r'Catalog Version:\s*(\d{6})',part)
  if not version:version=re.search(code+r' (\d{6})',part)
  version=version[1]if version else versions.get(code,'Published program guide; catalog version needs confirmation')
  requirements=[]
  for title,units in rows:
   matches=[s for s in sophia if norm(s['receiving'])==norm(title) or (s['receiving']=='Integrated Physical Science'and title=='Integrated Physical Sciences') or(s['receiving']=='Health, Fitness and Wellness'and title=='Health, Fitness, and Wellness')]
   options=[]
   for s in matches:
    course=next((c for c in courses if c['provider']=='Sophia'and norm(c['title'])==norm(s['title'])),None)
    options.append({'id':'sophia-'+s['code'].lower()+'-'+slug(title),'provider':'Sophia','title':s['title'],'code':s['code'],'credits':units,'sourceCredits':s['sourceCredits'],'sourceCreditSystem':'semester','creditSystem':'competency-unit','receivingTitle':title,'sourceIds':[sophia_source,source_id],'evidence':'conditional','evidenceType':'provider-partnership','creditOrigin':'ace','sourceType':'alternative','conditions':['Sophia publishes this WGU receiving-course title, but its table says equivalencies vary by degree. Obtain WGU approval for this exact program and catalog before purchase.','Upper-division Sophia articulations changed after March2026. Confirm the current course level and transfer pathway; do not use an older agreement.','The source course carries '+str(s['sourceCredits'])+' semester credits; this proposed receiving requirement carries '+str(units)+' WGU competency units. WGU evaluation decides the award.','All transfer credit must be evaluated before the WGU program starts.'],'url':course['url']if course else'https://'+partnership[kind]+'.sophia.org/'})
   category='general'if norm(title)in general_titles.get(code,set())else'capstone'if'capstone'in title.lower()else'core'
   requirements.append({'id':code.lower()+'-'+slug(title),'code':'','title':title,'credits':units,'category':category,'sourceIds':[source_id],'institutionalOnly':'capstone'in title.lower(),'options':options})
  model={'id':'curriculum-'+route['id'],'routeIds':[route['id']],'school':route['school'],'title':route['title'],'format':'Online','modalities':['online'],'level':route['level'],'catalog':version,'totalCredits':total,'creditSystem':'competency-unit','requirements':requirements,'coverage':'complete','completeExecutablePathway':False,'unresolved':['Confirm the student’s applicable program catalog; the official program-guide version is recorded above.','These are the complete named standard-path courses in the cited WGU guide. Current individual transfer approval and receiving level remain unresolved on each outside option.','WGU course identifiers are not printed in the guide; titles are retained without invented course codes.','Confirm the exact residency calculation, including the capstone exclusion, with WGU. No guessed numeric institutional minimum or overall transfer cap is assigned.','University courses without an outside option are not proof that no transfer exists. Additional approved provider matches require further current program-specific research.'],'rulesNotes':['The standard-path course values are WGU competency units. Source semester credits, where published, remain separately attached to outside-course options.','Sophia partnership table lists a75% ceiling for combined nontraditional training and credit-by-exam, and identifies postMarch2026 upper-division restrictions. Individual academic residency may require more WGU work.'],'mappingCheckedOn':CHECKED,'paceModel':'competency-subscription'}
  model['rulesNotes'].append('General education is labeled only where the retained official guide identifies the course under that heading. Remaining named courses stay in core requirements; provider subject labels are not treated as university degree categories.')
  if route['level']=='bachelor':
   model['alternativeMaxCredits']=round(total*0.75,3)
   model['alternativeCapSourceIds']=[sophia_source]
  else:
   model['rulesNotes']=['The standard-path course values are WGU competency units. This graduate curriculum contains no proposed undergraduate alternative-credit matches.']
   model['unresolved']=[model['unresolved'][0],model['unresolved'][2],'Confirm the required prior degree, applicable graduate transfer policy, admissions eligibility and catalog with WGU.','No outside transfer pathway is asserted for this graduate degree.']
  if code=='BSHIM':model['unresolved'].append('Professional Practice Experiences I and II are required in the official standard path. Confirm supervision, placement, site, eligibility and scheduling arrangements; an online course listing does not resolve these requirements.')
  tuition_url='https://www.wgu.edu/online-it-degrees/computer-science.html'if code=='BSCS'else route['url']
  if tuition_url in tuition:
   price_source='wgu-'+code.lower()+'-tuition'
   sources.append({'id':price_source,'title':route['title']+' official tuition per six-month term','url':tuition_url,'checked':CHECKED})
   model['pricing']={'model':'subscription','amount':tuition[tuition_url],'period':'6 months','currency':'USD','sourceUrl':tuition_url,'sourceIds':[price_source],'checkedOn':CHECKED,'notes':['Published tuition per six-month term. Confirm current mandatory fees, materials, financial-aid eligibility and the applicable program catalog. This is not a quoted total degree cost.']}
  models.append(model)
 source_ids={source['id']for source in sources}
 known_route_ids={p['id']for p in catalog+declared}
 assert len(source_ids)==len(sources)
 for model in models:
  assert set(model['routeIds'])<=known_route_ids
  assert sum(req['credits']for req in model['requirements'])==model['totalCredits']
  assert len({r['id']for r in model['requirements']})==len(model['requirements'])
  for req in model['requirements']:
   assert set(req['sourceIds'])<=source_ids
   for option in req['options']:
    assert option['evidence']=='conditional'
    assert option['credits']==req['credits'] and option['creditSystem']==model['creditSystem']
    assert option['sourceCredits']>0 and option['sourceCreditSystem']=='semester'
    assert set(option['sourceIds'])<=source_ids
    kind=next(s.split('wgu-sophia-')[1].split('-current')[0]for s in option['sourceIds']if s.startswith('wgu-sophia-'))
    raw=sophia_text(kind).rsplit('Sophia Courses Without Transfer Equivalency',1)
    assert len(raw)==2 and option['code']not in raw[1],(kind,option['code'],'listed as not transferable')
 out={'version':1,'checkedOn':CHECKED,'sources':sources,'models':models,'routes':declared}
 out=apply_reviewed_supplements(out)
 out=apply_reviewed_undergraduate_policies(out,json.loads((SNAP/'business-current-ledgers-policy-review-2026-11-17.json').read_text()))
 output=ROOT/'content/curricula/wgu.json';serialized=json.dumps(out,indent=2)+'\n'
 if '--check'in sys.argv:assert output.read_text()==serialized,'WGU curriculum artifact is stale; rerun importer'
 else:output.write_text(serialized)
 print(json.dumps({'models':len(models),'requirements':sum(len(m['requirements'])for m in models),'outsideOptions':sum(len(r['options'])for m in models for r in m['requirements']),'byProgram':[{ 'title':m['title'],'courses':len(m['requirements']),'credits':m['totalCredits']}for m in models]}))
if __name__=='__main__':main()
