"""Source-linked course discovery, separate from individual credit awards.
Use --fetch for an optional official-directory refresh; normal builds use the snapshot.
"""
import argparse,datetime,hashlib,html,json,re,urllib.request,subprocess
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parent.parent
SOURCES=[{'id':'sophia','provider':'Sophia','url':'https://www.sophia.org/online-courses/all-courses/','minimum':70},{'id':'straighterline','provider':'StraighterLine','url':'https://www.straighterline.com/online-college-courses/','minimum':45},{'id':'clep','provider':'CLEP','url':'https://clep.collegeboard.org/clep-exams','minimum':30}]
LEGACY_PROVIDER_IDS={'Study.com':'study','Sophia':'sophia','CLEP':'clep','StraighterLine':'straighterline'}
def clean(s):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',s)).replace('\u200b','').split())
def key(s):return re.sub('[^a-z0-9]','',s.lower())
class Links(HTMLParser):
 def __init__(self):super().__init__();self.a=None;self.items=[]
 def handle_starttag(self,t,a):
  if t=='a':self.a=[dict(a),'']
 def handle_data(self,t):
  if self.a is not None:self.a[1]+=t
 def handle_endtag(self,t):
  if t=='a' and self.a:self.items.append((self.a[0],clean(self.a[1])));self.a=None

def subject(title):
 s=title.lower()
 for name,terms in [('Math','algebra|calculus|statistic|mathematics'),('Science','biology|chemistry|physics|anatomy|physiology|microbiology|biochem|environment|nutrition'),('English & communication','composition|writing|english|communication|speaking'),('Business','business|account|financ|management|marketing|leadership|economics|human resource'),('Technology','computer|programming|information technology|database|network|web development|digital|data|ai '),('Social science','psychology|sociology|government|crimin|education|development|anthropology'),('Humanities','history|religion|philosoph|ethics|art|music|literature|spanish|french')]:
  if re.search(terms,s):return name
 return 'Other subjects'

