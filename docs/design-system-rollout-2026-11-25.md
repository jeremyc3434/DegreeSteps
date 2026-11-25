# Student design system

The approved November 25 design uses a light canvas, pale blue workspace navigation, white work surfaces, ink text, and a single strong next action. Public pages demonstrate a real degree route; the private worksheet retains its complete academic sections and controls.

## Presentation ownership

- `ds-tokens.css`, `brand.css`, and `brand-tokens.json` define the shared palette, type, spacing, and interaction tokens. The product stays explicitly light, including native form controls.
- `app-shell.css` and `app-shell.js` own the desktop sidebar, task header, phone navigation, save status, and More disclosure. Account and saved-plan transport remain in their existing clients.
- `workspace-design.css` and the discovery, collection, comparison, community, and settings styles own their page families. Public source generators and `public-design.css` own the crawlable website; `home-steps.css` owns the homepage journey.
- `plan-design.css` is the canonical worksheet presentation. `plan-redesign.css` is retired and is no longer loaded. Full academic sections, grouping, all six columns, source details, course comparisons, imports, exports, saved versions, and reversible course progress remain available.
- `ds-overlays.css` owns the existing dialog and drawer frames, readable content, close controls, and responsive dimensions. Dynamically loaded coach, lead, import, verification, save, and alert styles use the same tokens. Native dialog visibility, focus, Escape, dirty-state protection, and existing submit handlers remain authoritative.

`scripts/apply-brand-system.mjs` wires shared styles once across public and private pages. It also provides the shared navigation to reachable workspace tools that previously omitted it. Legacy redirect pages remain redirects. Regenerate public HTML with `node scripts/build-public-site.mjs`, then run `node scripts/apply-brand-system.mjs`; `npm run build` runs both as part of the production build.

## Verification boundaries

Academic models, source policies, published baselines, original course quantities, account record shapes, authentication, database schemas, and Worker API behavior are outside this presentation change. The release checks compare academic registries and baselines, preserve public metadata and article content, exercise the existing core suites, and inspect representative public/workspace/overlay flows at desktop and phone widths. Browser audits use isolated synthetic records and intercept writes; they do not operate on students' real accounts or submit real research, lead, or community requests.

Deployment follows the existing GitHub CI and Cloudflare staging/production workflow. No hosting, domain, database, or authentication-provider cutover is part of this release.
