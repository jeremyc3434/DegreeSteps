# Reviewed Liberty online psychology family

Five additional 2026–2027 psychology cognate pathways use one reviewed core:

| Cognate | Cognate credits | Free electives | Source-backed starting outside credits |
| --- | ---: | ---: | ---: |
| Criminal Psychology | 15 | 18 | 60 |
| Developmental Psychology | 15 | 18 | 63 |
| Christian Counseling | 9 | 24 | 69 |
| Crisis Counseling | 9 | 24 | 69 |
| Military Resilience | 9 | 24 | 69 |

These are five named specializations of the same B.S. family, not five new
universities. All ledgers retain 120 semester credits and three-credit UNIV 104,
with no religion waiver or personal transfer award assumed. BIOL 102 and PSYC 101
overlap general education and the major foundations; each is counted once.

The exact degree pages and PSYC, CJUS, CCOU, CRIS and MILT course descriptions
were captured from Liberty on November 27. General-education course choices,
standard online pricing, independently reviewed provider versions and the
school's published receiving awards retain their original source review dates.
New degree placements have their own model, requirement and catalog evidence.
The source-bound roster is
`content/curricula/snapshots/liberty/psychology-cognates-reviewed-2026-11-27.json`.
Each new program publishes in its own curriculum document, so opening one route
does not download the other four or enlarge the legacy Liberty fallback file.

Criminal Psychology includes CJUS 230 as a named unrestricted elective because
CJUS 340 requires both CJUS 200 and CJUS 230. The missing prerequisite is not
waived or added above the degree total. Developmental Psychology chooses five
online courses from the exact restricted list; residential-only PSYC 361 is not
selected. The other cognates retain their respective CRIS, CCOU and MILT chains.
The common online PSYC 491 capstone retains its minimum-C prerequisite grades,
junior/senior standing and 18 completed PSYC-credit registration conditions.

Conditional additional providers stay available separately, including the
Christian Leaders Institute THEO 104 proposal. An unreviewed provider version
does not become enrollment-ready because another degree uses the same receiving
course. No psychology or counseling specialization is represented as a qualifying
professional license.

Author or check the bounded family together:

```sh
node scripts/liberty-psychology-cognates-2026-11-27.mjs --apply-shared
node scripts/liberty-psychology-cognates-2026-11-27.mjs --check --apply-shared
node --test scripts/liberty-psychology-cognates-2026-11-27.test.mjs
```

After canonical authoring freezes, run the normal factory refresh once for the
whole release, followed by
`node --test liberty-psychology-cognates-acceptance.test.mjs` and the existing
released-45 acceptance fixture. The compiled publication assessment remains the
release authority; a successfully authored kit alone does not change live
availability.
