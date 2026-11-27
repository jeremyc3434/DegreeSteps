/* Course names such as "Business 100: Intro to Business" are one course, not two. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Import=require('./dist/record-import-engine.js'),Library=require('./dist/course-library-engine.js');
const fixture=fs.readFileSync(path.join(__dirname,'test-support/fixtures/course-import/usability-kit-sample.csv'),'utf8');
const codes=record=>Import.validateRecord(record).issues.map(item=>item.code);
const row=(code,title,extra={})=>({provider:'Study.com',code,title,credits:3,creditSystem:'semester',status:'earned',...extra});

// Every Study.com course our plan data names with its catalog title.
function studyComTitles(){
 const found=new Map();
 const scan=value=>{if(Array.isArray(value))return value.forEach(scan);if(!value||typeof value!=='object')return;const code=value.code||value.courseCode,title=value.title||value.name;if(typeof code==='string'&&/^SDCM-\d{4}$/.test(code)&&typeof title==='string'&&title.trim())found.set(code+'|'+title,{code,title});for(const item of Object.values(value))scan(item);};
 const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.json')){let json;try{json=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}scan(json);}}};
 walk(path.join(__dirname,'dist/data'));
 return [...found.values()];
}

test('the usability-kit sample keeps all three rows: two finished courses and one saved idea',()=>{
 const batch=Import.parseCSV(fixture);
 assert.equal(batch.rows.length,3);
 for(const item of batch.rows)assert.deepEqual(item.issues.filter(issue=>issue.severity==='error'),[],item.record.code);
 assert(batch.rows.every(item=>item.selected));
 const byCode=Object.fromEntries(batch.rows.map(item=>[item.record.code,item.record]));
 assert.equal(byCode['SDCM-0024'].title,'Business 100: Intro to Business');
 assert.equal(byCode['SDCM-0024'].status,'saved');assert.equal(byCode['SDCM-0024'].credits,3);assert.equal(byCode['SDCM-0024'].creditSystem,'semester');
 const finished=batch.rows.filter(item=>item.record.status==='earned');
 assert.equal(finished.length,2);assert.equal(finished.reduce((sum,item)=>sum+item.record.credits,0),6);
 assert(finished.every(item=>item.record.creditSystem==='semester'));
 // Importing adds original records only; nothing becomes a school evaluation.
 const state=Library.initialize(null),prepared=Import.prepareImport([],batch.rows);
 const result=Import.commit(state,prepared,{expectedRevision:prepared.baseRevision,reviewed:true});
 assert.equal(result.ok,true);assert.equal(result.state.learning.length,3);
 assert(result.state.learning.every(record=>Array.isArray(record.evaluations)&&record.evaluations.length===0));
 assert.equal(result.state.learning.find(record=>record.code==='SDCM-0024').status,'saved');
});

test('every Study.com catalog title in our plans imports as one course',()=>{
 const titles=studyComTitles();
 assert(titles.length>=48,'expected the Study.com titles our plans use; found '+titles.length);
 const flagged=titles.filter(({code,title})=>codes(row(code,title)).includes('combined-courses'));
 assert.deepEqual(flagged,[]);
 for(const [code,title] of [['SDCM-0024','Business 100: Intro to Business'],['SDCM-0013','Math 101: College Algebra'],['SDCM-0057','English 104: College Composition I'],['SDCM-0259','Physics 112L: Physics II with Lab'],['SDCM-0162','Computer Science 103: Computer Concepts and Applications'],['SDCM-0013','MATH 101: COLLEGE ALGEBRA']])
  assert(!codes(row(code,title)).includes('combined-courses'),title);
});

test('a row that really lists two course codes still needs attention',()=>{
 for(const [code,title] of [['SOPH-0015 SOPH-0048','Two courses'],['ENG 101/102','Writing'],['ENG101; ENG102','Writing'],['MAT101','MAT102 College Algebra'],['SDCM-0013','Math 101 and SDCM-0015 Precalculus'],['','ENG 101 / ENG 102']]){
  const issues=Import.validateRecord(row(code,title,{provider:'Example College'})).issues;
  const combined=issues.find(item=>item.code==='combined-courses');
  assert(combined,code+' | '+title);assert.equal(combined.severity,'error');assert.match(combined.message,/own row/);
 }
 // The row's own code repeated in its name is still one course.
 assert(!codes(row('ENGL101','ENGL 101 Composition',{provider:'Example College'})).includes('combined-courses'));
});
