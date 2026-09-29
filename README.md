# RUN Watchlist

**Track what matters. Research what changes.**

A private, personal equity research workspace. Every company goes through
the same path, so hours of reading end with a clear, recorded view:

    COMPANY → RESEARCH → THESIS → VALUATION → DECISION → ACTIONS → REVIEW

Nothing here is investment advice. The site does simple arithmetic (upside,
downside, research progress, days until a review) and records **your**
decisions. It never tells you what to buy or sell.

**First time?** Follow **SETUP_GUIDE.md** from top to bottom (about 20 minutes).

---

## What you get

| Page | What it is for |
|---|---|
| **Home** | The hero, now a living night sky. When you are signed in, the constellation is labelled with your reviews due, open tasks and companies (overdue items pulse in blue). Hover a label for details, click it to open that part of the workspace. Below it, a short "Now" summary: research in progress, research completed, open tasks, reviews due, recent updates. |
| **Watchlist** | Every company you follow, with status, research progress, decision, price, holding and next review on one quiet line. Make as many named watchlists as you like (a company can be in several), rename or delete them, and export or import them as CSV. Click a company to open its workspace. |
| **Portfolio** | Built from the buys and sells you record: shares, average cost, invested, current value, profit and loss, **invested allocation % vs present allocation %**, realised P&L, annual return (XIRR), sector split, amount at risk to your stop-losses, and checks against the maximum allocation in your decision. Import a Zerodha tradebook or holdings file; export holdings and trades. |
| **Company workspace** | One page per company (details below). |
| **IPOs** | Every IPO you apply for, from every account: people (mark your main account), categories (Retail, S-HNI, B-HNI, Shareholder, your own), applications with lots, amount and whose money was used, allotted or not, sell price, charges and loan interest. Profit per IPO, per person, per category and per period (this FY, last FY, year, all time), allotment rate, and a **Money to collect** list with a Settled tick. |
| **Desk** | Everything that needs attention across all companies: reviews due, open tasks, research in progress, completed research, recent updates. |
| **Researched** | The research archive. "Open research" opens your standalone research HTML documents. |
| **Sectors** | Coverage grouped by sector. |
| **About** | What the workspace is. |

### Inside a company workspace

At the top: a summary you can read in a few seconds (status, decision,
current price, fair value, target, entry range, stop / invalidation, research
progress, open questions, open tasks, last and next review), then six steps
showing where the research stands.

Below it, twelve sections in six phases:

1. **Research** — Research files (Google Drive links or private uploads), Research checklist, Key facts & observations
2. **Think** — Investment thesis, Catalysts, Risks, Open questions
3. **Value** — Valuation & price levels (with automatic upside / downside)
4. **Decide** — Investment decision (Researching, Watch, Wait, Buy, Hold, Avoid, Sold, Archived), Position & transactions
5. **Act** — Action items (tasks)
6. **Review** — Review & monitoring, Research history

**Your thinking is never overwritten.** Each thesis save is a new version.
Each valuation save is a new snapshot. Each decision is added to a log.
Target changes such as "₹850 → ₹920" are written into the research history
automatically, so you can always see what you thought six months ago.

---

## Where things live

| What | Where | Why |
|---|---|---|
| Website code, design, research HTML documents, database script, these guides | **GitHub** | They change rarely and are published as the website. |
| Companies, thesis, checklist, valuations, decisions, catalysts, risks, questions, tasks, reviews, history | **Supabase database** | Changes every day. Private to you. |
| Big documents (annual reports, concalls, presentations) | **Google Drive** (you paste the link) | 15 GB free. The link is stored privately in Supabase; keep Drive sharing on "Restricted". |
| Small private files (broker reports, notes, screenshots) | **Supabase Storage** (private bucket `research-files`) | Kept out of GitHub. Only you can open them. A meter shows how much of the 1 GB you have used. |
| Watchlists, trades, cash balance | **Supabase database** | Same privacy rules as everything else. |

You never edit JavaScript files to maintain company information. Everything
is added and changed through the website.

---

