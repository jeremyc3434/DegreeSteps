/*
 * Reviewed GCU campus BSBA curriculum, kept separate from transfer awards.
 * This importer deliberately does not turn a three-credit content equivalent
 * into a four-credit award. Course content, degree credit and division level
 * are separate facts under GCU's published transfer policies.
 */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(import.meta.dirname, '..');
const checkedOn = '2026-11-19';
const programUrl = 'https://www.gcu.edu/degree-programs/bachelor-science-business-administration';
const catalogUrl = 'https://www.gcu.edu/sites/default/files/media/documents/academics/catalog/2026-27/academic-catalog-fall-2026-v4.pdf';
const handbookUrl = 'https://www.gcu.edu/sites/default/files/media/documents/academics/handbook/2026-27/university-policy-handbook-fall-2026-v5.pdf';
const source = {
  program: 'gcu-bsba-program-current-2026-11-19',
  catalog: 'gcu-bsba-catalog-fall-2026-2026-11-19',
  general: 'gcu-bs-general-education-fall-2026-2026-11-19',
  electives: 'gcu-bsba-named-electives-fall-2026-2026-11-19',
  transfer: 'gcu-baccalaureate-transfer-fall-2026-2026-11-19',
  alternative: 'gcu-alternative-credit-fall-2026-2026-11-19',
  graduation: 'gcu-baccalaureate-graduation-fall-2026-2026-11-19',
  creditBalance: 'gcu-degree-credit-shortfall-fall-2026-2026-11-19',
  placement: 'gcu-campus-placement-fall-2026-2026-11-19',
  english: 'gcu-eng106-current-2026-11-19',
  sociology: 'gcu-sociology-course-identities-current-2026-11-19',
  communication: 'gcu-com100-current-2026-11-19',
  religion: 'gcu-int244-current-2026-11-19',
  serviceOne: 'gcu-ldr461-current-2026-11-19',
  serviceTwo: 'gcu-ldr462-current-2026-11-19',
  serviceThree: 'gcu-ldr463-native-catalog-api-2026-11-19',
};
export const outputPath = 'content/curricula/gcu-bsba-campus.json';
export const routeId = 'gcu-bsba-campus';
export const modelId = 'curriculum-gcu-bsba-campus';
const rid = code => code.toLowerCase().replace(/-/g, '');

