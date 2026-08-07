/**
 * Support identity and policy facts, in one place.
 *
 * Indian payment gateways (Razorpay, PayU, Cashfree) will not activate an
 * account until the site carries a reachable About, Contact, Terms, Privacy,
 * Refund/Cancellation, Shipping/Delivery and Pricing page. Every one of those
 * pages reads from this file, so the details cannot drift apart between pages
 * — which is the thing a reviewer checks first.
 *
 * DELIBERATELY EMAIL-ONLY. There is no postal address, phone number or trading
 * name here, and no page renders a slot for one. Support runs through a single
 * mailbox, every policy says so, and the promise the site makes is one it can
 * actually keep. Note for whoever fills in the gateway's onboarding form: the
 * form itself will still ask for a registered address and a contact number,
 * and that is answered there, not here.
 */

/** The one support address. Every page, every policy, every error screen. */
export const SUPPORT_EMAIL = "support@prepcadet.in";

export const SITE = {
  name: "CDS Prep",
  domain: "prepcadet.in",
  url: "https://prepcadet.in",
} as const;

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
 *
 * Now true: the deployment runs `rzp_live_` credentials and real cards are
 * charged. It is deliberately still a hand-set constant rather than something
 * derived from the key, so that turning payments on stays a decision somebody
 * made rather than a side effect of an environment variable landing on a box.
 * The direction of the error matters if the two ever disagree: claiming
 * payments are live while no key is set leaves a reader confused, and claiming
 * they are not while real money moves is misrepresentation. This errs the safe
 * way — the claim goes up first, the charging follows.
 */
export const BILLING_LIVE: boolean = true;

/** Shown on every policy page. Bump when the wording materially changes. */
export const LAST_UPDATED = "7 August 2026";

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
