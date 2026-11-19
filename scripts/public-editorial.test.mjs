import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {safeEditorialHref,articleAction,sourceAction,renderEditorialSection,articleAuthor,authorPath} from './public-editorial.mjs';
const content=JSON.parse(await readFile(new URL('../content/public-content.json',import.meta.url),'utf8'));

test('editorial actions retain reader intent and reject external, mutation and malformed destinations',()=>{
 for(const unsafe of ['https://evil.example/','//evil.example/','javascript:alert(1)','/api/portal/profile','/auth/logout','/blog/../api/portal','/degree-plans/%2e%2e/','/portal.html\\evil'])assert.equal(safeEditorialHref(unsafe),'',unsafe);
 assert.equal(safeEditorialHref('/portal.html?usePlan=liberty-business-residential'),'/portal.html?usePlan=liberty-business-residential');
 for(const article of content.articles){const action=articleAction(article);assert(safeEditorialHref(action.href),article.slug);assert.notEqual(action.href,'/portal.html',article.slug);assert(action.label.length>3);}
 assert.equal(articleAction({slug:'organize-transcripts-and-credits'}).href,'/import-courses.html');
 assert.equal(articleAction({slug:'degree-audit-and-what-if'}).href,'/compare-plans.html?from=courses');
 assert.equal(sourceAction({id:'study-com',name:'Study.com'}).href,'/courses.html?provider=Study.com');
 assert.equal(sourceAction({id:'modern-states',name:'Modern States'}).href,'/courses.html?provider=CLEP');
 assert.equal(sourceAction({id:'aleks'}).href,'/import-courses.html');
});

test('rich editorial blocks are accessible escaped HTML with validated table shape and reviewed plan references',()=>{
 const html=renderEditorialSection({heading:'A useful comparison',table:{caption:'Compare options',headers:['Course','Price'],rows:[['<script>','$99']]},callout:{title:'Next step',text:'Keep your work',label:'Import courses',href:'/import-courses.html'},calculator:'subscription'},0);
 assert.match(html,/<caption>Compare options<\/caption>/);assert.match(html,/scope="row"/);assert.match(html,/&lt;script&gt;/);assert(!html.includes('<script>'));assert.match(html,/data-subscription-calculator/);assert.match(html,/not a quote/);
 assert.throws(()=>renderEditorialSection({heading:'Broken',table:{headers:['One'],rows:[['Two','cells']]}},0),/match their headers/);
 assert.throws(()=>renderEditorialSection({heading:'Unknown',planPreview:'unreviewed-degree'},0,{plans:[],renderPlanCard(){}}),/publication-ready/);
 const clean=renderEditorialSection({heading:'Link',callout:{text:'Text',label:'Bad',href:'https://evil.example/'}},1);assert(!clean.includes('evil.example'));
});

test('authorship uses the actual editorial identity without creating a human reviewer or credential',()=>{
 for(const article of content.articles){const author=articleAuthor(article,content);assert(author);assert.equal(author.type,'Organization');assert.equal(authorPath(author),'/authors/degreesteps-editorial/');assert(author.bio.length>100);}
 assert.equal(authorPath({id:'../bad'}),'');
});

test('public course filters and subscription scenarios work without reading or uploading a private draft',async()=>{
 const script=await readFile(new URL('../dist/public-plan-preview.js',import.meta.url),'utf8');
 const callbacks={},filter={value:'all',disabled:true,addEventListener:(name,fn)=>callbacks[name]=fn};
 const rows=[{dataset:{previewProvider:'outside'}},{dataset:{previewProvider:'university'}},{dataset:{previewProvider:'outside'}}],count={textContent:''};
 const input=value=>({value,disabled:true,addEventListener(name,fn){this[name]=fn;}}),monthly=input('99'),months=input('1'),extras=input('0'),result={textContent:''};
 const calculator={querySelector:selector=>({'[data-calc-monthly]':monthly,'[data-calc-months]':months,'[data-calc-extras]':extras,'[data-calc-result]':result}[selector]),addEventListener(){}};
 const document={querySelector:selector=>selector==='[data-preview-filter]'?filter:selector==='[data-preview-count]'?count:null,querySelectorAll:selector=>selector==='[data-preview-provider]'?rows:selector==='[data-subscription-calculator]'?[calculator]:[]};
 const sandbox={document,Intl,localStorage:{getItem(){throw Error('Private data read');},setItem(){throw Error('Private data write');}},fetch(){throw Error('Unexpected upload');}};
 vm.runInNewContext(script,sandbox);assert.equal(filter.disabled,false);assert.match(count.textContent,/3 of 3/);
 filter.value='outside';callbacks.change();assert.deepEqual(rows.map(row=>row.hidden),[false,true,false]);assert.match(count.textContent,/2 of 3/);
 filter.value='bad-filter';callbacks.change();assert(rows.every(row=>row.hidden===false));
 assert.match(result.textContent,/\$99/);months.value='2';extras.value='15';months.input();assert.match(result.textContent,/\$213/);
 months.value='not-a-number';months.input();assert.match(result.textContent,/Enter a monthly fee/);
 assert.equal(monthly.disabled,false);
});
