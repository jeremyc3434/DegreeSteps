/** Public navigation, persistent student workspace, and readable shared tokens. No network. */
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
 assert.match(app,/data-fallback-href="\/start.html"/,'My plan falls back to Build my plan when no plan exists');
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

test('the workspace has five persistent destinations, with course help, preferences, resources and account reachable',()=>{
 const markup=shellMarkup({withHeader:true});
 assert.doesNotMatch(markup,/data-ds-header|dp-shell-subnav/,'the app has its own task header rather than stacked website navigation');
 for(const selector of ['dp-shell-nav','dp-shell-bottom']){
  const nav=markup.match(new RegExp('<nav class="'+selector+'"[^>]*>([\\s\\S]*?)<\\/nav>'))?.[1];assert(nav,selector);
  assert.deepEqual([...nav.matchAll(/data-shell-nav="([a-z]+)"/g)].map(m=>m[1]),['plan','credits','learning','programs','community']);
  assert.equal((nav.match(/aria-current="page"/g)||[]).length,1,'only the actual page is current');
 }
 const links=hrefs(markup);
 for(const target of ['plan.html','courses.html?tab=mine','learn.html','programs.html','community.html?tab=feed','portal.html?view=preferences','compare-plans.html','account.html','library.html','/transfer/','/'])assert(links.has(target),'still linked: '+target);
 for(const hook of ['data-shell-account-label','data-shell-account-detail','dp-shell-avatar','dp-shell-save-account','dp-shell-save"','id="dp-shell-page-title"'])assert(markup.includes(hook),hook);
 assert.equal((markup.match(/id="dp-shell-page-title"/g)||[]).length,1);
 assert.equal((markup.match(/data-shell-account-label/g)||[]).length,1,'account identity has one source of presentation');
 assert.equal(shellMarkup({withHeader:false}),markup,'the app navigation works without a public header dependency');
 const css=read('dist/app-shell.css');assert.match(css,/--dp-bottom-nav-height:calc\(72px \+ env\(safe-area-inset-bottom/);
 assert.match(css,/\.dp-shell-bottom \{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/is-onboarding[^}]*display:none/,'onboarding keeps a way back to the student workspace');
});

test('scratch builders, legacy guided entry and management pages receive the correct workspace context',()=>{
 for(const [page,title] of [['degree-audit.html','Build my own plan'],['guided.html','Find my degree'],['growth.html','Activity overview'],['coverage.html','Academic coverage']]){
  const markup=shellMarkup({page:'/'+page,withHeader:false});assert.match(markup,new RegExp('id="dp-shell-page-title">'+title+'<'),page);
  if(['growth.html','coverage.html'].includes(page))for(const href of ['admin.html','coverage.html','growth.html'])assert(hrefs(markup).has(href),page+' preserves '+href);
 }
 const preferences=shellMarkup({page:'/portal.html',search:'?view=preferences',withHeader:false});
 assert.match(preferences,/href="portal.html\?view=preferences" aria-current="page"/);
 assert.doesNotMatch(preferences,/href="plan.html" aria-current="page"/);
});

test('the school policy library has a visible primary heading and legal links without losing the retained policy tools',()=>{
 const html=read('dist/library.html');
 const explore=html.match(/<section id="explore">([\s\S]*?)<\/section>/)?.[1];assert(explore);
 assert.match(explore,/<h1>Explore the possibilities\.<\/h1>/);
 for(const id of ['search','level','format','sort','count','cards','compare'])assert(explore.includes('id="'+id+'"'),'policy tool '+id+' remains');
 for(const id of ['workspace','creditform','inventory','summary','tasks','notes'])assert(html.includes('id="'+id+'"'),'retained workspace '+id+' remains');
 const footer=html.match(/<footer class="dp-legal-footer"[\s\S]*?<\/footer>/)?.[0];assert(footer);
 for(const href of ['/privacy/','/terms/','/why-its-free/'])assert(hrefs(footer).has(href),'legal link '+href);
 assert.match(read('dist/app-shell.js'),/#explore \.section-head h1, #explore \.section-head h2/,'heading enhancement supports both the current and earlier markup');
 assert.match(read('dist/workspace-design.css'),/#explore \.section-head :is\(h1,h2\)/,'both heading versions share the page title style');
 assert.match(read('dist/app-shell.css'),/footer:not\(\.dp-legal-footer\)/,'legacy library footer hiding leaves legal links visible');
});

test('the phone More menu closes with Escape, outside click, route selection and a return to desktop',()=>{
 const handlers=new Map(),documentHandlers=new Map(),mediaHandlers=new Map();let focused=0;
 const toggle={attrs:{'aria-expanded':'false'},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},contains:target=>target==='toggle',focus(){focused++;},addEventListener:(name,fn)=>handlers.set('toggle:'+name,fn)};
 const menu={hidden:true,contains:target=>target==='menu',addEventListener:(name,fn)=>handlers.set('menu:'+name,fn)};
 const shell={innerHTML:'',querySelector:s=>s==='.dp-shell-more-toggle'?toggle:s==='#dp-shell-more-menu'?menu:null};
 const context={URLSearchParams,Date,location:{pathname:'/plan.html',search:''},document:{createElement:()=>shell,body:{prepend(){},classList:{add(){}}},getElementById(){return null;},addEventListener:(name,fn)=>documentHandlers.set(name,fn)},addEventListener(){},matchMedia:()=>({addEventListener:(name,fn)=>mediaHandlers.set(name,fn)})};
 context.window=context;vm.runInNewContext(read('dist/app-shell.js'),context);
 const open=()=>{handlers.get('toggle:click')();assert.equal(toggle.attrs['aria-expanded'],'true');assert.equal(menu.hidden,false);};
 const closed=()=>{assert.equal(toggle.attrs['aria-expanded'],'false');assert.equal(menu.hidden,true);};
 open();documentHandlers.get('keydown')({key:'Escape'});closed();assert.equal(focused,1,'Escape returns focus to the disclosure button');
 open();documentHandlers.get('click')({target:'outside'});closed();
 open();handlers.get('menu:click')({target:{closest:()=>({})}});closed();
 open();mediaHandlers.get('change')({matches:true});closed();
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
 for(const fg of ['ink','navy','muted','cobalt','cobalt-hover','success-text','pick-text','error'])for(const bg of ['surface','canvas','nav'])assert(ratio(value(fg),value(bg))>=4.5,fg+' on '+bg+' '+ratio(value(fg),value(bg)).toFixed(2));
 assert(ratio(value('cobalt-hover'),value('cobalt-soft'))>=4.5,'chip text on the soft blue');
 assert(ratio(value('control-border'),value('surface'))>=3,'form boundaries remain visible');
 assert.match(tokens,/color-scheme:light/);assert.match(tokens,/--tok-cobalt:#3458d4/);assert.match(tokens,/--tok-canvas:#f1f4f9/);assert.match(tokens,/--tok-nav:#e9eef7/);
 const metadata=JSON.parse(read('dist/brand-tokens.json'));for(const [name,actual] of [['ink',metadata.color.ink],['muted',metadata.color.muted],['canvas',metadata.color.canvas],['nav',metadata.color.navigation],['cobalt',metadata.brand.cobalt],['navy',metadata.brand.navy]])assert.equal(value(name),actual.toLowerCase(),name+' metadata matches rendered tokens');
 for(const name of ['--ds-navy','--ds-cobalt','--ds-ink','--ds-muted','--ds-border','--ds-radius-control','--ds-radius-card'])assert.match(brand,new RegExp(name+':var\\(--tok-'),name+' maps onto a token');
 assert.match(tokens,/prefers-reduced-motion/);
});

test('the component check page is never indexed or linked',()=>{
 const demo=read('dist/ui-demo.html');assert.match(demo,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(read('dist/robots.txt'),/Disallow: \/ui-demo\.html/);assert.doesNotMatch(read('dist/sitemap.xml'),/ui-demo/);
 assert.match(read('worker/index.mjs'),/'\/ui-demo\.html'[,\]]/);
 for(const file of walk(dist).filter(p=>p.endsWith('.html')&&!p.endsWith('ui-demo.html')))assert.doesNotMatch(readFileSync(file,'utf8'),/href="\/?ui-demo\.html"/,file);
});
