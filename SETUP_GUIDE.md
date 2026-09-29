# RUN Watchlist — Setup & Daily Use Guide

Written for someone who does not program. Follow the parts in order the
first time. Menu names in Supabase and GitHub sometimes move slightly. If a
button isn't exactly where described, look for the same words nearby.

**Contents**

- Part 1 — Create your Supabase project
- Part 2 — Create the database (run the SQL)
- Part 3 — Create your user and switch off sign-ups
- Part 4 — Connect the website to Supabase
- Part 5 — Put the website on GitHub Pages
- Part 6 — Tell Supabase your website address
- Part 7 — Sign in
- Part 8 — Everyday use: the research workflow
- Part 8A — Watchlists, portfolio, import and backup
- Part 8B — IPO tracker
- Part 9 — Updating research later
- Part 10 — Updating the website later
- Part 11 — Problems and fixes

---

## Part 1 — Create your Supabase project

1. Go to **https://supabase.com** and sign up (GitHub or email).
2. Click **New project**.
3. Name it, for example `run-watchlist`.
4. Choose a strong **database password** and save it in your password
   manager. You will not need it for the website.
5. Pick the region nearest to you (for India: **Mumbai** or **Singapore**).
6. Click **Create new project** and wait a minute or two.

---

## Part 2 — Create the database (run the SQL)

1. In your project, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file **`supabase-schema.sql`** from this folder in Notepad (or
   TextEdit), select everything, copy.
4. Paste it into the SQL Editor and click **Run**.
5. You should see **"Success. No rows returned"**.

This creates every table, turns on the security rules, and creates a
**private** storage bucket called `research-files` for your PDFs.

It is safe to run the file again later (for example after an update). It
never deletes your research.

> **Used the first version of RUN Watchlist before?** The script renames the
> old `companies` table to `companies_v1_backup`, locks it, and copies its
> companies into the new structure. If you run Part 3 before this part, the
> copy happens straight away. Otherwise the website offers an **Import
> starter companies** button after you sign in.

**Check it worked:** open **Table Editor**. You should see `companies`,
`company_thesis`, `research_checklist_items`, `key_facts`,
`valuation_snapshots`, `investment_decisions`, `catalysts`, `risks`,
`open_questions`, `tasks`, `company_reviews`, `research_files`,
`research_updates`, `watchlists`, `watchlist_items`, `transactions`,
`portfolio_settings`, `ipo_persons`, `ipo_categories`, `ipos` and
`ipo_applications`. Open **Storage**: `research-files` should be marked
**Private**.

---

## Part 3 — Create your user and switch off sign-ups

**Create your user (you are the only user):**

1. Left sidebar → **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your email and a strong password.
4. Tick **Auto Confirm User** (so no confirmation email is needed).
5. Click **Create user**.

**Stop anyone else from signing up:**

1. **Authentication** → **Sign In / Providers** (on some projects:
   **Providers** → **Email**, or **Settings**).
2. Turn **off** "Allow new users to sign up".
3. Save.

Even if someone did manage to sign up, they would only ever see their own
empty workspace. The security rules show each row only to the user who
created it. Turning sign-ups off is an extra lock.

---

## Part 4 — Connect the website to Supabase

1. In Supabase, click **Connect** at the top of the project (or go to
   **Project Settings → API Keys**, and **Data API** for the URL).
2. Copy two things:
   - **Project URL**: looks like `https://abcdefghijklm.supabase.co`
   - **Publishable key**: starts with `sb_publishable_`. On older projects
     use the **anon public** key under "Legacy API keys" (a long text that
     starts with `eyJ`).
3. Open **`js/supabase-config.js`** in Notepad and paste them between the
   quotes:

       const SUPABASE_CONFIG = {
         url: "https://abcdefghijklm.supabase.co",
         anonKey: "sb_publishable_xxxxxxxxxxxxxxxx"
       };

4. Save the file.

> ⚠️ **Never** paste the **secret** key (`sb_secret_…`) or the
> **service_role** key. The publishable / anon key is designed to be public.
> It lets the site talk to Supabase, but the database still refuses anyone
> who hasn't signed in. The site shows a warning and stops if it detects a
> secret key.

---

## Part 5 — Put the website on GitHub Pages

**First time:**

1. Sign in at **https://github.com** → **+** (top right) → **New repository**.
2. Name it, for example `run-watchlist`. Leave "Add a README" unticked.
   Click **Create repository**.
