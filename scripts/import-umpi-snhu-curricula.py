"""Compile reviewed facts from cited university degree plans and partner tables.
Offline: no requests or guessed course equivalencies. Review source facts before refresh.
"""
import json,re,copy,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CHECKED='2026-11-09'
SNHU_PLAN='https://www.snhu.edu/-/media/files/pdfs/community-college-partnership-pathways/camden-county-college/ccc-as-bus-admin-to-bs-bus-admin-online.pdf'
SOPHIA='https://snhu.sophia.org/'
CATALOG=json.loads((ROOT/'dist/data/course-catalog.json').read_text())['courses']
def norm(v):return re.sub(r'[^a-z0-9]','',v.lower())
def source(id,title,url):return {'id':id,'title':title,'url':url,'checked':CHECKED}
# Receiving-school course identities and original-provider identities transcribed
# from the current Sophia/SNHU official partner table. Numeric credits are SNHU
# awarded credits for the selected rows, not a claim about every ACE version.
MAPPINGS='''English Composition I|SOPH-0015|ENG130|3
English Composition II|SOPH-0030|ENG190|3
Workplace Writing I|SOPH-0050|ENG130|3
Workplace Writing II|SOPH-0049|ENG190|3
Financial Accounting|SOPH-0010|ACC201|3
Managerial Accounting|SOPH-0079|ACC202|3
Business Law|SOPH-0032|BUS206|3
Principles of Finance|SOPH-0033|FIN320|3
Principles of Management|SOPH-0054|OL215|3
Macroeconomics|SOPH-0012|ECO202|3
Microeconomics|SOPH-0011|ECO201|3
Introduction to Statistics|SOPH-0005|MAT240|3
Introduction to Ethics|SOPH-0020|PHL212|3
Critical Thinking|SOPH-0065|PHL111|3
Art History I|SOPH-0006|FAS201|3
Art History II|SOPH-0029|FAS202|3
U.S. History I|SOPH-0022|HIS113|3
U.S. History II|SOPH-0025|HIS114|3
Environmental Science|SOPH-0016|ENV101|3
Introduction to Psychology|SOPH-0048|PSY108|3
Lifespan Development|SOPH-0078|PSY211|3
Introduction to Sociology|SOPH-0051|SOC112|3
Public Speaking|SOPH-0024|COM213|3
Human Resource Management|SOPH-0089|HRM200|3
Introduction to Business|SOPH-0014|OL110|3
Project Management|SOPH-0013|QSO340|3
Operations Management|SOPH-0086|QSO300|3
Principles of Leadership|SOPH-0096|OL328|3
Personal Finance|SOPH-0044|FIN250|3
Business Communication|SOPH-0059|ENG220|3
Business Data Analytics|SOPH-0091|QSO250|3
Criminology|SOPH-0084|CJ340|3
Career Readiness|SOPH-0066|GENELE|3
College Readiness|SOPH-0031|GENELE|3
French I|SOPH-0077|LFR111|3
Spanish I|SOPH-0057|LSP111|3
Spanish II|SOPH-0064|LSP112|3
Introduction to Information Technology|SOPH-0023|IT200|3
Introduction to Java Programming|SOPH-0062|IT145|3
Introduction to Python Programming|SOPH-0058|IT140|3
Introduction to Relational Databases|SOPH-0047|CS231|3
Introduction to Networking|SOPH-0068|IT212|3
Introduction to Web Development|SOPH-0043|IT270|3
College Algebra|SOPH-0001|MAT136|3
Introduction to College Mathematics|SOPH-0055|MAT136|3
Precalculus|SOPH-0069|MAT142|3
U.S. Government|SOPH-0071|POL210|3
Visual Communications|SOPH-0009|GRA205|3
Workplace Communication|SOPH-0034|COM127|3
Introduction to Criminal Justice|SOPH-0090|CJ112|3
Approaches to Studying Religions|SOPH-0008|PHL230|3
Introduction to Physics|SOPH-0095|PHY101|3
Medical Terminology|SOPH-0094|HCM205|3
Microbiology|SOPH-0074|BIO212|3
'''
MAPS=[]
for line in MAPPINGS.strip().splitlines():
 title,code,receiving,credits=line.split('|')
 matches=[x for x in CATALOG if x['provider']=='Sophia' and (x.get('mappingCode')==code or norm(x['title'])==norm(title))]
 url=next((x.get('url') for x in matches if x.get('url')),None)
 MAPS.append({'id':'sophia-'+code.lower(),'provider':'Sophia','title':title,'code':code,'credits':int(credits),'sourceCredits':int(credits),'creditSystem':'semester','sourceCreditSystem':'semester','creditOrigin':'ace','receivingCode':receiving,'sourceIds':['snhu-sophia-current'],'evidence':'published','upper':bool(re.match(r'^[A-Z]+[34]',receiving)),'conditions':['Confirm that the current Sophia course version and completion date match SNHU’s transfer agreement. SNHU determines individual degree placement.'],'url':SOPHIA,**({'courseUrl':url}if url else{})})
