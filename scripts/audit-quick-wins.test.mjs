/* Small audit fixes that are easy to lose: legal links on app pages, a plain FAQ answer about cost, labelled cost
 * controls, exact WGU residency numbers and competency-unit wording, and save copy for first-time visitors. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
test('the save sign-in wall leads with what a free account gives',()=>{
 assert.match(read('account.js'),/saving \? 'Save your plan to your free account so you can come back to it on any device\.'/);
});