// Codes, titles and credit quantities are factual catalog data. Descriptions
// below are our paraphrases. Native options are not outside transfer awards.
const generalCourses = [
  ['UNV-103', 'University Success', 'foundations'],
  ['UNV-104', '21st Century Skills: Communication and Information Literacy', 'communication'],
  ['ENG-105', 'English Composition I', 'communication'],
  ['ENG-106', 'English Composition II', 'communication'],
  ['CWV-101', 'Christian Worldview', 'worldview'],
  ['PHI-105', '21st Century Skills: Critical Thinking and Problem Solving', 'critical-thinking'],
  ['MAT-144', 'College Mathematics', 'critical-thinking'],
  ['BIO-220', 'Environmental Science', 'critical-thinking'],
  ['HIS-144', 'U.S. History Themes', 'global-awareness'],
  ['PSY-102', 'General Psychology', 'global-awareness'],
];
const majorCourses = [
  ['BIT-200', 'Introduction to Computer Technology'],
  ['ACC-240', 'Fundamentals of Accounting', ['MAT-144'], 'Published alternatives: MAT-134, MAT-154, or a higher subsequent mathematics course. The selected baseline uses MAT-144.'],
  ['MKT-315', 'Introduction to Marketing'],
  ['BUS-352', 'Business Statistics', ['MAT-144', 'BIT-200'], 'Published alternatives: MAT-134, MAT-154, or higher subsequent mathematics; and BIT-205, CST-111, or ITT-111. The selected baseline uses MAT-144 and BIT-200.'],
  ['BUS-332', 'Customer Engagement', ['MKT-315']],
  ['BUS-340', 'Ethical and Legal Issues in Business'],
  ['BIT-301', 'Fundamentals in Business Analytics', ['BIT-200', 'BUS-352'], 'Published alternatives: BIT-205 or CST-111 for the technology prerequisite, and MAT-274 for statistics. The selected baseline uses BIT-200 and BUS-352.'],
  ['ECN-361', 'Microeconomics', ['ACC-240', 'BUS-352'], 'ACC-250 is the published alternative to ACC-240. Both an accounting option and BUS-352 are required.'],
  ['BUS-390', 'Global Business'],
  ['ECN-362', 'Macroeconomics', ['ECN-361']],
  ['FIN-350', 'Fundamentals of Business Finance', ['ECN-361', 'ACC-240'], 'Published alternatives: ECN-220 or ECN-351 for economics, and ACC-250 for accounting. The selected baseline uses ECN-361 and ACC-240.'],
  ['FIN-375', 'Introduction to Investments', ['FIN-350']],
  ['ACC-486', 'Financial Statement Analysis', ['ACC-240', 'FIN-350'], 'ACC-260 or ACC-350 are published alternatives to ACC-240; FIN-350 is also required.'],
  ['MGT-420', 'Organizational Behavior and Management'],
  ['MGT-455', 'Production/Operations Management', ['BUS-352'], 'MAT-274, MAT-374, or ESG-374 are published alternatives to BUS-352.'],
  ['BUS-485', 'Strategic Management', ['MGT-420', 'FIN-350', 'MKT-315'], 'Published alternatives: MGT-422HN; FIN-210; and MKT-245 respectively. This course is the program capstone.'],
];
const electiveCourses = [
  ['SOC-102', 'Principles of Sociology', source.sociology],
  ['SOC-220', 'Social Problems', source.sociology],
  ['COM-100', 'Fundamentals of Communication', source.communication],
  ['INT-244', 'World Religions', source.religion],
];

