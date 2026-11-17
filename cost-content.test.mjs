/** Public comparison evidence and crawlable output checks. Build first. No network or mutations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('./dist/data/cost-comparisons.json',import.meta.url),'utf8'));
const html=await readFile(new URL('./dist/compare/index.html',import.meta.url),'utf8');
const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');
const entry=id=>data.entries.find(item=>item.id===id);
test('the researched comparison contains six distinct universities and dated primary evidence',()=>{
  assert.equal(new Set(data.entries.map(item=>item.schoolId)).size,6);assert.equal(data.entries.length,7);
  assert.match(data.checkedOn,/^\d{4}-\d{2}-\d{2}$/);
  for(const item of data.entries){
    assert.equal(item.totalUnits,120);assert(item.scenarioTransferLimit>=60);
    assert(item.sources.length>=3,item.id+' has tuition and policy evidence');
    for(const source of item.sources){const url=new URL(source.url);assert.equal(url.protocol,'https:');assert(source.title.length>10);}
  }
});
test('published source restrictions remain separate from the lower-cost scenario assumptions',()=>{
  for(const id of ['tesu-standard','charter-oak']){assert.equal(entry(id).scenarioTransferLimit,90);assert.equal(entry(id).policy.overallMaxUnits,114);assert.match(entry(id).transferNote,/90/);}
  assert.equal(entry('wgu-project-management').scenarioTransferLimit,88);assert.equal(entry('wgu-project-management').totalUnits-entry('wgu-project-management').defaultTransferUnits,32);
  assert.match(entry('wgu-project-management').transferNote,/60/,'A theoretical ceiling is not confused with the actual cited transfer award');
  assert.match(entry('umpi-yourpace').policy.note,/no fixed|not a published/i);
  assert.match(entry('liberty-residential').coverageNote,/policy illustration/i,'The comparison is explicitly a policy illustration');assert.match(entry('liberty-residential').coverageNote,/exact course plan/i,'A schoolwide ceiling is not presented as a mapped course total');
});
test('the generated comparison exposes costs, assumptions, and every route without executing scripts',()=>{
  const table=html.match(/<table\b[^>]*class=["'][^"']*\bcost-table\b[^"']*["'][^>]*>[\s\S]*?<\/table>/i)?.[0];assert(table,'The full comparison has a semantic HTML table');
  const body=table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1]||'';assert.equal((body.match(/<tr\b/g)||[]).length,7);
  assert.match(plain,/101,560/);assert.match(plain,/27,390/);assert.match(plain,/74,170/);
  assert.match(plain,/aid/i);assert.match(plain,/fees|living/i);assert.match(plain,/budget|allowance/i);assert.match(plain,/term/i);
  for(const item of data.entries)assert(plain.includes(item.schoolName),item.schoolName+' is in crawlable content');
  assert(html.includes('/portal.html'),'There is a real next step into the builder');
  assert.match(html,/<link\b[^>]*rel=["']canonical["'][^>]*href=["'][^"']+\/compare\/["']/i);
});
