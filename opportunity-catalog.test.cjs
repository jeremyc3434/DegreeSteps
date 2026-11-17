const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Catalog=require('./dist/program-catalog.js'),base=require('./dist/data/pathways.json'),directory=require('./dist/data/program-catalog.json'),opportunities=require('./dist/data/opportunity-catalog.json');
const research=fs.readdirSync(path.join(__dirname,'content/research')).filter(name=>['cbe-schools.json','campus-schools-a.json','campus-schools-b.json','asu-programs.json','cbu-programs.json'].includes(name)).map(name=>JSON.parse(fs.readFileSync(path.join(__dirname,'content/research',name),'utf8')));
const school=id=>opportunities.schools.find(s=>s.id===id),program=id=>opportunities.programs.find(p=>p.id===id);

test('expanded discovery preserves every existing official listing and keeps source-backed school/program identities',()=>{
 assert.equal(directory.programs.filter(p=>p.catalogCollection!=='opportunity-expansion').length,508);
 const future=new Set(['upcoming','approval-pending','planned','pending-approval','not-yet-available']);
 const reviewedSchools=research.flatMap(r=>r.schools).filter(s=>(s.programs||[]).some(p=>!future.has(p.status||'listed')));
 assert.equal(opportunities.schools.length,reviewedSchools.length);
 assert(opportunities.schools.every(s=>s.programs.length>0));
 if(new Set(reviewedSchools.map(s=>s.id)).size===12)assert.equal(opportunities.schools.length,12);
 assert.equal(new Set(directory.programs.map(p=>p.id)).size,directory.programs.length);
 const sources=new Set(directory.sources.map(s=>s.id));
 for(const p of opportunities.programs){assert(sources.has(p.sourceId),p.id);assert(p.url.startsWith('https://'));assert.equal(p.courseMapStatus,'not-mapped');assert(!p.modelId);assert(p.modalities.every(mode=>['online','campus'].includes(mode)));}
 for(const s of opportunities.schools){const local=new Set(s.sources.map(source=>source.id));assert(opportunities.programs.filter(p=>p.schoolId===s.id).every(p=>local.has(p.sourceId)),s.id);assert(s.programs.every(p=>!p.effectiveTransferPolicy&&!p.pricing),'School program references do not duplicate full programme facts');}
 assert.equal(directory.programs.length,508+opportunities.programs.length);
});

test('upcoming and approval-pending programs never become current degree choices',()=>{
 assert(opportunities.plannedPrograms.some(p=>p.id==='south-cbe-ms-human-resources'&&p.status==='upcoming'));
 assert(opportunities.plannedPrograms.some(p=>p.id==='winthrop-elevate-bsba'&&p.status==='approval-pending'));
 const ids=new Set(opportunities.plannedPrograms.map(p=>p.id));assert(!directory.programs.some(p=>ids.has(p.id)));
 assert(!opportunities.programs.some(p=>['upcoming','approval-pending','planned'].includes(p.status)));
});

test('subscription periods and program-specific per-credit pricing are not conflated',()=>{
 assert.equal(program('umass-mypath-bba').effectivePricing.amount,3500);assert.equal(program('umass-mypath-bba').effectivePricing.period,'24 weeks');
 assert.equal(program('umass-mypath-mba').effectivePricing.amount,4030);
 assert.equal(program('phoenix-cb-mba').effectivePricing.model,'per-credit');assert.equal(program('phoenix-cb-mba').effectivePricing.amount,300);
 assert(opportunities.programs.filter(p=>p.schoolId==='university-of-phoenix'&&p.id.startsWith('phoenix-cb-')).every(p=>p.blockWeeks===16));
 assert.equal(program('phoenix-da-bs-information-technology').effectivePricing.model,'subscription');assert.equal(program('phoenix-da-bs-information-technology').effectivePricing.period,'12 weeks');
 assert.equal(school('south-college').pricing.amount,null);assert.equal(program('south-cbe-dba').effectivePricing.amount,null);
 assert.equal(program('walden-tempo-rn-bsn').creditUnit,'quarter');assert.equal(program('walden-tempo-rn-bsn').intakeVerified,false);
});

