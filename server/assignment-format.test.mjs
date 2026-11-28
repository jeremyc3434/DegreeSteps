import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAssignmentFormat,ASSIGNMENT_FORMAT_GUIDANCE,ASSIGNMENT_FORMAT_VERSION} from './assignment-format.mjs';

test('assignment rubric selects its style and layout over a conflicting prompt and syllabus',()=>{
 const out=resolveAssignmentFormat({project:{rubric:'Use APA 7th edition. Use Arial 11-point, 1.5-line spacing and 1.25-inch margins. No abstract required.',prompt:'Write the essay in MLA 9.'},course:{syllabus:'Use APA sixth edition, Times New Roman 12-point, double spacing. Include an abstract.'}});
 assert.equal(out.profile,'apa7');assert.equal(out.edition,7);assert.equal(out.source,'rubric');assert.equal(out.needsClarification,false);assert.equal(out.requiresAbstract,false);assert.equal(out.layout.fontFamily,'Arial');assert.equal(out.layout.fontSizePt,11);assert.equal(out.layout.lineSpacing,1.5);assert.deepEqual(out.layout.marginsInches,{top:1.25,right:1.25,bottom:1.25,left:1.25});assert.equal(out.conflicts.length,2);assert(out.conflicts.every(item=>item.overridden===true));
});
test('a named current edition or the documented default produces its supported profile',()=>{
 for(const text of['Use APA Style (7th ed.)','Use seventh-edition APA for this paper.','Please write in APA 7.']){const out=resolveAssignmentFormat({project:{prompt:text}});assert.equal(out.profile,'apa7',text);assert.equal(out.assumedEdition,false,text);}
 const mla=resolveAssignmentFormat({course:{syllabus:'Course papers follow MLA format.'}});assert.equal(mla.profile,'mla9');assert.equal(mla.source,'syllabus');assert.equal(mla.assumedEdition,true);assert.equal(mla.titlePage,'not-required');
 const neutral=resolveAssignmentFormat({project:{prompt:'Solve this algebra problem and explain the steps.'}});assert.equal(neutral.profile,'neutral');assert.equal(neutral.needsClarification,false);assert.equal(neutral.warnings.length,0);
});
test('explicit unsupported editions and named alternatives are retained without a latest-edition substitution',()=>{
 for(const [prompt,style,edition]of[['Use APA 6th edition','apa',6],['Use MLA eighth edition','mla',8]]){const out=resolveAssignmentFormat({project:{prompt}});assert.equal(out.style,style);assert.equal(out.edition,edition);assert.equal(out.profile,'neutral');assert.equal(out.supported,false);assert.match(out.warnings.join(' '),/requested/);}
 const other=resolveAssignmentFormat({project:{rubric:'Use Chicago style footnotes.'}});assert.equal(other.style,'other');assert.match(other.label,/Chicago/);assert.equal(other.profile,'neutral');
});
test('ambiguity at the winning instruction level is explicit while negations and discussion topics do not force a format',()=>{
 const out=resolveAssignmentFormat({project:{rubric:'Use APA 7 and MLA 9.'}});assert.equal(out.style,'conflict');assert.equal(out.needsClarification,true);assert.equal(out.conflicts[0].overridden,false);
 assert.equal(resolveAssignmentFormat({project:{prompt:'Use APA 7, not MLA 9.'}}).profile,'apa7');
 assert.equal(resolveAssignmentFormat({project:{prompt:'Compare APA and MLA citation practices in a short response.'}}).profile,'neutral');
 assert.equal(resolveAssignmentFormat({project:{prompt:'Read https://library.example.edu/APA-7 and answer the question.'}}).profile,'neutral');
});
test('specific instructor title-page, abstract, margins and page instructions override style defaults',()=>{
 const out=resolveAssignmentFormat({project:{rubric:'APA 7. Do not include a title page. No abstract. Single-spaced text. Left margin 1.5 inches. No page numbers.'},course:{syllabus:'Use APA 7. Include a title page and an abstract. Double spacing and 1-inch margins.'}});
 assert.equal(out.profile,'apa7');assert.equal(out.titlePage,'not-required');assert.equal(out.requiresAbstract,false);assert.equal(out.layout.lineSpacing,1);assert.equal(out.layout.marginsInches.left,1.5);assert.equal(out.layout.marginsInches.right,1);assert.equal(out.layout.pageNumbers,false);
 const half=resolveAssignmentFormat({project:{prompt:'MLA 9. Line spacing: 1.5.'}});assert.equal(half.layout.lineSpacing,1.5);
});
test('format guidance preserves machine provenance without treating internal source markers as formal citations',()=>{
 assert.match(ASSIGNMENT_FORMAT_VERSION,/^assignment-format-v/);assert.match(ASSIGNMENT_FORMAT_GUIDANCE,/author-date/);assert.match(ASSIGNMENT_FORMAT_GUIDANCE,/author-location/);assert.match(ASSIGNMENT_FORMAT_GUIDANCE,/checks details/);assert.match(ASSIGNMENT_FORMAT_GUIDANCE,/Never invent authors/);assert.doesNotMatch(ASSIGNMENT_FORMAT_GUIDANCE,/guaranteed|undetectable/);
});
test('compact edition names and repeated generic style mentions retain an explicit edition without a false conflict',()=>{
 for(const text of['Use APA7. Cite each source in APA style.','MLA-9 format is required.','APA, seventh edition.','Use APA 7, not Chicago style.']){
  const out=resolveAssignmentFormat({project:{prompt:text}});assert.equal(out.profile,text.startsWith('MLA')?'mla9':'apa7',text);assert.equal(out.needsClarification,false,text);assert.equal(out.assumedEdition,false,text);
 }
 const old=resolveAssignmentFormat({project:{prompt:'Use APA6. APA style is required.'}});assert.equal(old.edition,6);assert.equal(old.profile,'neutral');assert.equal(old.needsClarification,false);
});