function makeSources() {
  const common = {checked: checkedOn, checkedOn, authority: 'university', evidence: 'published'};
  return [
    {id: source.program, title: 'GCU Bachelor of Science in Business Administration — current official program curriculum and course prerequisites', url: programUrl, ...common, scope: 'Program states campus and online availability, 120 semester credits, 64-credit major and 34–40 general education / 16–22 elective ranges. The sixteen named major courses each carry four credits. Program page academic approval date: September 15, 2026.'},
    {id: source.catalog, title: 'GCU Fall 2026 Academic Catalog — BS Business Administration', url: catalogUrl + '#page=61', ...common, pages: [61, 62], scope: 'Printed pages 61–62: all sixteen required four-credit major courses, 64 major credits, 34–40 general education, 16–22 electives and 120 total. BUS-340 and BUS-485 carry the writing-intensive designation.'},
    {id: source.general, title: 'GCU Fall 2026 Academic Catalog — Bachelor of Science general education', url: catalogUrl + '#page=56', ...common, pages: [54, 55, 56], scope: 'Printed pages 54–56 list the five general education competencies and named GCU course choices. BS ranges: foundations 4, communication 9–12, worldview 4, critical thinking 11–12, global awareness 6–8. UNV-103/303 and CWV-101/301 are marked non-transferable in the published sequence; campus students can have additional approved choices.'},
    {id: source.electives, title: 'GCU Fall 2026 Academic Catalog — named unrestricted elective selections', url: catalogUrl, ...common, pages: [55, 61, 62, 158, 170, 171], scope: 'The BSBA has an open elective allowance. INT-244, COM-100, SOC-102 and SOC-220 are actual named four-credit university courses. They are selected examples, not additional required major courses or a promise of registration availability.'},
    {id: source.transfer, title: 'GCU Fall 2026 University Policy Handbook — baccalaureate transfer policies', url: handbookUrl + '#page=261', ...common, pages: [261, 262], scope: 'Printed pages 261–262: maximum 90 transfer credits, at most 84 lower-division; 30 combined alternative credits; another 30 maximum from military schools/training; all other transfer must be on an accredited GCU-approved originating college transcript. Lower-division substitutions do not become upper-division credit. Undergraduate transfer generally requires C or better; pass grades must equate to C. No duplicate/remedial credit.'},
    {id: source.alternative, title: 'GCU Fall 2026 University Policy Handbook — alternative credit source treatment', url: handbookUrl + '#page=262', ...common, pages: [262, 263], scope: 'Printed pages 262–263: combined 30-credit alternative ceiling, source transcript controls testing credit quantity and level; ACE credit is applied by transcript first to matching content/general education then electives. NCCRS may apply to undergraduate lower-division general education or electives. General alternative acceptance is not an exact course equivalency.'},
    {id: source.creditBalance, title: 'GCU Fall 2026 University Policy Handbook — degree credit minimum and transfer shortfalls', url: handbookUrl + '#page=267', ...common, pages: [262, 267], scope: 'Printed page 262 quarter-conversion example preserves 2.67 earned credits toward 120 even when English content is fulfilled. Printed page 267 allows GCU Service Learning coursework to fill a transfer-related shortfall toward 120 in the major/elective categories; Service Learning cannot fulfill general education. Content substitution never establishes a larger credit award.'},
    {id: source.graduation, title: 'GCU Fall 2026 University Policy Handbook — bachelor graduation, residency, upper division and writing', url: handbookUrl + '#page=267', ...common, pages: [267, 268], scope: 'Printed pages 267–268: 120 minimum; 30 semester credits at GCU; 36 upper total and at least 36 upper credits in the major; overall and major GPA 2.0, major courses C or better. Three writing-intensive courses include ENG-105/equivalent and two major courses, at least one upper. Traditional campus foundations waiver needs 24 transferred college-level credits and 3.0 GPA.'},
    {id: source.placement, title: 'GCU Fall 2026 University Policy Handbook — campus mathematics and English placement', url: handbookUrl + '#page=40', ...common, pages: [40], scope: 'Traditional campus freshmen must take the appropriate placement examination before math above MAT-110. Transfer students need placement unless a C-or-better approved prerequisite transfers from an approved accredited college. Direct ENG-105 registration depends on English competency/placement or the published waiver alternatives. Remedial prerequisites are not counted inside this 120-credit ledger.'},
    {id: source.english, title: 'GCU official current ENG-106 course description', url: 'https://www.gcu.edu/degree-programs/bsn-pre-licensure', ...common, scope: 'Named English Composition II course: 4 credits; formal prerequisite ENG-105. Course identity only; this is not a BSBA-specific outside transfer agreement.'},
    {id: source.sociology, title: 'GCU official current SOC-102 and SOC-220 course descriptions', url: 'https://www.gcu.edu/degree-programs/bachelor-science-sociology', ...common, scope: 'SOC-102 Principles of Sociology and SOC-220 Social Problems are each four-credit university courses; no formal prerequisite appears in these current course descriptions. Selected as nonduplicating BSBA open electives, not as BSBA required major courses.'},
    {id: source.communication, title: 'GCU official current COM-100 course description', url: 'https://www.gcu.edu/degree-programs/bachelor-arts-communications', ...common, scope: 'COM-100 Fundamentals of Communication: 4 credits; no formal prerequisite is listed in its current description. Selected university open elective only.'},
    {id: source.religion, title: 'GCU official current INT-244 course description', url: 'https://www.gcu.edu/degree-programs/bachelor-arts-christian-studies-global-ministry', ...common, scope: 'INT-244 World Religions: 4 credits; no formal prerequisite is listed in its current description. Selected university open elective only.'},
    {id: source.serviceOne, title: 'GCU official current LDR-461 course identity', url: 'https://www.gcu.edu/degree-programs/bachelor-science-molecular-cellular-biology', ...common, scope: 'LDR-461 Professional Applications in Service Learning I: one credit and ten volunteer hours in the chosen field. This source establishes course identity and quantity, not unlimited repeatability or automatic BSBA major allocation.'},
    {id: source.serviceTwo, title: 'GCU official current LDR-462 course identity', url: 'https://www.gcu.edu/degree-programs/bachelor-science-biology-pre-physician-assistant', ...common, scope: 'LDR-462 Professional Applications in Service Learning II: two credits and twenty volunteer hours in the chosen field. This source establishes course identity and quantity, not unlimited repeatability or automatic BSBA major allocation.'},
    {id: source.serviceThree, title: 'GCU public Transfer Search — active native LDR-463 catalog identity', url: 'https://transfersearch.gcu.edu/SSTPServices/tea/v1/get-gcu-course-by-criteria?criteria=LDR-463', ...common, retrievedAt: '2026-11-19T04:23:55.278990+00:00', responseSha256: 'c34ea1bc64d2c59f4816f1c0925165bcecc822376626a1252fa913ce19dbb36e', publicRecord: {id: '840e874e-20ca-4f07-bd8c-d8afdbbe8990', courseCode: 'LDR-463', title: 'Professional Applications in Service Learning III', credits: '3.0', courseLevelId: '2', active: true, courseMappingId: null}, scope: 'The university public catalog API returns an active non-honors LDR-463 course with three credits. This establishes current native identity and quantity only, not repeatability, a transfer award or automatic BSBA major allocation. Public response contains no student records.'},
  ];
}

