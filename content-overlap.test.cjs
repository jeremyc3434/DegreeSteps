/* Two different outside courses that teach the same subject are a "needs attention" item, never an error and never a
   ban on courses that only share a subject area. The WGU Psychology B.S. default plan is the case the audit found. */
const test=require('node:test'),assert=require('node:assert/strict');
const Overlap=require('./dist/content-overlap.js');
const row=(requirementId,provider,code,title,extra={})=>({requirementId,title:requirementId,status:'planned',option:{provider,code,title,...extra}});

test('same content across providers overlaps; distinct subjects and the same course do not',()=>{
 assert.equal(Overlap.contentKey('Principles of Microeconomics'),Overlap.contentKey('Microeconomics'));
 assert.notEqual(Overlap.contentKey('Microeconomics'),Overlap.contentKey('Macroeconomics'));
 assert.notEqual(Overlap.contentKey('English Composition I'),Overlap.contentKey('English Composition II'));
 assert.equal(Overlap.contentKey('Introduction to Psychology'),Overlap.contentKey('Psychology'));
 assert.equal(Overlap.contentKey('Elective'),'');
 const pair=Overlap.overlaps([row('a','Saylor','SAYA-0005','Principles of Microeconomics'),row('b','Sophia','SOPH-0011','Microeconomics')]);
 assert.equal(pair.length,1);assert.deepEqual(pair[0].items.map(item=>item.requirementId),['a','b']);
 assert.deepEqual(Overlap.overlaps([row('a','Saylor','SAYA-0005','Principles of Microeconomics'),row('b','Sophia','SOPH-0012','Macroeconomics')]),[],'Micro and Macro are distinct');
 assert.deepEqual(Overlap.overlaps([row('a','Sophia','SOPH-0011','Microeconomics'),row('b','Sophia','SOPH-0011','Microeconomics')]),[],'one course twice is the planner duplicate-source error, not an overlap');
 assert.deepEqual(Overlap.overlaps([row('a','University','ECO-1','Microeconomics'),row('b','Sophia','SOPH-0011','Microeconomics')]),[],'university courses are not outside-course overlaps');
 const text=Overlap.message(pair[0],'Western Governors University');
 assert.match(text,/published match for its own requirement/);assert.match(text,/Ask Western Governors University/);assert.doesNotMatch(text,/accepted/i);
});

test('the WGU Psychology B.S. default plan is flagged, and the flag changes no counts',()=>{
 const baselines=require('./dist/data/baseline-index.json').baselines,registry=require('./dist/data/curriculum-registry.json');
 const key='curriculum-wgu-catalog-19be0ad2d1922f49|wgu-catalog-19be0ad2d1922f49|online',baseline=baselines[key];assert.ok(baseline);
 const entry=registry.models.find(model=>model.id===baseline.modelId),doc=require('./dist/'+entry.path),model=(doc.models||[doc]).find(item=>item.id===baseline.modelId);
 const rows=baseline.rows.map(saved=>{const requirement=model.requirements.find(item=>item.id===saved.requirementId);return {requirementId:saved.requirementId,title:requirement.title,status:'planned',option:requirement.options.find(option=>option.id===saved.optionId)};});
 const groups=Overlap.overlaps(rows);assert.equal(groups.length,1);
 assert.deepEqual(groups[0].items.map(item=>item.provider+' '+item.code).sort(),['Saylor SAYA-0005','Sophia SOPH-0011']);
 assert.equal(baseline.validation.academicCountsValid,true,'the published plan keeps its academic validation');
});
