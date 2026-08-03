/**
 * Merchant identity and policy facts, in one place.
 *
 * Indian payment gateways (Razorpay, PayU, Cashfree) will not activate an
 * account until the site carries a reachable About, Contact, Terms, Privacy,
 * Refund/Cancellation, Shipping/Delivery and Pricing page, and until the
 * contact details on them match what was submitted during onboarding. Every
 * one of those pages reads from this file, so the details cannot drift apart
 * between pages — which is the thing a reviewer checks first.
 *
 * NOTHING HERE IS INVENTED. The three fields below that are `null` are facts
 * only the business owner has; a plausible-looking address on a live payments
 * page is worse than a missing one, so they render as nothing until filled in
 * rather than as a placeholder somebody might ship.
 */

/** The support address, used on every page and in every policy. */
export const SUPPORT_EMAIL = "support@prepcadet.in";

export const SITE = {
  name: "CDS Prep",
  domain: "prepcadet.in",
  url: "https://prepcadet.in",
} as const;

export const MERCHANT = {
  /**
   * The name the bank account and the gateway registration are in — a
   * proprietorship name, an LLP, or a private limited company. This is the
   * name that must appear on Terms, Refunds and the card statement.
   *
   * TODO(owner): set before submitting to a payment gateway.
   */
  legalName: null as string | null,

  /**
   * Full registered/operating address including PIN code. Gateways require a
   * verifiable postal address on the Contact page.
   *
   * TODO(owner): set before submitting to a payment gateway.
   */
  address: null as string | null,

  /**
   * A phone number that is actually answered, with country code.
   *
   * TODO(owner): set before submitting to a payment gateway.
   */
  phone: null as string | null,

  /**
   * The city whose courts govern disputes. Should be where the business
   * operates from; the gateway does not check this, but a contract naming no
   * forum is a contract worth less than the paper it isn't on.
   *
   * TODO(owner): set to your city, e.g. "Bengaluru, Karnataka".
   */
  jurisdiction: null as string | null,

  /** GST number, if registered. Left null when the business is below the
   *  threshold — an unregistered seller must NOT display a GSTIN. */
  gstin: null as string | null,
} as const;

/** True once every field a gateway reviewer looks for has been filled in. */
export const merchantComplete =
  MERCHANT.legalName !== null &&
  MERCHANT.address !== null &&
  MERCHANT.phone !== null;

/** Which of them are still missing, for the dev-only nag on /contact. */
export const missingMerchantFields = (
  [
    ["legalName", MERCHANT.legalName],
    ["address", MERCHANT.address],
    ["phone", MERCHANT.phone],
    ["jurisdiction", MERCHANT.jurisdiction],
  ] as const
)
  .filter(([, v]) => v === null)
  .map(([k]) => k);

/**
 * Support turnaround, stated once and quoted by every policy that promises a
 * reply. Change it here and the promise changes everywhere, rather than in
 * four places minus the one that gets missed.
 */
export const SUPPORT_HOURS = "Monday to Saturday, 10am–7pm IST";
export const REPLY_WINDOW = "within 2 working days";

/** How long a refund takes to land once approved. Gateway settlement time,
 *  not ours — quoted as a range because the issuing bank owns the last leg. */
export const REFUND_WINDOW = "5–7 working days";

/** The window in which a subscription can be refunded at all. */
export const REFUND_ELIGIBILITY_DAYS = 7;

/**
 * Plans, in paise so no float ever touches a price.
 *
 * The pricing page and the in-app plan sheet both read this array, because a
 * price shown to a customer in two places that disagree is a chargeback.
 */
export const PLANS = [
  {
    id: "weekly",
    name: "Weekly",
    paise: 4900,
    per: "week",
    days: 7,
    blurb: "Unlimited random sets for seven days.",
  },
  {
    id: "monthly",
    name: "Monthly",
    paise: 14900,
    per: "month",
    days: 30,
    blurb: "Everything in weekly, at about half the weekly rate.",
    best: true,
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Whether card payments are actually live.
 *
 * Every policy page reads this. While it is false the pages say plainly that
 * nothing can be charged yet — a Refund Policy that describes refunds for
 * payments the site cannot take is the kind of copy that gets an application
 * rejected for misrepresentation. Flip it in the same commit that wires up
 * the gateway, not before.
 */
export const BILLING_LIVE: boolean = false;

/** Shown on every policy page. Bump when the wording materially changes. */
export const LAST_UPDATED = "3 August 2026";

/**
 * The year in the footer's copyright line.
 *
 * A constant, not `new Date().getFullYear()`: the footer renders on the server
 * and again on the client, and for the hours around New Year those two are in
 * different years whenever the server's clock is not in IST — a hydration
 * mismatch on every page of the site, to save editing one line a year.
 */
export const COPYRIGHT_YEAR = 2026;

/** The policy pages, in the order a gateway reviewer walks them. Drives both
 *  the site footer and the sitemap, so a new page cannot be added in one
 *  place and forgotten in the other. */
export const LEGAL_LINKS = [
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms & conditions" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/refunds", label: "Refunds & cancellation" },
  { href: "/shipping", label: "Delivery" },
] as const;
