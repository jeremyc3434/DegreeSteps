const test = require('node:test');
const assert = require('node:assert/strict');
const Guide = require('./dist/guide-engine.js');
const snhu = require('./dist/data/curricula/snhu.json');
const tesu = require('./dist/data/tesu.json');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(requirement = {}) {
  return {id:'transfer-grade-fixture', school:'Example University', title:'Synthetic transfer grade fixture', creditSystem:'semester',
    transferGradePolicy:{minimumGrade:'C-', scope:'incoming-transfer', sourceIds:['fixture-policy']},
    sources:[{id:'fixture-policy', url:'https://example.edu/transfer-policy'}],
    requirements:[{id:'composition', title:'Composition', credits:3, category:'general', options:[
      {id:'partner-composition', provider:'Sophia', code:'SOPH-0015', codeAliases:['English Composition I'], title:'Composition',
        credits:3, evidence:'published', minimumTransferGrade:'C-', receivingCode:'DEST101', upper:false},
      {id:'university-composition', provider:'University', code:'DEST101', title:'Composition', credits:3, evidence:'published', upper:false}
    ], ...requirement}]};
}

function original(grade, extra = {}) {
  return {id:'original', provider:'Sophia', code:'SOPH-0015', title:'Original source course', credits:3,
    creditSystem:'semester', status:'earned', grade, upper:true, completedOn:'2026-01-01', evaluations:[],
    privateNote:'Keep the original transcript details', ...extra};
}

function unchangedMatch(program, records) {
  const before = clone(records), programBefore = clone(program), result = Guide.matchInventory(program, records);
  assert.deepEqual(records, before, 'grade eligibility must preserve source facts and saved school evaluations');
  assert.deepEqual(program, programBefore, 'matching must preserve the sourced curriculum');
  return result;
}

function evaluated(program, extra = {}) {
  return {programId:program.id, requirementId:'composition', status:'confirmed', ...extra};
}

test('transfer floors apply to published partner aliases and confirmed placements with or without a canonical option', () => {
  const program = fixture();
  const paths = [
    {provider:'Sophia Learning', code:'English Composition I'},
    {provider:'Sophia Learning', code:'English Composition I', evaluations:[evaluated(program, {optionId:'partner-composition'})]},
    {provider:'Other college', code:'SOURCE101', institution:'Original College', evaluations:[evaluated(program)]},
    {provider:'Other college', code:'SOURCE101', evaluations:[evaluated(program, {optionId:'university-composition'})]}
  ];
  for (const path of paths) for (const grade of ['D', 'D+', 'C-']) {
    const record = original(grade, path), match = unchangedMatch(program, [record]);
    assert.equal(match.completed.length, grade === 'C-' ? 1 : 0, path.provider + ' ' + path.code + ' ' + grade);
    assert.equal(match.unmatched.length, grade === 'C-' ? 0 : 1);
    if (grade === 'C-') assert.equal(match.completed[0].status, path.evaluations ? 'confirmed' : 'reported');
  }
});

test('an option transfer floor is enforced without a program-wide floor and the strongest applicable floor wins', () => {
  const program = fixture();
  delete program.transferGradePolicy;
  for (const grade of ['D', 'D+', 'C-']) {
    assert.equal(unchangedMatch(program, [original(grade, {provider:'Sophia Learning', code:'English Composition I'})]).completed.length,
      grade === 'C-' ? 1 : 0, 'option-only ' + grade);
    assert.equal(unchangedMatch(program, [original(grade, {evaluations:[evaluated(program)]})]).completed.length,
      grade === 'C-' ? 1 : 0, 'explicit option-only ' + grade);
  }
  program.transferGradePolicy = {minimumGrade:'C-', sourceIds:['fixture-policy']};
  program.requirements[0].minimumGrade = 'C';
  for (const grade of ['D', 'D+', 'C-', 'C']) {
    for (const extra of [{}, {provider:'College', code:'UNMAPPED', evaluations:[evaluated(program)]}]) {
      assert.equal(unchangedMatch(program, [original(grade, extra)]).completed.length, grade === 'C' ? 1 : 0,
        'unconditional C remains stronger than C-: ' + grade);
    }
  }
  program.requirements[0].options[0].minimumTransferGrade = 'B';
  assert.equal(unchangedMatch(program, [original('C')]).completed.length, 0);
  assert.equal(unchangedMatch(program, [original('B')]).completed.length, 1);
});

