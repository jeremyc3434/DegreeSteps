/** Static public-site QA. Run the build first; this test never edits generated pages. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, stat} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url)), dist=resolve(root,'dist');
const content=JSON.parse(await readFile(resolve(root,'content/public-content.json'),'utf8'));
const decode=value=>String(value).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const attr=(tag,name)=>decode(tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\\\']([^"\\\']*)["\\\']','i'))?.[1]||'');
const tagWith=(html,tag,name,value)=>(html.match(new RegExp('<'+tag+'\\b[^>]*>','gi'))||[]).find(t=>attr(t,name).toLowerCase()===value.toLowerCase())||'';
const strip=html=>decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const exists=async path=>{try{return(await stat(path)).isFile();}catch{return false;}};
function targetFile(pathname){const path=decodeURIComponent(pathname);assert(!path.includes('\0'));return resolve(dist,'.'+(path.endsWith('/')?path+'index.html':path));}
const sitemap=await readFile(resolve(dist,'sitemap.xml'),'utf8');
const locations=[...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m=>new URL(decode(m[1]).trim()));
assert(locations.length>0,'The sitemap must contain public pages');
const siteOrigin=locations[0].origin;
const pages=await Promise.all(locations.map(async url=>({url,html:await readFile(targetFile(url.pathname),'utf8')})));
const privatePaths=['/portal.html','/plan.html','/account.html','/guided.html','/audit.html'];
const articlePath=article=>(article.type==='guide'?'/guides/':'/blog/')+article.slug+'/';

test('the public homepage explains the product and offers a clear separate builder entry',()=>{
  const home=pages.find(p=>p.url.pathname==='/');assert(home,'Homepage is in the sitemap');
  assert.match(home.html,/<main\b/i);assert.match(home.html,/<h1\b/i);assert.match(home.html,/<nav\b/i);
  assert(!home.html.includes('id="portal-content"'),'The landing page is separate from the application');
  assert(!home.html.includes('What would you like help with?'),'The builder question is not the public landing page');
  const links=(home.html.match(/<a\b[^>]*>/gi)||[]).map(t=>attr(t,'href'));
  assert(links.some(h=>new URL(h,home.url).pathname==='/portal.html'),'A real CTA opens the builder');
  assert(links.some(h=>new URL(h,home.url).pathname==='/account.html'),'A real account entry is available');
  assert(strip(home.html).split(/\s+/).length>=200,'The explanation is crawlable without client rendering');
  const headline=strip(home.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  assert.match(headline,/^Finish your degree for less\.$/i,'The first message states the outcome');
  assert.match(strip(home.html.match(/<h2 id="home-steps-title"[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||''),/^The degree you want\. A smarter way there\.$/i,'The example chapter still connects the degree goal to a different route');
  assert.match(strip(home.html),/Find a faster, more affordable route with flexible courses that can count toward your degree\. Online or on campus\./,'The supporting sentence states the student outcome and course flexibility');
  const chapters=[...home.html.matchAll(/<section\b(?=[^>]*\bdata-home-step(?:\s|>))[^>]*>/gi)];
  assert.deepEqual(chapters.map(chapter=>attr(chapter[0],'id')),['home-step-1','home-step-2','home-step-3'],'The journey has three ordered semantic chapters');
  for(const [chapter] of chapters){
    assert(!/\s(?:hidden|inert)(?:\s|=|>)/i.test(chapter),'Every chapter is available without a carousel interaction');
    assert.notEqual(attr(chapter,'aria-hidden'),'true','Every chapter remains exposed to assistive technology');
    const label=attr(chapter,'aria-labelledby');assert(label&&home.html.includes('id="'+label+'"'),'Every chapter has a readable heading');
  }
  assert.doesNotMatch(home.html,/data-home-step-(?:viewport|track|back|next|controls)\b/,'The student can follow the page in normal document order');
  assert.match(home.html,/<script src="\/home-steps\.js" defer><\/script>/);
  assert(home.html.indexOf('href="/home-steps.css"')>home.html.indexOf('href="/public-design.css"'),'The homepage component is styled after the shared public design');
  assert.match(home.html,/Example degree plan/,'The proposed product preview is clearly labeled as an example');
  assert.match(home.html,/<table\b[^>]*class="home-plan-table"/,'The course-choice example retains its degree worksheet');
  const brandNames=new Map([['liberty',/Liberty University/i],['sophia',/Sophia/i]]);
  for(const match of home.html.matchAll(/<img\b[^>]*>/gi)){
    const image=match[0],source=new URL(attr(image,'src'),home.url);
    assert.equal(source.origin,siteOrigin,'Homepage images are self-hosted');
    const brand=source.pathname.match(/^\/images\/brands\/([a-z0-9-]+)\.svg$/i);
    if(brand){
      assert.match(image,/\balt\s*=\s*(["'])\1/i,'A decorative brand image has an explicit empty text alternative');
      for(const dimension of ['width','height'])assert(/^[1-9]\d*$/.test(attr(image,dimension)),'Brand images have positive numeric '+dimension);
      const name=brandNames.get(brand[1]);assert(name,'The example identifies a known school or course provider');
      assert.match(strip(home.html.slice(match.index+image.length,match.index+image.length+600)),name,'The decorative logo has a nearby readable brand name');
    }else assert(attr(image,'alt').length>=12,'A photograph has a useful text alternative');
  }

});

test('all sitemap pages have unique search metadata and a matching absolute canonical',()=>{
  const titles=new Set(),descriptions=new Set();
  for(const {url,html} of pages){
    const title=decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'').trim();
    const description=attr(tagWith(html,'meta','name','description'),'content');
    assert(title.length>=10,`${url.pathname}: useful title`);assert(description.length>=50,`${url.pathname}: useful description`);
    assert(!titles.has(title),`${url.pathname}: duplicate title`);titles.add(title);
    assert(!descriptions.has(description),`${url.pathname}: duplicate description`);descriptions.add(description);
    const canonical=attr(tagWith(html,'link','rel','canonical'),'href');assert.equal(canonical,url.href,`${url.pathname}: canonical must match sitemap URL`);
    assert.equal(new URL(canonical).origin,siteOrigin);
    assert(!/noindex/i.test(attr(tagWith(html,'meta','name','robots'),'content')),`${url.pathname}: public page must be indexable`);
    assert(attr(tagWith(html,'meta','property','og:title'),'content'),`${url.pathname}: Open Graph title`);
    assert(attr(tagWith(html,'meta','property','og:description'),'content'),`${url.pathname}: Open Graph description`);
  }
});

test('the public route example matches its real preloaded degree and never represents personal awards',async()=>{
  const home=pages.find(page=>page.url.pathname==='/').html;
  const data=JSON.parse(home.match(/<script type="application\/json" id="home-route-example-data">([\s\S]*?)<\/script>/)[1]);
  const baseline=JSON.parse(await readFile(resolve(dist,'data/baseline-index.json'),'utf8'));
  const actual=Object.values(baseline.baselines).find(row=>row.modelId===data.modelId);
  assert.equal(data.modelId,'liberty-business-residential');assert.equal(data.personalCreditsAwarded,0);assert.equal(data.total,120);
  assert.equal(data.choices.sophia.outside,actual.summary.transferCredits);assert.equal(data.choices.sophia.university,actual.summary.universityCredits);
  assert.deepEqual([data.choices.sophia.outside,data.choices.sophia.university],[83,37]);
  assert.deepEqual([data.choices.university.outside,data.choices.university.university],[80,40]);
  const target=new URL(data.planUrl,siteOrigin);assert.equal(target.pathname,'/portal.html');assert.equal(target.searchParams.get('school'),'Liberty University');assert.equal(target.searchParams.get('program'),data.modelId);assert.equal(target.searchParams.get('format'),'campus');
  for(const choice of Object.values(data.choices))assert.equal(choice.outside+choice.university,data.total);
});

test('switching the public course example updates only its proposed mix and rejects malformed examples',async()=>{
  const home=pages.find(page=>page.url.pathname==='/').html;
  const data=JSON.parse(home.match(/<script type="application\/json" id="home-route-example-data">([\s\S]*?)<\/script>/)[1]);
  const script=await readFile(resolve(dist,'site.js'),'utf8');
  function mount(example){
    const listeners={},select={value:'sophia',disabled:true,addEventListener(name,handler){listeners[name]=handler;}},nodes=new Map();
    for(const selector of ['[data-home-course-provider]','[data-home-outside]','[data-home-university]','[data-home-route-feedback]'])nodes.set(selector,{textContent:''});
    nodes.set('[data-home-course-choice]',select);
    const route={querySelector:selector=>nodes.get(selector)||null},original=JSON.stringify(example),payload={textContent:original};
    const document={querySelector:selector=>selector==='[data-home-route-example]'?route:null,getElementById:id=>id==='home-route-example-data'?payload:null,addEventListener(){}};
    const context={document,matchMedia:()=>({matches:true,addEventListener(){}}),localStorage:{getItem(){throw Error('The example must not read private records');},setItem(){throw Error('The example must not change private records');}},fetch(){throw Error('The example must not make network requests');}};context.window=context;
    vm.runInNewContext(script,context);
    return {select,nodes,change(value){select.value=value;listeners.change?.();},payload,original};
  }
  const ui=mount(data);assert.equal(ui.select.disabled,false);assert.equal(ui.nodes.get('[data-home-outside]').textContent,'83');
  ui.change('university');assert.equal(ui.nodes.get('[data-home-outside]').textContent,'80');assert.equal(ui.nodes.get('[data-home-university]').textContent,'40');assert.match(ui.nodes.get('[data-home-course-provider]').textContent,/Liberty/);
  ui.change('sophia');assert.equal(ui.nodes.get('[data-home-outside]').textContent,'83');assert.equal(ui.nodes.get('[data-home-university]').textContent,'37');assert.equal(ui.payload.textContent,ui.original);
  const invalid=structuredClone(data);invalid.choices.university.university=-1;assert.equal(mount(invalid).select.disabled,true);
  const awarded=structuredClone(data);awarded.personalCreditsAwarded=3;assert.equal(mount(awarded).select.disabled,true);
});

test('structured data is valid JSON and editorial pages use factual article metadata',()=>{
  let articles=0;
  for(const {url,html} of pages){
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>attr('<script '+m[1]+'>','type')==='application/ld+json');
    assert(scripts.length,`${url.pathname}: structured data is present`);
    const nodes=[];const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){nodes.push(value);Object.values(value).forEach(visit);}};
    for(const script of scripts)visit(JSON.parse(script[2]));
    assert(!nodes.some(n=>n.aggregateRating),'Do not invent star ratings for an unlaunched platform');
    if(url.pathname==='/')assert(nodes.some(n=>n['@type']==='Organization')&&nodes.some(n=>n['@type']==='WebSite'),'Homepage identifies the actual site and organization');
    const editorial=content.articles.find(a=>articlePath(a)===url.pathname);
    if(editorial){
      const article=nodes.find(n=>[].concat(n['@type']||[]).some(t=>['Article','BlogPosting'].includes(t)));
      assert(article,`${url.pathname}: Article or BlogPosting schema`);assert.equal(article.headline,editorial.title);
      assert(article.author,`${url.pathname}: actual editorial byline`);
      if(article.dateModified)assert.equal(article.dateModified.slice(0,10),editorial.reviewedOn,`${url.pathname}: real review date`);
      articles++;
    }else assert(nodes.some(n=>n['@type']==='BreadcrumbList')||url.pathname==='/',`${url.pathname}: breadcrumb schema`);
  }
  assert.equal(articles,content.articles.length,'Every published guide and article is represented');
});

test('the sitemap exposes public resources and keeps personal drafts and account pages out of search',async()=>{
  const paths=new Set(locations.map(u=>u.pathname));assert.equal(paths.size,locations.length,'No duplicate sitemap entries');
  for(const article of content.articles)assert(paths.has(articlePath(article)),`${article.slug}: published editorial route`);
  for(const path of ['/resources/','/guides/','/blog/','/schools/','/credit-sources/','/how-it-works/','/about/','/faq/','/privacy/','/terms/'])assert(paths.has(path),`${path}: public route`);
  const robots=await readFile(resolve(dist,'robots.txt'),'utf8');
  assert.match(robots,/User-agent:\s*\*/i);assert.match(robots,/Sitemap:\s*https:\/\//i);assert(!/^Disallow:\s*\/\s*$/mi.test(robots),'Public website is not globally blocked');
  for(const path of privatePaths){
    assert(!paths.has(path),`${path}: not in public sitemap`);
    const html=await readFile(targetFile(path),'utf8');assert(/noindex/i.test(attr(tagWith(html,'meta','name','robots'),'content')),`${path}: noindex metadata`);
    assert(robots.includes('Disallow: '+path),`${path}: excluded from public crawling`);
  }
});

