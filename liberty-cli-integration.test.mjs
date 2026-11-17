import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {addLibertyCLIOptions,readLibertyCLIReview} from './scripts/add-liberty-cli-awards.mjs';
import CourseView from './dist/course-plan-view.js';
const review=await readLibertyCLIReview();
test('legacy residential business receives exact optional alternatives without changing defaults or source quantities',async()=>{
 const original=JSON.parse(await readFile(new URL('dist/data/liberty.json',import.meta.url),'utf8')),before=JSON.stringify(original),model=addLibertyCLIOptions(original,review);
 assert.equal(JSON.stringify(original),before);
 const options=model.requirements.flatMap(row=>row.options).filter(option=>option.provider===review.provider);
 assert.equal(options.length,4);
 assert(!model.defaultProviders.includes(review.provider));
 assert(options.every(option=>option.evidence==='conditional'&&option.preapprovalRequired===true&&option.credits===3&&option.sourceCredits===undefined&&option.sourceCreditSystem===undefined));
 assert(options.filter(option=>['BUS 320','ECN 301'].includes(option.code)).every(option=>option.courseUrl.startsWith('https://christianleaders.org/course/view.php?id=')));
 for(const code of ['BUS 330','BUS 415']){const directory=options.find(option=>option.code===code);assert.equal(directory.courseUrl,undefined);assert.equal(directory.providerDirectoryUrl,'https://christianleaders.org/course/index.php?categoryid=131');
 const link=CourseView.courseLinks(directory,{courses:[]});assert.equal(link.courseUrl,null);assert.equal(link.providerUrl,directory.providerDirectoryUrl);assert.match(link.providerLinkLabel,/Find course/);}
 assert(options.every(option=>[...option.sourceIds,...option.identitySourceIds].every(id=>model.sources.some(source=>source.id===id))));
 assert.deepEqual(addLibertyCLIOptions(model,review),model);
});
test('no cross-school, graduate, university-only or unnamed requirement placement is introduced',()=>{
 const make=patch=>({id:'fixture',school:'Liberty University',level:'bachelor',format:'Online',creditSystem:'semester',requirements:[{id:'bus',code:'BUSI 320',credits:3,options:[]}],sources:[],...patch});
 for(const input of [make({school:'Other'}),make({level:'master'}),make({requirements:[{id:'bus',code:'BUSI 320',credits:3,institutionalOnly:true,options:[]}]}),make({requirements:[{id:'free',credits:3,options:[]}]}),make({format:'Hybrid'})])assert.deepEqual(addLibertyCLIOptions(input,review),input);
});
