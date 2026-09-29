/* ============================================================
   RUN WATCHLIST — js/data.js

   Two things live here:

   1. STARTER_COMPANIES — the companies the site started with.
      After you sign in, an empty workspace offers a one-click
      "Import starter companies" button that copies these into
      your Supabase database. In local mode (no Supabase settings
      yet) they are shown straight away.

      You do NOT need to edit this file to add companies any more.
      Use "+ Add Company" on the Watchlist page instead.

   2. RUN — the fixed vocabularies the workspace uses
      (decision states, checklist template, document types …).
      Change a label here if you prefer different wording.
   ============================================================ */

const STARTER_COMPANIES = [
  {
    slug: "helios-industrial",
    name: "Helios Industrial Systems",
    ticker: "HELIO",
    sector: "Industrials",
    description: "Precision motion control and grid-scale automation systems.",
    researchStatus: "researched",
    researchFile: "research/helios-industrial.html",
    addedOn: "2026-09-24",
    summary: "Order book inflected in Q2 on grid capex. Margin recovery is the open question."
  },
  {
    slug: "seamac-concall",
    name: "Seamac — Conference Call Analysis",
    ticker: "SEAMECLTD",
    sector: "Offshore & Marine Services",
    description: "Earnings conference call and management guidance analysis.",
    researchStatus: "researched",
    researchFile: "research/seamac-concall.html",
    addedOn: "2026-09-11",
    summary: "Management commentary on vessel charter day rates, dry-docking schedule, and order book execution."
  },
  {
    slug: "seamac-ar26",
    name: "Seamac — Annual Report FY26",
    ticker: "SEAMECLTD",
    sector: "Offshore & Marine Services",
    description: "Annual Report FY26 deep fundamental and operational analysis.",
    researchStatus: "researched",
    researchFile: "research/seamac-ar26.html",
    addedOn: "2026-09-11",
    summary: "Deep dive into fleet utilization, offshore exploration capex cycles, debt reduction, and return metrics."
  },
  {
    slug: "mm-forgings",
    name: "MM Forgings",
    ticker: "MMFL",
    sector: "Auto Components",
    description: "Interactive investment research terminal and valuation study.",
    researchStatus: "researched",
    researchFile: "research/mm-forgings.html",
    addedOn: "2026-08-23",
    summary: "High-pressure forgings, export demand cycles, and EV drivetrain component roadmap."
  }
];

/* Kept for anything that still refers to the old name. */
const COMPANIES = STARTER_COMPANIES;

