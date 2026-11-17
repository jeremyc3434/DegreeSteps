# TESU conditional course-map expansion

Reviewed the local canonical snapshots checked October 30, 2026. No network requests or fresh provider availability checks were performed. Changed only `dist/data/tesu.json` and this audit.

The 120-credit General Management ledger, requirement IDs, selected major courses, 18-credit total upper-level minimum, 12-credit AOS upper-level minimum, 15-credit normal local residency and 90-credit combined alternative-source cap remain intact.

## Coverage and validation

| Measure | Before | After |
|---|---:|---:|
| Requirement credits with at least one outside candidate | 39 | 93 |
| Exact or disclosed legacy receiving-course / specific unrestricted-elective candidates | 39 | 87 |
| Additional explicitly identified science-category replacement candidates | 0 | 6 |
| Outside option entries | 16 | 58 |
| Source records | 15 | 22 |

The 93 credits describe candidate coverage across the library. **They do not describe a feasible 93-credit alternative-source plan.** With conditional mappings enabled, the existing transfer, speed and cost generators each return 120 accounted credits, 90 alternative/outside credits, 30 university credits and 30 upper-level credits under the checked scenario. All 38 existing planner checks pass. With conditional mappings disabled, none of the new options is selected.

The current source basket contains only alternative providers; it cannot supply the other 15 outside institutional-source credits needed to approach the separate 105-credit overall transfer ceiling. Its 30 university-credit result is not a claim that TESU policy mandates 30 local credits. The standard local minimum remains 15; eligible accredited institutional transfer would require additional verified mappings.

## Source decisions

- [Sophia equivalency list](https://degreeforum.miraheze.org/wiki/Sophia.org_Equivalency_List), revision **6816**, last edited July 17, 2026, describes rough transfers as of January 2026. Added exact reported ACC-1020, CIS-1070, STA-2010, PHI-1300 and upper-level MAN-3110 candidates; also disclosed legacy-code candidates for writing, public speaking, history, law, government, sociology and economics. Original provider titles serve as identities when the source provides no course number; no ACE IDs or versions were invented.
- [Accounting plan](https://degreeforum.miraheze.org/wiki/Sample_TESU_BSBA_Accounting_Degree_Plan), revision **6620**, last edited December 16, 2025, scoped November 2025: Study.com Accounting 201 → ACC-2010, Accounting 303 → ACC-3030, and Accounting 302 → ACC-4010. The inconsistent reported Accounting 302 title is an explicit condition.
- [Finance plan](https://degreeforum.miraheze.org/wiki/Sample_TESU_BSBA_Finance_Degree_Plan), revision **6587**, last edited November 14, 2025: Study.com Finance 302 → FIN-3340 and Finance 303 → FIN-3310, reported upper level.
- [Organizational Leadership plan](https://degreeforum.miraheze.org/wiki/Sample_TESU_BS_Organizational_Leadership_Degree_Plan), revision **5982**, last edited October 14, 2024, scoped August 2022: Study.com Business 307 → legacy MAN-311 and Business 324 → legacy MAN-373, reported upper level. Legacy-to-current normalization remains conditional.
- [Certificate plans](https://degreeforum.miraheze.org/wiki/Sample_TESU_Certificate_Plans), revision **5984**, last edited October 14, 2024: explicit Study.com Accounting 102 → legacy ACC-102 candidate.
- [General education roadmap](https://degreeforum.miraheze.org/wiki/Sample_TESU_General_Education_Requirements_Roadmap), revision **6573**, last edited November 11, 2025, supplements the existing catalog category ledger. Four unrestricted elective slots offer four distinct Sophia receiving-award candidates: BUS-1010, MAN-2350, PHI-1800 and conditionally normalized PHI-2260. Provider-course uniqueness prevents using one course repeatedly. University placeholders still require a specific course selection.

Scientific Knowledge rows preserve their original featured-course IDs/codes and identify themselves as category choices. Proposed Sophia Human Biology → **BIO-1010** and Introduction to Nutrition → **NUT-1010** are explicit category substitutions. They are **not** EAS-1010 or BIO-2080 equivalencies. Current catalog placement and nonduplication require TESU confirmation. Each option exposes its actual `receivingCode`; each requirement exposes `categoryLabel`, `categoryAllowed` and `allocationType`.

Every new option is conditional and includes the canonical source URL, revision, scope date, local review date, unknown version/recommendation windows, provider-directory qualification and individual approval condition. Source dates do not become provider availability claims or completion-time estimates.

## Explicit inventory identifier aliases

On October 31, 2026, curated explicit `codeAliases` for 12 exact Sophia course identities using the preloaded [official Liberty Sophia equivalency guide](https://www.liberty.edu/residential/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf), May 2026, checked October 28, 2026. These identify original Sophia learning only; Liberty's receiving awards and awarded levels do not establish TESU acceptance or course-version eligibility. The new source record is explicitly scoped to provider identity, and each affected option retains its TESU source chain, conditional status and version/date conditions.

| Exact original Sophia title | Inventory alias |
|---|---|
| English Composition I | SOPH-0015 |
| English Composition II | SOPH-0030 |
| Introduction to Sociology | SOPH-0051 |
| U.S. Government | SOPH-0071 |
| US History I | SOPH-0022 |
| US History II | SOPH-0025 |
| Critical Thinking | SOPH-0065 |
| Macroeconomics | SOPH-0012 |
| Microeconomics | SOPH-0011 |
| Organizational Behavior | SOPH-0083 |
| Introduction to Business | SOPH-0014 |
| Ancient Greek Philosophers | SOPH-0027 |

Those 12 identities cover 18 option entries because the two free-elective identities occur in four alternative slots. Two existing options also receive explicit aliases from their own already-recorded ACE identifiers: College Algebra → SOPH-0001 and Financial Accounting → SOPH-0010. Total: **20 aliased option entries, 14 distinct identities**. No runtime title guessing was introduced. Unmatched courses remain unaliased.

The SOPH-0051 alias attaches only to the exact current **Introduction to Sociology** title. It does not attach to the retired “Embracing Diversity and Collaboration” subtitle variant. Organizational Behavior keeps the TESU report's conditional upper-level award; Liberty's lower-level receiving award is not copied. No exact recommendation dates or course versions were inferred from the shared identifiers. The existing 38 planner checks still pass after adding the aliases.

Actual-data integration probes passed for all 20 aliased TESU option entries: earned inventory projects as reported pending TESU evaluation, a different provider does not match, alias/canonical copies remain one action, and planner totals retain 120 credits with no more than 90 alternative credits.

## Unresolved work

No exact current outside mapping was established for ETH-2200, FIN-3010, BUS-2100, MAN-3720 or MAN-3310. SOC-2100 and FIL-1100 remain featured Human Cultures selections without new outside candidates. These 21 credits are research gaps, not established university-only courses.

Do not map Sophia FIN-200 to FIN-3010, COM-202 to MAN-3730, or MKT-3010 to MKT-2010. Do not map Study.com Business 306's reported HRM-331 award to MAN-3310. These similar titles have distinct receiving awards.

The corpus also reports TECEP and Coopersmith/Davar possibilities. They remain excluded from selectable options because current availability and independent institutional-source, local-residency, alternative-source and duplicate-award treatment are not established in this engine. The source catalog can expose those routes for research without allowing them to evade credit caps.