BY={}
for m in MAPS:BY.setdefault(m['receivingCode'],[]).append(m)
def options(codes,category=False):
 out=[]
 for c in codes:
  for mapping in BY.get(c,[]):
   o=copy.deepcopy(mapping)
   if category:o['conditions'].append('Proposed placement within the published category; obtain the advisor’s exact allocation and avoid duplicate credit.')
   out.append(o)
 return out
reqs=[]
def req(id,code,title,category='major',upper=False,opts=None,**extra):
 r={'id':id,'code':code,'title':title,'credits':3,'category':category,'upper':upper,'sourceIds':['snhu-business-jan2026'],'options':options([code]) if opts is None else opts,**extra};reqs.append(r);return r
# Fourteen Commons allocations, preserving the Jan2026 transfer-guide categories.
req('commons-ethical','EETH','Ethical Thought and Equity','general',opts=options(['PHL212','PHL230','PHL111'],True),selectionRequired=True)
req('commons-expression','ECCE','Creative and Critical Expression','general',opts=options(['FAS201','FAS202','COM213','ENG220','LFR111','LSP111'],True),selectionRequired=True)
req('commons-history','EHPS','Historical Perspectives','general',opts=options(['HIS113','HIS114'],True),selectionRequired=True)
req('commons-science-math','ESMF','Scientific and Mathematical Fluencies','general',opts=options(['ENV101','IT200','MAT136','PHY101'],True),selectionRequired=True)
req('eco201','ECO201','Microeconomics','general')
req('eco202','ECO202','Macroeconomics','general')
req('commons-exploration','EXPLORATION','Exploration elective: EETH, ECCE, EHPS, ESMF or ESPE','general',opts=options(['PHL212','PHL230','PHL111','FAS201','FAS202','HIS113','HIS114','ENV101','PSY108','SOC112'],True),selectionRequired=True)
req('commons-upper','COMMONS-300-400','Culmination: 300/400 HIS, LIT, IDS, PHL, POL, PSY, SCS, SOC or ENG','general',upper=True,selectionRequired=True,notes='Requires 60 or more credits. Choose an eligible 300/400 course listed by the degree guide; no outside match has been verified here.')
req('commons-justice-sustainability','CSOJ-CSST','Social Justice or Sustainability','general',selectionRequired=True,notes='The source identifies CSOJ or CSST/SST/ENV; exact course selection is still required.')
for i in [1,2]:req('commons-cornerstone-'+str(i),'CSOJ-CHUM-CSST-'+str(i),'Social Justice, Humanities or Sustainability; transfer-entry substitution '+str(i),'general',selectionRequired=True,notes='An Exploration elective may replace this allocation for students transferring 12+ credits under the cited Jan2026 pathway. Confirm how first-year or lower-transfer entry is allocated; no outside equivalency is assumed.')
req('eng130','ENG130','Foundations of Written Communication','general',notes='ENG120 is an alternative in the cited pathway; this proposed route selects ENG130.')
req('eng190','ENG190','Research and Persuasion','general',notes='ENG200 is an alternative in the cited pathway; this proposed route selects ENG190.')
req('mat240','MAT240','Applied Statistics','general')
CORE=[('ACC201','Financial Accounting'),('ACC202','Managerial Accounting'),('BUS206','Business Law I'),('BUS210','Managing and Leading in Business'),('BUS225','Critical Business Skills for Success'),('BUS400','Driving Business Opportunities'),('FIN320','Principles of Finance'),('INT220','Global Dimensions in Business'),('MKT205','Applied Marketing Strategies'),('QSO321','People, Planet, and Profit')]
for c,t in CORE:req(c.lower(),c,t,upper=bool(re.search(r'[A-Z](3|4)',c)))
req('ol215','OL215','Principles of Management')
# Concrete choices within the published 6 lower/upper major elective allocations.
# Prefix selection HRM + FIN + QSO + OL respects maximum6credits/prefix in the15credit major section.
req('major-elective-hrm','HRM200','Human Resource Functions — proposed major elective',opts=options(['HRM200']),notes='One of two 100–499 major electives selected under the published allowed-prefix rule.')
req('major-elective-fin','FIN250','Personal Financial Planning — proposed major elective',opts=options(['FIN250']),notes='One of two 100–499 major electives selected under the published allowed-prefix rule.')
req('major-elective-qso','QSO340','Project Management — proposed upper-level major elective',upper=True,opts=options(['QSO340']),notes='One of two 300–499 major electives selected under the published allowed-prefix rule.')
req('major-elective-ol','OL328','Leadership — proposed upper-level major elective',upper=True,opts=options(['OL328']),notes='One of two 300–499 major electives selected under the published allowed-prefix rule. Along with OL215, uses6OLprefixcredits in the15credit major section.')
free_codes=['PSY108','PSY211','SOC112','COM213','LFR111','LSP111','LSP112','IT200','IT145','IT140','CS231','IT212','IT270','MAT136','MAT142','POL210','GRA205','COM127','CJ112','PHL230','PHL111','PHY101','HCM205','BIO212','GENELE','HIS113','HIS114','FAS201','FAS202','ENV101']
free_options=options(free_codes,True)
for i in range(11):req('free-elective-'+str(i+1),'FREE-'+str(i+1),'Free elective '+str(i+1),'electives',opts=copy.deepcopy(free_options),selectionRequired=True,notes='33 free elective credits are published. Course suggestions must not duplicate another degree allocation. Extra credits may be limited by transfer and academic-residency rules.')
assert sum(x['credits']for x in reqs)==120
model={'id':'curriculum-snhu-catalog-8919d742796348bd','routeIds':['snhu-catalog-8919d742796348bd'],'school':'Southern New Hampshire University','title':'B.S. Business Administration — General Track','format':'Online','level':'bachelor','catalog':'January 2026 (published transfer-pathway curriculum)','totalCredits':120,'creditSystem':'semester','institutionMinCredits':30,'externalMaxCredits':90,'alternativeMaxCredits':90,'requirements':reqs,'coverage':'complete','sourceIds':['snhu-business-jan2026'],'curriculumSections':[{'id':'general','title':'The Commons / General Education','requirementIds':[r['id']for r in reqs if r['category']=='general'],'sourceId':'snhu-business-jan2026'},{'id':'major','title':'Business Core and Major Electives','requirementIds':[r['id']for r in reqs if r['category']=='major'],'sourceId':'snhu-business-jan2026'},{'id':'electives','title':'Free Electives','requirementIds':[r['id']for r in reqs if r['category']=='electives'],'sourceId':'snhu-business-jan2026'}],'unresolved':['Confirm that the January2026 curriculum is the correct catalog for the student. The cited official transfer guide is a curriculum source, not an award of CamdenCounty credit to another student.','Confirm the two Cornerstone substitutions and any incoming-transfer threshold; the guide permits Exploration replacements for students transferring12+credits.','Select and confirm the named upper-level Commons course and SocialJustice/Sustainability requirement; no outside match is asserted for these allocations.','The four major elective choices are a proposed valid selection under the guide’s allowed-prefix and level rules. Confirm course availability and advisor approval.','The published90credit ceiling is the overall transfer maximum; the current individual evaluation controls alternative-source applicability.','No complete prerequisite/calendar sequence or official upper-level graduation minimum has been imported.'],'rulesNotes':['42 Commons credits +30 BusinessCore credits +15 Majorcredits +33 FreeElective credits =120.','The15credit major section includes OL215 plus6credits at100–499 and6credits at300–499 from the published business-prefix list, with maximum6credits in any one prefix.','Proposed major elective choices HRM200,FIN250,QSO340,OL328 satisfy these level/prefix allocations; do not swap in an unrestricted course.','At least30credits atSNHU and at most90overalltransfercredits.','Published Sophia equivalencies are school awards; degree allocation remains subject to catalog, duplication and advisor evaluation.']}
doc={'version':1,'checkedOn':CHECKED,'sources':[source('snhu-business-jan2026','SNHU official online BSBusinessAdministration curriculum, Jan2026 catalog (CamdenCounty transfer pathway)',SNHU_PLAN),source('snhu-sophia-current','Sophia/SNHU official current transfer-equivalency table',SOPHIA)],'models':[model]}
(ROOT/'content/curricula/snhu.json').write_text(json.dumps(doc,indent=2)+'\n')
print(json.dumps({'snhuModels':1,'requirements':len(reqs),'credits':sum(r['credits']for r in reqs),'SophiaRequirementOptions':sum(len(r['options'])for r in reqs)}))
# A second full January2026 curriculum. The Camden guide is a specific student
# pathway with a two-calculus-course waiver; normalize to the unwaived degree
# allocations by reversing its explicitly stated6-credit free-elective increase.
DATA_PLAN='https://www.snhu.edu/-/media/files/pdfs/community-college-partnership-pathways/camden-county-college/ccc-aas-data-science-to-bs-data-analytics-online.pdf'
base_model=model
reqs=[]
for old in base_model['requirements'][:3]:
 r=copy.deepcopy(old);r['sourceIds']=['snhu-data-jan2026'];reqs.append(r)
