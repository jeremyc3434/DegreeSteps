const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('degree results open the chosen course plan directly while retaining optional college details',async()=>{
 const nodes=new Map(),handlers={},writes=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',hidden:false,dataset:{},addEventListener(){},querySelector(){return node(id+'-child');},showModal(){this.shown=true;},setAttribute(){}});return nodes.get(id);};
 const route={id:'test-campus-business',school:'A & B University',title:'Business',level:'bachelor',modalities:['campus'],paceModel:'course-term',url:'https://example.edu/business'};
 const opportunities={schoolFor:()=>({name:route.school}),priceText:()=>'$100 per credit',paceText:()=> 'On campus',availability:()=>({canChoose:true}),detailsHTML:()=>'<p>College details</p>'};
 const catalog={merge:()=>({}),loadIndex:async value=>value,publishedPlans:()=>[route],planChoiceCount:()=>0};
 const context={console,URLSearchParams,location:{search:''},document:{getElementById:node,querySelectorAll:()=>[],activeElement:null,addEventListener(type,handler){handlers[type]=handler;}},window:{DegreeProgramOpportunities:opportunities,DegreePlanFinder:require('./dist/plan-finder.js')},sessionStorage:{getItem(){return null;},setItem(){}},DegreeProgramCatalog:catalog,localStorage:{setItem(...args){writes.push(args);}},fetch:async()=>({ok:true,json:async()=>({sources:[]})})};
 vm.runInNewContext(fs.readFileSync('./dist/programs.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 const html=node('program-results').innerHTML;
 const primary=html.match(/<a class="fd-primary pf-button pf-button-primary pf-open-plan" href="([^"]+)"/);
 assert(primary,'The result needs a direct plan action before the policy dialog.');
 const target=new URL(primary[1].replaceAll('&amp;','&'),'https://degreesteps.com/');
 assert.equal(target.pathname,'/portal.html');assert.equal(target.searchParams.get('school'),route.school);assert.equal(target.searchParams.get('program'),route.id);assert.equal(target.searchParams.get('level'),route.level);
 handlers.click({target:{closest(){return {dataset:{programDetails:route.id}};}}});
 assert.equal(node('program-dialog').shown,true);assert.match(node('program-dialog-content').innerHTML,/College details/);
 assert.equal(writes.length,0,'Browsing or reviewing a degree must not replace the student’s current work.');
});