test('institutional transfer and alternative recommendations remain separate at each degree level',()=>{
 assert.equal(school('university-of-phoenix').transferPolicy.ace.status,'accepted');
 assert.equal(program('phoenix-cb-mba').effectiveTransferPolicy.institutional.status,'not-accepted');
 assert.equal(program('phoenix-cb-mba').effectiveTransferPolicy.ace.status,'not-accepted');
 assert.equal(program('umass-mypath-bba').effectiveTransferPolicy.ace.status,'accepted');
 assert.equal(program('umass-mypath-bba').effectiveTransferPolicy.institutional.maximumCredits,90);
 assert.equal(program('umass-mypath-aa-general-business').effectiveTransferPolicy.institutional.maximumCredits,null);
 assert.notEqual(program('umass-mypath-mba').effectiveTransferPolicy.ace.status,'accepted');
 assert.equal(program('south-cbe-dba').effectiveTransferPolicy.ace.status,'not-verified');
 if(school('gcu')){const s=school('gcu');assert.equal(s.transferPolicy.institutional.maximumCredits,90);assert.equal(s.transferPolicy.ace.maximumCredits,30);}
 if(school('regent')){assert.equal(school('regent').transferPolicy.institutional.maximumCreditsByLevel.associate,48);const rows=opportunities.programs.filter(p=>p.schoolId==='regent'&&p.level==='associate');assert(rows.every(p=>p.effectiveTransferPolicy.institutional.maximumCredits===48&&p.transferPolicy.institutional.maximumCredits===48));}
 if(school('asu')){assert.equal(school('asu').transferPolicy.institutional.maximumCredits,null);assert.equal(school('asu').transferPolicy.institutional.twoYearLowerDivisionMaximumCredits,64);assert(opportunities.programs.filter(p=>p.schoolId==='asu'&&p.level==='bachelor').every(p=>p.effectiveTransferPolicy.institutional.maximumCredits===null&&p.effectiveTransferPolicy.institutional.twoYearLowerDivisionMaximumCredits===64));assert(opportunities.programs.filter(p=>p.schoolId==='asu'&&p.level==='master').every(p=>!p.effectiveTransferPolicy.institutional.twoYearLowerDivisionMaximumCredits));}
 if(school('odu')){assert.equal(school('odu').transferPolicy.institutional.maximumCredits,null);assert(opportunities.programs.filter(p=>p.schoolId==='odu'&&p.level==='bachelor').every(p=>p.effectiveTransferPolicy.institutional.maximumCredits===null));}
 if(school('california-baptist')){const rows=opportunities.programs.filter(p=>p.schoolId==='california-baptist');assert(rows.filter(p=>p.modalities.includes('campus')).every(p=>!p.effectiveTransferPolicy.institutional.minimumInstitutionalCredits));assert(rows.filter(p=>p.level==='master').every(p=>p.effectiveTransferPolicy.institutional.maximumCredits!==9));assert(rows.filter(p=>p.level==='bachelor'&&p.modalities.length===1&&p.modalities[0]==='online').every(p=>p.effectiveTransferPolicy.institutional.minimumInstitutionalCredits===36));}
});

test('merged planner routes retain discovery facts without acquiring made-up course maps',()=>{
 const before=JSON.stringify(base),merged=Catalog.merge(base,directory),route=merged.pathways.find(p=>p.id==='umass-mypath-mba');
 assert.equal(JSON.stringify(base),before);assert.equal(route.paceModel,'competency-subscription');assert.equal(route.effectivePricing.amount,4030);assert(Array.isArray(route.prerequisites));assert.equal(route.courseMapStatus,'not-mapped');assert.equal(route.modelId,undefined);
 assert.equal(merged.programDirectory.schools.length,opportunities.schools.length);assert.equal(Catalog.modelFiles.length,4);
 const variants=Catalog.merge({pathways:[]},{programs:[{id:'fixed-mba',school:'Example',title:'MBA',level:'master',modalities:['online'],paceModel:'course-term',catalogCollection:'opportunity-expansion',url:'https://example.edu/mba'},{id:'paced-mba',school:'Example',title:'MBA',level:'master',modalities:['online'],paceModel:'competency-subscription',catalogCollection:'opportunity-expansion',url:'https://example.edu/cbe-mba'}]});assert.equal(variants.pathways.length,2);
});

test('existing WGU and UMPI YourPace programs remain discoverable as competency subscriptions without invented prices',()=>{
 const merged=Catalog.merge(base,directory);
 for(const schoolId of ['wgu','umpi']){const rows=directory.programs.filter(p=>p.schoolId===schoolId);assert(rows.length>10);assert(rows.every(p=>p.paceModel==='competency-subscription'));assert(rows.every(p=>!p.pricing&&!p.effectivePricing));}
 assert(merged.pathways.filter(p=>p.school==='Western Governors University'||p.school==='University of Maine at Presque Isle').every(p=>p.paceModel==='competency-subscription'));
});

test('degree award words never relabel the actual subject during discovery',()=>{
 assert.equal(Catalog.field('Bachelor of Science in Criminal Justice'),'social-science');
 assert.equal(Catalog.field('Master of Science in Industrial and Organizational Psychology'),'social-science');
 assert.equal(Catalog.field('Master of Arts in History'),'humanities');
 assert.equal(Catalog.field('Master of Science in Human Resources'),'business');
 assert.equal(Catalog.field('Political Science Major (B.S.)'),'social-science');
 assert.equal(Catalog.field('Bachelor of Science'),'general');
});