req('mat140','MAT140','Precalculus','general',opts=[],notes='The January2026 degree guide identifies MAT140. Sophia’s published MAT142 award is not assumed equivalent to MAT140.')
req('mat243','MAT243','Applied Statistics for STEM','general',opts=[],notes='No SophiaMAT240 substitution is inferred for this STEM-specific statistics requirement.')
req('commons-society','ESPE','Contexts in Shaping the Self in Society','general',opts=options(['PSY108','SOC112','ECO201','ECO202','POL210'],True),selectionRequired=True)
for old in [r for r in base_model['requirements'] if r['id'] in ['commons-exploration','commons-upper','commons-justice-sustainability','commons-cornerstone-1','commons-cornerstone-2','eng130','eng190']]:
 r=copy.deepcopy(old);r['sourceIds']=['snhu-data-jan2026'];reqs.append(r)
req('mat136','MAT136','Introduction to Quantitative Analysis','general')
DATA_CORE=[('DAD220','Introduction to Structured Database Environments'),('IT140','Introduction to Scripting'),('MAT225','Calculus I: Single-Variable Calculus'),('MAT303','Applied Statistics II for STEM'),('DAT205','Role of Data Analysis in Organizations'),('DAT223','Gathering Requirements and Collecting Data'),('DAT250','Data Policy and Decision Making'),('DAT260','Emerging Technologies and Big Data'),('DAT300','Data Validation: Getting the Right Data'),('DAT325','Data Validation: Quality and Cleaning'),('DAT375','Data Analysis Techniques'),('DAT430','Leveraging Data Analysis for Organizational Results'),('DAT475','Applied Data Analysis'),('IT226','Communication in STEM Professions')]
calc=next((x for x in CATALOG if x['provider']=='Sophia'and norm(x['title'])==norm('Calculus I')),None)
calcOption={'id':'sophia-soph-0060','provider':'Sophia','title':'Calculus I','code':'SOPH-0060','credits':3,'sourceCredits':4,'creditSystem':'semester','sourceCreditSystem':'semester','creditOrigin':'ace','receivingCode':'MAT225','sourceIds':['snhu-sophia-current'],'evidence':'published','upper':False,'url':SOPHIA,'conditions':['The partner table identifies MAT225 as3SNHUcredits for the4-credit Sophia course. Do not assume the extra source credit fills another requirement.','Confirm current course version, completion date and individual transfer evaluation.'],**({'courseUrl':calc['url']}if calc and calc.get('url')else{})}
for c,t in DATA_CORE:req(c.lower(),c,t,upper=bool(re.match(r'^[A-Z]+[34]',c)),opts=[copy.deepcopy(calcOption)]if c=='MAT225'else None)
# Actual permissible selection from CS/CYB/DAT/IT200–499 or specifically listed
# BUS206,COM213,COM227,QSO340,SNHU495. Four proposals use distinct courses.
for c,t in [('BUS206','Business Law I'),('COM213','Public Speaking and Presentation Skills'),('QSO340','Project Management'),('IT212','Introduction to Computer Networks')]:
 req('major-elective-'+c.lower(),c,t+' — proposed major elective',upper=bool(re.match(r'^[A-Z]+[34]',c)),notes='Proposed choice within the source’s published12credit major-elective list. Confirm selected degree allocation.')