def parse(source,raw):
 text=raw.decode('utf8',errors='replace');items=[];p=Links();p.feed(text)
 if source['id']=='sophia':
  for attrs,title in p.items:
   href=attrs.get('href','');parts=urlsplit(href).path.strip('/').split('/')
   if len(parts)==3 and parts[0]=='online-courses' and attrs.get('data-modulename') and title and not re.search('Explore|Non.Credit|Your AI.Era Job Search',title,re.I):items.append({'title':attrs.get('data-modulename') or title,'url':urljoin(source['url'],href),'credits':None})
 elif source['id']=='straighterline':
  blocks=re.split(r'<h4[^>]*>',text)[1:]
  for block in blocks:
   title=clean(block.split('</h4>',1)[0]);credit=re.search(r'\b(\d+(?:\.\d+)?)\s+credits?\b',clean(block),re.I);links=Links();links.feed(block)
   href=next((a.get('href')for a,t in links.items if '/online-college-courses/'in a.get('href','') and urlsplit(a['href']).path.rstrip('/')!='/online-college-courses'),None)
   if href and title:items.append({'title':title,'url':urljoin(source['url'],href),'credits':float(credit.group(1))if credit else None})
 else:
  for attrs,title in p.items:
   href=attrs.get('href','')
   if re.fullmatch(r'/clep-exams/[a-z0-9-]+/?',urlsplit(href).path) and attrs.get('aria-labelledby')and title:items.append({'title':title,'url':urljoin(source['url'],href),'credits':None})
 seen=set();out=[]
 for item in items:
  if key(item['title']) in seen:continue
  seen.add(key(item['title']));u=urlsplit(item['url'])
  if u.scheme!='https':continue
  item['url']=urlunsplit((u.scheme,u.netloc,u.path,'',''));out.append(item)
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--cache-dir',default='/tmp/degreepath-course-sources');ap.add_argument('--fetch',action='store_true');args=ap.parse_args();cache=Path(args.cache_dir);cache.mkdir(parents=True,exist_ok=True);now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
 target=ROOT/'dist/data/course-catalog.json';prior_bytes=target.read_bytes()if target.exists()else None;previous=json.loads(prior_bytes)if prior_bytes is not None else{'courses':[],'sources':[]}
 refreshed={key(source['provider'])for source in SOURCES}
 # A three-directory refresh does not retire courses from unrefreshed sources.
 retained=[json.loads(json.dumps(course))for course in previous.get('courses',[])if key(course.get('provider',''))not in refreshed]
 models=[json.loads((ROOT/('dist/data/'+n+'.json')).read_text())for n in ['tesu','liberty','liberty-criminal-justice-residential','liberty-criminal-justice-online']];known={}
 for m in models:
  for req in m['requirements']:
   for o in req['options']:
    # New providers enter through their own reviewed source adapters. A degree
    # option cannot invent a generic provider ID, source quantity or price.
    if o['provider']not in LEGACY_PROVIDER_IDS:continue
    k=(key(o['provider']),key(o['title']));entry=known.setdefault(k,{'provider':o['provider'],'title':o['title'],'code':o.get('code')or o['id'],'aliases':set(),'credits':o.get('bundleCredits')or o.get('sourceCredits')or o['credits'],'url':o.get('url'),'mapped':set()});entry['aliases'].update(o.get('codeAliases',[]));entry['mapped'].add(m['id']+':'+req['id'])
 courses={};manifest=[]
 def add(provider,pid,title,url,credits,source,checked,basis='provider-directory',knownEntry=None):
  k=(key(provider),key(title));enriched=knownEntry or known.get(k)
  if not enriched:
   matches=[o for o in known.values()if key(o['provider'])==key(provider)and o.get('url')and o['url'].rstrip('/')==url.rstrip('/')and len(urlsplit(url).path.strip('/').split('/'))>=2]
   if matches and len(set(o['code']for o in matches))==1:enriched=matches[0]
  amount=credits if credits is not None else enriched['credits']if enriched else None
  cid=pid+'-'+hashlib.sha256((pid+'|'+key(title)).encode()).hexdigest()[:18]
  courses[k]={'id':cid,'provider':provider,'providerId':pid,'title':title,'url':url,'code':None,'mappingCode':enriched['code']if enriched else None,'codeAliases':sorted(enriched['aliases'])if enriched else [],'credits':amount,'creditSystem':'semester'if amount is not None else None,'creditBasis':'provider-directory'if credits is not None else'curated-course-map'if enriched else'not-listed','subject':subject(title),'assessment':None,'price':None,'priceNote':'Membership and/or course fees apply; check the provider’s current terms.','sourceId':source,'checkedAt':checked,'recommendationStatus':'requires-review','mappingStatus':'reviewed-destination-example'if enriched else'source-listing','mappedCourseIds':sorted(enriched['mapped'])if enriched else []}
 for source in SOURCES:
  path=cache/(source['id']+'.html')
  if args.fetch:
   with urllib.request.urlopen(urllib.request.Request(source['url'],headers={'User-Agent':'DegreeSteps source-linked course catalog research'}),timeout=30)as r:raw=r.read()
   path.write_bytes(raw)
  raw=path.read_bytes();rows=parse(source,raw)
  if len(rows)<source['minimum']:raise ValueError(source['id']+' returned too few courses; old snapshot retained')
  checked=datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat(timespec='seconds')
  for row in rows:add(source['provider'],source['id'],row['title'],row['url'],row['credits'],source['id'],checked)
  manifest.append({**source,'checkedAt':checked,'count':len(rows),'status':'imported','scope':'Source-linked provider directory entries. Credit recommendations and individual degree applicability require review.','contentHash':'sha256:'+hashlib.sha256(raw).hexdigest()})
 added={}
 for k,o in known.items():
  pool=[*courses.values(),*retained]
  if k in courses or any(key(c['provider'])==key(o['provider'])and(key(c['title'])==key(o['title'])or c.get('mappingCode')==o['code']or c.get('code')==o['code'])for c in pool):continue
  pid=LEGACY_PROVIDER_IDS[o['provider']];sid=pid+'-mapped';add(o['provider'],pid,o['title'],o['url'],None,sid,now,'curated-course-map',o);added[sid]=added.get(sid,0)+1
 for sid,count in added.items():
  provider=next(c['provider']for c in courses.values()if c['sourceId']==sid);url={'Study.com':'https://study.com/college/online-college-courses.html','Sophia':'https://www.sophia.org/online-courses/','CLEP':'https://clep.collegeboard.org/clep-exams','StraighterLine':'https://www.straighterline.com/online-college-courses/'}[provider];manifest.append({'id':sid,'provider':provider,'url':url,'checkedAt':now,'count':count,'status':'mapping-reference','scope':'Exact source-course references in the existing degree maps; current availability and recommendation dates still require provider review.'})
 manifest_ids={source['id']for source in manifest}
 for source in previous.get('sources',[]):
  if source.get('id')not in manifest_ids:manifest.append(source);manifest_ids.add(source.get('id'))
 refs=json.loads((ROOT/'dist/data/credit-sources.json').read_text())
 for source in refs.get('sources',[]):
  if not source.get('url') or any(key(s['provider'])==key(source.get('name',''))for s in manifest):continue
  manifest.append({'id':'directory-'+source['id'],'provider':source['name'],'url':source['url'],'checkedAt':refs.get('checkedOn',now),'count':0,'status':'directory-link','scope':'Provider research directory; individual courses are not imported in this snapshot.'})
 data={'version':1,'checkedAt':min(s['checkedAt']for s in manifest if s['status']=='imported'),'importedAt':now,'scope':'Official Sophia, StraighterLine and CLEP directory refresh, plus retained reviewed source courses and course references. This is a scoped catalog, not every course from every provider. Listings do not confer credit or guarantee school acceptance.','sources':manifest,'courses':sorted([*courses.values(),*retained],key=lambda c:(c['provider'],c['title']))}
 if len(data['courses'])<len(previous.get('courses',[]))*.8:raise ValueError('Catalog dropped more than 20%; review parser before replacing snapshot')
 temp=target.with_suffix('.json.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');temp.replace(target)
 try:
  subprocess.run(['node',str(ROOT/'scripts/reviewed-course-identities.mjs')],check=True)
  subprocess.run(['node',str(ROOT/'scripts/upi-course-catalog.mjs')],check=True)
 except BaseException:
  # A changed identity or failed source review must retain the last usable
  # snapshot rather than leaving the partially refreshed directory installed.
  if prior_bytes is None:target.unlink(missing_ok=True)
  else:temp.write_bytes(prior_bytes);temp.replace(target)
  raise
 final=json.loads(target.read_text());(ROOT/'content/catalog/course-sources.json').write_text(json.dumps({'version':1,'sources':final['sources']},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'courses':len(final['courses']),'sources':[{'provider':s['provider'],'count':s['count'],'status':s['status']}for s in final['sources']if s.get('count')]}))
if __name__=='__main__':main()