3. On the new page, click **uploading an existing file**.
4. Drag in **everything inside the project folder**: `index.html`,
   `README.md`, `SETUP_GUIDE.md`, `supabase-schema.sql`, and the folders
   `css`, `js` and `research`.
5. Write a message such as `Research workspace` and click **Commit changes**.
6. Open **Settings → Pages**. Under **Build and deployment** choose
   **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
7. After a minute or two, refresh the page. It will show:
   **Your site is live at `https://your-username.github.io/run-watchlist/`**.

> The website code and the files in `research/` are visible to anyone if the
> repository is public. Your companies, notes, valuations and uploaded PDFs
> are **not**. They live in Supabase behind your sign-in.

---

## Part 6 — Tell Supabase your website address

This makes "Forgot password?" emails bring you back to your site.

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: paste your GitHub Pages address, for example
   `https://your-username.github.io/run-watchlist/`.
3. Under **Redirect URLs**, add the same address. Save.

---

## Part 7 — Sign in

1. Open your GitHub Pages address.
2. Click **Sign in** (top right) and use the email and password from Part 3.
3. You stay signed in on that browser until you sign out (**Account** → **Sign out**).

If the Watchlist is empty, click **Import starter companies** to bring in the
four companies the site started with (Helios, the two Seamac studies and
MM Forgings). Their "Open research" buttons open the HTML files in `research/`.

---

## Part 8 — Everyday use: the research workflow

### 1. Add a company
**Watchlist → + Add Company.** Enter the name (required), ticker, exchange,
sector and a one-line description. If you already have a research HTML
document, put it in the `research/` folder on GitHub and type its path, for
example `research/acme.html`. Click **Add company**. Its workspace opens
straight away.

### 2. Start research
In the workspace, click **Start research**. The status changes to
**Researching**, and the start date is recorded in the history.

### 3. Add documents (Google Drive links or uploads)
Section **01 Research files.** There are two ways, and you can mix them.

**Google Drive link (recommended for big files, no storage used):**
1. Put the PDF in your Google Drive.
2. Right-click it → **Share** → **Copy link**. Leave "General access" on
   **Restricted** so only you can open it.
3. Paste the link into "Or paste a link", optionally give it a name, choose
   the document type, and click **Add link**.

The same box works for NSE / BSE filing links or the company's own website.

**Upload (for small private files):** drag files onto the dotted box (or click
**choose files**). Choose the **document type** (Annual report, Quarterly
results, Conference call, Investor presentation, Exchange filing, Broker
report, Screenshot, Notes, Other), the **document date**, and a short
**description**, then click **Upload**.

- **Open** opens the file in a new tab. **Download** saves it.
- **Edit** changes the name, type, date or notes, or **Delete file**.
- The chips above the list filter by document type.
- Uploaded files are private. Each link works for one hour only, and a fresh
  one is made every time you click.
