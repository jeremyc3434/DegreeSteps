/** Rebrand release checks: display names change; saved academic work and credentials do not. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCipheriv} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolveAIConnection} from './server/ai-connections.mjs';
import {resolvePortalIdentity} from './server/auth.mjs';
const require=createRequire(import.meta.url),Workflow=require('./dist/course-import-workflow.js'),Account=require('./dist/account-client.js'),Returns=require('./dist/account-return.js');
const root=import.meta.dirname,dist=resolve(root,'dist'),read=path=>readFileSync(resolve(root,path),'utf8');
const publicHost='https://degreesteps.com';
const matches=(value,pattern,message)=>assert(pattern.test(value),message||'Expected '+pattern),notMatches=(value,pattern,message)=>assert(!pattern.test(value),message||'Unexpected '+pattern);
function walk(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(resolve(directory,entry.name)):[resolve(directory,entry.name)]);}
function decode(value){return value.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');}
function textOnly(html){return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ');}

test('all published HTML uses DegreeSteps display branding and shared brand styling',()=>{
 const files=walk(dist).filter(path=>path.endsWith('.html'));assert(files.length>=70);
 for(const file of files){const html=readFileSync(file,'utf8'),path=file.slice(dist.length);notMatches(textOnly(html),/\b(?:DegreePath|Degree Path|DEGREEPATH)\b/,path+' still displays the old name');matches(html,/<link\b[^>]*href=["'][^"']*brand\.css["'][^>]*>/i,path+' needs the shared brand stylesheet');}
 for(const file of ['index.html','portal.html','plan.html','courses.html','import-courses.html','account.html','community.html','compare-plans.html','degree-audit.html','request-plan.html','school.html','admin.html']){const html=read('dist/'+file);matches(html,/<title>[^<]*DegreeSteps[^<]*<\/title>/,file+' needs its branded title');notMatches(html,/aria-label=["'][^"']*(?:DegreePath|Degree Path)[^"']*["']/i,file+' has an obsolete accessible label');}
});

test('homepage explains the student outcome and every primary navigation destination exists',()=>{
 const html=read('dist/index.html'),text=textOnly(html);matches(text,/A clearer path to your degree\./);matches(text,/Build my plan/);matches(text,/affordable courses/i);matches(text,/Illustrative|illustration|example plan/i,'Any prefilled product preview must identify itself as an example');
 for(const target of ['/portal.html','/programs.html','/courses.html','/resources/','/community.html','/account.html']){assert(html.includes('href="'+target),'Homepage should link to '+target);const file=resolve(dist,target.replace(/^\//,'')+(target.endsWith('/')?'index.html':''));assert(existsSync(file),'Navigation destination must be published: '+target);}
});

test('SEO uses the official DegreeSteps domain while private-page search boundaries stay stable',()=>{
 for(const path of ['index.html','resources/index.html','about/index.html','faq/index.html','privacy/index.html','terms/index.html']){const html=read('dist/'+path);matches(html,/property="og:site_name" content="DegreeSteps"/);const canonical=html.match(/<link rel="canonical" href="([^"]+)"/);assert(canonical,path+' has a canonical URL');assert.equal(new URL(canonical[1]).origin,publicHost);}
 const home=read('dist/index.html'),schemas=[...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));for(const type of ['Organization','WebSite']){const item=schemas.flat().find(item=>item['@type']===type);assert(item,type+' structured data missing');assert.equal(item.name,'DegreeSteps');assert.equal(new URL(item.url).origin,publicHost);assert.equal(item.aggregateRating,undefined,'The rebrand must not fabricate ratings');}
 const sitemap=read('dist/sitemap.xml');for(const path of ['plan.html','courses.html','import-courses.html','account.html','admin.html','request-plan.html'])assert(!sitemap.includes('/'+path),path+' must stay outside the public sitemap');
});

test('central tokens provide the intended palette with readable measured text combinations',()=>{
 const tokens=JSON.parse(read('dist/brand-tokens.json')),css=read('dist/brand.css');assert.equal(tokens.brand.navy.toLowerCase(),'#192c43');assert.equal(tokens.brand.cobalt.toLowerCase(),'#4054f4');for(const token of ['--ds-navy','--ds-cobalt','--ds-ink','--ds-muted','--ds-control-border','--ds-success','--ds-warning','--ds-error'])assert(css.includes(token),token);matches(css,/:focus-visible/);matches(css,/prefers-reduced-motion/);
 function luminance(hex){const rgb=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
 function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(values[0]+.05)/(values[1]+.05);}
 for(const foreground of [tokens.brand.navy,tokens.brand.cobalt,tokens.color.ink,tokens.color.muted,tokens.color.success,tokens.color.warning,tokens.color.error])for(const background of [tokens.color.surface,tokens.color.canvas])assert(contrast(foreground,background)>=4.5,foreground+' needs readable normal text on '+background);assert(contrast(tokens.color.controlBorder,tokens.color.surface)>=3,'Visible input boundaries need enough contrast');
});

test('download labels use the new name without renaming browser data contracts',()=>{
 const files=readdirSync(dist).filter(file=>file.endsWith('.js'));for(const file of files){const source=read('dist/'+file);notMatches(source,/['"`]DEGREEPATH\s*[—-]/,file+' still exports an old brand heading');notMatches(source,/\.download\s*=\s*['"]degreepath-/i,file+' still uses an old download name');notMatches(source,/downloadFile\(\s*['"]degreepath-/i,file+' still uses an old download name');notMatches(source,/['"`]degreepath-[^'"`]+\.(?:json|csv|txt)['"`]/i,file+' still exposes an old export filename');}
 assert.equal(Account.DRAFT_KEY,'degreepath-guide-v3');assert.equal(Workflow.KEY,'degreepath-guide-v3');assert.equal(Returns.KEY,'degreepath-auth-return-v1');
 const source=read('dist/app-shell.js');assert(source.includes("'degreepath:save'"));assert(source.includes("'degreepath:account'"));matches(source,/ds-wordmark/);notMatches(source,/DegreeSteps<span[^>]*dp-shell-brand-dot/,'The old trailing dot must not become part of the new wordmark');
});

test('a pre-rebrand saved plan opens with all source facts, evaluations and notes unchanged',()=>{
 const prior={version:3,selectedPathwayId:'old-degree-choice',profile:{degree:'My degree',school:'My college',hasPrior:'some'},learning:[{id:'kept-course',provider:'Original College',code:'ENG101',title:'Writing',credits:4,creditSystem:'quarter',status:'earned',completedOn:'2024-01-20',grade:'A',evaluations:[{programId:'old-degree-choice',requirementId:'writing',status:'confirmed'}]}],sheet:{isExample:false,notes:{private:'Keep my advisor notes'}},checklist:{plans:{'old-degree-choice':{items:{application:{done:true}}}}},whatIf:{snapshots:[{id:'previous',label:'My other degree'}]}};
 const raw=JSON.stringify(prior),storage={getItem(key){assert.equal(key,'degreepath-guide-v3');return raw;},setItem(){throw Error('Opening a plan must not replace the old copy');}};assert.deepEqual(Workflow.load(storage),prior);
});

test('the old HttpOnly access cookie still resolves the same provider-verified student',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls=[];const identity=await resolvePortalIdentity(new Request(publicHost+'/api/portal/session',{headers:{Cookie:'__Host-degreepath_access=legacy-valid-access'}}),{PORTAL_SUPABASE_URL:'https://project.supabase.co',PORTAL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',PORTAL_AUTH_FETCH:async(url,options)=>{calls.push(url);assert.equal(url,'https://project.supabase.co/auth/v1/user');assert.equal(options.headers.Authorization,'Bearer legacy-valid-access');return Response.json({id,email:'synthetic@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'});}});assert.equal(identity.user.id,'sb-'+id);assert.equal(calls.length,1);assert.deepEqual(identity.setCookies,[]);
});

test('a Claude key encrypted under the old brand still decrypts after the display rebrand',async()=>{
 const key='old-brand-fixture-api-key-not-a-real-secret',master=Buffer.from('11'.repeat(32),'hex'),iv=Buffer.from('22'.repeat(12),'hex'),cipher=createCipheriv('aes-256-gcm',master,iv);cipher.setAAD(Buffer.from('DegreePath:appgprj_6ae164d97e2081919c60ab5e6a2b4be2:anthropic-connection:aes-gcm:v1'));const ciphertext=Buffer.concat([cipher.update(key,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64'),row={id:'anthropic',ciphertext,iv:iv.toString('hex'),revision:1,verified_at:1};let reads=0;const DB={prepare(sql){matches(sql,/SELECT \* FROM ai_service_connections/);return{bind(service){assert.equal(service,'anthropic');return{async first(){reads++;return row;}};}};}};const result=await resolveAIConnection({DB,AI_CONNECTIONS_MASTER_KEY:master.toString('hex')},{includeKey:true});assert.equal(result.apiKey,key);assert.equal(result.source,'managed');assert.equal(reads,1);
});
