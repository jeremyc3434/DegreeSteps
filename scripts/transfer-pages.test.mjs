import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadTransferCourses,renderTransferCourse,transferPath} from './transfer-pages.mjs';
const dist=resolve(import.meta.dirname,'../dist');
const courses=await loadTransferCourses(dist);

test('every listed match is an official published receiving-school equivalency with a source',async()=>{
 assert.ok(courses.length>50);
 const index=JSON.parse(await readFile(resolve(dist,'data/plan-library-index.json'),'utf8'));
 for(const course of courses){
  assert.ok(course.matches.length>0);assert.notEqual(course.provider,'University');
  for(const m of course.matches){
   assert.ok(index.plans[m.routeId],'only plans a student can open are listed');
   assert.equal(m.tier,index.plans[m.routeId].tier,'the plan status shown matches the finder');
   assert.ok(m.receivingTitle&&Number.isFinite(m.credits)&&m.credits>0);
  }
 }
 // Spot-check a known WGU agreement row against the compiled model it came from.
 const macro=courses.find(c=>c.provider==='Sophia'&&c.code==='SOPH-0012');
 const row=macro.matches.find(m=>m.routeId==='wgu-catalog-ecceaa488637ac83'&&m.receivingCode==='D089');
 assert.ok(row);assert.match(row.evidenceUrl,/^https:\/\/marketing-api-gateway\.wgu\.edu\//);
});

test('pages, paths and generated files agree, and allocation slots are not repeated',async()=>{
 const paths=new Set(courses.map(c=>c.path));assert.equal(paths.size,courses.length,'paths are unique');
 for(const c of courses){
  assert.equal(c.path,transferPath(c.provider,c.code,c.title));
  await readFile(resolve(dist,'.'+c.path,'index.html'),'utf8');
  const keys=c.matches.map(m=>m.routeId+'|'+m.receivingCode+'|'+m.receivingTitle);assert.equal(new Set(keys).size,keys.length);
  assert.ok(c.matches.every(m=>!/allocation\s+\d+/i.test(m.receivingTitle)));
 }
 const providers=(await readdir(resolve(dist,'transfer'),{withFileTypes:true})).filter(e=>e.isDirectory());
 let files=0;for(const p of providers)files+=(await readdir(resolve(dist,'transfer',p.name))).length;
 assert.equal(files,courses.length,'no stale course pages remain');
 const sitemap=await readFile(resolve(dist,'sitemap.xml'),'utf8');assert.ok(courses.every(c=>sitemap.includes(c.path)));
});

test('a course page explains scope and never claims a personal award',()=>{
 const html=renderTransferCourse(courses[0]);
 assert.match(html,/Your school still evaluates your official records/);assert.match(html,/not itself a school award/);
 assert.match(html,/data-transfer-course=/);
 // The not-an-award explanation sits directly under "Where it counts", before the first listed plan, and the column
 // names published evidence rather than an award.
 const qualifier=html.indexOf('data-transfer-qualifier'),table=html.indexOf('<table');
 assert.ok(qualifier>0&&qualifier<table,'the qualifier comes before the table');
 assert.match(html,/Published school guidance, not credit awarded to you\./);
 assert.doesNotMatch(html,/Credit awarded/);assert.match(html,/<th scope="col">Credit in the school’s guide<\/th>/);assert.match(html,/data-label="Credit in the school’s guide"/);
});
