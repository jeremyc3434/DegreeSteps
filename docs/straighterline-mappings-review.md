# StraighterLine mapping review

Prepared November 1, 2026. **Applied after review.** The official residential PDF was independently re-opened, exact course identifiers were checked, and the script was applied to the current Liberty model. The idempotent command `node scripts/add-straighterline.mjs --apply` adds the 17 conditional Liberty options below to both the base ledger and the qualifying-transfer waiver variant, plus two exact options unique to the waiver ledger (36 option placements total). Without `--apply`, it does not write files. The script validates the model ID, residential format, exact requirement codes and credit amounts before adding anything.

## Official residential evidence

The [Liberty residential StraighterLine guide](https://www.liberty.edu/residential/wp-content/uploads/Straighterline-Transfer-Equivalency-Guide-Finalized.pdf) was successfully retrieved and its one-page table read. Its footer says updated April 2026. This is the residential-hosted document, not an inference from the separate online PDF. Its BUS101 row expressly distinguishes **BUSI 105 (Res)** from **BUSI 101 (LUO)**.

The following are exact receiving-course matches to the existing `liberty-business-residential` ledger. All are three semester credits. BUSI 342 is upper level at Liberty; the others are lower level. The provider course number and original ACE ID remain separate identifiers.

| Requirement | StraighterLine course | ACE ID | Liberty award |
|---|---|---|---|
| `engl-101` | ENG101 English Composition I | OOSL-0005 | ENGL 101 |
| `engl-102` | ENG102 English Composition II | OOSL-0006 | ENGL 102 |
| `math-115` | MAT102 Quantitative Reasoning | OOSL-0108 | MATH 115 |
| `govt-220` | POLS101 American Government | OOSL-0063 | GOVT 220 |
| `envr-215` | ENV101 Introduction to Environmental Science | OOSL-0055 | ENVR 215 |
| `busi-105` | BUS101 Introduction to Business | OOSL-0001 | BUSI 105 (Res) |
| `busi-223` | FIN101 Personal Finance | OOSL-0036 | BUSI 223 |
| `busi-240` | BUS120 Organizational Behavior | OOSL-0042 | BUSI 240 |
| `econ-213` | ECON102 Microeconomics | OOSL-0008 | ECON 213 |
| `econ-214` | ECON101 Macroeconomics | OOSL-0007 | ECON 214 |
| `busi-342` | HRM200 Human Resource Management | OOSL-0125 | BUSI 342 |
| `hius-221` | USHIST101 United States History I | OOSL-0039 | HIUS 221 |
| `hius-222` | USHIST102 United States History II | OOSL-0044 | HIUS 222 |
| `psyc-101` | PSY101 Introduction to Psychology | OOSL-0027 | PSYC 101 |
| `psyc-210` | PSY120 Life-Span Development | OOSL-0107 | PSYC 210 |
| `soci-200` | SOC101 Introduction to Sociology | OOSL-0035 | SOCI 200 |
| `phil-201` | PHIL101 Introduction to Philosophy | OOSL-0060 | PHIL 201 |

These cover **51 distinct requirement credits** in each ledger, all as conditional candidates. The waiver variant also has exact named matches for `waiver-coms-101`: COM101 Introduction to Communications / OOSL-0052 → COMS 101 (3 credits), and `waiver-hlth-216`: PE101 Personal Fitness & Wellness / OOSL-0059 → HLTH 216 (3 credits), bringing that variant to **57 matched requirement credits**. Its ARTS 201 replacement remains unmatched. The variant’s waiver eligibility remains separately conditional; these are actual elective course awards and do not attribute credits to waived requirements.

These mappings do not establish that every option can be used together while retaining Liberty residence, major-residence and upper-level minima. Existing planner validation must still enforce those rules. The [residential admissions transfer page](https://www.liberty.edu/residential/undergraduate/transfer-students/) distinguishes unofficial consultation from the official evaluation after acceptance and receipt of official transcripts; the script does not claim an individual award.

No exact version number or ACE recommendation start/end dates are supplied by this guide. Every option therefore keeps `courseVersion`, `recommendationStart` and `recommendationEnd` null and retains conditional evidence until the current course, completion-date window and individual residential applicability are confirmed. The April 2026 guide update is not an ACE effective date.

## Deliberately excluded mismatches

The same official guide maps ACC101, ACC102 and ACC151 to **ACCT 1XX**, not ACCT 211 or ACCT 212. ACC150 receives **ACCT 3XX**, not ACCT 370. BUS110 Business Law and BUS106 Business Ethics receive **BUSI 1XX**, not BUSI 301. BUS102 Marketing receives **BUSI 1XX**, not BUSI 330. IT101 receives **CSIS 1XX**, not BUSI 201. ART101 receives **ARTS 105**, not ARTS 209. None was imported into these named requirements.

MAT150 receives BUSI 230 and MAT202 receives MATH 201; the guide notes their crosslisting, but neither named course is in this particular modeled ledger. College Algebra receives MATH 121, not the model’s MATH 115. Introductory philosophy receives PHIL 201 and was added only there, not PHIL 210. Generic elective awards were not attached to unrelated selected free-elective rows, and three-credit awards were not forced into the one-credit elective slots.

## TESU evidence and blocker

The [TESU approved-provider directory](https://www.tesu.edu/admissions/methods-of-earning-credit/provider-directory.php) was retrieved and currently places StraighterLine under **Provisionally Approved – Review Pending**. This is provider-status evidence, not an exact course mapping or proof of rejection.

The old [provider TESU equivalency URL](https://www.straighterline.com/colleges/thomas-edison-state-university/course-equivalency/) redirects to its [TESU partnership marketing page](https://www.straighterline.com/colleges/thomas-edison-state-university/). The fetched text contains a Course Equivalency Guide heading but no named receiving-course table. Consequently **zero TESU options are imported**. Historic DegreeForum matches and Liberty awards are not substituted for current TESU equivalency evidence. Exact current provider versions, TESU receiving codes, levels and applicable recommendation dates remain to be recovered before expanding that model.

## Price, assessment and integration limits

No course-specific assessment/proctoring policy was independently verified. Every added option explicitly requires confirmation of its current assessment format, identity checks, proctoring and accommodations. `assessmentFormat` and `proctoringRequired` remain null; these candidates must not be marketed as unproctored.

The retrieved StraighterLine partnership page advertises membership plus course fees and longer plans, but contains conflicting annual prices ($1,299 and $1,499). It is insufficient for a complete selected-course quote. Membership, course fees, excluded courses, lab/material charges, proctoring/retakes, tax and transcript costs remain unknown. The script adds a pricing note and no numeric zero-price assumption.

`planner.js` already recognizes StraighterLine as alternative credit. `availableOptions` admits conditional options only with `allowConditional: true`; planned conditional rows remain validation blockers. `costModel` flags unrecognized providers with “StraighterLine pricing,” so a total remains incomplete. The UI must expose the mapped provider dynamically (parent task) and show unknown pricing; this script does not modify planner or UI code.

Only the existing models’ named requirements were considered. This review does not redefine either degree, import all of the provider’s generic credits, or claim that 51 credits of mappings are a complete executable Liberty pathway.