- The meter under the box shows how much of your 1 GB upload space is used
  (links don't count).

### 4. Work through the research checklist
Section **02.** Tick each item as you finish it. The date is recorded, and
research progress updates at the top of the page. Click an item's name to add
notes or change its completion date. Add your own items at the bottom, or
remove ones you don't need for this company.

### 5. Record key facts
Section **03.** One line per fact or observation, with its source (for
example "Net cash ₹120 cr — AR FY26 p.114").

### 6. Write the thesis
Section **04.** Fill in:
- Why am I interested in this company?
- Investment thesis
- What needs to happen for the thesis to work?
- Key assumptions
- What would change my mind?
- Thesis confidence (click a level)

Optionally note what changed, then click **Save thesis**. Each save is a
**new version**. Earlier versions are listed under "Earlier versions".

### 7. Catalysts, risks, open questions
Sections **05–07.** Type in the top line and press **Add**. Click any entry
to open it and fill in the rest: description, dates, importance, severity,
probability (your assessment), what would confirm a risk, your response, and
the answer and source for a question. Set a question to **Resolved** when you
have the answer.

### 8. Enter the current price
Click **enter price** (in the summary or in the Valuation section), type the
price, and save. Prices are typed by hand, so there is no market-data cost.

### 9. Complete the valuation
Section **08.** Enter as many of these as you use:
- Fair value, Bear / Base / Bull targets
- Preferred entry range (low and high)
- Stop-loss and invalidation price
- Time horizon

Then add **one line per valuation method** you used (P/E, EV/EBITDA, DCF,
P/B, SOTP… or type your own), with its basis and implied value. Describe the
method and the key assumptions in the two text boxes.

As you type, the box below does the arithmetic from the current price:
upside to your targets, downside to your stop and invalidation price, upside ÷
downside, and whether the price is inside your entry range.

Add a reason and click **Save valuation snapshot.** The summary at the top
updates.

### 10. Record your decision
Section **09.** Choose **Researching, Watch, Wait, Buy, Hold, Avoid, Sold or
Archived**. Add the decision date, time horizon, holding status, position
size %, maximum intended allocation %, and your rationale. Click **Record
decision**. Every decision is kept in the decision log.

### 11. Add action items
Section **10.** Type a task and press **Add**. You can set a due date and
priority on the same line, and add a description by clicking the task later.
Tick the box when a task is done. Every open task also appears on the
**Desk**.

### 12. Schedule the next review
Section **11.** Choose **In 30 days, In 90 days, Monthly, Every quarter,
After next results, When a catalyst occurs, or On a date**. Adjust the date or
note, then click **Schedule review**. Monthly and quarterly reviews repeat
automatically when you mark them reviewed. A review tied to a catalyst
becomes due when you set that catalyst to **Occurred**.

### 13. Mark research complete
At the top, click **Mark research complete.** A short panel lists the facts:
checklist progress, thesis, valuation, stop level, unresolved questions,
review date. These are information, not rules. Choose your decision, add a
sentence of rationale, and click **Complete research.** The company is marked
**Researched** (gold) and appears in the research archive.

---

## Part 8A — Watchlists, portfolio, import and backup

### Watchlists
On the **Watchlist** page, "All companies" shows everything. To make a list:
**+ New list** → type a name (e.g. "Core ideas") → **Create** → tick its
companies → **Save**. A company can be in any number of lists.
- Click a list's name to see only its companies.
- **Choose companies**, **Rename** and **Delete list** appear when a list
  is selected. Deleting a list never deletes companies.
- Inside a company's workspace, **Lists** (top right) shows which lists it is
  in. Tick or untick, or create a new list right there.

### Export and import a watchlist
- **Export (CSV)** downloads the selected list (or all companies) with
  status, decision, price, fair value, targets, entry range, stop, next review
  and shares held. It opens in Excel or Google Sheets.
- **Import (CSV)** adds companies from a file. Click **Download template** for
  the right columns. Companies you already have are matched by ticker and
  just added to the list, never duplicated.

### Record trades
Two places, same result:
- In a company's workspace, section **Position & transactions**: choose
  **Buy** or **Sell**, then the date, shares, price and charges → **Add trade**.
- On the **Portfolio** page: **+ Add trade**, choose the company, same fields.

Sells reduce your holding at average cost. The difference is your realised
profit or loss. Delete a wrong trade and re-enter it.

### The Portfolio page
- **Summary:** current value, invested, unrealised and realised P&L, annual
  return (XIRR), number of holdings, cash and largest position.
- **Cash (optional):** click **enter cash** and type your cash balance.
  Allocations then also show each holding's share of stocks + cash.
- **Holdings:** for each stock, shares, average cost, invested, price, value,
  P&L, **Invested %** (share of what you paid) and **Present %** (share of
  today's value), plus your maximum allocation from the Decision section.
- **Update prices:** click it, type today's prices in the price column, then
  **Save prices**.
- **Allocation:** bars comparing invested % and present %, by company and by
  sector.
- **Risk and targets:** how much you'd lose if every stop-loss were hit, and
  the upside to your base targets. Both come from your latest valuation.

### Import from Zerodha
- **All trades:** Zerodha Console → Reports → **Tradebook** → choose dates →
  download **CSV**. On the Portfolio page click **Import trades or holdings**
  → **Choose CSV file** → check the preview → **Import**. Import again any
  time: trades already imported are skipped.
- **Just current holdings:** Kite → **Holdings** → download (or Console
  holdings, saved as CSV). Pick the date to record them on, then Import.
  Each holding becomes one buy at its average cost.
- **Other brokers:** download the trades template, paste your trades into it
  in Excel, save as CSV, and import.

### Full backup
Click **Account** (top right of the menu). Use **Download full backup
(JSON)** now and then, and keep the file somewhere safe. **Sign out** is on
the same page. It contains all your records. Your
uploaded PDFs stay in storage and aren't inside the backup file.

---

## Part 8B — IPO tracker

Open **IPOs** in the top menu.

**1. Add your people (once).** Type each account holder's name and click
**Add person**. For your own account, tick **Main account (mine)**. To stop
someone appearing in new IPOs without losing their history, click **Edit** →
untick **Show in new IPOs**.

**2. Check the categories.** Retail, S-HNI, B-HNI, Shareholder and Employee
are ready. Add your own (e.g. Policyholder) at the bottom. Click a category
to rename or delete it.

**3. Create the IPO.** **+ New IPO** → name, issue price, lot size and dates
→ **Create IPO**.

**4. Add the applications.**
- **Add for everyone** creates one application for every person in one
  click. Choose the category, lots and whose money it is. Your main account
  is set to "My main account" automatically.
- **Add one application** is for extras, e.g. your S-HNI or shareholder
  application.
- Click **Edit** on a row for the amount, loan amount, loan interest,
  charges, application number and notes.

**Money options:**
- **I sent money:** you gave money to that person. It appears in
  **Money to collect**.
- **My main account:** your own account.
- **Their own money:** tracked for them, but not counted in your profit.

**5. Record the allotment.** Each row has **… / Yes / No**. Tap **Yes** or
**No**. Yes fills in one lot of shares; change it in Edit if you got more.

**6. Record the sale.** Type the price in **Sold at listing?** and click
**Apply**. Every allotted application without a sell price gets it. To
record different prices, use Edit on each row.

**7. Collect and settle.** **Money to collect** (on the IPOs page and the
Desk) lists everyone who still has your money, and how much:
- **Not allotted:** the money you sent.
- **Sold:** the money you sent + the sale gain − charges.
- **Allotted, not sold yet:** the refund now, plus the shares.

Tick the box when the money comes back. You can also tick **Settled** in the
IPO's table, or use **Mark all decided as settled**.

**Profit shown:** listing gain − charges − loan interest, for applications
made with your money. Use the period buttons (This FY, Last FY, this year,
All time) to see totals for any period, plus allotment rate by person and by
category.

**Bringing in your Excel sheet:** save it as CSV, click **Import (CSV)**, and
check the preview. **Download template** shows the column names it
understands. **Export all applications (CSV)** gives you everything back in
Excel.

---

## Part 9 — Updating research later

- **New results or news:** open the company → **12 Research history →
  + Add research update**. Choose a type (Results, News, Note…), write a
  title and note, and optionally record a previous → new value.
- **Thesis changed:** edit the thesis and click **Save new version**. The
  old version stays readable.
- **Target changed:** change the numbers in Valuation, write the reason, and
  click **Save valuation snapshot**. The history records, for example,
  "Base-case target changed ₹850 → ₹920 — Reason: margin assumption
  changed", and the valuation history table keeps every snapshot (changed
  values are shown in gold).
- **Decision changed:** record the new decision. The log keeps the old one.
- **Doing a review:** in Review & monitoring, write what you checked and click
  **Mark reviewed**.
- **Reopen research:** click **Reopen research** at the top of a researched
  company.
- **Rename or delete a company:** click **Edit details** at the top.
  Deleting removes all of its research and files permanently.

**The Desk** (top menu) is your to-do list across every company: reviews
coming due, open tasks (tick them off right there), research in progress,
completed research, and the latest updates.

---

## Part 10 — Updating the website later

To change a file (for example a new research HTML document):

1. Open your repository on GitHub.
2. Go into the folder (for example `research`) → **Add file → Upload
   files** → drag the file in → **Commit changes**.
3. Wait a minute and refresh your site.

**Updates that add features (watchlists, portfolio, links, IPOs) need one
database step:** open the Supabase SQL Editor, paste the new
`supabase-schema.sql` and press **Run**. It adds the new tables and keeps
everything you already have. Do the
same whenever a future update includes a new version of that file.

---

## Part 11 — Problems and fixes

| What you see | What to do |
|---|---|
| "Supabase is not connected" with a configuration message | Check `js/supabase-config.js`: both values filled in, inside quotes, and the key is the publishable / anon key. |
| "Email or password is incorrect" | Check Authentication → Users in Supabase. You can reset the password there. |
| "Not allowed. Please make sure you are signed in." | Your session ended. Sign in again. |
| "Could not reach Supabase" | Internet problem, or the free project is paused. Open the Supabase dashboard and press **Restore** if you see it. |
| Upload fails with "too large" | The limit is 50 MB per file. Compress the PDF or split it. |
| Watchlist says "Local mode · this browser" | `js/supabase-config.js` is empty on the site you opened. Upload your filled-in copy to GitHub. |
| Password reset email opens the wrong page | Do Part 6 again with your exact GitHub Pages address. |
| Nothing changes after uploading to GitHub | Wait a minute, then refresh the page while holding Shift. |