## Project structure

    Run/
    ├── index.html              the website (one page with several views)
    ├── css/styles.css          all visual styling
    ├── js/
    │   ├── supabase-config.js  ★ your Supabase URL + publishable key (the only file you edit)
    │   ├── data.js             starter companies + the fixed lists (decision states, checklist template, document types)
    │   ├── ui.js               small shared helpers (dates, money, percentages, notices)
    │   ├── io.js               CSV import/export, broker file recognition, downloads
    │   ├── portfolio.js        portfolio arithmetic (average cost, allocation, XIRR, risk)
    │   ├── ipo.js              IPO arithmetic (profit, money to collect, periods)
    │   ├── datalayer.js        the ONLY code that talks to Supabase
    │   ├── workspace.js        the company workspace
    │   ├── desk.js             the Desk and the home "Now" summary
    │   ├── portfolio-view.js   the Portfolio page
    │   ├── ipo-view.js         the IPOs pages
    │   └── app.js              pages, watchlists, hero animation, sign-in, navigation
    ├── research/               ★ your standalone research HTML documents
    ├── supabase-schema.sql     ★ run once in Supabase (safe to run again)
    ├── README.md               this file
    └── SETUP_GUIDE.md          step-by-step setup and daily use

### How the code is organised

    Screens (app.js, workspace.js, desk.js)
          ↓   ask for data
    DataLayer (datalayer.js)
          ↓   the only place with Supabase queries
    Supabase (database + private file storage)

Because every screen goes through the DataLayer, a later change (for example a
market-data feed for prices) only touches one file. The DataLayer already has
a place for a price source: `DataLayer.prices.register(...)`. Today prices are
typed in by hand, which costs nothing.

---

## Security, in plain words

- The database refuses **everyone** who is not signed in. Visitors to your
  website see the hero and a sign-in page, and nothing else.
- Every row is stamped with your user id, and the database only ever returns
  rows stamped with the id of the person asking (Row Level Security).
- Uploaded files are stored in a **private** bucket, inside a folder named
  after your user id. Links to open a file are created on demand and expire
  after one hour.
- History tables (thesis versions, valuation snapshots, decisions, research
  updates) can be added to and deleted, but never edited.
- Only the **publishable (anon) key** goes in the website. The site refuses to
  start if it sees a secret / service-role key.
- The old prototype let anyone add or edit companies. Running the new SQL
  script locks that table and carries its rows into the new structure.

**One thing to know:** the files in `research/` are part of the website, so if
your GitHub repository is public, anyone who guesses a file's address can open
those HTML documents. Your database and uploaded PDFs stay private either way.
If a research document must be private too, either keep it as a PDF in the
workspace's Research files section, or make the GitHub repository private
(publishing a private repository on GitHub Pages needs a paid GitHub plan).

---

## Import formats

| File | Where to get it | What happens |
|---|---|---|
| **Zerodha Console tradebook** (CSV) | Console → Reports → Tradebook → Download CSV | Every trade is added with its date, price and quantity. Trades already imported are skipped (matched by trade id), so you can import overlapping periods safely. |
| **Kite / Console holdings** (CSV) | Kite → Holdings → Download, or Console → Portfolio → Holdings (save as CSV) | Each holding becomes one buy at its average cost on the date you choose, and the LTP becomes the current price. |
| **Trades template** | "Download template" in the import box | `date, ticker, exchange, type, quantity, price, fees, notes`. Works for any broker. |
| **Companies template** | "Download template" on the Watchlist import | `name, ticker, exchange, sector, description, status, current_price`. |
| **IPO applications** | "Download template" on the IPOs import, or your own IPO sheet saved as CSV | One application per line: `ipo, issue_price, lot_size, listing_date, person, category, lots, amount, funding (sent / main / own), allotted (yes / no), shares, sell_price, sell_date, charges, loan_amount, loan_interest, settled`. IPOs, people and categories are created as needed; re-importing updates instead of duplicating. |

Companies that don't exist yet are created automatically during a trades
import. Excel files must be saved as CSV first. Dates like 28/09/2026 are
read as day/month/year.

---

## Local mode

If `js/supabase-config.js` is left empty, the site runs in **local mode**:
no sign-in, and everything is kept in the browser you are using (uploaded
files included). It is handy for trying things out. Nothing is backed up, and
nothing appears on your other devices. Connect Supabase for real use.

---

## Cost

GitHub Pages, the Supabase free plan and your free Google Drive (15 GB) are enough. No paid services, no
server, no build step. At the time of writing the free plan includes 500 MB
of database space and 1 GB of file storage, with a 50 MB limit per file. Supabase pauses a free
project after about a week with no activity. If that happens, open the
Supabase dashboard and press **Restore**. Your data is kept.

---

Personal project. Nothing here is investment advice.