export function buildGCUCampusBSBA() {
  const sources = makeSources();
  const bySource = new Map(sources.map(item => [item.id, item]));
  const universityOption = (id, code, title, sourceIds) => ({
    id: 'university-' + id, provider: 'University', code, title,
    credits: 4, upper: Number(code.split('-')[1]) >= 300,
    creditSystem: 'semester', creditOrigin: 'institutional', evidence: 'published',
    sourceIds: [...sourceIds], url: bySource.get(sourceIds.at(-1)).url,
  });
  const general = generalCourses.map(([code, title, competency]) => {
    const id = rid(code), sourceIds = [source.program, source.general];
    const row = {
      id, code, title, credits: 4, category: 'general', group: 'gcu-' + competency,
      subgroup: 'gcu-' + competency, upper: false, sourceIds,
      options: [universityOption(id, code, title, sourceIds)],
      choiceNote: 'Selected GCU course within this published general education competency; approved transfer credit may change the allocation without reducing the 120-credit degree minimum.',
    };
    if (code === 'UNV-103' || code === 'CWV-101') {
      row.institutionalOnly = true;
      row.institutionalOnlySourceIds = [source.general];
      row.notes = code === 'UNV-103'
        ? 'The baseline retains University Success. A traditional campus student with at least 24 transferred college-level credits and a 3.0 GPA can qualify for the published foundations waiver; do not award four earned credits for a waiver.'
        : 'Christian Worldview is a required non-transferable GCU general education course. CWV-301 is the published alternative; this baseline selects CWV-101.';
    }
    if (code === 'ENG-106') Object.assign(row, {prerequisites: ['eng105'], prerequisiteSourceIds: [source.english], prerequisiteNotes: 'ENG-105 is the published prerequisite to ENG-106.'});
    if (code === 'ENG-105') Object.assign(row, {writingIntensive: true, writingIntensiveSourceIds: [source.general], prerequisiteNotes: 'Campus English competency/placement or an applicable published waiver must permit direct registration in ENG-105.', prerequisiteSourceIds: [source.placement]});
    if (code === 'ENG-106') Object.assign(row, {writingIntensive: true, writingIntensiveSourceIds: [source.general]});
    if (code === 'MAT-144') Object.assign(row, {prerequisiteNotes: 'Campus mathematics placement must permit MAT-144, or an approved prerequisite with C or better must transfer. The selected ledger does not assume a student has already met placement.', prerequisiteSourceIds: [source.placement]});
    return row;
  });
  const major = majorCourses.map(([code, title, prerequisites = [], note]) => {
    const id = rid(code), sourceIds = [source.catalog, source.program];
    const row = {
      id, code, title, credits: 4, category: 'major', group: 'business-core',
      subgroup: 'business-core', upper: Number(code.split('-')[1]) >= 300,
      sourceIds, options: [universityOption(id, code, title, sourceIds)],
      minimumGrade: 'C', minimumGradeSourceIds: [source.graduation],
    };
    if (prerequisites.length) Object.assign(row, {prerequisites: prerequisites.map(rid), prerequisiteSourceIds: [source.program]});
    if (note) row.prerequisiteNotes = note;
    if (code === 'BUS-340' || code === 'BUS-485') Object.assign(row, {writingIntensive: true, writingIntensiveSourceIds: [source.catalog, source.program]});
    if (code === 'BUS-485') row.capstone = true;
    return row;
  });
  const electives = electiveCourses.map(([code, title, identitySource], index) => {
    const id = 'open-' + rid(code), sourceIds = [source.catalog, source.electives, identitySource];
    return {
      id, title: 'Open elective ' + (index + 1), credits: 4, category: 'elective',
      group: 'open-electives', subgroup: 'open-electives', upper: false,
      freeElective: true, excludeAlreadyUsed: true, sourceIds,
      options: [universityOption(id, code, title, sourceIds)],
      choiceNote: 'Named, nonduplicating university course selected inside the 16-credit open elective allowance. Other acceptable electives may replace it; this is not a required receiving-course equivalency.',
    };
  });
  const requirements = [...general, ...major, ...electives];
  const evidence = (value, sourceIds, scope) => ({value, creditSystem: 'semester', sourceIds, scope});
  const section = (id, title, rows, parentId) => ({id, title, parentId, requirementIds: rows.map(row => row.id), sourceId: source.catalog});
  const catalogIdentity = {kind: 'published-catalog-edition', label: 'Fall 2026 · 2026–2027 Academic Catalog', sourceUrl: catalogUrl, checkedOn};
  const model = {
    id: modelId, routeIds: [routeId], school: 'Grand Canyon University',
    title: 'Bachelor of Science in Business Administration', level: 'bachelor',
    format: 'Residential', modalities: ['campus'], paceModel: 'course-term',
    defaultProviders: [], catalog: 'Fall 2026 · 2026–2027', catalogYear: '2026-2027', catalogIdentity,
    creditSystem: 'semester', totalCredits: 120,
    institutionMinCredits: 30, externalMaxCredits: 90, alternativeMaxCredits: 30,
    upperMinCredits: 36, upperGroupMinimums: [{group: 'business-core', credits: 36}],
    requirements, sources, evidenceCheckedOn: checkedOn,
    coverage: 'complete', completeExecutablePathway: false,
    coverageLabel: 'Complete 120-credit campus curriculum with named university choices; outside-course awards must be researched separately.',
    curriculumAllocation: {
      generalEducation: {minCredits: 34, maxCredits: 40, selectedCredits: 40, sourceIds: [source.catalog, source.program]},
      major: {credits: 64, sourceIds: [source.catalog, source.program]},
      openElectives: {minCredits: 16, maxCredits: 22, selectedCredits: 16, sourceIds: [source.catalog, source.program]},
      scope: 'The selected native-course baseline uses 40 general education plus 64 major plus 16 open electives. Published ranges permit a different transfer-credit allocation; they do not award unearned credits or waive 120 total.',
    },
    generalEducationMinimums: [
      {group: 'gcu-foundations', credits: 4, sourceIds: [source.general]},
      {group: 'gcu-communication', credits: 9, sourceIds: [source.general]},
      {group: 'gcu-worldview', credits: 4, sourceIds: [source.general]},
      {group: 'gcu-critical-thinking', credits: 11, sourceIds: [source.general]},
      {group: 'gcu-global-awareness', credits: 6, sourceIds: [source.general]},
    ],
    curriculumSections: [
      section('gcu-foundations', 'University Foundations', general.filter(row => row.group === 'gcu-foundations'), 'general'),
      section('gcu-communication', 'Effective Communication', general.filter(row => row.group === 'gcu-communication'), 'general'),
      section('gcu-worldview', 'Christian Worldview', general.filter(row => row.group === 'gcu-worldview'), 'general'),
      section('gcu-critical-thinking', 'Critical Thinking', general.filter(row => row.group === 'gcu-critical-thinking'), 'general'),
      section('gcu-global-awareness', 'Global Awareness, Perspectives and Ethics', general.filter(row => row.group === 'gcu-global-awareness'), 'general'),
      section('gcu-business-major', 'Business Administration Major', major, 'major'),
      section('gcu-open-electives', 'Open Electives', electives, 'elective'),
    ],
    policyEvidence: {
      institutionMinCredits: evidence(30, [source.graduation], 'Explicit bachelor residency: at least 30 semester credits of coursework in a GCU program. This value is not inferred from the 90-credit transfer ceiling.'),
      externalMaxCredits: evidence(90, [source.transfer], 'Overall undergraduate transfer ceiling; individual applicability and the remaining graduation requirements still constrain actual use.'),
      alternativeMaxCredits: evidence(30, [source.transfer, source.alternative], 'One combined ceiling across alternative sources, not 30 per provider. Military-school/training credit has its separately stated ceiling and still counts toward the overall transfer limit.'),
      upperMinCredits: evidence(36, [source.graduation], 'At least 36 semester credits in 300-or-higher courses; Major/Core also requires at least 36 upper-division credits in the major.'),
    },
    policySourceIds: [source.transfer, source.alternative, source.graduation, source.creditBalance, source.placement],
    gradePolicy: {minimumGrade: 'C', scope: 'outside-undergraduate-transfer-and-major-courses', sourceIds: [source.transfer, source.graduation], checked: checkedOn, detail: 'Undergraduate transfer generally requires C or better; pass grades must equate to C. Major coursework requires C or better; the student must maintain overall and major GPA 2.0. This does not assert a blanket C floor for every native elective.'},
    transferPolicyReview: {
      checked: checkedOn, alternativeMaxCredits: 30, alternativeMaxScope: 'Combined alternative sources.',
      lowerDivisionMaxCredits: 84, militaryTrainingMaxCredits: 30,
      duplicatesCountOnce: true, requiredInstitutionalCourses: ['CWV-101'],
      sourceIds: [source.transfer, source.alternative, source.graduation, source.general],
      residencyNote: 'At least 30 semester credits must be earned in a GCU program; 36 upper credits in the major must remain satisfied independently of content substitutions.',
      sourceTranscriptRequired: true,
      thirdPartyTranscriptAccepted: false,
    },
    degreeCreditBalancePolicy: {
      kind: 'content-and-earned-credit-separate', sourceIds: [source.transfer, source.alternative, source.creditBalance],
      minimumDegreeCredits: 120, inflateSourceCredits: false,
      lowerDivisionContentMatchEarnsUpperCredit: false,
      permittedShortfallCategories: ['major', 'elective'], prohibitedShortfallCategories: ['general'],
      shortfallMechanism: 'GCU Service Learning coursework may fill a transfer-related credit shortfall in the major/elective category. Specific eligible service-learning course, credit amount and applicability must be independently established before generating a transfer scenario.',
      note: 'A receiving-course content match is not evidence that a 3-credit source earns 4 degree credits. Preserve the actual transcript quantity and level; an exact transfer scenario must separately reach 120, the general education minima and 36 upper-major credits.',
      courseIdentityCandidates: [
        {code: 'LDR-461', title: 'Professional Applications in Service Learning I', credits: 1, creditSystem: 'semester', upper: true, volunteerHours: 10, sourceIds: [source.serviceOne]},
        {code: 'LDR-462', title: 'Professional Applications in Service Learning II', credits: 2, creditSystem: 'semester', upper: true, volunteerHours: 20, sourceIds: [source.serviceTwo]},
        {code: 'LDR-463', title: 'Professional Applications in Service Learning III', credits: 3, creditSystem: 'semester', upper: true, sourceIds: [source.serviceThree]},
      ],
      repeatabilityEstablished: false,
      automaticRepeatAllowed: false,
      noteOnCandidates: 'Current official course identities are research inputs, not additional requirements inside the native 120-credit ledger. Each listed identity is distinct. No repeatable credit allowance or guaranteed simultaneous enrollment in all three was established by this review.',
    },
    foundationsWaiver: {modality: 'campus', minimumTransferredCollegeCredits: 24, minimumGPA: 3, creditAward: 0, automatic: false, sourceIds: [source.graduation], note: 'Traditional campus students meeting both conditions can waive University Foundations. The waiver does not create earned credits or reduce the 120-credit degree minimum; this baseline retains the course.'},
    writingIntensiveRule: {
      minimumCourses: 3, minimumMajorCourses: 2, minimumUpperMajorCourses: 1,
      requiredCompositionRequirementId: 'eng105', selectedNativeMajorRequirementIds: ['bus340', 'bus485'],
      sourceIds: [source.graduation, source.catalog],
      transferTreatment: 'A content-equivalent outside course must separately satisfy the writing-intensive graduation requirement; the receiving-course label alone does not establish the source designation. Retain the native major options unless a reviewed equivalent designation or a separately researched replacement meets the rule.',
    },
    graduationRequirements: [
      {id: 'gcu-gpa', title: 'Overall and major GPA', description: 'At least 2.0 overall and major GPA; no grade below C may count toward the major.', sourceIds: [source.graduation]},
      {id: 'gcu-writing-intensive', title: 'Writing-intensive coursework', description: 'Complete at least three designated writing-intensive courses: ENG-105 or its equivalent and two in the major, at least one upper division. The selected native baseline includes ENG-105, ENG-106, BUS-340 and BUS-485.', requirementIds: ['eng105', 'eng106', 'bus340', 'bus485'], sourceIds: [source.graduation, source.general, source.catalog]},
      {id: 'gcu-campus-placement', title: 'Campus mathematics and English placement', description: 'Meet the campus placement/approved-prerequisite conditions before registering in MAT-144 and ENG-105. Any needed developmental preparation is separate from the 120 degree-credit ledger.', sourceIds: [source.placement]},
    ],
    rulesNotes: [
      'Selected native allocation: 40 general education + 64 required major + 16 open electives = 120 semester credits; no requirement is counted twice.',
      'The required major is the current sixteen-course 64-credit BSBA. ACC-250/ACC-260 are not inferred substitutes for its current ACC-240 requirement.',
      'General education course choices and open electives are selections within published competencies/allowances, not claims that every student must take these exact electives.',
      'Lower-division transfer can satisfy the content of an upper-division course but cannot satisfy upper-division credit minima. Major upper-division credit is a separate 36-credit rule.',
      'Published transfer ceilings are not course-level awards. No Sophia, Study.com, CLEP, NCCRS or institutional-equivalency option is fabricated by this curriculum importer.',
      'Campus transfer foundations waivers require both 24 college-level credits and 3.0 GPA. The baseline does not assume either personal eligibility fact.',
      'Registration offerings, individual admission/catalog assignment and personal transfer evaluation remain institution-controlled; no graduation date or tuition estimate is invented.',
    ],
    unresolved: [],
  };
  validateGCUCampusBSBA(model);
  const route = {id: routeId, parentId: 'gcu-bachelor-of-science-in-business-administration', title: model.title, school: model.school, schoolId: 'gcu', level: 'bachelor', modalities: ['campus'], paceModel: 'course-term', url: programUrl, sourceId: source.program, degreeCredits: 120, creditUnit: 'semester', status: 'listed', checkedOn};
  return {version: 1, checkedOn, routes: [route], models: [model]};
}

