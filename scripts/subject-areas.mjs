/** Browsing subjects for degree plans: a transparent keyword taxonomy over degree titles (content/catalog/subject-areas.json). */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const subjectAreas=JSON.parse(readFileSync(resolve(import.meta.dirname,'../content/catalog/subject-areas.json'),'utf8')).subjects;
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const matchers=subjectAreas.map(subject=>({id:subject.id,pattern:new RegExp('\\b(?:'+subject.keywords.map(escape).join('|')+')\\b','i')}));

/** Subject ids for a degree title, in taxonomy order; empty when nothing matches. */
export function subjectsFor(title){
  const text=String(title||'').replace(/[–—&]/g,' ');
  return matchers.filter(m=>m.pattern.test(text)).map(m=>m.id);
}
export const subjectLabel=id=>subjectAreas.find(subject=>subject.id===id)?.label||id;
