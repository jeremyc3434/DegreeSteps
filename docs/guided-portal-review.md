# Guided portal release

The front door now starts with one question: “What would you like help with?” The three choices distinguish exploration, a known school or degree, and a review of existing learning. Subsequent questions adapt to the target, career, study format, military connection and priority. They use preloaded rules and catalogs; there is no paid AI request in the student flow.

After setup, the portal presents one current task within four steps: choose a degree, add past learning, review the plan, and ask the school. The full editable course worksheet remains at `plan.html`. Focused task URLs reuse its existing credit-entry, CSV, cost/time, review and export tools. New visitors do not inherit the former TESU sample as their own target.

Original learning records, school-specific evaluations, notes and per-program choices stay in the existing private browser ledger. Community templates contribute proposed choices only. Unmatched shared choices are disclosed, and public sharing continues to omit private completed/in-progress learning and notes. A saved review or school-contact acknowledgment is bound to the current draft; material changes require a fresh review. “Sent” means awaiting school review, never school approval.

## Public design references

Reviewed Better’s public start page and public descriptions of the mortgage dashboard, not a signed-in application or private interface:

- https://better.com/start — a short opening question, a few clear actions, help, and return to an existing application.
- https://better.com/content/home-buying-process-timeline — clear stages and user responsibilities.
- https://better.com/content/what-documents-will-i-need-for-my-mortgage — relevant document requests and outstanding items.
- https://better.com/content/buying-a-house-online — a dashboard with updates, reminders, and upload instructions.

Applied the interaction principles to DegreePath while retaining its white, dark-ink and blue identity: one question, one primary action, saved progress, and details when relevant. No claim of copying or inspecting Better’s authenticated workflow.

## Coverage limits

The portal makes the available research easier to use. It does not turn school profiles into complete audited degree maps. The TESU and Liberty course maps remain partial and include conditional matches and research gaps. Other routes are identified as outlines or career guides. No total degree price, graduation date, military award, professional eligibility or individual transfer award is inferred from incomplete data or community votes.

## Validation

Use `journey-engine.test.cjs` for pure migration, branching, filters, shared calculations and signature behavior; `portal-browser.test.cjs` for student journeys. Existing worksheet, CSV, community and evidence tests cover the connected tools. Browser verification uses the local loopback preview; production deployment is verified by the native Sites result.