test('original same-school institutional courses are exempt across both automatic and explicit matching paths', () => {
  const program = fixture();
  for (const sourceProgramId of [program.id, 'earlier-degree-at-the-same-school']) {
    for (const evaluations of [[], [evaluated(program, {optionId:'university-composition'})]]) {
      const record = original('D', {provider:' UNIVERSITY ', code:'DEST101', institution:'EXAMPLE, University.',
        sourceProgramId, creditOrigin:'institutional', evaluations});
      const match = unchangedMatch(program, [record]);
      assert.equal(match.completed.length, 1);
      assert.equal(match.completed[0].status, evaluations.length ? 'confirmed' : 'reported');
    }
  }
  const requirement = {...program.requirements[0], minimumGrade:'C'};
  const internal = original('D', {provider:'University', code:'DEST101', institution:program.school, sourceProgramId:program.id});
  assert.equal(unchangedMatch({...program, requirements:[requirement]}, [internal]).completed.length, 0,
    'a transfer exemption never removes a requirement-wide grade minimum');
});

test('University labels and receiving profile fields do not exempt another or unknown original issuer', () => {
  const program = fixture();
  const origins = [
    {institution:'Another University'},
    {institution:''},
    {institution:program.school, creditOrigin:'ace'},
    {institution:program.school, creditOrigin:'NCCRS recommended'},
    {institution:program.school, sourceType:'alternative'},
    {institution:program.school, creditOrigin:'institutional', sourceType:'alternative'},
    {institution:program.school, creditOrigin:'unknown'}
  ];
  for (const origin of origins) for (const grade of ['D', 'D+', 'C-']) {
    const record = original(grade, {provider:'University', code:'DEST101', sourceProgramId:program.id,
      profile:{school:program.school, degree:program.title}, evaluations:[evaluated(program, {optionId:'university-composition'})], ...origin});
    assert.equal(unchangedMatch(program, [record]).completed.length, grade === 'C-' ? 1 : 0, JSON.stringify(origin) + ' ' + grade);
  }
});

test('transfer floors combine with receiving-level grade rules without inferring destination level from the source', () => {
  const program = fixture({minimumGradeWhenUpper:'C', options:[]});
  for (const upper of [false, true, undefined]) for (const grade of ['D', 'D+', 'C-', 'C']) {
    const record = original(grade, {provider:'College', code:'SOURCE400', upper:true,
      evaluations:[evaluated(program, upper === undefined ? {} : {upper})]});
    const eligible = upper === true ? grade === 'C' : ['C-', 'C'].includes(grade);
    assert.equal(unchangedMatch(program, [record]).completed.length, eligible ? 1 : 0, String(upper) + ' destination, ' + grade);
  }
});

test('non-earned records and failing records do not award credit through a saved school confirmation', () => {
  const program = fixture();
  for (const status of ['planned', 'in-progress', 'saved']) {
    assert.equal(unchangedMatch(program, [original('C-', {status, evaluations:[evaluated(program)]})]).completed.length, 0, status);
  }
  for (const grade of ['F', 'W', 'WF', 'I', 'INCOMPLETE']) {
    assert.equal(unchangedMatch(program, [original(grade, {evaluations:[evaluated(program)]})]).completed.length, 0, grade);
  }
});

