/* Source-review dates must not be refreshed by adding or rebuilding a degree. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('only a real review date on the evidence supplies its checked date',async()=>{
 const {reviewedSourceDate}=await import('./scripts/reviewed-source-date.mjs');
 assert.equal(reviewedSourceDate({checked:'2026-11-10',indexedAt:'2026-11-18'}),'2026-11-10');
 assert.equal(reviewedSourceDate({checkedOn:'2026-11-09'}),'2026-11-09');
 assert.equal(reviewedSourceDate({checkedAt:'2024-02-29'}),'2024-02-29');
 for(const value of [undefined,null,'','2026-02-30','2025-02-29','2026-13-01','November 18, 2026',Date.now()]){
  assert.equal(reviewedSourceDate({checked:value,indexedAt:'2026-11-18',checkedOn:null}),null);
 }
 assert.equal(reviewedSourceDate({indexedAt:'2026-11-18',checkedOn:null}),null,'Indexing alone does not establish any source review');
});

test('compiled course rows retain their cited evidence dates separately from indexing dates',async()=>{
 const {reviewedSourceDate}=await import('./scripts/reviewed-source-date.mjs');
 const index=require('./dist/data/curriculum-course-index.json'),sources=new Map(index.sources.map(source=>[source.id,source]));
 assert(index.courses.length>0);
 for(const course of index.courses){
  const source=sources.get(course.sourceId);assert(source,'Every checked date needs its cited source');
  assert.equal(course.checkedAt,reviewedSourceDate(source),course.provider+' '+course.code);
  assert.equal(typeof course.indexedAt,'string','Indexing is reported independently');
 }
 const older=index.courses.find(course=>course.checkedAt&&course.indexedAt>course.checkedAt);
 assert(older,'An older cited review must remain older when a new curriculum reuses it');
 const study=index.courses.find(course=>course.provider==='Study.com'&&course.code==='SDCM-0057');
 assert(study);assert.equal(study.checkedAt,'2026-11-10');
});

test('course detail dates preserve civil days and explicit unknowns without a catalog-date fallback',()=>{
 const source=fs.readFileSync('dist/courses.js','utf8');
 const instrumented=source.replace('  function error(value)',"  window.dateHooks={dateLabel,sourceChecked};return;\n  function error(value)");
 assert.notEqual(instrumented,source);
 const context={window:{DegreeCourseLibrary:{}},Intl,Date,URL};vm.runInNewContext(instrumented,context);
 const {dateLabel,sourceChecked}=context.window.dateHooks;
 assert.equal(dateLabel('2026-11-18'),'Nov 18, 2026','A source review is a civil date, not midnight converted into the previous day');
 assert.equal(dateLabel('2024-02-29'),'Feb 29, 2024');
 for(const value of [null,undefined,'','2026-02-30','2025-02-29'])assert.equal(dateLabel(value),'Date not listed');
 assert.equal(sourceChecked({checkedAt:null,indexedAt:'2026-11-18'},{checkedAt:'2026-11-10'}),null,'Explicitly unknown course evidence stays unknown');
 assert.equal(sourceChecked({indexedAt:'2026-11-18'},{checkedAt:'2026-11-10'}),'2026-11-10');
 assert.equal(sourceChecked({indexedAt:'2026-11-18'}),null,'A generated catalog date cannot become a source review');
 assert.equal(sourceChecked({checkedAt:'2026-11-10',indexedAt:'2026-11-18'},{checkedAt:'2026-11-18'}),'2026-11-10');
});
