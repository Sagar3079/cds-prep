import { NextResponse } from "next/server";

/**
 * prepcadet.in/download/android → the current Android build.
 *
 * A redirect rather than a file in `public/`, for two reasons. The APK is a
 * binary that changes every release, and committing each one bloats the git
 * history of a repo whose whole point is text. And GitHub's `releases/latest`
 * alias always resolves to the newest published release, so shipping a new
 * version is a release upload — this route, the settings page, and anything
 * else pointing at it never change.
 *
 * The URL is ours, not GitHub's, so it can be printed, put in an ad, or moved
 * to different hosting later without breaking anything already in the wild.
 */
const LATEST =
  "https://github.com/Sagar3079/cds-prep/releases/latest/download/cds-prep.apk";

export function GET() {
  // 302, deliberately not 308. A permanent redirect is cached by the browser
  // forever, which would pin somebody to whatever GitHub URL was current the
  // first time they tapped it.
  return NextResponse.redirect(LATEST, 302);
}
