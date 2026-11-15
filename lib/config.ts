// ─────────────────────────────────────────────────────────────
// APP CONFIGURATION  — edit this file to customise the app.
// ─────────────────────────────────────────────────────────────

export const APP_CONFIG = {
  /** Display name shown in the header and throughout the app. */
  appName: "Ruinan Super 11",

  /**
   * 4-digit admin PIN.
   * ⚠️  Change this before sharing the link with your team!
   * The PIN is checked client-side; it is NOT stored in the database.
   */
  adminPin: "9647",

  /** Local currency symbol shown next to amounts. */
  currency: "₹",

  /** Default fee charged per player per match. */
  defaultFeePerMatch: 100,

  /** Number of players in each friendly team. */
  friendlyTeamSize: 11,
} as const;
