import type { Metadata } from "next";
import { currentAccount, displayName } from "@/lib/account";
import { getBoard } from "@/app/api/leaderboard/route";
import { toSubject } from "@/lib/subject";
import { pageMetadata } from "@/lib/pageMeta";
import LeaderboardClient from "./LeaderboardClient";

/**
 * Metadata lives here directly now. It used to live in a sibling
 * `layout.tsx` whose entire reason to exist was that this page was a client
 * component, and a client component cannot export `metadata` — now that this
 * is a server component (see below), that workaround is no longer needed and
 * `layout.tsx` has been removed rather than left carrying a comment about a
 * constraint that no longer applies.
 */
export const metadata: Metadata = pageMetadata({
  path: "/leaderboard",
  title: "Daily leaderboard",
  description:
    "This week's top scores on the daily CDS English and General Knowledge tests, best attempt of the week.",
});

/**
 * Server component now, not client.
 *
 * It used to render an empty shell and fetch the board from
 * `/api/leaderboard` after mount — real content, but only ever visible to
 * something that runs JavaScript. `robots.ts` disallows all of `/api/`, and
 * Google's renderer respects that even for a fetch a client script makes
 * during rendering, so the page's only actual content — the ranked rows,
 * which is the entire reason anyone would link to or search for this page —
 * was structurally invisible to indexing.
 *
 * `getBoard()` is called directly, in-process, rather than through an HTTP
 * request to the app's own API — cheaper, and it sidesteps the robots
 * question entirely since nothing is being "fetched" from a disallowed path
 * at all. The interactive part (subject switching, live polling, "you"
 * highlighting) is unchanged and lives in `LeaderboardClient`, seeded with
 * whatever this component already resolved so the first thing a visitor
 * (or a crawler) sees is the real board, not a loading state.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const params = await searchParams;
  const hadExplicitSubject =
    typeof params.subject === "string" && params.subject.length > 0;
  const subject = toSubject(params.subject);

  const acct = await currentAccount();
  const board = await getBoard(subject, acct);

  const initialMe = acct
    ? { signedIn: true, name: displayName(acct) }
    : { signedIn: false };

  return (
    <LeaderboardClient
      initialSubject={subject}
      initialBoard={board}
      initialMe={initialMe}
      hadExplicitSubject={hadExplicitSubject}
    />
  );
}
