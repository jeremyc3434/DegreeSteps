# Next-step action fixes

Students with no finished learning can now choose Add past courses, I have no completed credits yet, or Do this later from the records step. An explicit zero-credit choice removes the missing-record assumption while preserving saved, planned and in-progress courses. It is refused if an earned record exists. Deferring keeps the plan provisional and puts the degree's record-gathering task in Waiting.

The next action now prioritizes actual degree/preference and course-selection conflicts, then unresolved original-record decisions, before ordinary course progress. A manually checked review cannot resolve a real curriculum conflict. Ordinary school questions do not indefinitely block coursework.

Plan review opens the existing review screen with its acknowledgement. Transcript, deadline, enrollment, campus and graduation tasks open specific school questions with a copyable request, official program information when available, and a return to My Plan. Those requests never record transfer approval or claim known school deadlines. Military transcript guidance now handles an Air Force/Space Force learner whose record type is not yet known consistently with the checklist.

Validation: six regression suites passed (checklist engine, checklist acceptance, prior-credit choices, Journey, Sheet, account-client). JavaScript syntax and whitespace checks passed. Production build and asset/API boundary checks passed.

Browser limitation: nine browser journeys were authored and syntax checked. The default Chromium attempt failed before opening a page because Crashpad's socket operation was denied (`setsockopt: Operation not permitted`, SIGTRAP). Those new browser journeys are not reported as passed.
