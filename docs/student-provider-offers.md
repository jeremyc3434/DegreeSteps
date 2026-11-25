# Student provider offers

The offer registry is separate from affiliate settings, academic fit, course selection and published plan estimates. The initial public Study.com record advertises **10% off College Saver and College Saver Pro**, with an official provider link. Its full eligibility, introductory duration, renewal and expiration terms are not established, so it renders **View provider offer** and never applies a discount to a degree estimate. The provider's separate 20% test-prep offer is not a college-credit offer.

`content/monetization/student-offers.json` is the canonical public registry. `student-offers-reviewed-2026-11-25.json` records the research scope. `reviewUntil` is an internal review deadline, not a claim that the provider ends the offer that day. The public CTA disappears after that deadline, when a provider's explicit offer window ends, or while an offer is paused. No negotiated DegreeSteps code is present. No applications, contracts or outreach were submitted.

## Integration

The build copies the canonical registry to `dist/data/student-offers.json`. Load `provider-offers.js` and `provider-offers.css` on the course/plan source-selection surface. The UMD API is `window.DegreeProviderOffers` in a browser and CommonJS in tests.

```js
await DegreeProviderOffers.load();
const offerMarkup = DegreeProviderOffers.html({provider: chosenCourse.provider});
// A compact alternative for a tight source-selection row:
const compact = DegreeProviderOffers.html({provider: chosenCourse.provider, compact: true});
```

Render beside an already selected provider or in the course-source chooser. Avoid inserting the same full offer box into every worksheet row. Passing `product: 'test-prep'` excludes the shipped college offer. Without a selected product the full card explicitly names College Saver/Pro. Loading makes one same-origin public-data GET with cookies omitted and no student query/body. Rendering links to the official provider URL with no referrer; no student, transcript, degree or account information is appended.

The module does not automatically load or trigger a plan rerender. Await `load()` before the relevant first render, or rerender its display after the promise resolves. `configure(raw)` and `offersFor(provider, options)` support controlled data and deterministic dates. Missing/invalid data produces no offer UI and does not interrupt planning. The module has no account storage, analytics or backend writes.

## Future complete offers

Only an explicitly applied, active offer with complete current eligibility, products, billing duration, window, renewal and fee-review terms can use `estimateDiscount()`. This is a **membership-only illustration in integer cents**; it never changes a baseline or a degree estimate. The caller must supply the exact eligible product, customer type, relevant location/school, billing period and reviewed regular/renewal price. No code is appended automatically. Optional authorized codes are shown as text in the full card.

Unknown terms, product mismatch, stale reviews, expired windows, ineligible populations, disallowed stacking or mismatched renewal prices return zero applicable savings. Commissions and partner parameters are rejected from the registry. Fully reviewed eligible student discounts can later inform a separate explicit net-cost calculation; commission must never influence academic fit or ranking.

This release deliberately does not wire the future illustration into `plan-estimate-engine.js` or any recommendation engine. There is no complete activated offer in the shipped registry. Keep full offer terms and authorization under review before adding one.

Focused verification: `node --test --test-isolation=none provider-offers.test.cjs`.