test('an exact confirmed TESU award preserves an evaluated older algebra course when the current version window changes', () => {
  const requirement = tesu.requirements.find(req => req.id === 'mat1210');
  const option = requirement.options.find(option => option.provider === 'Sophia' && option.codeAliases?.includes('SOPH-0001'));
  assert.equal(option.courseVersion, 6);
  assert.equal(option.recommendationStart, '2025-05-01');
  assert.equal(option.recommendationEnd, '2028-04-30');
  const program = {...tesu, requirements:[requirement]};
  const confirmation = {programId:tesu.id, requirementId:requirement.id, optionId:option.id, status:'confirmed'};
  const record = original('C', {code:'SOPH-0001', completedOn:'2023-06-01', evaluations:[confirmation]});
  const approved = unchangedMatch(program, [record]);
  assert.equal(approved.completed.length, 1);
  assert.equal(approved.completed[0].status, 'confirmed');
  assert.equal(approved.completed[0].optionId, option.id);
  for (const evaluations of [[], [{...confirmation, status:'reported'}], [{...confirmation, programId:'another-degree'}],
    [{...confirmation, requirementId:'another-requirement'}]]) {
    assert.equal(unchangedMatch(program, [{...record, evaluations}]).completed.length, 0,
      'an older unknown version needs confirmation for this exact destination award');
  }
  const active = unchangedMatch(program, [{...record, completedOn:'2026-06-01', evaluations:[]}]);
  assert.equal(active.completed.length, 1);
  assert.equal(active.completed[0].status, 'reported');
});

test('confirmed destination awards bypass only current version windows and retain every grade and score floor', () => {
  const program = fixture({minimumGrade:'C'});
  const option = {...program.requirements[0].options[0], provider:'CLEP', code:'CLEP-1', codeAliases:[], minScore:50,
    recommendationStart:'2025-05-01', recommendationEnd:'2028-04-30'};
  program.requirements[0].options = [option];
  const evaluations = [evaluated(program, {optionId:option.id})];
  for (const [grade, score, eligible] of [['D', 50, false], ['C-', 50, false], ['C', 49, false], ['C', 50, true]]) {
    const record = original(grade, {provider:'CLEP', code:option.code, score, completedOn:'2023-06-01', evaluations});
    assert.equal(unchangedMatch(program, [record]).completed.length, eligible ? 1 : 0, grade + ', score ' + score);
  }
});

test('actual SNHU degree models apply their sourced transfer floor while allowing original institutional D grades', () => {
  assert.equal(snhu.models.length, 2);
  for (const model of snhu.models) {
    assert.equal(model.transferGradePolicy?.minimumGrade, 'C-', model.id + ' policy');
    assert(model.transferGradePolicy.sourceIds.every(id => model.sources.some(source => source.id === id)));
    const requirement = model.requirements.find(req => !req.minimumGrade && req.options.some(option => option.provider === 'Sophia') &&
      req.options.some(option => option.provider === 'University' && !option.selectionRequired));
    assert(requirement, model.id + ' has a concrete partner and institutional course');
    const program = {...model, requirements:[requirement]}, partner = requirement.options.find(option => option.provider === 'Sophia');
    const university = requirement.options.find(option => option.provider === 'University' && !option.selectionRequired);
    assert.equal(partner.minimumTransferGrade, 'C-');
    for (const grade of ['D', 'D+', 'C-']) {
      assert.equal(unchangedMatch(program, [original(grade, {provider:'Sophia Learning', code:partner.code,
        credits:partner.sourceCredits || partner.credits})]).completed.length, grade === 'C-' ? 1 : 0, model.id + ' partner ' + grade);
      assert.equal(unchangedMatch(program, [original(grade, {provider:'University', institution:'Another University', code:'OTHER101',
        sourceProgramId:model.id, evaluations:[{programId:model.id, requirementId:requirement.id, status:'confirmed'}]})]).completed.length,
        grade === 'C-' ? 1 : 0, model.id + ' other university ' + grade);
    }
    assert.equal(unchangedMatch(program, [original('D', {provider:'University', institution:model.school, code:university.code,
      sourceProgramId:'previous-snhu-degree', creditOrigin:'institutional'})]).completed.length, 1, model.id + ' original SNHU grade');
  }
});
