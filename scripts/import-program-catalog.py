"""Import official program listings, independently of course-equivalency maps.
Run with --cache-dir PATH for retained source HTML, or --fetch to refresh sources.
A failed source never replaces a previous published snapshot. No third-party packages.
"""
import argparse, concurrent.futures, datetime, hashlib, html, json, re, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
ROOT=Path(__file__).resolve().parent.parent
SOURCES=[
 {'id':'liberty','school':'Liberty University','url':'https://catalog.liberty.edu/programs/','minimum':300,'scope':'2026–2027 Programs A–Z; degree listings, not minors or certificates'},
 {'id':'snhu','school':'Southern New Hampshire University','url':'https://www.snhu.edu/online-degrees/bachelors','minimum':25,'scope':'Online bachelor’s directory'},
 {'id':'wgu','school':'Western Governors University','url':'https://www.wgu.edu/online-degree-programs.html','minimum':50,'scope':'Online bachelor’s and master’s degree directory'},
 {'id':'umpi','school':'University of Maine at Presque Isle','url':'https://www.umpi.edu/yourpace/yourpace-programs/','minimum':10,'scope':'UMPI YourPace degrees; certificates, minors and partner-university awards excluded'}
]
def clean(t):return ' '.join(html.unescape(t).replace('\u200b','').replace('\xa0',' ').split()).strip()
class Links(HTMLParser):
 def __init__(self):super().__init__();self.current=None;self.links=[]
 def handle_starttag(self,t,a):
  if t=='a':self.current=[dict(a).get('href',''),'']
 def handle_data(self,t):
  if self.current is not None:self.current[1]+=t
 def handle_endtag(self,t):
  if t=='a' and self.current:self.links.append((self.current[0],clean(self.current[1])));self.current=None

def level(title,url):
 if re.search(r'Ph\.D|Ed\.D|D\.B\.A|D\.N\.P|D\.O\.|D\.P\.|D\.M\.|D\.Min|D\.Sc|J\.D\.|Doctor',title,re.I):return 'doctorate'
 if re.search(r'\bEd\.S|Education Specialist',title,re.I):return 'specialist'
 if re.search(r'\bMaster|\bMBA|\(M\.|[–—-] M\.|\bMSN\b',title,re.I) or 'masters-' in url:return 'master'
 if re.search(r'\bAssociate|\(A\.|[–—-] A\.',title,re.I):return 'associate'
 if re.search(r'\bBachelor|\(B\.|[–—-] B\.|\bBSN\b',title,re.I) or 'bachelors-' in url:return 'bachelor'
 return None

