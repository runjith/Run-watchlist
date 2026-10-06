# Apply the security and guest-access update

Prepared 6 October 2026. The code and SQL were tested locally. The live database
has not been changed. Complete the SQL steps before publishing the website.
Keep your existing owner account; do not create a replacement owner login.

## 1. Preserve your data

Take a Supabase database backup/export and keep copies of uploaded files. The
old website's JSON export may be incomplete above the API row limit; do not
rely on it as your only backup. The update fixes pagination.

Keep the supplied **Run-watchlist-original-research.zip** privately. It holds
all four original HTML documents. Never upload that ZIP to public GitHub.
The SQL does not delete portfolio, IPO or research records.

## 2. Run the SQL

Open your Supabase project → **SQL Editor → New query**.

1. Copy **migrations/20261006_guest_access.sql** in full and run it. Your existing
   `supabase-schema.sql` must already be installed. If a table is missing, stop
   and share the error rather than deleting anything.
2. Copy **migrations/20261006_register_owner.sql** into a new query. Replace
   `REPLACE_WITH_YOUR_OWNER_EMAIL` with your current owner login email **in the
   SQL Editor only**, then run it. Do not commit this edited copy to GitHub.
3. Run **migrations/20261006_verify.sql**. Each query describes its expected
   result. It does not return portfolio amounts or research text. Review any
   unexpected tables, views or privileged functions before enabling guests.

Between steps 1 and 2, access is denied intentionally: nobody is automatically
assumed to be the owner. Registration restores access to your existing rows.
Never register guests as owners. The scripts can be rerun. A migration error
rolls back its transaction. Do not disable RLS to resolve an error.

## 3. Confirm authentication settings

Keep public signups and anonymous sign-in off. Keep only providers you use.
Set Site URL and allowed redirects to your exact website URL; avoid wildcards.
Use strong unique passwords and MFA for GitHub and the Supabase dashboard.
Review Security Advisor, authentication rate limits, CAPTCHA options and active
sessions. App-account MFA is a follow-up feature, not included in this update.
Confirm the `research-files` bucket is private.

## 4. Publish all website changes together

After verification, publish all changed files, including `vendor/`,
`js/sharing.js`, `index.html` and CSS. No website build is needed. `package.json`
is for development tests only. The old owner frontend works with the new owner
restriction while you prepare this update. Do not invite guests until the full
update is live and checked.

Refresh the site. An access-setup error means rechecking SQL, not switching off
security. The new frontend intentionally refuses owner access if setup fails.

## 5. Restore research into the private archive

Sign in as owner → **Guest access → Private research documents**. Choose the
matching company and upload each original HTML file from the ZIP. Repeat for
all four documents. Existing companies in Supabase are retained. If a company
is missing, add it first. The public hardcoded starter list is removed.

The company’s Open research button now opens the private document. Uploading
it does not share it with guests. The private HTML reader blocks scripts and
external resources: text/inline styles work, but old interactive charts and
controls will not run. Keep the original files; safe interactive documents can
be a future improvement.

The four old public HTML files become sign-in notices. **Their original contents
remain in public GitHub history.** A login screen or these SQL rules cannot hide
Git history. Consider a private source repository or a clean sanitized repo,
with compatible hosting. History removal requires a separate reviewed plan
and cannot recall copies already downloaded or cached. A private source repo
does not automatically make its published website private.

## 6. Add a guest

1. Supabase **Authentication → Users → Add user**: create an individual guest
   account with a strong unique password, or use its invite/reset flow if email
   is configured. Never share your owner account. The website does not create
   auth accounts or send invitation emails.
2. Website **Guest access → Add a guest**: enter that existing account’s email.
   Both content permissions start off.
3. Enable **Watchlist companies** and/or **Research**, optionally set expiry,
   then **Save permissions**.
4. Publish chosen companies: only name, ticker, sector and research status are
   copied. Portfolio, IPOs, private notes and private documents stay excluded.
5. Write/paste guest-safe research and confirm publication. Review it: anything
   you paste here is visible to permitted guests.
6. Use an incognito window to sign in as the guest. Check what is visible. Try
   `#/portfolio`, `#/ipos` and a private company URL: all must show the shared
   portal, never the owner's private workspace.
7. Disable/remove guest access and refresh the guest portal. It should become
   empty. New reads are blocked immediately; an open portal refreshes each
   minute. Previously read/copied information cannot be recalled.

All guests currently use one published collection, with per-person content
permissions and expiry. Different company selections per guest are not yet
implemented. Private edits are not automatically published: use **Update
snapshot** or **Update shared research** to update the shared copy.

## Troubleshooting

- Owner cannot enter: check the owner-registration email.
- Guest not found: create their Supabase auth account first.
- Guest sees nothing: enable permissions, check expiry and publish content.
- Report shows migration notice: upload its original HTML as in step 5.
- SQL fails: share the error text, never passwords or secret keys.

Do not roll back by disabling RLS or republishing private research HTML. The
previous frontend can temporarily serve the registered owner while keeping
new database boundaries in place.
