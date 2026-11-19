# Liberty baseline provider identity review

The November 18, 2026 packet independently binds ten Sophia course identities to current provider offerings, the current provider-linked PDF syllabi, and exact ACE National Guide course records. The raw bodies were captured separately and their actual SHA-256 values are retained in the reviewed packet.

| Sophia ACE ID | Provider course code | ACE version | Original semester hours | Current recommendation period |
| --- | --- | --- | --- | --- |
| SOPH-0016 | SCIE1005 | 5 | 3 | June 1, 2026–May 31, 2029 |
| SOPH-0022 | HIST1001 | 4 | 3 | July 1, 2026–June 30, 2029 |
| SOPH-0025 | HIST1002 | 4 | 3 | July 1, 2026–June 30, 2029 |
| SOPH-0027 | PHIL1001 | 3 | 3 | June 1, 2024–May 31, 2027 |
| SOPH-0065 | PHIL1005 | 2 | 3 | October 1, 2025–September 30, 2028 |
| SOPH-0021 | BUS1200 | 4 | 1 | October 1, 2024–September 30, 2027 |
| SOPH-0041 | CS1003 | 3 | 1 | July 1, 2026–June 30, 2029 |
| SOPH-0006 | ARTHIST1001 | 4 | 3 | April 1, 2024–March 31, 2027 |
| SOPH-0029 | HUMA1012 | 3 | 3 | May 1, 2025–April 30, 2028 |
| SOPH-0080 | HLTH1011 | 2 | 3 | February 1, 2024–January 31, 2027 |

ACE identifies Ancient Greek Philosophers as retiring in May 2027. The helper preserves that warning and the finite recommendation end date. Historical completions need their corresponding historical recommendation record or an individual university evaluation; this packet does not turn the current version into a timeless course identity. Syllabus wording that ends in “Present” is not used to infer an ACE end date.

`applyLibertyProviderIdentities(model)` can attach these independently sourced provider facts to matching Sophia ACE identities in current 2026–2027 Liberty undergraduate models. It preserves Liberty receiving quantities, mapped course codes, evidence status and existing receiving-review dates. Explicit source-quantity, unit, course-version or recommendation-period disagreements remain unresolved. Course-title similarity and ambiguous ACE aliases do not establish identity. Health, Fitness, and Wellness keeps its current version 2 period; the future version 3 begins February 1, 2027 and is recorded separately rather than applied prematurely.

`applyLibertyBaselineReceivingReview(model)` is narrower: it reviews only seven existing published choices in the exact residential business baseline against the current linked Sophia receiving guide. The degree's existing requirement codes establish placement. It does not create new awards or extend residential choices to an online program.

The duplicate-credit policy comes from the actual full 2026–2027 undergraduate catalog, physical PDF page 47 / printed page 46. The contemporaneous overview HTML and its short PDF omitted this rule, so they are not used as evidence. The helper requires the explicitly verified full-catalog review before converting the note into a student-specific record task. The current two one-credit courses have distinct documented source identities and receiving elective departments; prior overlapping learning still needs Liberty’s individual record evaluation.

The nine focused tests cover unchanged award boundaries, scope/version conflicts, idempotence, exact catalog listing identity, current-policy evidence holds, narrow receiving-guide applicability, future-version separation, and the actual 120-credit business solver baseline. The complete composition now passes the independent research-quality gate with 83 outside credits and 37 Liberty credits. It awards no student credits and retains a partial price estimate. Closing these facts does not automatically clear unrelated academic research.
