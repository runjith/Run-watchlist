# RUN Watchlist security and quality review

Reviewed 6 October 2026. Baseline: `c757774` in `runjith/Run-watchlist`.
Status: code and database changes prepared; live database migration and release
verification are still required. This is a scoped source review and test report,
not a claim that the deployed system has no vulnerabilities.

## What was reviewed

All application JavaScript modules, HTML entry point, CSS, four bundled research
HTML documents, the database/schema/storage policies, authentication handling,
imports/exports, financial calculations and all three existing Git commits.
Checks included anonymous live reads, source-level secret patterns, guest data
boundaries, stored-content rendering, unsafe URLs, dependency delivery,
backups and destructive UI controls. No live private records were modified.

The Supabase dashboard, actual authenticated policies, unknown views/functions,
private object contents, auth logs, backup recovery and GitHub account security
were not accessible. Read-only SQL is supplied to inspect those database gaps.

## Findings and disposition

| Priority | Finding | Change or remaining action |
|---|---|---|
| High privacy | The four research HTML documents and starter research summaries were shipped publicly. Login did not protect those files. | Current research documents replaced by sign-in notices and starter data removed. Original documents preserved in a private ZIP. Owner upload/reader added for private storage. **Old GitHub history remains public and needs a separate privacy decision.** |
| High if implemented incorrectly | Hiding navigation alone would not secure future guest access. | Added owner registry and restrictive database policies on all 21 original tables. Guests read only separate explicitly published snapshots. No guest policy opens portfolio, IPO, private research or storage rows. |
| Medium | Existing permissive policies could combine with future ones and broaden access. | Restrictive owner boundary intersects permissive policies; tested against an intentionally broad leftover policy. Explicit table grants remove unnecessary privileges, including TRUNCATE. Unknown views and privileged functions still need live inventory review. |
| Medium | Research paths were opened without a strict scheme/path check; one rendering location made them direct links. A stored `javascript:` value could become an executable link. | Allowlisted references, validation on writes and open, removal of direct research href, safe HTTPS rendering for saved links. |
| Medium | Report HTML ran scripts; same-origin public documents share the site's origin. | Private reader uses an opaque sandbox, strips executable/navigation elements and handlers, and blocks external resources. Old interactive charts do not run in this reader. |
| Medium | Supabase SDK was loaded from a floating third-party CDN version. No app CSP. | Vendored 2.117.2, pinned SHA-384, MIT license, restrictive Content Security Policy and no-referrer policy. Ongoing dependency updates remain necessary. |
| Medium | CSV text could be interpreted as spreadsheet formulas when exported. | Formula-like text is prefixed; actual numeric negative values remain numeric. |
| Medium | Unpaginated reads and backups could silently stop at the API row limit. | Stable ordered pagination; tested with 1,203 rows and a simulated 100-row response cap. Sharing tables are included in the new owner backup. |
| Medium | Cached/rendered owner information could remain in a page after account changes; sign-out failures were ignored. | Failures are surfaced, successful logout/account switches reload the page, stale read responses are rejected by session generation. |
| Low | Desktop IPO and person Edit buttons inherited opacity zero without the matching hover selector. Delete application was inside that hidden editor. | Actions are visible. Edit/save, delete, cancellation and recalculated application display tested. |
| Low | Malformed URL escapes could crash route parsing. | Invalid hash encoding handled safely. |
| Low | Local-mode writes could fail silently when browser storage was full. | Save errors now surfaced. Local mode remains a development convenience, not authenticated cloud storage. |
| Residual | Private-file signed URLs lasted an hour. | Reduced new signed URLs to five minutes. Anyone who obtains one can use it until expiry; old issued URLs remain valid for their original lifetime. Guests receive no such URLs. |

## Evidence from the live site

- Anonymous GETs selecting at most one ID against all 21 application tables
  returned HTTP 401. A follow-up on `companies` returned PostgreSQL `42501`,
  permission denied for table companies. No private row contents were printed.
- `companies_v1_backup` returned 404; this is not proof of its SQL privilege state.
- The auth settings endpoint reported public signup disabled and automatic
  email confirmation disabled. Anonymous sign-in, provider settings, CAPTCHA,
  rate limits, MFA and redirect allowlists require dashboard confirmation.
