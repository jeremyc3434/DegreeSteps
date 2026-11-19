# Liberty online receiving-award coverage

The reviewed packet `content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json` accounts for all source-course rows in the captured July 2026 Sophia guide and May 2026 Study.com guide.

- Sophia: 81 single receiving awards and two chemistry inputs belonging to one combined four-credit award.
- Study.com: 218 single receiving awards and four combined receiving awards.
- Total: 299 single-award records, five held composite awards, 305 source courses represented.

Each source records the actual captured PDF SHA-256, public university URL, review date and guide edition. Award records keep PDF page, exact provider/ACE identifiers, printed receiving title/code/quantity, and a normalized row extract or review annotation. Source PDFs remain in the ignored capture workspace; the reviewed packet is reproducible curated input. A source-content hash establishes document identity, not the independent truth of every claim.

The guide's left-hand quantity is retained as `providerListedCreditsInReceivingGuide`. `sourceCredits` and `sourceCreditSystem` stay null because no independent provider/ACE recommendation review is inferred from a receiving-school guide. An upper source-course number does not imply an upper Liberty award. For example, several advanced Accounting source courses receive ACCT 3XX elective credit and cannot replace named ACCT 301 requirements. The Study.com CSIS 3XX row whose title says lower level is held out of automatic attachment until clarified.

The helper `applyCompiled(model, packet, {includeResearchCandidates: false})` uses exact Liberty school, 2026–2027 catalog, online undergraduate level, semester units and official requirement-source bindings. Its default refreshes existing conditional matches with exact online-guide and degree-placement evidence. Published choices remain unchanged. It preserves source identifiers and never creates new default research choices that could displace a cleared student baseline.

Explicit research mode attaches all exact named matches and a bounded flexible free-elective pool. It respects quantity, institution-only flags, allowed departments, level limits, fixed-course exclusions and cross-listed placements. Generic 1XX/3XX awards can enter an eligible free-elective block; they cannot replace a named major course. Each new choice remains conditional with `eligibleToStart: false` until the independent provider version and recommendation period are reviewed. Composite awards never become standalone or prorated options.

Useful next independent identity reviews include Study.com Health 301 → BUSI 302, Health 302 → BUSI 304, Health 303 → BUSI 311, Health 305 → BUSI 323, Health 308 → BUSI 419, Health 309 → INFO 320 and Health 310 → BUSI 344. These are documented receiving opportunities, not automatic enrollment recommendations or awarded credits.

Run `node --test --test-isolation=none liberty-online-guide-awards.test.mjs` for the focused contract checks.