const RUN = {

  /* Research status drives the Watchlist rail (the existing legend). */
  RESEARCH_STATUS: [
    { value: 'watch',       label: 'Watching' },
    { value: 'researching', label: 'Researching' },
    { value: 'researched',  label: 'Researched' }
  ],

  /* Your investment decision. Listed alphabetically-neutral on screen:
     the app never ranks, colours or recommends any of these. */
  DECISIONS: [
    { value: 'researching', label: 'Researching' },
    { value: 'watch',       label: 'Watch' },
    { value: 'wait',        label: 'Wait' },
    { value: 'buy',         label: 'Buy' },
    { value: 'hold',        label: 'Hold' },
    { value: 'avoid',       label: 'Avoid' },
    { value: 'sold',        label: 'Sold' },
    { value: 'archived',    label: 'Archived' }
  ],

  HOLDING_STATUS: [
    { value: 'not_held', label: 'Not held' },
    { value: 'holding',  label: 'Holding' },
    { value: 'partial',  label: 'Partly exited' },
    { value: 'exited',   label: 'Exited' }
  ],

  /* Created for every company the first time its workspace opens.
     Items can be renamed, removed, or added to per company. */
  CHECKLIST_TEMPLATE: [
    'Annual Report',
    'Quarterly Results',
    'Earnings / Conference Call',
    'Investor Presentation',
    'Financial Statements',
    'Industry Research',
    'Competitor Analysis',
    'Management Assessment',
    'Business Model',
    'Growth Drivers',
    'Capital Allocation',
    'Valuation',
    'Risks',
    'Final Investment Thesis',
    'Final Decision'
  ],

  CONFIDENCE: [
    { value: 1, label: 'Very low' },
    { value: 2, label: 'Low' },
    { value: 3, label: 'Medium' },
    { value: 4, label: 'High' },
    { value: 5, label: 'Very high' }
  ],

  VALUATION_METHODS: ['P/E', 'EV/EBITDA', 'DCF', 'P/B', 'SOTP', 'EV/Sales', 'Dividend yield', 'Other'],

  CURRENCIES: [
    { value: 'INR', symbol: '₹' },
    { value: 'USD', symbol: '$' },
    { value: 'EUR', symbol: '€' },
    { value: 'GBP', symbol: '£' }
  ],

  LEVELS: [
    { value: 'low',    label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high',   label: 'High' }
  ],

  CATALYST_STATUS: [
    { value: 'expected',  label: 'Expected' },
    { value: 'occurred',  label: 'Occurred' },
    { value: 'delayed',   label: 'Delayed' },
    { value: 'cancelled', label: 'Cancelled' }
  ],

  RISK_STATUS: [
    { value: 'monitoring',   label: 'Monitoring' },
    { value: 'emerging',     label: 'Emerging' },
    { value: 'materialised', label: 'Materialised' },
    { value: 'retired',      label: 'Retired' }
  ],

  QUESTION_STATUS: [
    { value: 'open',          label: 'Open' },
    { value: 'investigating', label: 'Investigating' },
    { value: 'resolved',      label: 'Resolved' }
  ],

  TASK_PRIORITY: [
    { value: 'low',    label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high',   label: 'High' }
  ],

  /* folder = sub-folder used inside Supabase Storage */
  DOC_TYPES: [
    { value: 'annual_report',     label: 'Annual report',        folder: 'annual-reports' },
    { value: 'quarterly_results', label: 'Quarterly results',    folder: 'quarterly-results' },
    { value: 'concall',           label: 'Conference call',      folder: 'concalls' },
    { value: 'presentation',      label: 'Investor presentation', folder: 'presentations' },
    { value: 'filing',            label: 'Exchange filing',      folder: 'filings' },
    { value: 'broker_report',     label: 'Broker report',        folder: 'broker-reports' },
    { value: 'screenshot',        label: 'Screenshot',           folder: 'screenshots' },
    { value: 'notes',             label: 'Notes',                folder: 'notes' },
    { value: 'other',             label: 'Other',                folder: 'other' }
  ],

  UPDATE_TYPES: [
    { value: 'note',      label: 'Note' },
    { value: 'thesis',    label: 'Thesis' },
    { value: 'valuation', label: 'Valuation' },
    { value: 'decision',  label: 'Decision' },
    { value: 'status',    label: 'Status' },
    { value: 'review',    label: 'Review' },
    { value: 'price',     label: 'Price' },
    { value: 'result',    label: 'Results' },
    { value: 'news',      label: 'News' },
    { value: 'checklist', label: 'Checklist' },
    { value: 'file',      label: 'File' },
    { value: 'question',  label: 'Question' },
    { value: 'catalyst',  label: 'Catalyst' },
    { value: 'risk',      label: 'Risk' },
    { value: 'task',      label: 'Task' },
    { value: 'trade',     label: 'Trade' },
    { value: 'other',     label: 'Other' }
  ],

  /* Supabase free plan file storage (used for the storage meter). */
  STORAGE_LIMIT_MB: 1024,

  REVIEW_PRESETS: [
    { value: 'in_days_30',   label: 'In 30 days',          trigger: 'in_days',      days: 30 },
    { value: 'in_days_90',   label: 'In 90 days',          trigger: 'in_days',      days: 90 },
    { value: 'monthly',      label: 'Monthly',             trigger: 'monthly',      days: 30, recurring: 30 },
    { value: 'quarterly',    label: 'Every quarter',       trigger: 'quarterly',    days: 91, recurring: 91 },
    { value: 'next_results', label: 'After next results',  trigger: 'next_results', days: 90 },
    { value: 'catalyst',     label: 'When a catalyst occurs', trigger: 'catalyst' },
    { value: 'date',         label: 'On a date',           trigger: 'date' }
  ],

  /* Look up a label from any list above. */
  label(list, value, fallback = '—') {
    const hit = (this[list] || []).find(x => x.value === value);
    return hit ? hit.label : (value == null || value === '' ? fallback : String(value));
  },

  /* ₹1,024 · ₹1,024.50 · ₹1,02,450 (Indian grouping for INR). */
  money(value, currency = 'INR') {
    if (value === null || value === undefined || value === '' || isNaN(Number(value))) return '—';
    const n = Number(value);
    const cur = this.CURRENCIES.find(c => c.value === currency) || this.CURRENCIES[0];
    const locale = cur.value === 'INR' ? 'en-IN' : 'en-US';
    const digits = Number.isInteger(n) ? 0 : 2;
    return cur.symbol + n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  }
};
