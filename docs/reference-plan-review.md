# Reference-plan review

Reviewed November 1, 2026. The supplied two-page Liberty PDF is a useful product example: it leads with a specific destination, counts courses that reduce that destination's requirements, explains exclusions, and ends with an advising action. It is a user-supplied reference, not independently verified primary-source evidence. Its “verified” and “safe” labels must not become DegreePath evidence statuses or a new public 48-credit template without current source review.

## What the example reveals

| Product lesson | Current app and bounded improvement |
| --- | --- |
| Identify the entire destination. | The PDF targets **Entrepreneurship plus a Strength & Conditioning minor, 2026–27 residential catalog**. Our `liberty-business-residential` model covers **Interdisciplinary Business**, with 31 unique general-education + 66 major/foundation/cognate + 23 elective hours. They are different curricula. Capture exact major/concentration, minor, and catalog together; preserve an unsupported combination as a research target instead of relabeling the existing model. |
| Separate outside-course rules from the degree's attendance format. | The PDF applies four gates: online, asynchronous/self-paced, no proctored final, and a published equivalency satisfying a named requirement. The fourth gate is academic applicability, not delivery format. A residential degree can use outside courses meeting these gates. Today `proctoringPreference: avoid` removes CLEP but does not verify the remaining options; the engine lacks option-level delivery/assessment gates. Add strict outside-course requirements separately from campus preferences, with **supported / incompatible / unknown** evidence states. Unknown options stay out of strict compliant totals and remain research questions. |
| Count applicable credit separately from a ceiling. | The PDF claims 13 Sophia courses × 3 = **39**, plus 3 Study.com courses × 3 = **9**, totaling **48** direct replacements. This arithmetic is internally consistent; the underlying equivalencies and formats remain unverified here. Retain separate totals for selected applicable outside credit, policy ceilings, and unresolved possibilities. A 60-credit waiver threshold or 90-credit ceiling cannot inflate 48 into an applicable award. |
| Make provider alternatives choices, not additions. | The PDF presents Sophia and Study.com alternatives for the same receiving requirement. The planner already selects one option per requirement and checks duplicate sources/bundles. Expose this clearly in a compact comparison: receiving course, candidate provider/course, evidence, and “choose one.” Changing providers must not add another award. |
| Reserve real space for a minor and its prerequisites. | Generic accepted electives can stop reducing graduation work once the minor and prerequisite sequence occupy that space. Do not carry the Interdisciplinary model's 23 elective hours into this new combination. Build a unique-credit audit that allocates overlap once, reserves the minor/prerequisites, and recalculates free electives before recommending purchases. |
| Match exact sequence and component identity. | The PDF says outside A&P does not replace **BIOL 213/214/215/216**. Treat that as a claim needing current equivalency/catalog review. Similar titles or a generic A&P award do not establish the exact lecture/lab sequence, credits, or prerequisite satisfaction. Keep unmatched work available for evaluation without silently filling those requirements. |
| Preserve contradictory catalog statements. | The PDF reports **STRG 398 as 2 credits**, a STRG 298 prerequisite statement, and a minor-enrollment registration restriction that may qualify access. The applicability of STRG 298 is unresolved. Record both source claims and an advising question; do not invent an extra STRG 298 requirement, credit amount, waiver, or guaranteed schedule. |

Concrete mapping differences also need review: the PDF uses MATH 121 where our model selects MATH 115; it places HIUS 221 in information literacy where our model selects ARTS 209 and uses HIUS 221 as an elective. Its Sophia → BUSI 305 and Study.com Finance 301 → BUSI 320 options are absent from our current option menus. These are research gaps, not proof either source is correct.

## Evidence needed before extending the model

Review the exact Entrepreneurship degree page, minor requirements, current course/prerequisite catalog, and residential provider equivalency guides. Retain source URLs, dates, course identities, recommendation windows, and catalog scope. The PDF names source families but supplies no directly traceable page-level citations.

Provider formats need their own dated evidence. The PDF describes **Study.com College Saver** finals; the app currently models a **Pro membership assumption** in `providerPricing`. Do not transfer an assessment claim, library entitlement, or price between plans or versions. Check the relevant subscription, course, exam policy, and completion date. Apply the same discipline to Sophia's format and course identifiers. A receiving-school mapping and a provider-format claim are separate facts; neither grants an individual award.

## Recommended delivery scope

1. First add exact-target fields and strict outside-format controls with visible unknowns. Keep unsupported targets in the existing research-guide flow.
2. Add evidence metadata to candidate options and gate compliant totals before optimizing time, price, or transfer. Preserve the current duplicate, residency, prerequisite, and waiver safeguards.
3. Add a compact **two-page advisor brief** alongside the full audit/export: page one gives exact target/catalog, constraints, applicable-provider totals, and receiving-course mappings; page two gives choose-one alternatives, remaining university/minor work, exclusions, dated source links, unresolved questions, and the next advising request. Use “proposed” and evidence-specific labels. Keep detailed conditions in the full audit; avoid a headline “safe” guarantee.
4. Research the new Entrepreneurship/minor combination as a separate model only after the evidence above is available. Community publication remains an explicit action; this PDF review does not publish its contents.

## Acceptance fixtures for a later implementation

- **Target isolation:** selecting Entrepreneurship + Strength & Conditioning never receives the Interdisciplinary model or its elective basket automatically.
- **Independent format gates:** campus attendance remains eligible while outside options are screened separately; unknown proctoring/self-paced evidence cannot count as satisfying a hard requirement. Changing a provider plan/version invalidates inherited format evidence.
- **Reference arithmetic:** a synthetic, explicitly labeled 13×3 Sophia + 3×3 Study.com fixture totals 48 once. A 90-credit policy ceiling and an unapproved 60-credit waiver trigger do not change it. This fixture validates accounting, not the PDF's real-world mappings.
- **One receiving award:** switching BUSI 105 between supported provider candidates preserves its 3-credit award; selecting another candidate cannot create another requirement or duplicate credit.
- **Allocation:** moving HIUS 221 into information literacy replaces that choice and removes its elective allocation. Minor/prerequisite hours consume remaining electives; valid overlaps count once and overflow stays visible.
- **A&P specificity:** a generic or differently split anatomy/physiology course cannot satisfy the four named receiving components without an explicit supported allocation.
- **STRG conflict:** STRG 398 retains the reference's 2-credit claim as pending evidence; conflicting STRG 298 access conditions produce an unresolved advising item and no invented compulsory credits.
- **Export:** the advisor brief identifies the exact program/minor/catalog, distinguishes proposed applicability from the ceiling, includes exclusions and source dates, and leaves unresolved prerequisites visible.

No curriculum data, engine rules, starter templates, or public posts were changed by this review.
