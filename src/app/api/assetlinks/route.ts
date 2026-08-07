import { NextResponse } from "next/server";

/**
 * Digital Asset Links, served at /.well-known/assetlinks.json via a rewrite.
 *
 * This file is the entire reason a Trusted Web Activity can drop the browser
 * UI. Chrome fetches it from the domain the app claims to represent and checks
 * that the signing certificate of the installed APK is listed here. Without a
 * match the app still works — it just falls back to a Custom Tab with a visible
 * URL bar, which is the giveaway that verification is failing.
 *
 * The fingerprint comes from the environment, not from a committed constant,
 * because it is not known until a release keystore exists and it changes if the
 * key is ever rotated. Putting it in the repo would mean a rebuild and a deploy
 * to fix a mismatch; in the environment it is a restart. It is not a secret —
 * a certificate fingerprint is public by construction — it is just late-bound.
 *
 * Served as a route rather than a file in `public/` because Next's static
 * handling of dot-directories has moved around between versions, and a rewrite
 * to a handler behaves the same on every one of them.
 */

const PACKAGE = process.env.ANDROID_PACKAGE ?? "in.prepcadet.app";

/** Colon-separated uppercase hex, exactly as `keytool -list` prints it. */
const FINGERPRINTS = (process.env.ANDROID_CERT_SHA256 ?? "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export async function GET() {
  const body = FINGERPRINTS.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: PACKAGE,
            sha256_cert_fingerprints: FINGERPRINTS,
          },
        },
      ]
    : // An empty array is the honest answer before a key exists: valid JSON that
      // verifies nothing, rather than a 404 that reads as a broken domain.
      [];

  return NextResponse.json(body, {
    headers: {
      "content-type": "application/json",
      // Chrome caches this. Short enough that fixing a wrong fingerprint does
      // not mean waiting a day for every installed app to notice.
      "cache-control": "public, max-age=300",
    },
  });
}
