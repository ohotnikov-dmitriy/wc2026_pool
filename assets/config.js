/* EDIT THIS FILE after you deploy the Cloudflare Worker.
 * Put your Worker URL below (no trailing slash). */
window.POOL_CONFIG = {
  // e.g. "https://wc2026-pool.<your-subdomain>.workers.dev"
  API_BASE: "https://wc2026-pool.dhnf11.workers.dev",

  // Submission deadline. Stored as UTC; 23:00 CET on 10 Jun 2026 = 21:00 UTC.
  // (CET is UTC+1 in winter. If your local zone observes summer time in June it is
  //  CEST/UTC+2 → use 21:00Z for CEST. Adjust here if you mean a different offset.)
  DEADLINE_ISO: "2026-06-10T21:00:00Z",
  DEADLINE_LABEL: "23:00 CET · 10 Jun 2026",

  // Title shown in the header.
  TITLE: "World Cup 2026"
};
