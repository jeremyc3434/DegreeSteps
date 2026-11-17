# Broader credit-source catalog review

Checked **November 1, 2026** against official provider, university, ACE and NCCRS pages. The new `dist/data/credit-sources.json` contains **25 sources**, with StraighterLine first and with source-specific evidence links. No existing degree models, course mappings, prices in the optimizer, or UI files were changed in this task.

Every entry has `mappingStatus: "catalog-only"`. This means a researched discovery source, **not** an approved course-to-school mapping, transferable-credit allocation or enrollment recommendation. The dataset's `checkedOn` applies to the source observations, including availability and price notes. Status is stated in each summary because the requested schema has no separate availability field.

## Current breadth and source types

| Source | Availability observed | Credit basis / important boundary |
|---|---|---|
| [StraighterLine](https://www.straighterline.com/how-it-works/accreditation-and-quality/) | Current public course offer | Designated ACE-recommended college courses; preparation/certification products may be excluded. |
| [Sophia](https://www.sophia.org/about/) | Current public subscription offer | Designated ACE recommendations, including course-specific level and developmental distinctions. |
| [Study.com](https://study.com/support/solutions/articles/1000167188-what-type-of-study-com-membership-do-i-need-to-earn-college-recommended-credit-) | Current credit-earning plans | Eligible ACE/NCCRS courses require College Saver or Pro; study-help subscriptions are different. |
| [Saylor Direct Credit](https://support.saylor.org/hc/en-us/articles/23597374410900-FAQ-Saylor-Direct-Credit) | Current selected credit exams | ACE recommendations require the designated proctored credit exam, not an ordinary completion certificate. |
| [CLEP](https://clep.collegeboard.org/clep-exams/introductory-business-law) | Current examination program | Exam-specific recommendations and receiving-school score/award decisions. |
| [Modern States](https://modernstates.org/faq/) | Current preparation/funding | No separate academic credit: vouchers fund an eligible CLEP examination. |
| [DSST](https://getcollegecredit.com/dsst-exams/) | Current examination program | Exam-specific awards/levels; military funding eligibility differs from civilian pricing. |
| [TECEP](https://www.tesu.edu/admissions/methods-of-earning-credit/tecep/index.php) | Current university examinations | TESU examination credit; transfer and residency treatment remain destination decisions. |
| [Coopersmith](https://www.coopersmithcc.net/about/) | Current course catalog | NCCRS-recommended learning, with course-specific assessment and costs. |
| [Davar](https://www.davaracademy.com/take-a-course.html) | Current course offer | NCCRS-recommended learning; selected business bundles have separate purchase terms. |
| [TEL Education](https://www.tel-education.org/start-now/) | Current, partner/learner eligibility restricted | TEL delivers learning; the selected partner university grants/transcripts credit. Keep original provenance. |
| [ASU Universal Learner](https://ulc.asu.edu/help-center/faqs/) | Current with eligibility and timing limits | ASU institutional credit after successful completion and optional purchase. |
| [Outlier by Savvas](https://www.savvas.com/solutions/dual-enrollment) | Current school-mediated high-school offer; generic adult access needs review | District-selected institutional or ACE/Credly options. Do not assume one transcript route for every student. |
| [Google/Coursera](https://grow.google/certificates/) | Current designated complete credentials | Certificate/version-specific ACE recommendations, not every Google course. |
| [IBM and other Coursera credentials](https://www.acenet.edu/National-Guide/Pages/Organization.aspx?oid=49ddc095-0bdc-ea11-a813-000d3a33232a) | Current selected credentials | ACE catalog includes multiple issuers; complete bundles, recommendation dates and overlap matter. |
| [ACTFL/LTI](https://www.actfl.org/assessments/college-credit) | Current recommendation window | Performance-, language- and assessment-dependent recommendations; no fixed award for all learners. |
| [Microsoft examinations](https://learn.microsoft.com/en-us/credentials/certifications/college-credit) | Qualifying route; each exam needs an availability check | Vendor certifications differ from Coursera certificates; recommendation validity does not establish exam schedulability. |
| [TEEX](https://teex.org/resources/earn-college-credit/) | Training active; prospective credit eligibility needs review | November 2026 recommendation renewal was not established. No blanket current free-credit total. |
| [FEMA/FCC conversion](https://www.frederick.edu/programs/emergency-management-public-safety/credit-conversion.html) | Current training and separate conversion | FEMA learning/CEUs are not college credit; FCC converts only eligible completed courses for a fee. |
| [LawShelf](https://www.lawshelf.com/) | Current public offer; assessment details need checking | NCCRS-recommended legal learning; current detailed proctoring was not verified. |
| [Total Testing Education / CIS](https://totaltestingeducation.com/faq-2/) | Current; purchase terms need review | NCCRS-recommended CIS courses. Official plan descriptions are inconsistent. |
| [CPA Credits / UIU](https://www.cpacredits.com/self-paced-courses-info/) | Current course offer | Documented self-paced route is UIU university coursework/transcript; licensure acceptance is a separate decision. |
| [Military training / JST](https://www.acenet.edu/National-Guide/Pages/Seeking-Credit.aspx/) | Qualifying prior-learning route | Evaluate existing eligible training records before recommending repeated learning. Not an open-enrollment shortcut. |
| [OnlineDegree.com](https://www.onlinedegree.com/contact-us/) | New courses stopped January 29, 2025 | Historical transcript assistance remains; old exam prices are not a current earning route. |
| [UExcel](https://www.excelsior.edu/start-with-more-credit/transfer-more-credits/) | Examinations retired August 21, 2022 | Preserve historical earned results and transcript retrieval; disable future earning recommendations. |

## Material corrections to older guidance

**StraighterLine deserves an explicit catalog entry.** Its [current pricing](https://www.straighterline.com/pricing) combines a monthly plus course-charge option with new-student selected-course bundles; lab kits are excluded. Its [March 2026 exam guidance](https://helpcenter.straighterline.com/hc/en-us/articles/47963029736083-Exams-How-to-Prepare-for-my-Final-Exam) requires Honorlock for final Benchmark exams. Historical descriptions of either universal ProctorU use or universally unmonitored exams should not drive the present catalog.

**Study.com’s older exam quota is obsolete for the currently advertised plans.** The [pricing page](https://study.com/college/pricing.html) advertises unlimited monthly completions with plan-specific concurrency. [Current support](https://study.com/support/solutions/articles/11000134404-does-study-com-s-college-saver-plan-allow-you-to-earn-college-credit-online-) describes open-book, non-proctored finals. Do not reintroduce the wiki’s two-included/three-paid-final model into live estimates.

**Published official prices can disagree.** Sophia’s [public pricing](https://www.sophia.org/plans-and-pricing/) displays a different annual price from its [billing tutorial](https://app.sophia.org/tutorials/account-and-billing). TEL’s [enrollment page](https://www.tel-education.org/start-now/) and [independent-student FAQ](https://teleducation.zohodesk.com/portal/en/kb/articles/independent-self-paced-students-what-to-know-before-you-course-purchase-6-5-2025-1) disagree on per-credit tuition. Total Testing mixes per-course and monthly-plan descriptions. The catalog either quotes an unambiguous observed option or requests checkout confirmation; it does not select the cheapest conflicting number.

**Self-paced does not mean unlimited acceleration.** ASU’s current [FAQ](https://ulc.asu.edu/help-center/faqs/) includes credit-dependent on-demand minimum participation. TEL likewise publishes minimum participation periods. Outlier’s current [school offering](https://www.savvas.com/solutions/dual-enrollment) uses cohorts and eligibility conditions, so old adult consumer pages cannot establish general present access.

**Recommendation versions matter.** Current [Google ACE records](https://www.acenet.edu/National-Guide/Pages/Organization.aspx?oid=3fdb1492-e04f-e911-a97b-000d3a363c81) differ from aggregate Google marketing credit totals; some current records end November 30, 2026. The current Coursera ACE catalog also includes renewed records absent from older wiki snapshots. No aggregate credit total was copied into the catalog. TEEX’s live training and credit-process pages were accessible, but a renewal covering prospective November 2026 completion was not verified. An older record does not justify either present earning eligibility or rejection of historically eligible completions.

## Interpretation and evidence limits

ACE and NCCRS are recommendation bodies, not blanket institutional accreditors or transfer guarantees. [ACE explains](https://acenationalguide.zendesk.com/hc/en-us/articles/21152452077979-How-do-I-find-a-program-with-ACE-recommendations) that each institution can accept or reject recommendations, and [its date guidance](https://acenationalguide.zendesk.com/hc/en-us/articles/21152957233307-Why-do-ACE-recommendations-have-start-and-end-dates) requires matching the completed version and period. The [official NCCRS FAQ](https://ccrsstg-acquia.nysed.gov/students/faq-students) likewise distinguishes recommendations, institutional awards and case-by-case applicability.

Institution-issued credit does not automatically satisfy another institution’s residency, upper-level requirement, major requirement or accredited-origin rule. Preserve original provider, transcript issuer, awarded level, completion date and actual receiving evaluation separately. Certificates with shared content can reduce study effort while still duplicating academic credit. Modern States preparation, FEMA CEUs and a badge alone must not become extra transferable courses.

Evidence was gathered from official public pages and official search-accessible material; no copied wiki assertion establishes a current price or transfer mapping. Some pages depend on scripts, and direct NCCRS requests intermittently returned 502; the substantive official NYSED-hosted FAQ was accessible. Saylor’s official support FAQ supplied operational details where its marketing pages were unreadable. LawShelf’s detailed current assessment FAQ was inaccessible. TEEX renewal remains expressly unconfirmed. Public pages do not verify personal eligibility, checkout, a university award or the applicability of a source to a particular degree.

The JSON is valid, IDs are unique, every record has all requested fields, evidence URLs are HTTPS, and every record remains `catalog-only`. No automated purchasing, enrollment or unverified course allocation was introduced.