for i in range(8):req('free-elective-'+str(i+1),'FREE-'+str(i+1),'Free elective '+str(i+1),'electives',opts=copy.deepcopy(free_options),selectionRequired=True,notes='Baseline24free elective credits before a documented calculus transfer waiver. No duplicate degree allocation is allowed.')
for r in reqs:r['sourceIds']=['snhu-data-jan2026']
assert len(reqs)==40 and sum(r['credits']for r in reqs)==120
model=copy.deepcopy(base_model)
model.update(id='curriculum-snhu-catalog-41b14c88648c21f7',routeIds=['snhu-catalog-41b14c88648c21f7'],title='B.S. Data Analytics — General Track',requirements=reqs,sourceIds=['snhu-data-jan2026'])
model['curriculumSections']=[{'id':c,'title':t,'requirementIds':[r['id']for r in reqs if r['category']==c],'sourceId':'snhu-data-jan2026'}for c,t in [('general','The Commons / General Education'),('major','Data Analytics Core and Major Electives'),('electives','Free Electives')]]
model['unresolved']=['Confirm the January2026 catalog applies to the student. The published Camden transfer guide describes an institution-specific evaluation, not an automatic award to every student.','This baseline retains MAT136 andMAT140. The cited guide’s30freeelectives include6extra credits after the stated two-calculus-course waiver; reversing that explicit increase gives24baselinefreecredits and120total. Obtain an official waiver before changing this allocation.','MAT140, MAT243 and DAD220 keep the exact published receiving-course codes; superficially similar Sophia awards are not inferred equivalents.','The Commons upper-level/Cornerstone/SocialJustice selections still need actualcourse choices and advisor confirmation.','The4major-elective courses are a proposed eligible selection; future course availability and individual degree applicability require school confirmation.','Confirm prerequisite order and the university’s current upper-level minimum before committing to a completion schedule.']
model['rulesNotes']=['42Commons +42DataAnalyticsCore +12MajorElectives +24baselineFreeElectives =120.','The specific Camden two-calculus-course waiver removes MAT136 andMAT140 and increases FreeElectives by6; this baseline does not grant that waiver.','The major-elective allowance permits CS,CYB,DAT,IT200–499, or BUS206,COM213,COM227,QSO340,SNHU495.','The partner’s SophiaCalculusI4sourcecredits award3MAT225credits. An extra source credit is not counted twice.','Minimum30SNHUresidency and maximum90overalltransfercredits remain separate from individual course acceptance.']
doc['sources'].append(source('snhu-data-jan2026','SNHU official BSDataAnalytics curriculum, January2026catalog (CamdenCounty transfer pathway)',DATA_PLAN))
doc['models'].append(model)
(ROOT/'content/curricula/snhu.json').write_text(json.dumps(doc,indent=2)+'\n')
print(json.dumps({'snhuModels':len(doc['models']),'totalRequirementRows':sum(len(m['requirements'])for m in doc['models'])}))
# Reviewed provider identities and transfer-only policy are applied separately
# from the published degree ledger. The supplement also has a read-only --check.
subprocess.run(['node',str(ROOT/'scripts/add-snhu-transfer-evidence.mjs')],check=True)
