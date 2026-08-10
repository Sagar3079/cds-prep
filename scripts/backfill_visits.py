#!/usr/bin/env python3
"""Seed the visit counters from nginx access logs.

The panel's `visit` counter only knows about days since the beacon shipped, so
every day before that reads zero — including the days an ad campaign ran, which
is exactly the history worth having. nginx logged all of it and nothing else
did, so this is the one recoverable metric of the ones that were missing.

WHAT IT COUNTS, and why it is not quite the same thing as the live counter:

The live counter fires from the browser, once per tab, so it counts sessions by
something that executed JavaScript. A log line cannot tell us whether JavaScript
ran. The closest honest reconstruction is a unique client address per day that
asked for a PAGE — not an asset, not a probe — with obvious crawlers and
scanners removed. That over-counts people sharing an address and under-counts
one person on several networks, and it is a reconstruction rather than a
measurement.

Only writes days STRICTLY BEFORE the beacon's first day, so a backfilled day and
a measured day can never be added together.

    python3 scripts/backfill_visits.py --from-day 2026-08-11          # dry run
    python3 scripts/backfill_visits.py --from-day 2026-08-11 --write
"""

from __future__ import annotations

import argparse
import glob
import gzip
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

# `1.2.3.4 - - [10/Aug/2026:00:28:22 +0200] "GET /path HTTP/1.1" 200 ...`
LINE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\] "(?P<method>[A-Z]+) (?P<path>\S+)[^"]*" (?P<status>\d{3})'
)

# Anything whose user agent says it is a robot. Not exhaustive and cannot be:
# the scanners that spray /wp-admin often present as a browser. Those are caught
# by the path filter instead, since they never request a real page.
BOT = re.compile(
    r"bot|crawl|spider|slurp|scan|curl|wget|python-requests|go-http|zgrab|"
    r"censys|masscan|nmap|headless|monitor|uptime|pingdom|semrush|ahrefs|"
    r"bytespider|gptbot|claudebot|facebookexternalhit|preview",
    re.I,
)

# Real pages only. Assets and API calls ride along with a page view and would
# multiply one visitor into twenty.
ASSET = re.compile(r"^/(_next|api|favicon|robots|sitemap|opengraph|icon|apple-)|\.(js|css|woff2?|png|jpe?g|svg|ico|webmanifest|txt|xml|map)$")

# The routes this site actually serves. A request for /wp-login.php is a scanner
# no matter what user agent it claims, and counting it as a visitor is how a
# traffic figure becomes fiction.
REAL_PAGE = re.compile(
    r"^/($|landing|test|results|history|leaderboard|settings|pricing|about|"
    r"contact|terms|privacy|refunds|shipping|download)"
)


def ist_day(raw: str) -> str | None:
    """`10/Aug/2026:00:28:22 +0200` -> the IST calendar day it falls in."""
    try:
        return datetime.strptime(raw, "%d/%b/%Y:%H:%M:%S %z").astimezone(IST).strftime("%Y-%m-%d")
    except ValueError:
        return None


def read_lines(paths: list[str]):
    for path in paths:
        opener = gzip.open if path.endswith(".gz") else open
        try:
            with opener(path, "rt", errors="replace") as fh:
                yield from fh
        except OSError as exc:
            print(f"  ! skipping {path}: {exc}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--logs", default="/var/log/nginx/access.log*")
    ap.add_argument(
        "--from-day",
        required=True,
        help="First day the live beacon covers (IST, YYYY-MM-DD). Days on or after this are left alone.",
    )
    ap.add_argument("--write", action="store_true", help="Actually write. Default is a dry run.")
    args = ap.parse_args()

    paths = sorted(glob.glob(args.logs))
    if not paths:
        print(f"no logs matched {args.logs}", file=sys.stderr)
        return 1
    print(f"reading {len(paths)} log file(s)")

    per_day: dict[str, set[str]] = defaultdict(set)
    seen = kept = 0

    for line in read_lines(paths):
        seen += 1
        m = LINE.match(line)
        if not m:
            continue
        path = m.group("path").split("?")[0]
        if ASSET.match(path) or not REAL_PAGE.match(path):
            continue
        # 4xx/5xx are probes and typos, not visits. 3xx is a real arrival that
        # got redirected, so it counts.
        if not m.group("status").startswith(("2", "3")):
            continue
        agent = line.rsplit('"', 2)[-2] if line.count('"') >= 4 else ""
        if BOT.search(agent):
            continue
        day = ist_day(m.group("ts"))
        if not day or day >= args.from_day:
            continue
        per_day[day].add(m.group("ip"))
        kept += 1

    print(f"{seen} lines, {kept} counted as page views by a plausible human\n")
    if not per_day:
        print("nothing to backfill")
        return 0

    print(f"{'day':<12} {'visitors':>9}")
    for day in sorted(per_day):
        print(f"{day:<12} {len(per_day[day]):>9}")
    print(f"{'TOTAL':<12} {sum(len(v) for v in per_day.values()):>9}\n")

    if not args.write:
        print("dry run — pass --write to store these")
        return 0

    url, token = os.environ.get("KV_REST_API_URL"), os.environ.get("KV_REST_API_TOKEN")
    if not url or not token:
        print("KV_REST_API_URL / KV_REST_API_TOKEN not set", file=sys.stderr)
        return 1

    def cmd(parts: list[str]):
        req = urllib.request.Request(
            url,
            data=json.dumps([str(p) for p in parts]).encode(),
            headers={"authorization": f"Bearer {token}", "content-type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.load(res).get("result")

    ttl = 400 * 86400
    for day in sorted(per_day):
        key = f"stat:visit:{day}"
        # SET, not INCRBY: running this twice must not double the figure.
        cmd(["SET", key, len(per_day[day]), "EX", ttl])
        print(f"  wrote {key} = {len(per_day[day])}")
    print("\ndone")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
