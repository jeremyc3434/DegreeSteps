const test = require('node:test');
const assert = require('node:assert/strict');
const Guide = require('./dist/guide-engine.js');
const Sheet = require('./dist/sheet-state.js');
const pack = require('./dist/data/curricula/liberty.json');
const clone = value => JSON.parse(JSON.stringify(value));

function original(provider, code, grade, extra = {}) {
  return {id:'original-record', provider, code, title:'Original source course', credits:3, creditSystem:'semester',
    status:'earned', grade, privateNote:'Preserve my transcript details', evaluations:[], ...extra};
}

function unchangedMatch(program, records) {
  const before = clone(records), result = Guide.matchInventory(program, records);
  assert.deepEqual(records, before, 'eligibility must not edit grades, evaluations or original source metadata');
  return result;
}

test('an actual Liberty mixed major-elective allocation applies C to an upper award while retaining a lower award', () => {
  const model = pack.models.find(model => model.id === 'curriculum-liberty-interdisciplinary-aa-online');
  const requirement = model.requirements.find(requirement => requirement.id === 'interdisciplinary-general-electives-1');
  assert.equal(requirement.minimumGradeWhenUpper, 'C');
  assert.equal(requirement.minimumGrade, undefined);
  assert(requirement.minimumGradeSourceIds.every(id => model.sources.some(source => source.id === id)));
  const program = {...model, requirements:[requirement]};
  const upper = requirement.options.find(option => option.provider === 'Sophia' && option.code === 'SOPH-0085');
  const lower = requirement.options.find(option => option.provider === 'Study.com' && option.code === 'SDCM-0053');
  assert.equal(upper.receivingCode, 'BUSI 330');
  assert.equal(upper.upper, true);
  assert.equal(lower.receivingCode, 'BUSI 240');
  assert.equal(lower.upper, false, 'the receiving award remains lower level despite the source Business 307 title');
  for (const grade of ['D', 'C-', 'C']) {
    for (const option of [upper, lower]) {
      const record = original(option.provider, option.code, grade, {title:option.title, upper:true});
      const match = unchangedMatch(program, [record]);
      const eligible = option === lower || grade === 'C';
      assert.equal(match.completed.length, eligible ? 1 : 0, option.receivingCode + ' ' + grade);
      assert.equal(match.unmatched.length, eligible ? 0 : 1);
      if (eligible) assert.equal(match.completed[0].status, 'reported', 'a published mapping does not create school confirmation');
    }
  }
});

test('a real Psychology A.A. elective respects the evaluated receiving level even without a curated course option', () => {
  const model = pack.models.find(model => model.id === 'curriculum-liberty-psychology-aa-online');
  const requirement = model.requirements.find(requirement => requirement.id === 'psychology-elective-1');
  assert.equal(requirement.minimumGradeWhenUpper, 'C');
  assert.equal(requirement.minimumGrade, undefined);
  const program = {...model, requirements:[requirement]};
  for (const destinationUpper of [true, false, undefined]) for (const grade of ['D', 'C-', 'C']) {
    const evaluation = {programId:model.id, requirementId:requirement.id, status:'confirmed',
      ...(destinationUpper === undefined ? {} : {upper:destinationUpper})};
    const record = original('College', 'PSYC-400', grade, {upper:true, evaluations:[evaluation]});
    const match = unchangedMatch(program, [record]);
    const eligible = destinationUpper !== true || grade === 'C';
    assert.equal(match.completed.length, eligible ? 1 : 0, String(destinationUpper) + ' destination level, grade ' + grade);
    if (eligible) {
      assert.equal(match.completed[0].status, 'confirmed');
      assert.equal(match.completed[0].optionId, undefined, 'this explicit school award is not a fabricated provider mapping');
    } else assert.equal(match.unmatched[0].id, record.id);
  }
});

function fixture(requirement = {}) {
  return {id:'conditional-grade-fixture', school:'Example University', title:'Explicitly synthetic grade fixture', creditSystem:'semester',
    sources:[{id:'fixture', url:'https://example.edu/policy-fixture'}],
    requirements:[{id:'mixed-major', title:'Mixed-level major elective', credits:3, category:'major', minimumGradeWhenUpper:'C',
      options:[{id:'university-upper', provider:'University', code:'DEST 330', title:'Upper destination course', credits:3, upper:true,
        evidence:'published', sourceIds:['fixture']}], ...requirement}]};
}

test('the same-university matching path checks the selected upper destination award before recognizing an earned course', () => {
  const program = fixture();
  for (const grade of ['D', 'C-', 'C']) {
    const record = original('University', 'DEST 330', grade, {institution:program.school, sourceProgramId:'earlier-degree'});
    const match = unchangedMatch(program, [record]);
    assert.equal(match.completed.length, grade === 'C' ? 1 : 0, grade);
    if (grade === 'C') assert.equal(match.completed[0].status, 'reported', 'a prior degree placement remains provisional');
  }
});

test('school confirmation cannot bypass an upper-only requirement or the stronger of two sourced grade minima', () => {
  const upperOnly = fixture({upperOnly:true, options:[]});
  for (const grade of ['D', 'C-', 'C']) {
    const record = original('College', 'SOURCE 100', grade, {evaluations:[{
      programId:upperOnly.id, requirementId:'mixed-major', status:'confirmed'}]});
    assert.equal(unchangedMatch(upperOnly, [record]).completed.length, grade === 'C' ? 1 : 0, 'upper-only ' + grade);
  }
  for (const destinationUpper of [false, true]) {
    const program = fixture({minimumGrade:'B', options:[]});
    for (const grade of ['D', 'C-', 'C', 'B-', 'B']) {
      const record = original('College', 'SOURCE 300', grade, {evaluations:[{
        programId:program.id, requirementId:'mixed-major', upper:destinationUpper, status:'confirmed'}]});
      assert.equal(unchangedMatch(program, [record]).completed.length, grade === 'B' ? 1 : 0, 'B minimum, upper ' + destinationUpper + ', grade ' + grade);
    }
  }
});

test('recording an upper canonical school placement cannot override an insufficient saved grade', () => {
  const program = fixture(), requirement = program.requirements[0], option = requirement.options[0];
  for (const grade of ['D', 'C-', 'C']) {
    let state = Sheet.updateLearning({learning:[]}, original('University', option.code, grade,
      {institution:program.school, sourceProgramId:program.id}));
    state = Sheet.recordProgress(state, program, requirement, option, 'confirmed', {confirmation:true});
    const before = clone(state), match = unchangedMatch(program, state.learning);
    assert.equal(match.completed.length, grade === 'C' ? 1 : 0, grade);
    assert.deepEqual(state, before, 'the rejected source and explicit confirmation remain available for correction');
  }
});