def parse(source,raw):
 text=raw.decode('utf-8',errors='replace');name=source['id'];items=[]
 if name=='liberty':
  text=text[text.index('<div class="az_sitemap"'):];parser=Links();parser.feed(text)
  items=[(url,title,[]) for url,title in parser.links if re.match(r'/(?:undergraduate|graduate)/colleges-schools/',url) and level(title,url) and not re.search(r'\bMinor\b|Certificate|Concentration only',title,re.I)]
 elif name=='umpi':
  for block in re.split(r"<div class='ums-academic-program-item'",text)[1:]:
   parser=Links();parser.feed(block.split('end .ums-academic-program-item')[0]);links=[(u,t) for u,t in parser.links if '/academic_programs/' in u]
   if not links:continue
   url,title=links[0]
   if re.search(r'Certificate|Certification|– UMF|– UMFK',title,re.I):continue
   awards=re.findall(r"<span class='academic_program_type[^']*'[^>]*>(.*?)</span>",block,re.S)
   for award in awards:
    award=clean(award)
    if award.startswith(('Bachelor of','Associate of','Master of')):items.append((url,clean(title.replace('(YourPace Grad)','').replace('(YourPace)',''))+' — '+award,['online']))
 else:
  parser=Links();parser.feed(text)
  for url,title in parser.links:
   if name=='snhu':
    if '/online-degrees/bachelors/' not in url:continue
    # Nursing bridge is a distinct pathway but the RN-to-MSN destination is not a bachelor's award.
    if '/nursing-bs-advanced-pathway-' in url:continue
    title=re.sub(r' degree online$| degree$','',title,flags=re.I)
    award=re.search(r'/(ba|bs)-in-',url);title=title+' ('+(award.group(1).upper().replace('BA','B.A.').replace('BS','B.S.') if award else 'Bachelor’s')+')'
   else:
    if not re.search(r'/online-[^/]+/[^/]+(?:bachelor|master|mba)[^/]*\.html',url):continue
    if re.search(r'(?:bachelors|masters|education-masters)-programs\.html$|education-bachelors-degrees\.html$',url) or re.match(r'View|See all|Explore all|Apply|Learn more|Get started|All ',title,re.I):continue
    if not level(title,url):continue
   if title:items.append((url,title,['online']))
 seen=set();out=[]
 for url,title,modes in items:
  url=urljoin(source['url'],url);lev=level(title,url)
  if name=='snhu':lev='bachelor'
  if not lev or urlparse(url).hostname!=urlparse(source['url']).hostname:continue
  identity=url+'|'+title if name=='umpi' else url
  if identity in seen:continue
  seen.add(identity);pid=source['id']+'-catalog-'+hashlib.sha256(identity.encode()).hexdigest()[:16]
  out.append({'id':pid,'schoolId':name,'school':source['school'],'title':title,'level':lev,'modalities':modes,'url':url,'sourceId':name,'coverage':'official-listing','courseMapStatus':'not-mapped',**({'paceModel':'competency-subscription','paceSourceUrl':source['url']} if name in ['wgu','umpi'] else {})})
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--cache-dir',default='/tmp/degreepath-catalog-research');ap.add_argument('--fetch',action='store_true');args=ap.parse_args();cache=Path(args.cache_dir);cache.mkdir(parents=True,exist_ok=True)
 records=[];manifest=[];checked=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
 for source in SOURCES:
  path=cache/(source['id']+'.html')
  if args.fetch:
   req=urllib.request.Request(source['url'],headers={'User-Agent':'DegreeSteps public academic program directory; source-linked research'})
   with urllib.request.urlopen(req,timeout=30) as response:raw=response.read()
   path.write_bytes(raw)
  raw=path.read_bytes();programs=parse(source,raw)
  if len(programs)<source['minimum']:raise ValueError(f"{source['id']} returned only {len(programs)} degrees; existing snapshot left intact")
  records.extend(programs);manifest.append({**source,'checkedAt':datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat(timespec='seconds'),'programCount':len(programs),'contentHash':'sha256:'+hashlib.sha256(raw).hexdigest()})
 previous=ROOT/'dist/data/program-catalog.json';old={}
 if previous.exists():
  old=json.loads(previous.read_text());counts={s['id']:s['programCount'] for s in old['sources']}
  for source in manifest:
   if source['programCount']<counts.get(source['id'],0)*.8:raise ValueError('Large catalog drop requires parser review; existing snapshot left intact')
 # The four legacy scrapers do not replace separately reviewed school inventories.
 expanded=[p for p in old.get('programs',[]) if p.get('catalogCollection')=='opportunity-expansion']
 records.extend(expanded)
 manifest.extend(s for s in old.get('sources',[]) if s.get('catalogCollection')=='opportunity-expansion')
 overrides_path=ROOT/'content/catalog/program-overrides.json'
 if overrides_path.exists():
  overrides=json.loads(overrides_path.read_text()).get('programs',{})
  for record in records:
   if record['id'] in overrides:record.update(overrides[record['id']])
 data={'version':1,'importedAt':checked,'checkedAt':min(s['checkedAt'] for s in manifest),'scope':'Official program listings. Source coverage is explicit; listings do not establish transfer equivalencies, admission availability or eligibility for licensure.','sources':manifest,'programs':sorted(records,key=lambda x:(x['school'],x['title']))}
 for key in ['schools','expandedCheckedOn','expansionCoverage']:
  if key in old:data[key]=old[key]
 temp=previous.with_suffix('.json.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');temp.replace(previous)
 (ROOT/'content/catalog/sources.json').write_text(json.dumps({'version':1,'sources':manifest},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'programs':len(records),'schools':len(manifest),'sources':[{s['id']:s['programCount']}for s in manifest]}))
if __name__=='__main__':main()
