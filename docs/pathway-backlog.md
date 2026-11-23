# Pathway backlog

Curriculum models that exist in `dist/data/curriculum-registry.json` but are deliberately left out of the plan finder, and why. A model leaves this list only when it can reach at least the "needs school confirmation" tier from sources the factory's verify step accepts. Last reviewed 2026-11-23.

## Western Governors University: Master of Business Administration (`curriculum-wgu-catalog-b2a8a37d4fbedabd`)

**Left unpublished: graduate program with no published outside-course pathway.**

- The site can show master's plans (the finder lists four University of Phoenix master's plans at the confirmation tier), so level alone is not the blocker.
- WGU's public academic API, which supplies every other WGU plan, has no MBA record: `program-data?pamsCodes=MBA;<catalog>` returns "No ProgramVersion record(s) found" for every 2025–2026 catalog, and no college listing (`program/college/BU`, `IT`, `HE`) includes it.
- None of WGU's twelve current partner agreements (Sophia, Study.com, StraighterLine, Saylor for the BU, IT and HE colleges) lists the MBA among its `agreementPrograms`, and there are no transfer guidelines for it. There is therefore no school-published way to replace any MBA course with an outside course.
- The November 2026 institutional catalog does name the current MBA ledger (catalog 201404, 34 CUs, C200–C216). A plan built from it would be 34 WGU CUs and 0 outside CUs: a list of WGU's own courses, not a transfer pathway.
- Owner decision needed: whether all-at-the-school master's plans (like the Phoenix ones) belong in the finder. If yes, the MBA ledger can be authored from the captured catalog page; it would still carry the generic WGU residency and catalog questions.

## Other registry models outside the finder (not in the 2026-11-23 scope)

These were already unpublished before this batch and were not part of it; their blockers are recorded in `dist/data/pathway-quality-report.json`:

- University of Phoenix B.S. Information Technology and B.S. Health Management (Direct Assessment): incomplete ledgers, unbound mapping evidence and open course choices.
- Old Dominion University Psychology, BS: no exact program identity and 35 open course choices.
- SNHU B.S. Business Administration and B.S. Data Analytics (General Track): no exact catalog edition and conditional awards.