- Anonymous bucket lookup returned “Bucket not found”. This does not prove the
  bucket is absent or private; its setting must be checked using the SQL query.
- No service-secret, private-key, GitHub-token or JWT patterns were found in
  the three original commits by the pattern scan performed. This is not a
  comprehensive secret-scanner attestation. The configured `sb_publishable_`
  key is a public client key, not an administrator credential.

## Guest design

Owners are registered explicitly in SQL, never from a browser role field or
user-editable metadata. Unregistered logins cannot read or write original
workspace tables. The original account still owns its existing rows.

`shared_companies` contains only name, ticker, sector and research status.
`shared_research` contains a deliberately published title and plain-text body.
Both also have normal identifiers/timestamps. Neither contains portfolio
amounts, trades, IPO applications or private file paths.

Each guest has an individual Supabase auth account and a grant specifying
watchlist permission, research permission, enabled status and optional expiry.
Owners can change/remove grants and unpublish or update content. All permitted
guests currently share one published collection; per-company selection differs
from the private watchlist but is not yet configurable separately per guest.

The sole new privileged RPC resolves an existing guest email. It checks the
owner before querying auth users, has a fixed empty search path and does not
create accounts, send mail or elevate owners. Public/anonymous execute is
revoked. No administrator key is embedded in the frontend.

Guest routes never load the owner overview. Direct private-table requests are
still protected by the database. Revocation blocks future reads immediately;
the portal refreshes every minute. No system can retract screenshots or text
already copied by an authorized reader.

## Validation

Run `npm ci --ignore-scripts` then `npm test` with Node 24 or a compatible version.

- SQL executes in PGlite (real PostgreSQL semantics), with simulated Supabase
  auth/storage schemas. Tests cover owner/guest/other-owner/stranger/anonymous
  isolation, blocked promotion and writes, expiry, revocation, separate
  permissions, an intentionally broad legacy policy, least-privilege grants,
  migration reapplication and reapplication of the base schema.
- DOM tests exercise IPO edits/deletes, cancelling deletion, desktop action
  opacity, URL validation, CSV escaping, hostile guest text and revoked content.
- Full router tests exercise direct guest navigation to portfolio, IPO, company
  and desk pages, malformed hashes and fail-closed missing migration behavior.
- Data tests cover full paginated backup, sign-out failure and basic
  portfolio/IPO arithmetic. They do not establish tax/reporting correctness.
- JavaScript syntax, integrity hash and patch whitespace are checked.

A real desktop/mobile browser and a real owner/guest pair against the deployed
Supabase instance still need the acceptance checks in UPDATE_GUIDE.md. DOM tests
do not validate CSP enforcement, browser-specific layout or the real mail flow.
The local SQL harness does not emulate all Supabase platform roles/settings.

## Remaining risks and suggested next work

1. **Resolve public history** before describing existing research as private.
   Choose private source hosting or a clean sanitized repository and plan old
   repository/history removal separately. Prior clones/caches cannot be recalled.
2. **Run the SQL and inspect live verification results.** Unknown views or
   security-definer functions can bypass table policies; do not ignore them.
3. **Backups and recovery:** keep encrypted/offline database and file backups;
   conduct a restore drill. The app's JSON backup is not a complete file backup
   or an implemented restore workflow.
4. **Owner MFA and account protections:** protect dashboard/GitHub accounts;
   add app MFA support and review throttling/CAPTCHA as appropriate.
5. **Guest improvements:** per-person company selections, approved PDF/HTML
   publication, access audit trail and an owner preview-as-guest screen.
6. **Data-quality work:** broker import reconciliation, corporate actions,
   oversell handling and broader financial test cases. Multi-step writes/history
   updates are not transactional; an interrupted operation can require review.
7. **Hosting headers:** a response-level `frame-ancestors` policy cannot be set
   using the meta CSP used here. Consider a host supporting response headers for
   clickjacking protections. This update does not claim full header hardening.
8. Private HTML scripts are disabled intentionally. If interactive reports are
   needed, design a separate isolated renderer with reviewed dependencies.

## Primary documentation consulted

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/deployment/going-into-prod

The implementation applies database grants and row policies together; privileged
functions require explicit caller checks and restricted execution privileges.
