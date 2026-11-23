/** Redesign foundation: one header everywhere, no destination lost, tokens readable. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {applyExperience} from './scripts/apply-brand-system.mjs';
const require=createRequire(import.meta.url),Header=require('./dist/site-header.js');
const root=import.meta.dirname,dist=resolve(root,'dist'),read=path=>readFileSync(resolve(root,path),'utf8');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='vendor'?[]:walk(resolve(dir,e.name))):[resolve(dir,e.name)]);
const destinations=html=>[...html.matchAll(/data-header-destination="([a-z]+)"/g)].map(m=>m[1]);
const hrefs=html=>new Set([...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&')));
const FIVE=['degrees','transfer','community','plan','account'];

test('the shared header names the five destinations on both surfaces',()=>{
 const pub=Header.html({surface:'public',current:'degrees'}),app=Header.html({surface:'app',current:'plan'});
 assert.deepEqual(destinations(pub),FIVE);assert.deepEqual(destinations(app),FIVE);
 for(const [label,href] of [['Degrees','/degree-plans/'],['Transfer courses','/transfer/'],['Community','/community.html?tab=feed'],['My plan','/plan.html'],['Sign in','/account.html']])assert(pub.includes('href="'+href.replace('&','&amp;')+'"')&&pub.includes('>'+label+'<'),label);
 assert(app.includes('href="/programs.html"'),'Degrees opens the degree finder inside the workspace');
 assert.match(pub,/href="\/degree-plans\/"[^>]*aria-current="page"/);assert.match(app,/data-shell-nav="plan"[^>]*aria-current="page"/);
 assert.match(app,/data-fallback-href="\/portal.html"/,'My plan falls back to setup when no plan exists');
 assert.match(pub,/<button type="button" class="ds-header-toggle" aria-expanded="false" aria-controls="ds-header-menu-public" hidden>/,'The menu button stays hidden until the script can run it');
 assert.match(pub,/<nav class="ds-header-nav" id="ds-header-menu-public" aria-label="Main navigation">/);
});

test('My plan points to the plan only when this device holds a chosen degree, and never writes storage',()=>{
 const store=value=>({getItem:key=>{assert.equal(key,'degreepath-guide-v3');return value;},setItem(){throw Error('read only');}});
 assert.equal(Header.hasPlan(store(null)),false);assert.equal(Header.hasPlan(store('not json')),false);
 assert.equal(Header.hasPlan(store(JSON.stringify({selectedPathwayId:'x',sheet:{isExample:true}}))),false);
 assert.equal(Header.hasPlan(store(JSON.stringify({selectedPathwayId:'liberty-business-residential'}))),true);
 assert.equal(Header.hasPlan(store(JSON.stringify({profile:{pathwayId:'wgu-psychology'}}))),true);
});

test('every public page renders the shared header, and every earlier header or footer destination is still linked',()=>{
 const pages=walk(dist).filter(p=>p.endsWith('.html')).map(p=>({path:p.slice(dist.length),html:readFileSync(p,'utf8')})).filter(p=>/<body\b[^>]*class="[^"]*\bpublic-page\b/.test(p.html));
 assert(pages.length>=250,'all generated public pages are checked');
 const earlier=['/how-it-works/','/degree-plans/','/resources/','/account.html','/portal.html','/campuses.html','/compare/','/about/','/courses.html','/guides/','/schools/','/credit-sources/','/transfer/','/blog/','/faq/','/community.html','/privacy/','/terms/','/why-its-free/'];
 for(const page of pages){
  assert.equal((page.html.match(/data-ds-header/g)||[]).length,1,page.path+' has one shared header');
  assert.deepEqual(destinations(page.html),FIVE,page.path);
  const links=hrefs(page.html);for(const target of earlier)assert(links.has(target),page.path+' still links '+target);
  assert(page.html.includes('<script src="/site-header.js" defer></script>'),page.path+' loads the header script');
 }
});

function shellMarkup({withHeader,search='',page='/plan.html'}){
 const shell={innerHTML:'',querySelector(){return null;}};
 const context={location:{pathname:page,search},URLSearchParams,Date,
  document:{createElement:()=>shell,body:{prepend(){},classList:{add(){}},style:{}},getElementById(){return null;},addEventListener(){}},addEventListener(){}};
 context.window=context;
 if(withHeader)vm.runInNewContext(read('dist/site-header.js'),context,{filename:'site-header.js'});
 vm.runInNewContext(read('dist/app-shell.js'),context,{filename:'app-shell.js'});
 return shell.innerHTML;
}

test('the workspace renders the same header and keeps every former sidebar and tab destination one tap away',()=>{
 const markup=shellMarkup({withHeader:true});
 assert.deepEqual(destinations(markup),FIVE);assert.match(markup,/class="ds-header ds-header--app dp-shell-header"/);
 for(const nav of ['plan','programs','community','credits'])assert.match(markup,new RegExp('data-shell-nav="'+nav+'"'),nav);
 const links=hrefs(markup);
 for(const target of ['/plan.html','courses.html?tab=mine','/programs.html','/community.html?tab=feed','portal.html?view=preferences','account.html','library.html','/'])assert(links.has(target),'still linked: '+target);
 for(const hook of ['data-shell-account-label','data-shell-account-detail','dp-shell-avatar','dp-shell-save-account','dp-shell-save"','id="dp-shell-page-title"'])assert(markup.includes(hook),hook);
 assert.doesNotMatch(markup,/dp-shell-bottom|dp-shell-sidebar/,'the sidebar and phone tab bar are replaced, not duplicated');
 const fallback=shellMarkup({withHeader:false});for(const nav of ['plan','programs','community','credits'])assert.match(fallback,new RegExp('data-shell-nav="'+nav+'"'),'fallback keeps '+nav);
});

test('the build loads the header builder before the workspace shell, once, on every rebuild',()=>{
 const source='<!doctype html><html><head><script src="app-shell.js" defer></script></head><body></body></html>';
 const once=applyExperience(source,'plan.html').html,twice=applyExperience(once,'plan.html').html;
 assert.equal(once,twice,'wiring is idempotent');
 assert.equal((twice.match(/site-header\.js/g)||[]).length,1);
 assert(twice.indexOf('/site-header.js')<twice.indexOf('app-shell.js'),'header builder runs first');
 for(const file of ['plan.html','programs.html','portal.html','community.html','account.html','courses.html']){const html=read('dist/'+file);assert(html.indexOf('/site-header.js')>-1&&html.indexOf('/site-header.js')<html.indexOf('app-shell.js'),file);}
});

test('tokens: brand names map onto the new tokens and text colors stay readable',()=>{
 const tokens=read('dist/ds-tokens.css'),brand=read('dist/brand.css');
 const value=name=>tokens.match(new RegExp('--tok-'+name+':(#[0-9a-f]{6})','i'))[1];
 const lum=hex=>hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return(x+.05)/(y+.05);};
 for(const fg of ['ink','navy','muted','cobalt','cobalt-hover','success-text','pick-text','error'])for(const bg of ['surface','canvas'])assert(ratio(value(fg),value(bg))>=4.5,fg+' on '+bg+' '+ratio(value(fg),value(bg)).toFixed(2));
 assert(ratio(value('cobalt-hover'),value('cobalt-soft'))>=4.5,'chip text on the soft blue');
 for(const name of ['--ds-navy','--ds-cobalt','--ds-ink','--ds-muted','--ds-border','--ds-radius-control','--ds-radius-card'])assert.match(brand,new RegExp(name+':var\\(--tok-'),name+' maps onto a token');
 assert.match(tokens,/prefers-reduced-motion/);
});

test('the component check page is never indexed or linked',()=>{
 const demo=read('dist/ui-demo.html');assert.match(demo,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(read('dist/robots.txt'),/Disallow: \/ui-demo\.html/);assert.doesNotMatch(read('dist/sitemap.xml'),/ui-demo/);
 assert.match(read('worker/index.mjs'),/'\/ui-demo\.html'\]\.includes\(path\)/);
 for(const file of walk(dist).filter(p=>p.endsWith('.html')&&!p.endsWith('ui-demo.html')))assert.doesNotMatch(readFileSync(file,'utf8'),/href="\/?ui-demo\.html"/,file);
});
