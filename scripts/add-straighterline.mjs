/**
 * Reviewed and applied 2026-11-01. Idempotent source-model import:
 *   node scripts/add-straighterline.mjs --apply
 * Without --apply this script reports the proposal and does not write files.
 * No TESU rows: an official named TESU equivalency table was not recovered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checked = '2026-11-01';
const guideUrl = 'https://www.liberty.edu/residential/wp-content/uploads/Straighterline-Transfer-Equivalency-Guide-Finalized.pdf';
const sourceId = 'liberty-straighterline-residential-2026-04';

// [modeled requirement, original ACE ID, provider course code, provider title,
//  exact published Liberty receiving code, destination upper level]
export const candidates = [
  ['engl-101', 'OOSL-0005', 'ENG101', 'English Composition I', 'ENGL 101', false],
  ['engl-102', 'OOSL-0006', 'ENG102', 'English Composition II', 'ENGL 102', false],
  ['math-115', 'OOSL-0108', 'MAT102', 'Quantitative Reasoning', 'MATH 115', false],
  ['govt-220', 'OOSL-0063', 'POLS101', 'American Government', 'GOVT 220', false],
  ['envr-215', 'OOSL-0055', 'ENV101', 'Introduction to Environmental Science', 'ENVR 215', false],
  ['busi-105', 'OOSL-0001', 'BUS101', 'Introduction to Business', 'BUSI 105', false],
  ['busi-223', 'OOSL-0036', 'FIN101', 'Personal Finance', 'BUSI 223', false],
  ['busi-240', 'OOSL-0042', 'BUS120', 'Organizational Behavior', 'BUSI 240', false],
  ['econ-213', 'OOSL-0008', 'ECON102', 'Microeconomics', 'ECON 213', false],
  ['econ-214', 'OOSL-0007', 'ECON101', 'Macroeconomics', 'ECON 214', false],
  ['busi-342', 'OOSL-0125', 'HRM200', 'Human Resource Management', 'BUSI 342', true],
  ['hius-221', 'OOSL-0039', 'USHIST101', 'United States History I', 'HIUS 221', false],
  ['hius-222', 'OOSL-0044', 'USHIST102', 'United States History II', 'HIUS 222', false],
  ['psyc-101', 'OOSL-0027', 'PSY101', 'Introduction to Psychology', 'PSYC 101', false],
  ['psyc-210', 'OOSL-0107', 'PSY120', 'Life-Span Development', 'PSYC 210', false],
  ['soci-200', 'OOSL-0035', 'SOC101', 'Introduction to Sociology', 'SOCI 200', false],
  ['phil-201', 'OOSL-0060', 'PHIL101', 'Introduction to Philosophy', 'PHIL 201', false],
  ['waiver-coms-101', 'OOSL-0052', 'COM101', 'Introduction to Communications', 'COMS 101', false],
  ['waiver-hlth-216', 'OOSL-0059', 'PE101', 'Personal Fitness & Wellness', 'HLTH 216', false]
];

export function prepare(program) {
  if (program.id !== 'liberty-business-residential' || program.format !== 'Residential') throw new Error('Expected the reviewed Liberty residential model.');
  const next = structuredClone(program);
  next.sources ||= [];
  const existingSource = next.sources.find(source => source.id === sourceId);
  if (existingSource && existingSource.url !== guideUrl) throw new Error('Conflicting source identity.');
  if (!existingSource) next.sources.push({
    id: sourceId,
    title: 'Liberty residential StraighterLine transfer equivalency guide · updated April 2026',
    url: guideUrl,
    checked,
    evidenceType: 'official-receiving-school-equivalency',
    guideUpdated: '2026-04',
    scope: 'Exact named awards in the existing residential degree ledger; not generic elective substitution. BUS101 explicitly distinguishes BUSI 105 (Res) from BUSI 101 (LUO).',
    verification: 'Official residential-hosted PDF retrieved in web research; one-page table and April-2026 footer read. Current ACE recommendation versions/windows and individual catalog applicability remain unverified.'
  });
  let added = 0;
  const ledgers = [{ label: 'base', requirements: next.requirements }];
  if (next.transferWaiverVariant) ledgers.push({ label: 'waiver', requirements: next.transferWaiverVariant.requirements });
  for (const ledger of ledgers) for (const [requirementId, aceId, providerCourseCode, title, receivingCode, upper] of candidates) {
    const requirement = ledger.requirements.find(row => row.id === requirementId);
    if (!requirement && ledger.label === 'base' && requirementId.startsWith('waiver-')) continue;
    if (!requirement || requirement.code !== receivingCode || requirement.credits !== 3 || requirement.institutionalOnly) throw new Error('Reviewed requirement changed: ' + ledger.label + '/' + requirementId);
    const id = 'straighterline-' + aceId.toLowerCase();
    const old = requirement.options.find(option => option.id === id);
    if (old) {
      if (old.provider !== 'StraighterLine' || old.code !== aceId || old.receivingCode !== receivingCode || old.credits !== 3) throw new Error('Conflicting existing option: ' + id);
      continue;
    }
    requirement.options.push({
      id, provider: 'StraighterLine', title, code: aceId, codeType: 'ace-course-id',
      providerCourseCode, codeAliases: [providerCourseCode], sourceCredits: 3, sourceCreditSystem: 'semester', credits: 3, upper, receivingCode,
      sourceIds: [sourceId], evidence: 'conditional',
      evidenceType: 'official-receiving-school-equivalency',
      mappingChecked: checked, guideUpdated: '2026-04',
      courseVersion: null, recommendationStart: null, recommendationEnd: null,
      effortHours: null, url: guideUrl,
      assessmentFormat: null, proctoringRequired: null,
      costVerified: false,
      conditions: [
        'Liberty’s residential-hosted April 2026 StraighterLine guide publishes ' + providerCourseCode + ' / ' + aceId + ' → ' + receivingCode + ', 3 semester credits. This is the exact named receiving course in this ledger.',
        'Confirm the current StraighterLine course version and ACE recommendation period covering the completion date. This guide does not state those version/date windows; they remain unknown.',
        'Obtain Liberty confirmation that this award applies to your residential catalog and individual degree plan before purchase. Published equivalency is not an individual transfer award or campus residency credit.',
        'Confirm this specific course’s assessment format, identity checks, proctoring requirements and any accommodations directly with StraighterLine before enrolling. Assessment/proctoring format was not independently verified.',
        'StraighterLine membership, per-course charges, plan exclusions, proctoring/retake fees, materials and tax are not priced in this option. A missing price is unknown, never zero.',
        ...(upper ? ['Upper-level classification follows the published Liberty BUSI 342 receiving course, not an assumption about the original provider recommendation.'] : []),
        ...(requirementId === 'busi-105' ? ['Use the guide’s explicit residential BUSI 105 award; its online BUSI 101 alternative is a different course.'] : [])
      ]
    });
    added++;
  }
  next.pricingNotes ||= [];
  const note = 'StraighterLine candidates have unknown complete pricing and unverified assessment/proctoring details; the planner must flag missing StraighterLine pricing rather than treat their costs as zero.';
  if (!next.pricingNotes.includes(note)) next.pricingNotes.push(note);
  return { program: next, added };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.join(root, 'dist/data/liberty.json');
  const { program, added } = prepare(JSON.parse(fs.readFileSync(target, 'utf8')));
  if (process.argv.includes('--apply')) {
    fs.writeFileSync(target, JSON.stringify(program, null, 2) + '\n');
    console.log('Added ' + added + ' conditional Liberty StraighterLine options. TESU unchanged.');
  } else console.log('Prepared ' + candidates.length + ' named Liberty StraighterLine candidates (' + added + ' new); no files written. Review docs/straighterline-mappings-review.md before applying.');
}
