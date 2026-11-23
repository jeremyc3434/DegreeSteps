/** Pathway Factory join key: catalog and provider tables write the same course code with different punctuation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {courseCodeKey,matchRequirement} from './scripts/pathway-factory/lib.mjs';
import {requirementId} from './scripts/pathway-factory/draft.mjs';

const program=requirements=>({slug:'demo',requirements});

test('course codes compare after uppercasing and dropping spaces, hyphens and periods',()=>{
  for(const [a,b]of [['MGMT 110','MGMT-110'],['ENGL 100','engl.100'],['CMIT-200','CMIT200'],['ACC 100','acc-100']])assert.equal(courseCodeKey(a),courseCodeKey(b));
  assert.notEqual(courseCodeKey('MGMT 110'),courseCodeKey('MGMT 1100'));
  assert.equal(courseCodeKey(''),'');assert.equal(courseCodeKey(undefined),'');
});

test('an exact code match wins; a normalized match joins only when it is unique',()=>{
  const reqs=[{id:'a',code:'MGMT 110',title:'Management'},{id:'b',code:'MGMT-110',title:'Duplicate listing'}];
  assert.equal(matchRequirement({receivingCode:'MGMT-110'},program(reqs)).id,'b','exact match first');
  assert.equal(matchRequirement({receivingCode:'MGMT.110'},program(reqs)),null,'two normalized candidates: no join');
  assert.equal(matchRequirement({receivingCode:'MGMT-110'},program([{id:'x',code:'MGMT 110',title:'M'}])).id,'x');
  assert.equal(matchRequirement({receivingCode:'MGMT-111'},program([{id:'x',code:'MGMT 110',title:'M'}])),null);
  assert.equal(matchRequirement({receivingCode:'MGMT-110',placements:{demo:{requirementId:'y'}}},program([{id:'x',code:'MGMT 110'},{id:'y',code:'OTHER 1'}])).id,'y','explicit placement still wins');
});

test('drafted requirement ids stay within 120 characters with a stable suffix',()=>{
  assert.equal(requirementId('bba','ACC 100'),'bba-acc-100');
  const label='Concentration (select one: Addiction Treatment Facility Management, Correctional Healthcare Facility Management, Emergency Management, Leadership, or Mental Healthcare Facility Management)';
  const id=requirementId('bachelor-of-science-in-healthcare-administration',label);
  assert.ok(id.length<=120);assert.equal(id,requirementId('bachelor-of-science-in-healthcare-administration',label));
  assert.notEqual(id,requirementId('bachelor-of-science-in-healthcare-administration',label+' x'));
});
