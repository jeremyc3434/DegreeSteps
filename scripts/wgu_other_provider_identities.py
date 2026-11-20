"""Normalize independent Saylor/StraighterLine provider credit facts.

Only provider bodies establish original quantities; WGU receiving agreements
are deliberately not inputs. Captures remain separate from academic approval.
"""
from datetime import date, datetime
from html import unescape
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse, parse_qs

PROVIDERS = {'Saylor': ('SAYA', 'saylor.org'), 'StraighterLine': ('OOSL', 'straighterline.com')}
RECEIVING_FIELDS = {'receivingCode', 'receivingTitle', 'receivingCredits', 'mappingEvidence',
    'universityMapRecord', 'modelId', 'programId', 'catalogTerm', 'school', 'credits', 'creditSystem', 'requirementId'}

class TableRows(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None; self.link=None
    def handle_starttag(self,tag,attrs):
        if tag=='tr': self.row=[]
        elif tag in ['td','th'] and self.row is not None: self.cell={'text':'','url':None}
        elif tag=='a' and self.cell is not None: self.cell['url']=dict(attrs).get('href')
    def handle_data(self,data):
        if self.cell is not None:self.cell['text']+=data
    def handle_endtag(self,tag):
        if tag in ['td','th'] and self.cell is not None:
            self.cell['text']=re.sub(r'\s+',' ',self.cell['text']).strip();self.row.append(self.cell);self.cell=None
        elif tag=='tr' and self.row is not None:
            self.rows.append(self.row);self.row=None

def digest(body):return hashlib.sha256(body).hexdigest()

def read_capture(folder,name):
    path=Path(folder)/name;body=path.read_bytes();receipt=json.loads(path.with_suffix('.receipt.json').read_text())
    assert digest(body)==receipt['sha256'],'Provider body changed since capture'
    assert receipt['bytes']==len(body) and receipt['url'].startswith('https://') and receipt.get('status',200)==200
    return body,receipt

def safe_source(sid,title,url,receipt,provider,codes):
    return {'id':sid,'title':title,'url':url,'kind':'provider','roles':['provider-identity'],
        'provider':provider,'checked':receipt['capturedAt'][:10],
        'sourceContentHash':'sha256:'+receipt['sha256'],'sha256':receipt['sha256'],
        'captureUrl':receipt['url'],'captureFormat':'provider-public-body',
        'courseCodes':sorted(codes),'retrieval':'Unauthenticated public provider capture; academic fields only.'}

def identity(provider,code,provider_code,title,quantity,url,sid,checked,**extra):
    assert provider in ['Saylor','StraighterLine'] and quantity>0
    return {'provider':provider,'code':code,'aceId':code,'providerCourseCode':provider_code,
        'codeAliases':[provider_code],'title':title,'sourceCredits':quantity,
        'sourceCreditSystem':'semester','creditOrigin':'alternative','sourceType':'alternative',
        'url':url,'identitySourceIds':[sid],'sourceCreditStatus':'verified',
        'sourceCreditVerification':{'credits':quantity,'creditSystem':'semester','sourceIds':[sid]},
        'sourceCreditBasis':'Original quantity from the provider’s current ACE-recommended course list or current offering, independently of the receiving university award.',
        'identityCheckedOn':checked,'identityReviewId':'other-provider-current-original-quantities-2026-11-20',**extra}

def normalize_saylor(body,receipt):
    assert receipt['url']=='https://support.saylor.org/api/v2/help_center/en-us/articles/24821523422484.json'
    article=json.loads(body)['article'];assert article['id']==24821523422484 and article['draft'] is False and article['outdated'] is False
    assert 'current ACE recommendations' in article['body'] and 'Credits' in article['body']
    parser=TableRows();parser.feed(article['body']);courses=[];sid='saylor-current-provider-credit-list-20261120'
    for row in parser.rows:
        if len(row)!=4 or not re.fullmatch(r'SAYA-\d{4}',row[1]['text']):continue
        label,code,expires,qty=[c['text'] for c in row]
        provider_code,title=label.split(':',1);provider_code=provider_code.strip();title=title.strip()
        assert re.fullmatch(r'[A-Z]+\d{3}',provider_code)
        quantity=int(qty);assert 0<quantity<=12
        end=datetime.strptime(expires,'%m/%d/%Y').date().isoformat();checked=receipt['capturedAt'][:10];assert end>=checked
        url=unescape(row[0]['url'] or '');assert url.startswith('https://www.acenet.edu/National-Guide/Pages/Course.aspx?')
        courses.append(identity('Saylor',code,provider_code,title,quantity,url,sid,checked,
            recommendationEnd=end,recommendationPeriodStatus='provider-listed-current-recommendation',
            recommendationPeriodSourceIds=[sid],
            identityEvidence={'providerTableRow':{'providerCourseCode':provider_code,'aceId':code,'title':title,'credits':quantity,'expirationDate':end,'aceExhibitUrl':url},'sourceIds':[sid]}))
    assert len(courses)==29 and len({c['code'] for c in courses})==29,'Review a changed provider course inventory explicitly'
    source=safe_source(sid,'Saylor current ACE-recommended courses: original credits and expiration dates',article['html_url'],receipt,'Saylor',[c['code'] for c in courses])
    source['captureFormat']='provider-help-center-api-json';source['publishedArticleUpdatedAt']=article['updated_at']
    return {'version':1,'id':'wgu-saylor-independent-provider-identities-20261120','provider':'Saylor',
        'checkedOn':receipt['capturedAt'][:10],'sources':[source],'courses':sorted(courses,key=lambda c:c['code']),
        'scope':'Independent original provider quantities and current availability only; no university award, degree placement, recommendation start date or unobserved course version is inferred.',
        'studentCreditsAwarded':0,'publicationDecisionsMade':0}

def validate_bundle(bundle,as_of=None):
    """Validate independent source facts without granting any receiving award.

    The Saylor list supplies an expiration, not a start date or version. Those
    unknown fields must stay absent. This is a provider identity validation;
    receiving approval still belongs to the exact official program agreement.
    """
    assert bundle['version']==1 and bundle['id'] and bundle['provider'] in PROVIDERS
    checked=date.fromisoformat(bundle['checkedOn']);assert checked<=date.fromisoformat(as_of) if as_of else checked<=date.today()
    assert not RECEIVING_FIELDS.intersection(bundle)
    assert bundle['studentCreditsAwarded']==0 and bundle['publicationDecisionsMade']==0
    prefix,domain=PROVIDERS[bundle['provider']];sources={}
    for source in bundle['sources']:
        assert source['id'] and source['id'] not in sources
        host=urlparse(source['url']).hostname or ''
        assert source['url'].startswith('https://') and (host==domain or host.endswith('.'+domain) or host in {'acenet.edu','www.acenet.edu'})
        assert source['provider']==bundle['provider'] and 'provider-identity' in source['roles']
        assert date.fromisoformat(source['checked'])<=checked
        assert re.fullmatch(r'[a-f0-9]{64}',source['sha256']) and source['sourceContentHash']=='sha256:'+source['sha256']
        assert source['courseCodes'] and len(set(source['courseCodes']))==len(source['courseCodes'])
        sources[source['id']]=source
    assert sources and bundle['courses'];codes=set()
    for course in bundle['courses']:
        assert course['provider']==bundle['provider'] and re.fullmatch(prefix+r'-\d{4}',course['code'])
        assert course['code'] not in codes and course['aceId']==course['code'];codes.add(course['code'])
        assert not RECEIVING_FIELDS.intersection(course)
        assert course['title'] and course['sourceCreditStatus']=='verified'
        assert isinstance(course['sourceCredits'],int) and not isinstance(course['sourceCredits'],bool) and course['sourceCredits']>0
        assert course['sourceCreditSystem']=='semester'
        assert course['identitySourceIds'] and set(course['identitySourceIds'])<=sources.keys()
        assert all(course['code'] in sources[sid]['courseCodes'] for sid in course['identitySourceIds'])
        verification=course['sourceCreditVerification']
        assert verification['credits']==course['sourceCredits'] and verification['creditSystem']=='semester'
        assert verification['sourceIds'] and set(verification['sourceIds'])<=set(course['identitySourceIds'])
        assert date.fromisoformat(course['identityCheckedOn'])<=checked
        assert not {'proctoringRequired','price','cost'}.intersection(course), 'Unobserved assessment and price fields stay unknown'
        if bundle['provider']=='Saylor':
            assert not {'recommendationStart','courseVersion'}.intersection(course), 'The provider list does not supply a recommendation start or course version'
            observed=course['identityEvidence']['providerTableRow']
            assert observed['aceId']==course['code'] and observed['providerCourseCode']==course['providerCourseCode']
            assert observed['title']==course['title'] and observed['credits']==course['sourceCredits']
            assert observed['expirationDate']==course['recommendationEnd'] and date.fromisoformat(course['recommendationEnd'])>=checked
            assert course['recommendationPeriodSourceIds'] and set(course['recommendationPeriodSourceIds'])<=set(course['identitySourceIds'])
            assert observed['aceExhibitUrl']==course['url'] and urlparse(course['url']).hostname=='www.acenet.edu'
        else:
            assert course['identityEvidence']['providerAceCode']==course['code']
            assert course['identityEvidence']['providerHeadline']==course['providerCourseCode']+' | '+str(course['sourceCredits'])+' Credits'
            assert course['providerCourseUrl']==course['url'] and urlparse(course['url']).hostname=='www.straighterline.com'
            observed=course['identityEvidence']['aceExhibit']
            assert observed['aceId']==course['code'] and observed['providerCourseCode']==course['providerCourseCode']
            assert observed['sourceCredits']==course['sourceCredits'] and observed['sourceCreditSystem']==course['sourceCreditSystem']
            assert course['courseVersion']==observed['courseVersion']
            assert course['recommendationStart']==observed['recommendationStart'] and course['recommendationEnd']==observed['recommendationEnd']
            assert date.fromisoformat(course['recommendationStart'])<=checked<=date.fromisoformat(course['recommendationEnd'])
            assert course['recommendationPeriodSourceIds'] and set(course['recommendationPeriodSourceIds'])<=set(course['identitySourceIds'])
    return bundle

def normalize_straighterline(captures):
    courses=[];sources=[]
    for name,ace_name,provider_code,ace,title in [('straighterline-personal-finance.html','straighterline-finance-ace.html','FIN101','OOSL-0036','Personal Finance'),('straighterline-college-algebra.html','straighterline-algebra-ace.html','MAT101','OOSL-0002','College Algebra')]:
        body,receipt=captures[name];raw=body.decode();page=re.sub(r'\s+',' ',unescape(re.sub(r'<[^>]+>',' ',raw)))
        assert receipt['url'].startswith('https://www.straighterline.com/online-college-courses/')
        matches=re.findall(r'ACE Code:\s*(OOSL-\d{4})',page);assert set(matches)=={ace},'An unrelated ACE code cannot establish this course'
        quantities=re.findall(r'\b'+provider_code+r'\s*\|\s*(\d+) Credits\b',page);assert quantities and set(quantities)=={'3'},'Read the original provider headline quantity'
        assert 'ACE-Recommended' in page and title in page
        sid='straighterline-'+ace.lower()+'-current-offering-20261120'
        ace_body,ace_receipt=captures[ace_name];ace_raw=ace_body.decode();ace_page=re.sub(r'\s+',' ',unescape(re.sub(r'<[^>]+>',' ',ace_raw)))
        assert urlparse(ace_receipt['url']).hostname=='www.acenet.edu'
        assert 'ACE ID: '+ace+' Version: ' in ace_page and "Organization's ID: "+provider_code+' Organization: StraighterLine' in ace_page
        assert 'Level Credits (SH) Subject Lower-Division Baccalaureate 3 '+title in ace_page
        version=int(re.search(r'ACE ID: '+ace+r' Version: (\d+)',ace_page)[1])
        selected=re.search(r'<option selected="selected" value="([^"]+)">(\d+/\d+/\d{4}) - (\d+/\d+/\d{4})</option>',ace_raw)
        assert selected and parse_qs(urlparse(unescape(selected[1])).query)['cid']==parse_qs(urlparse(ace_receipt['url']).query)['cid']
        start,end=[datetime.strptime(selected[i],'%m/%d/%Y').date().isoformat() for i in [2,3]]
        checked=max(receipt['capturedAt'][:10],ace_receipt['capturedAt'][:10]);assert start<=checked<=end
        ace_sid='straighterline-'+ace.lower()+'-ace-exhibit-20261120'
        course=identity('StraighterLine',ace,provider_code,title,3,receipt['url'],sid,checked,
            providerCourseUrl=receipt['url'],courseVersion=version,recommendationStart=start,recommendationEnd=end,recommendationPeriodSourceIds=[ace_sid],
            identityEvidence={'providerHeadline':provider_code+' | 3 Credits','providerAceCode':ace,
                'aceExhibit':{'aceId':ace,'providerCourseCode':provider_code,'sourceCredits':3,'sourceCreditSystem':'semester','courseVersion':version,'recommendationStart':start,'recommendationEnd':end},
                'sourceIds':[sid,ace_sid]})
        course['identitySourceIds'].append(ace_sid);course['sourceCreditVerification']['sourceIds'].append(ace_sid)
        course['sourceCreditBasis']='Current provider offering confirms the exact ACE identity and quantity; the separate exact ACE exhibit confirms the original semester-hour unit and current recommendation period.'
        courses.append(course)
        sources.append(safe_source(sid,'StraighterLine '+title+' current offering and original credits',receipt['url'],receipt,'StraighterLine',[ace]))
        ace_source=safe_source(ace_sid,'ACE National Guide: '+title+' ('+ace+'), original semester hours and current recommendation',ace_receipt['url'],ace_receipt,'StraighterLine',[ace])
        ace_source['kind']='ace';ace_source['captureFormat']='ace-national-guide-html';sources.append(ace_source)
    return {'version':1,'id':'wgu-straighterline-independent-provider-identities-20261120','provider':'StraighterLine',
        'checkedOn':max(s['checked'] for s in sources),'sources':sources,'courses':sorted(courses,key=lambda c:c['code']),
        'scope':'Independent currently offered provider identities and original quantities, with separately captured exact ACE versions and recommendation periods. No receiving university award or degree placement is inferred.',
        'studentCreditsAwarded':0,'publicationDecisionsMade':0}

def build_from_captures(folder):
    saylor=read_capture(folder,'saylor-current-credit-table.json')
    sl={name:read_capture(folder,name) for name in ['straighterline-personal-finance.html','straighterline-college-algebra.html','straighterline-finance-ace.html','straighterline-algebra-ace.html']}
    return [validate_bundle(normalize_saylor(*saylor)),validate_bundle(normalize_straighterline(sl))]

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--capture-dir',default='outputs/research/wgu-batch');parser.add_argument('--write',action='store_true');args=parser.parse_args()
    bundles=build_from_captures(args.capture_dir)
    for bundle in bundles:
        path=Path('content/reuse')/('wgu-'+bundle['provider'].lower()+'-provider-identities.json')
        if args.write:path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(bundle,indent=2)+'\n')
        print(json.dumps({'path':str(path),'provider':bundle['provider'],'courses':len(bundle['courses']),'sources':len(bundle['sources'])}))
