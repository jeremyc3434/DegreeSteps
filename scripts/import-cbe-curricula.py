#!/usr/bin/env python3
"""Build reviewed CBE requirement ledgers from independently cited factual records.

No degree requirements are inferred from a title or an institution-wide transfer
ceiling. The facts file contains only course identifiers, titles, credits and
policy facts; programme descriptions are not reproduced.
"""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CHECKED='2026-11-09'

def slug(value):
    import re
    return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')

def build():
    facts=json.loads((ROOT/'content/curricula/snapshots/cbe/phoenix-2026-2027-facts.json').read_text())
    sources=[]; models=[]
    catalog=json.loads((ROOT/'dist/data/program-catalog.json').read_text())
    routes={p['id']:p for p in catalog['programs']}
    for p in facts['programs']:
        route=routes[p['routeId']]
        sid='phoenix-2026-27-'+p['routeId']
        source={'id':sid,'title':'University of Phoenix 2026–2027 Online Academic Catalog: '+p['award'], 'url':facts['catalogUrl']+'#page='+str(p['pdfPage']), 'checked':CHECKED, 'catalog':'2026–2027, November 1, 2026 updates', 'notes':'PDF page numbers in the fragment are one-based; programme and residency policies continue onto the next page.'}
        sources.append(source)
        reqs=[]; groups=[]
        for group, courses in p['groups']:
            gid=slug(group); groups.append({'id':gid,'title':group,'parentId':'major','requirementIds':[],'sourceId':sid})
            for code,title,credits in courses:
                rid=slug(code); groups[-1]['requirementIds'].append(rid)
                req={'id':rid,'code':code,'title':title,'credits':credits,'category':'major','group':gid,'upper':False,'institutionalOnly':True,'sourceIds':[sid],'options':[]}
                if code==p.get('capstoneCode'):
                    req['minimumCompletedCredits']=p['capstoneMinimumCredits']
                    req['conditions']=[f"The catalog requires at least {p['capstoneMinimumCredits']} completed {'CUs' if p['creditSystem']=='competency-unit' else 'credits'} before this course. There is no fixed first-seven-course dependency."]
                reqs.append(req)
        assert sum(r['credits'] for r in reqs)==p['totalCredits'],p['routeId']
        assert len({r['id'] for r in reqs})==len(reqs),p['routeId']
        notes=['All required courses must be completed within this exact Phoenix competency-based programme. Transfer activities and Phoenix coursework from outside this programme cannot waive required courses.', 'Admission, state-of-residence availability, applicable catalog and prior work-experience eligibility must be confirmed before enrollment.']
        if p['routeId']=='phoenix-da-ms-psychology':
            notes.extend(['This is an educational psychology degree; it does not prepare students for psychologist licensure or certification.','The 2026–2027 catalog states that this Direct Assessment programme is not eligible for Title IV financial aid.'])
        models.append({'id':'curriculum-'+p['routeId'],'routeIds':[p['routeId']],'school':route['school'],'title':route['title'],'format':'Online','paceModel':route.get('paceModel'),'level':route['level'],'catalog':'2026–2027, November 1, 2026 updates','totalCredits':p['totalCredits'],'creditSystem':p['creditSystem'],'institutionMinCredits':p['totalCredits'],'externalMaxCredits':0,'alternativeMaxCredits':0,'upperMinCredits':0,'requirements':reqs,'sources':[source],'curriculumSections':groups,'coverage':'complete','completeExecutablePathway':True,'coverageLabel':'Complete required-course ledger from the current university catalog','rulesNotes':notes,'unresolved':['Confirm admission eligibility, catalog applicability and enrollment availability with the university.'],'obligations':[{'title':'Capstone credit prerequisite','notes':f"At least {p['capstoneMinimumCredits']} completed {'CUs' if p['creditSystem']=='competency-unit' else 'credits'} are required before {p['capstoneCode']}.",'sourceIds':[sid]}],'policyReview':[],'evidenceCheckedOn':CHECKED,'pricingNotes':p['pricingNotes'],'pricing':p['pricing'],'pacing':{'universityTermWeeks':12,'maximumCoursesPerTerm':4,'maximumUniversityCreditsPer12Months':39} if p['creditSystem']=='competency-unit' else {'universityTermWeeks':16,'maximumCoursesPerTerm':4}})
    undergraduate=json.loads((ROOT/'content/curricula/snapshots/cbe/phoenix-da-undergraduate-facts.json').read_text())
    partner_source={'id':'phoenix-sophia-categories-2026-11','title':'Sophia University of Phoenix partner course/category table','url':undergraduate['partnerUrl'],'checked':CHECKED}
    unit_source={'id':'phoenix-da-cu-equivalence-2026-27','title':'Phoenix Direct Assessment competency-unit equivalence policy','url':undergraduate['catalogUrl']+'#page=453','checked':CHECKED}
    pacing_source={'id':'phoenix-da-annual-cu-limit-2026-27','title':'Phoenix Direct Assessment annual CU completion limits','url':undergraduate['catalogUrl']+'#page=458','checked':CHECKED}
    sources.extend([partner_source,unit_source,pacing_source])
    course_catalog=json.loads((ROOT/'dist/data/course-catalog.json').read_text())['courses']
    categories=undergraduate['partnerCategories']
    categories['composition']=[categories['communication'][0]]
    categories['liberal-arts']=sum([categories[k] for k in ['communication','humanities','math','physical-biological-science','social-science']],[])
    for p in undergraduate['programs']:
        route=routes[p['routeId']];sid='phoenix-2026-27-'+p['routeId']
        source={'id':sid,'title':'Phoenix 2026–2027 Direct Assessment degree and transfer requirements: '+route['title'],'url':undergraduate['catalogUrl']+'#page='+str(p['pdfPage']),'checked':CHECKED}
        sources.append(source); local_sources=[source,partner_source,unit_source,pacing_source]
        reqs=[];groups=[]
        for group,courses in p['groups']:
            gid=slug(group);groups.append({'id':gid,'title':group,'parentId':'major','requirementIds':[],'sourceId':sid})
            for code,title,credits in courses:
                rid=slug(code);groups[-1]['requirementIds'].append(rid)
                reqs.append({'id':rid,'code':code,'title':title,'credits':credits,'category':'major','group':gid,'upper':int(code.split()[-1])>=300,'institutionalOnly':True,'sourceIds':[sid],'options':[]})
        for key,title,credits,category in p['generalEducation']:
            if category=='institutional':
                reqs.append({'id':'genda-201','code':'GENDA 201','title':title,'credits':3,'category':'general','group':'humanities','upper':False,'institutionalOnly':True,'sourceIds':[sid],'options':[],'conditions':['Must be scheduled in the first term; it cannot normally be waived with transfer coursework.']})
                continue
            count=credits//3
            for i in range(count):
                rid=key+'-'+str(i+1)
                options=[]
                for ace_id,course_title,course_credits in categories[category]:
                    identity=next((c for c in course_catalog if c['provider']=='Sophia' and (ace_id==c.get('code') or ace_id in c.get('codeAliases',[]))),None)
                    if not identity:identity=next((c for c in course_catalog if c['provider']=='Sophia' and c['title']==course_title),None)
                    options.append({'id':'sophia-'+ace_id.lower(),'provider':'Sophia','title':course_title,'code':ace_id,'codeAliases':list(set([identity.get('mappingCode')] if identity and identity.get('mappingCode') else [])),'credits':course_credits,'upper':False,'creditSystem':'competency-unit','sourceCreditSystem':'semester','sourceCredits':course_credits,'creditOrigin':'ace','placementType':'category','allocationBasis':'published-category-with-degree-review','receivingCategory':category,'sourceIds':[sid,partner_source['id'],unit_source['id']],'evidence':'conditional','evidenceType':'partner-published-category','conditions':['Sophia and Phoenix publish this course as eligible in this education category. The partner table explicitly requires counselor approval for the exact degree, course version, course order and individual student.','This is a proposed category allocation, not an exact Phoenix course-code equivalency or an individual transfer award.','Phoenix states that one Direct Assessment CU is equivalent to one semester credit hour of learning; the university must apply the transfer activity to the specific degree requirement.'],'url':identity['url'] if identity else undergraduate['partnerUrl']})
                reqs.append({'id':rid,'code':'','title':title+((' — choice '+str(i+1)) if count>1 else ''),'credits':3,'category':'general','group':key,'upper':False,'institutionalOnly':False,'sourceIds':[sid],'allocationSlot':True,'allocationGroup':key,'allocationGroupCredits':credits,'options':options})
        for key,title,credits,category,upper in p['buckets']:
            for i in range(credits//3):
                rid=key+'-'+str(i+1);options=[]
                if category:
                    for ace_id,course_title,course_credits in categories[category]:
                        identity=next((c for c in course_catalog if c['provider']=='Sophia' and (ace_id in c.get('codeAliases',[]) or c['title']==course_title)),None)
                        options.append({'id':'sophia-'+ace_id.lower(),'provider':'Sophia','title':course_title,'code':ace_id,'credits':course_credits,'upper':False,'creditSystem':'competency-unit','sourceCreditSystem':'semester','sourceCredits':course_credits,'creditOrigin':'ace','placementType':'category','allocationBasis':'published-category-with-degree-review','receivingCategory':'interdisciplinary-elective','sourceIds':[sid,partner_source['id'],unit_source['id']],'evidence':'conditional','evidenceType':'partner-published-category','conditions':['The partner table lists the course in the interdisciplinary/elective category. Phoenix requires counselor approval for this exact degree, course version and course order.','No individual transfer award or application to a professional/upper-level elective is assumed.'],'url':identity['url'] if identity else undergraduate['partnerUrl']})
                reqs.append({'id':rid,'code':'','title':title+' — choice '+str(i+1),'credits':3,'category':'electives','group':key,'upper':upper,'institutionalOnly':False,'sourceIds':[sid],'allocationSlot':True,'allocationGroup':key,'allocationGroupCredits':credits,'options':options,'researchGap':not bool(options),'conditions':[] if options else ['Choose a university-approved course or transfer activity meeting this exact department, level and recency requirement. No specific outside equivalency has been established here.']})
        assert sum(r['credits'] for r in reqs)==120,p['routeId']
        groups.extend([{'id':key,'title':title,'parentId':'general','requirementIds':[r['id'] for r in reqs if r.get('allocationGroup')==key or (r['id']=='genda-201' and key=='humanities')],'sourceId':sid} for key,title,credits,category in p['generalEducation'] if category!='institutional'])
        groups.extend([{'id':key,'title':title,'parentId':'electives','requirementIds':[r['id'] for r in reqs if r.get('allocationGroup')==key],'sourceId':sid} for key,title,*_ in p['buckets']])
        models.append({'id':'curriculum-'+p['routeId'],'routeIds':[p['routeId']],'school':route['school'],'title':route['title'],'format':'Online','paceModel':'competency-subscription','level':'bachelor','catalog':'2026–2027, November 1, 2026 updates','totalCredits':120,'creditSystem':'competency-unit','institutionMinCredits':p['requiredInstitutionCourses']+3,'upperMinCredits':p['upperMinCredits'],'externalMaxCredits':120-p['requiredInstitutionCourses']-3,'requirements':reqs,'sources':local_sources,'curriculumSections':groups,'coverage':'partial','completeExecutablePathway':False,'coverageLabel':'Complete 120-CU requirements ledger; department electives and proposed outside-course allocations still require approval','rulesNotes':['The required Direct Assessment course-of-study courses and GENDA 201 are kept at Phoenix in this baseline. This produces '+str(p['requiredInstitutionCourses']+3)+' CUs of named required Phoenix work; an exceptional entry-course waiver needs separate approval.','General education and elective slots represent the actual catalog credit-category allocations. Each three-CU row is an allocation slot, not an invented required course.','The Sophia partnership publishes education-category eligibility; each proposed placement remains conditional on Phoenix approval for the exact degree and learner.','The 2026–2027 catalog limits undergraduate Direct Assessment students to 48 UOPX CUs per 12-month period. This is not unlimited completion within a subscription.','GENDA 201 must be scheduled in the first term. The program is not eligible for Title IV financial aid.']+p['admissionNotes'],'unresolved':['Obtain approval for proposed category placements, current ACE recommendation windows, course order and any duplicate content.','Department-specific and upper-division elective choices remain to be selected; these gaps do not mean those credits must be purchased from Phoenix.','Confirm any separate combined noncollegiate-credit cap and individual catalog applicability before purchase.'],'policyReview':['The exact combined noncollegiate-credit ceiling and individual course/version approvals remain unverified.'],'creditConversions':[{'from':'semester','to':'competency-unit','ratio':1,'sourceIds':[unit_source['id']]}],'pacing':undergraduate['pacing'],'financialAid':{'federalAidEligible':False,'sourceUrl':source['url']},'pricing':{'model':'subscription','amount':2500,'period':'12 weeks','currency':'USD','sourceUrl':route['url']},'evidenceCheckedOn':CHECKED})
    output={'version':1,'checkedOn':CHECKED,'sources':sources,'models':models,'coverage':{'scope':'Only individually researched CBE course ledgers with reconciled catalog totals are included.','omissions':json.loads((ROOT/'content/curricula/snapshots/cbe/research-gaps.json').read_text()) if (ROOT/'content/curricula/snapshots/cbe/research-gaps.json').exists() else []}}
    (ROOT/'content/curricula/cbe.json').write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'models':len(models),'requirements':sum(len(m['requirements']) for m in models),'complete':sum(m['coverage']=='complete' for m in models)}))

if __name__=='__main__':build()