test('public links, stylesheets and scripts resolve to real pages or local assets',async()=>{
  const failures=[];
  for(const {url,html} of pages){
    const tags=html.match(/<(?:a|link|script|img|source)\b[^>]*>/gi)||[];
    for(const tag of tags){
      for(const source of attr(tag,'srcset').split(',').map(value=>value.trim().split(/\s+/)[0]).filter(Boolean)){
        let image;try{image=new URL(source,url);}catch{failures.push(`${url.pathname}: invalid image URL ${source}`);continue;}
        if(image.origin===siteOrigin&&!(await exists(targetFile(image.pathname))))failures.push(`${url.pathname}: missing responsive image ${source}`);
      }
      const raw=attr(tag,/^<(script|img|source)\b/i.test(tag)?'src':'href');if(!raw||/^(mailto:|tel:|data:|javascript:)/i.test(raw))continue;
      let resolved;try{resolved=new URL(raw,url);}catch{failures.push(`${url.pathname}: invalid URL ${raw}`);continue;}
      if(resolved.origin!==siteOrigin)continue;
      let path=targetFile(resolved.pathname);
      if(!(await exists(path))&&!(resolved.pathname.endsWith('/'))&&await exists(resolve(path,'index.html')))path=resolve(path,'index.html');
      if(!(await exists(path))){failures.push(`${url.pathname}: missing ${raw}`);continue;}
      if(resolved.hash&&path.endsWith('.html')){
        const targetHtml=await readFile(path,'utf8'),id=decodeURIComponent(resolved.hash.slice(1));
        const ids=(targetHtml.match(/\bid\s*=\s*["'][^"']+["']/gi)||[]).map(t=>attr(t,'id'));
        if(!ids.includes(id))failures.push(`${url.pathname}: missing anchor ${raw}`);
      }
    }
  }
  assert.deepEqual(failures,[],'Public navigation must not lead to missing resources');
});

test('editorial pages contain substantial readable guidance, sources, related reading and a useful next step',()=>{
  assert(content.articles.filter(a=>a.type==='guide').length>=8);assert(content.articles.filter(a=>a.type==='article').length>=12);
  for(const article of content.articles){
    const page=pages.find(p=>p.url.pathname===articlePath(article));assert(page,article.slug);
    const main=page.html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||'';
    const words=strip(main).split(/\s+/).length;assert(words>=(article.type==='guide'?600:400),`${article.slug}: full server-readable article (${words} words)`);
    assert(article.sources.length>=1,`${article.slug}: evidence sources`);
    for(const source of article.sources)assert(page.html.includes(source.url.replace(/&/g,'&amp;'))||page.html.includes(source.url),`${article.slug}: source is visible`);
    for(const related of article.related||[]){const target=content.articles.find(a=>a.slug===related);assert(target);assert(page.html.includes(articlePath(target)),`${article.slug}: related ${related} is linked`);}
    assert(page.html.includes('/portal.html'),`${article.slug}: useful next step enters the app`);
    assert(!/application\/ld\+json[^>]*>[\s\S]*?"aggregateRating"/.test(page.html));
  }
});
