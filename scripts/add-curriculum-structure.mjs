/* Source-reviewed display hierarchy. This changes no course awards or credit budgets. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),checkedOn='2026-11-03';
const node=(id,title,parentId,requirementIds=[],extra={})=>({id,title,parentId,requirementIds,sourceId:'degree',...extra});
const libGen=(mode,business=false)=>[
 node('lu-communication','Communication & Information Literacy','general',business?['engl-101','engl-102','arts-209']:['engl-101','coms-101','engl-102','arts-209'],business?{sharedRequirementIds:['busi-105']}:{}),
 node('lu-technology','Technological Solutions & Quantitative Reasoning','general',business?['univ-101','math-115']:mode==='online'?['univ-104','math-115']:['univ-101','math-115','inft-110'],business?{sharedRequirementIds:['busi-201'],sharedCreditOverrides:{'busi-201':0}}:{}),
 node('lu-critical','Critical Thinking','general',business?['rlgn-105']:mode==='online'?['rlgn-104','ethc-101']:['rlgn-105','ethc-101'],business?{sharedRequirementIds:['busi-205']}:{}),
 node('lu-civic','Civic & Global Engagement','general',business?['evan-101','govt-220']:mode==='online'?[]:['evan-101'],business?{}:{sharedRequirementIds:['govt-220']}),
 node('lu-inquiry','Social & Scientific Inquiry','general',business?['envr-215']:mode==='online'?['biol-102','psyc-101']:['envr-215','psyc-101'],business?{sharedRequirementIds:['busi-240']}:{}),
 node('lu-christianity','Christianity & Contexts','general',mode==='online'?['bibl-104','theo-104']:['bibl-105','bibl-110','theo-201','theo-202'])
];
const cjMajor=()=>[
 node('lu-major-foundation','Major Foundational Courses','major',['govt-200','govt-220']),
 node('lu-major-courses','Major Courses','major',['cjus-200','cjus-230','cjus-231','cjus-300','cjus-310','cjus-320','cjus-330','cjus-340','cjus-350','cjus-400','cjus-410','cjus-420','govt-480'])
];
const businessMajor=()=>[
 node('lu-major-foundation','Major Foundational Courses','major',['busi-105','busi-201','busi-205','busi-223','busi-240','econ-213']),
 node('lu-major-courses','Major Courses','major',['acct-211','acct-212','acct-370','busi-301','busi-305','busi-307','busi-320','busi-330','busi-342','busi-411','busi-490','econ-214']),
 node('lu-interdisciplinary-cognate','Interdisciplinary Business Cognate','major',['busi-313','busi-336','busi-371','busi-343'])
];
const tesu=()=>[
 node('tesu-skills','Intellectual and Practical Skills','general'),
 node('tesu-written','Written Communication','tesu-skills',['enc1010','enc1020'],{sourceId:'tesu-gened-structure'}),
 node('tesu-oral','Oral Communication','tesu-skills',['com2090'],{sourceId:'tesu-gened-structure'}),
 node('tesu-quantitative','Quantitative Literacy','tesu-skills',['mat1210'],{sourceId:'tesu-gened-structure'}),
 node('tesu-information','Information Literacy','tesu-skills',['sos1100'],{sourceId:'tesu-gened-structure'}),
 node('tesu-civic','Civic and Global Leadership','general'),
 node('tesu-diversity','Diversity Intercultural Literacy','tesu-civic',['soc1010'],{sourceId:'tesu-gened-structure'}),
 node('tesu-ethics','Ethical Leadership','tesu-civic',['eth2200'],{sourceId:'tesu-gened-structure'}),
 node('tesu-engagement','Civic Engagement','tesu-civic',['pos1100'],{sourceId:'tesu-gened-structure'}),
 node('tesu-cultures','Knowledge of Human Cultures','general'),
 node('tesu-humanities','Humanities','tesu-cultures',['his1130','fil1100','his1140','phi1300'],{sourceId:'tesu-gened-structure'}),
 node('tesu-social','Social Sciences','tesu-cultures',['soc2100'],{sourceId:'tesu-gened-structure'}),
 node('tesu-science','Scientific Knowledge','general',['eas1010','bio2080']),
 node('tesu-professional-business','Professional Business Requirements','major',['acc1010','acc1020','cis1070','law2010','man2100','mkt2010','fin3010','eco1110','eco1120','bus2100','sta2010','man3730','man3720','bus4210']),
 node('tesu-area-of-study','Area of Study','major'),
 node('tesu-accounting','Accounting','tesu-area-of-study',['acc3030','acc4010']),
 node('tesu-finance','Finance','tesu-area-of-study',['fin3310','fin3340']),
 node('tesu-management','Management','tesu-area-of-study',['man3310','man3110'])
].map(item=>item.sourceId==='degree'?{...item,sourceId:'tesu-degree'}:item);
for(const file of ['liberty','liberty-criminal-justice-residential','liberty-criminal-justice-online','tesu']){
 const path=resolve(root,'dist/data',file+'.json'),model=JSON.parse(await readFile(path,'utf8'));
 const structure=file==='tesu'?tesu():[...libGen(file.endsWith('online')?'online':'residential',file==='liberty'),...(file==='liberty'?businessMajor():cjMajor())];
 model.curriculumSections=structure;model.curriculumStructureCheckedOn=checkedOn;
 if(file==='tesu'&&!model.sources.some(s=>s.id==='tesu-gened-structure'))model.sources.push({id:'tesu-gened-structure',title:'TESU general education categories, 2021 and after',url:'https://www.tesu.edu/degrees-programs/courses/general-education/2021-and-after.php',checked:checkedOn});
 if(file==='liberty'||file==='liberty-criminal-justice-residential')model.graduationRequirements=[{id:'christian-service',title:'Christian service (CSER)',creditType:'non-credit',sourceId:'degree',description:'Residential service requirement. Confirm the number of service semesters that apply to your enrollment with Liberty.'}];
 if(model.transferWaiverVariant){const ids=new Set(model.transferWaiverVariant.requirements.map(r=>r.id));model.transferWaiverVariant.curriculumSections=structure.map(s=>({...s,requirementIds:s.requirementIds.filter(id=>ids.has(id))}));}
 await writeFile(path,JSON.stringify(model,null,2)+'\n');
 console.log(file+': '+structure.length+' sourced curriculum headings');
}
