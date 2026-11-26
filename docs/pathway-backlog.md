# Pathway backlog

Curriculum models that exist in `dist/data/curriculum-registry.json` but are deliberately left out of the plan finder, and why. A model leaves this list only when it can reach at least the "needs school confirmation" tier from sources the factory's verify step accepts. Last reviewed 2026-11-23.

## Western Governors University: Master of Business Administration (`curriculum-wgu-catalog-b2a8a37d4fbedabd`)

**Left unpublished: graduate program with no published outside-course pathway.**

- The site can show master's plans (the finder lists four University of Phoenix master's plans at the confirmation tier), so level alone is not the blocker.
- WGU's public academic API, which supplies every other WGU plan, has no MBA record: `program-data?pamsCodes=MBA;<catalog>` returns "No ProgramVersion record(s) found" for every 2025–2026 catalog, and no college listing (`program/college/BU`, `IT`, `HE`) includes it.
- None of WGU's twelve current partner agreements (Sophia, Study.com, StraighterLine, Saylor for the BU, IT and HE colleges) lists the MBA among its `agreementPrograms`, and there are no transfer guidelines for it. There is therefore no school-published way to replace any MBA course with an outside course.
- WGU's transfer page (checked 2026-11-23, https://www.wgu.edu/admissions/transfers.html) says only: "WGU accepts limited college transfer credits at the graduate (master's) level in some degree programs. There are special requirements to receive graduate-level transfer credit that vary by program. Please speak with your enrollment counselor for more information." It also says "Some graduate programs allow the transfer of individual courses and others do not." Neither that page nor the current MBA page names the MBA as accepting transfer credit, and no MBA transfer guideline is published. MBA transfer credit is therefore unconfirmed and, at best, case by case through an enrollment counselor; it is not a pathway we can publish.
- The November 2026 institutional catalog does name the current MBA ledger (catalog 201404, 34 CUs, C200–C216). A plan built from it would be 34 WGU CUs and 0 outside CUs: a list of WGU's own courses, not a transfer pathway.
- Owner decision needed: whether all-at-the-school master's plans (like the Phoenix ones) belong in the finder. If yes, the MBA ledger can be authored from the captured catalog page; it would still carry the generic WGU residency and catalog questions.

## First automated batch (Strayer, Champlain College Online, APUS, Bellevue), 2026-11-23

Reviewed kits under `content/pathway-kits/{strayer,champlain,apus,bellevue}`; each held program records its reason in `review.heldReason`.

- **Needs a named baseline (58 programs):** general-education, concentration and elective blocks without a named course. Next step: capture each school's course catalog and fill every block with named courses offered online, as was done for Liberty's elective slots.
- **No outside course joins (14):** 12 Bellevue programs (Bellevue's pages list general education only as a 37-credit block) and APUS Homeland Security and Interdisciplinary Studies.
- **Unexplained credit totals (4):** Champlain B.S. Accounting and A.S. General Studies, and Bellevue B.S. Psychology (drafts removed), and Bellevue Supply Chain and Logistics (draft kept).
- **Published:** Strayer A.A. Information Technology (needs school confirmation).

## PDF-catalog batch (UMGC, Columbia Southern), 2026-11-23

Reviewed kits under `content/pathway-kits/{umgc,columbia-southern}` (`scripts/pathway-factory/finalize-umgc-csu-2026-11-23.mjs`); held programs record their reason in `review.heldReason`. 35 of 37 drafted programs publish at needs school confirmation.

- **UMGC B.S. General Studies (held):** UMGC requires 15 upper-level credits at UMGC. The ledger fixes only 6 (the capstone and the upper-level writing course); its 27 major-elective credits are any discipline at any level, so meeting the rule depends on the student's choices.
- **UMGC B.S. Homeland Security (held):** no published outside course joins. Its only codeless block is "Remaining General Education and Elective Courses", a mixed block no Sophia category award fills.
- **UMGC B.S. Social Science (fixed, published):** the draft summed to 123. The capture lists STAT 200 as a "required related course" that "may be applied to general education requirements", and UMGC's mathematics general education list names STAT 200, so the separate mathematics block was removed (120 credits).
- **Columbia Southern A.S. Cybersecurity (not drafted):** the batch's page range 48–49 drafted A.S. Business a second time; the duplicate was removed. Draft A.S. Cybersecurity from page 49 in a later run.

## Other registry models outside the finder (not in the 2026-11-23 scope)

These were already unpublished before this batch and were not part of it; their blockers are recorded in `dist/data/pathway-quality-report.json`:

- University of Phoenix B.S. Information Technology and B.S. Health Management (Direct Assessment): incomplete ledgers, unbound mapping evidence and open course choices.
- Old Dominion University Psychology, BS: no exact program identity and 35 open course choices.
- SNHU B.S. Business Administration and B.S. Data Analytics (General Track): no exact catalog edition and conditional awards.

## Alternative-credit landscape batch 1, 2026-11-26

See `docs/alt-credit-landscape-2026-11-26.md`. Ten kits added with provider-published Sophia equivalencies and, where the school states it explicitly, a normalized transfer cap (Norwich, Indiana Tech, Nichols, Wilmington at 90 semester credits). None has programs yet, so none is in the finder. Queue: school-published tables for UAGC, Capella, Charter Oak, Empire State and CSU Global (after the policy-field workstream merges); Walden, Phoenix, Davenport; then program drafting for the new kits.
