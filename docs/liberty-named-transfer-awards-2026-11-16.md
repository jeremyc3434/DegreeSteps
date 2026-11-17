# Additional Liberty named receiving awards

This supplement adds 51 provider-course identities with 31 distinct named Liberty receiving codes from six university-published guides. It is a receiving-award pool, not a degree model or a claim that 51 courses can fit one degree. Generic `1XX`/`3XX` elective awards, ambiguous merged rows and combined lecture/lab awards were excluded. A deduplication check excludes awards already in the previous reviewed supplement.

Reviewed official guides:

- [Sophia online, July 2026](https://www.liberty.edu/online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf) and [residential, May 2026](https://www.liberty.edu/residential/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf).
- [Study.com online, May 2026](https://www.liberty.edu/online/wp-content/uploads/Study.com-Course-Equivalency-Guide.pdf) and [residential, May 2026](https://www.liberty.edu/residential/wp-content/uploads/Study.com-Transfer-Equivalency-Guide-Finalized.pdf).
- [StraighterLine online, April 2026](https://www.liberty.edu/online/wp-content/uploads/StraighterLine-Transfer-Equivalencies.pdf) and [residential, April 2026](https://www.liberty.edu/residential/wp-content/uploads/Straighterline-Transfer-Equivalency-Guide-Finalized.pdf).

Useful omitted named awards include Study.com Computer Science 103 to INFT 110, Psychology 301 to PSYC 316, Humanities 201 to PHIL 210, and several history, science, language and leadership awards. These can support exact coded requirements or a separately published eligible elective block. No title-only equivalency is inferred. Source quantity and recommendation-version periods remain unreviewed: the supplement preserves Liberty receiving credits and explicitly leaves independent source credits/units null. Receiving upper-level status never establishes the source's ACE level.

Awards stay conditional for exact-degree planning. Scope is limited to Liberty associate/bachelor programs and separately reviewed study formats. Sophia Intro to Education is online-only in this evidence set because it is absent from the reviewed residential guide. Sophia history awards retain online page 2 versus residential page 1. The Environmental Science provider alias printed only in the residential guide retains that specific alias reference.

Regenerate with `node scripts/build-liberty-named-awards.mjs`; verify without writing with `--check`. Curated source facts live under `content/transfer-awards/snapshots/`, and the generated pool is `content/transfer-awards/liberty-named-awards-2026-11.json`. The module exports `buildDocument`, `validateDocument`, `scopeAllows` and `optionsFor`; the last helper requires exact receiving codes/credits and rejects university-only rows, graduate contexts and incompatible upper-level requirements. A shared compiler may also use the pool in explicitly sourced elective blocks while independently enforcing degree policies and duplicate-credit rules.
