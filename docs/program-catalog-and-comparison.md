# Program catalog and shared-credit scenarios

Program availability and degree-transfer mappings are separate data layers. A program listing is not a promise of transferability, admission, online delivery or professional licensure. Existing Liberty residential business and TESU general-management models remain specific to their exact degrees; they are never attached to every degree at those schools.

## Official directory coverage

The first source-linked snapshot imports 508 degree listings: Liberty 387, SNHU 32 online bachelor's listings, WGU 66 degree listings, and UMPI 23 YourPace awards. Existing researched pathways remain available. The Liberty import follows the 2026–2027 official Programs A–Z index and excludes minors and certificates. Its parent listings do not establish online/campus delivery; unknown delivery stays unknown. The UMPI parser excludes partner-university awards and expands only degree awards explicitly present in its directory.

These are explicit source scopes, not complete national coverage. TESU and other schools still have the previously researched pathways and exact free-text target fallback. Adding complete official directories for those institutions is further catalog work. Broad course-equivalency coverage is a separate, larger research task.

`content/catalog/sources.json` records each directory URL, scope, fetched-at timestamp, HTML hash and imported count. `scripts/import-program-catalog.py --fetch` refreshes these sources without a paid AI call. Cached HTML can be reprocessed with `--cache-dir PATH`; its original file timestamp is retained as the source-check date. Builds consume the checked-in snapshot and never fetch websites. Source failures, unexpectedly small imports, and drops greater than 20% abort before replacing the published dataset. No monthly automation is configured; this command supports a scheduled review process.

`GET /api/catalog/programs` supports school, search phrase, degree level, known modality and pagination. `GET /api/catalog/coverage` reports exact source coverage. These cached public endpoints never receive private student courses. Program search also runs locally against the same versioned snapshot. Exact unlisted targets remain editable, so a directory gap cannot replace a student's goal with an unrelated degree.

## What-if comparison

Compare plans uses one live `state.learning` library across up to three degree scenarios. Saved versions capture only a target, priority and program-specific planning/savings settings, with no copied learning or private notes. School evaluations remain scoped to their exact receiving program. Switching active plans explicitly saves the previous choices and retains original records, private notes and other program settings.

Each scenario is rebuilt from the same records with Journey/Guide/Planner; academic conflicts pause numerical claims. Completed courses use allocated destination credits, with required/elective and confirmed/reported breakdowns. Original quarter/semester units remain on the source record. Alias and bundle identities prevent the same source action from being counted twice. University source identities also include institution and source program.

In-progress records, planned library courses and proposed external choices from compared plans remain prospective. Their matrix cells test potential use independently, with existing completed courses held fixed. They never increase earned totals; they do not establish that all prospective choices fit jointly. An unmapped or unmatched course says Needs evaluation, not rejected or wasted. A known candidate course can be checked before changing the active plan, using a validated provider/code pair.

Tuition left prices only university work still planned, using actual billing bands and partial final loads. Outside-course spending, other fees, books, living costs and financial aid remain excluded. Research gaps are priced as university fallback, not declared university-only requirements. TESU's published default is standard nonresident pricing. Full study duration requires pace inputs; unlike terms can have different lengths and are not ranked directly as if equivalent. Comparisons never award a degree or carry school approval to a different program.
