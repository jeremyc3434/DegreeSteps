import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyExperience} from './apply-brand-system.mjs';

const css=html=>[...html.matchAll(/<link\b[^>]*\bhref="([^" ]+\.css)"/g)].map(match=>match[1]);
test('the complete working plan retains every source control while shared styles precede its dedicated design',async()=>{
 const before=await readFile(new URL('../dist/plan.html',import.meta.url),'utf8'),result=applyExperience(before,'plan.html');
 const required=['sheet-grid','sheet-task-panel','sheet-home','sheet-dialog','sheet-search'];
 for(const id of required.filter(id=>before.includes('id="'+id+'"')))assert(result.html.includes('id="'+id+'"'));
 assert.deepEqual(result.styles,['brand.css','experience.css','workspace-design.css','plan-design.css']);
 assert.equal(css(result.html).at(-1),'/plan-design.css');
 assert.equal(applyExperience(result.html,'plan.html').html,result.html);
 assert.deepEqual([...before.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]),[...result.html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]));
});

test('public metadata, structured content and external styles survive deterministic wiring',()=>{
 const input='<!doctype html><html><head><title>Keep this title</title><link rel="canonical" href="https://degreesteps.com/guides/example/"><link rel="stylesheet" href="https://external.example/brand.css"><link rel="stylesheet" href="/brand.css"><script type="application/ld+json">{"@type":"Article","headline":"Keep this evidence"}</script></head><body class="public-page article-public"><main id="main"><p>Keep every researched paragraph.</p></main></body></html>';
 const result=applyExperience(input,'guides/example/index.html');
 assert.deepEqual(result.styles,['brand.css','experience.css','public-design.css']);assert.equal(result.workspace,false);
 for(const text of ['<title>Keep this title</title>','href="https://degreesteps.com/guides/example/"','href="https://external.example/brand.css"','{"@type":"Article","headline":"Keep this evidence"}','<p>Keep every researched paragraph.</p>'])assert(result.html.includes(text));
 assert.match(result.html,/<body class="public-page article-public ds-experience ds-public-page">/);assert.equal(applyExperience(result.html,'guides/example/index.html').html,result.html);
});

test('bare legacy builder bodies receive family styling without introducing a new setup flow or rewriting inline scripts',()=>{
 const inline="const example='<link rel=\"stylesheet\" href=\"/brand.css\">';";
 const source='<html><head><meta name="theme-color" content="#123456"></head><body><form id="existing-audit"><input type="hidden" name="existingContext" value="kept"></form><script>'+inline+'</script></body></html>';
 const result=applyExperience(source,'audit.html');
 assert.deepEqual(result.styles,['brand.css','experience.css','workspace-design.css','discovery-design.css']);
 assert.match(result.html,/<body class="ds-experience ds-workspace-page ds-discovery-page">/);
 assert(result.html.includes(inline));assert(result.html.includes('<input type="hidden" name="existingContext" value="kept">'));
 assert.equal((result.html.match(/id="existing-audit"/g)||[]).length,1);assert.equal(applyExperience(result.html,'audit.html').html,result.html);
});

test('course, comparison, community and protected settings routes keep separate presentation families',()=>{
 const source='<html><head></head><body class="existing-page"><form id="keep-me"></form></body></html>';
 for(const [name,family]of [['courses.html','collection'],['import-courses.html','collection'],['compare-plans.html','comparison'],['community.html','community'],['account.html','settings'],['admin.html','settings'],['coverage.html','settings']]){
  const result=applyExperience(source,name);assert.equal(result.family,family);assert.equal(result.workspace,true);assert.equal(result.styles.at(-1),family+'-design.css');assert(result.html.includes('id="keep-me"'));assert(result.html.includes('existing-page'));
 }
 const library=applyExperience(source,'library.html');assert.equal(library.family,null);assert.equal(library.styles.at(-1),'workspace-design.css');
});

test('a partial fragment cannot silently become a branded public page',()=>{
 for(const source of ['<div>Private form</div>','<html><head></head></html>','<body>Missing head</body>'])assert.throws(()=>applyExperience(source,'account.html'),/complete HTML document/);
});
