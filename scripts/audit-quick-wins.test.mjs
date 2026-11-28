/* Small audit fixes that are easy to lose: legal links on app pages, a plain FAQ answer about cost, labelled cost
 * controls, exact WGU residency numbers and competency-unit wording, and save copy for first-time visitors. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import AccountReturn from '../dist/account-return.js';
const read=path=>readFileSync(new URL('../dist/'+path,import.meta.url),'utf8');

test('app pages carry a slim footer with Privacy, Terms and Why DegreeSteps is free',()=>{
 for(const page of ['programs.html','portal.html','plan.html','credits-worth.html']){
  const footer=read(page).match(/<footer class="dp-legal-footer"[\s\S]*?<\/footer>/)?.[0];assert(footer,page);
  for(const href of ['/privacy/','/terms/','/why-its-free/'])assert(footer.includes('href="'+href+'"'),page+' links '+href);
 }
 assert.match(read('app-shell.css'),/\.dp-legal-footer\{/);
});
test('the FAQ answers plainly that DegreeSteps is free and links to why',()=>{
 const faq=read('faq/index.html');
 assert.match(faq,/<summary>Is DegreeSteps free\?<\/summary><p>Yes\. DegreeSteps is free to use[^<]*<a href="\/why-its-free\/">/);assert.doesNotMatch(faq,/free to try/);
});
test('every cost-calculator control on home and /compare/ is labelled',()=>{
 for(const page of ['index.html','compare/index.html']){
  const html=read(page),controls=html.match(/<(?:input|select)\b[^>]*data-cost-[a-z-]+[^>]*>/g)||[];assert(controls.length>=5,page);
  for(const control of controls){const id=control.match(/aria-labelledby="([^"]+)"/)?.[1];assert(id,page+' '+control.slice(0,60));assert(html.includes('id="'+id+'"'),page+' label '+id);}
 }
});
test('plan cards can shrink below 310px so /degree-plans/ fits a 320px screen',()=>{
 const css=read('public-design.css');assert.doesNotMatch(css,/minmax\(310px,1fr\)/);assert.match(css,/minmax\(min\(310px,100%\),1fr\)/);
});
test('WGU requirements keep their exact competency units and unit names',()=>{
 const portal=read('portal.js'),sheet=read('sheet.js');
 assert.match(portal,/maximumFractionDigits:2\}\)\.format\(value\);\n    const minimum=/,'residency and transfer limits are not rounded');
 assert.match(sheet,/The published residency rule requires at least '\+residency\+' '\+unitWord\(residency\)/);
 assert.doesNotMatch(portal,/' proposed transfer credits on this plan|' planned transfer credits'/);assert.doesNotMatch(sheet,/<span>planned transfer credits<\/span>|<span>degree credits<\/span>/);
});
test('sign-in explains the requested plan or course workspace without uploading private work',async()=>{
 async function renderSignIn(returnTo){
  const nodes=new Map(['account-content','account-status','account-error'].map(id=>[id,{innerHTML:'',textContent:'',hidden:false,querySelector(){return null;}}]));
  const calls=[],storage={getItem(){return null;},setItem(){},removeItem(){}};
  const Account={
   async auth(path){calls.push(path);return{configured:true,providers:['email','google']};},
   async session(){calls.push('session');return{user:null};},
   async api(path){calls.push('api:'+path);throw Error('Opening sign-in must not load private plans.');},
   async uploadDraft(){calls.push('uploadDraft');throw Error('Opening sign-in must not upload private work.');}
  };
  const context={window:{DegreeAccount:Account,DegreeAccountReturn:AccountReturn,sessionStorage:storage},document:{getElementById:id=>nodes.get(id),addEventListener(){}},location:{origin:'https://degreesteps.test',pathname:'/account.html',search:'?returnTo='+encodeURIComponent(returnTo)},history:{replaceState(){}},URLSearchParams,URL,Date,console,setTimeout};
  runInNewContext(read('account.js'),context,{filename:'account.js'});
  for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['/status','session']);
  return nodes.get('account-content').innerHTML;
 }
 const plan=await renderSignIn('/plan.html');
 assert(plan.includes('<h1>Save your plan.</h1>'));
 assert(plan.includes('<p class="account-lede">Save your plan to your free account so you can come back to it on any device.</p>'));
 const course=await renderSignIn('/learn.html');
 assert(course.includes('<h1>Open your course workspace.</h1>'));
 assert(course.includes('<p class="account-lede">Sign in to work on assignments, study your courses and return to your saved work.</p>'));
 assert(!course.includes('Save your plan to your free account'));
});