export function validateGCUCampusBSBA(model) {
  assert.equal(model.id, modelId);
  assert.deepEqual(model.routeIds, [routeId]);
  assert.equal(model.creditSystem, 'semester');
  assert.equal(model.totalCredits, 120);
  assert.equal(model.requirements.length, 30);
  assert.equal(new Set(model.requirements.map(row => row.id)).size, 30);
  assert.equal(model.requirements.reduce((total, row) => total + row.credits, 0), 120);
  assert.equal(model.requirements.filter(row => row.category === 'general').reduce((total, row) => total + row.credits, 0), 40);
  assert.equal(model.requirements.filter(row => row.category === 'major').reduce((total, row) => total + row.credits, 0), 64);
  assert.equal(model.requirements.filter(row => row.category === 'elective').reduce((total, row) => total + row.credits, 0), 16);
  const ids = new Set(model.requirements.map(row => row.id)), sources = new Set(model.sources.map(item => item.id));
  assert.equal(sources.size, model.sources.length);
  const codes = new Set();
  for (const row of model.requirements) {
    assert(row.sourceIds.length && row.sourceIds.every(id => sources.has(id)), 'Requirement needs reviewed sources: ' + row.id);
    assert.equal(row.credits, 4, 'Do not silently resize native GCU courses.');
    assert.equal(row.options.length, 1);
    const option = row.options[0];
    assert.equal(option.provider, 'University', 'Transfer awards require separate source research.');
    assert.equal(option.credits, 4);
    assert.equal(option.creditOrigin, 'institutional');
    assert.equal(option.creditSystem, 'semester');
    assert(!codes.has(option.code), 'Duplicate university selection ' + option.code); codes.add(option.code);
    assert(option.sourceIds.length && option.sourceIds.every(id => sources.has(id)));
    for (const prerequisite of row.prerequisites || []) assert(ids.has(prerequisite), 'Selected prerequisite absent: ' + prerequisite);
    if (row.prerequisites?.length) assert(row.prerequisiteSourceIds?.length && row.prerequisiteSourceIds.every(id => sources.has(id)));
  }
  const assigned = model.curriculumSections.flatMap(section => section.requirementIds);
  assert.equal(assigned.length, ids.size); assert.equal(new Set(assigned).size, ids.size);
  assert(assigned.every(id => ids.has(id)));
  for (const key of ['institutionMinCredits', 'externalMaxCredits', 'alternativeMaxCredits', 'upperMinCredits']) {
    assert.equal(model.policyEvidence[key].value, model[key]);
    assert(model.policyEvidence[key].sourceIds.every(id => sources.has(id)));
  }
  assert.deepEqual(model.upperGroupMinimums, [{group: 'business-core', credits: 36}]);
  assert.equal(model.generalEducationMinimums.reduce((sum, rule) => sum + rule.credits, 0), 34);
  assert.equal(model.degreeCreditBalancePolicy.inflateSourceCredits, false);
  assert.equal(model.foundationsWaiver.creditAward, 0);
  assert.equal(model.completeExecutablePathway, false);
  return model;
}

export async function run({check = false} = {}) {
  const result = buildGCUCampusBSBA();
  if (check) assert.deepEqual(JSON.parse(await readFile(resolve(root, outputPath), 'utf8')), result, 'GCU reviewed curriculum needs regeneration.');
  else await writeFile(resolve(root, outputPath), JSON.stringify(result, null, 2) + '\n');
  return {model: modelId, requirements: 30, generalCredits: 40, majorCredits: 64, electiveCredits: 16, credits: 120, transferAwardsAdded: 0, check};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run({check: process.argv.includes('--check')}).then(result => console.log(JSON.stringify(result))).catch(error => {console.error(error.message); process.exitCode = 1;});
