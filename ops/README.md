# ops — how prepcadet.in actually runs

Everything in here was, until now, only on the VPS. `deploy.sh` in particular —
the script holding the build-health-check-rollback logic the whole deployment
depends on — had never been committed to any branch. Losing the box meant
rebuilding it from memory. These files are that memory, written down.

## The shape of it

```
GitHub push to main
  └─ .github/workflows/deploy.yml   verify job (typecheck/lint/build/proof), THEN ssh
       └─ /opt/cds-prep/deploy.sh   build idle slot → start it → prove it → flip nginx
            └─ systemd cds-prep@a   next start :3100 from .next-a   ┐ one live,
               systemd cds-prep@b   next start :3101 from .next-b   ┘ one idle
                 └─ nginx prepcadet.in → upstream cds_prep → the live slot
```

Ports **3100/3101**, never 3000: `ai-freelance-platform` already owns 3000 on this host.

## Blue/green, and why

Both slots are the same checkout at `/opt/cds-prep`. They differ in their port
and their build directory (`.next-a` / `.next-b`, via `NEXT_DIST_DIR`, wired up
in `next.config.ts`).

The old arrangement was a single instance that rebuilt `.next` in place and
restarted. What was actually wrong with it:

- **Every deploy restarted the only instance**, and a rollback restarted it
  again. Downtime was the normal path, not the failure path.
- **A failed deploy had already disturbed production** by the time it knew it
  had failed, so recovery meant a second rebuild and a second restart.
- Rebuilding a directory under a running server is genuinely unsound — the
  process holds a manifest for chunks that are being replaced — even though, see
  below, it is not what caused the errors it was blamed for.

**A correction, because the wrong cause was written down first.** The
"Server Reference ID did not match" entries in `/var/log/cds-prep.log` were
attributed to the in-place rebuild. They are not that. The logged values are
`"x"`, `"y"` and a bare SHA — malformed `Next-Action` headers from an outside
scanner probing for the server-action endpoint, which Next rejects correctly.
They appear against a steadily-running instance with no deploy nearby. Blue/green
does not make them stop and was never going to; they are unactionable noise, and
the only thing worth doing about them is not mistaking them for a deploy fault
again.

Now a deploy builds and starts the **idle** slot, health-checks it on its own
port, and only then moves nginx. `nginx -s reload` is graceful: existing workers
finish the requests they are already serving. The live slot is not touched until
traffic has moved, so **every failure before the flip leaves the old version
serving** — the failure path is "nothing happened".

The old slot's build directory is kept after it stops. It is the previous
version, ready to switch back to with one `sed` and a reload, no rebuild.

### Emergency: put traffic back on the other slot

```bash
sed -i 's/:310[01]/:3100/' /etc/nginx/conf.d/cds-prep-upstream.conf   # or :3101
systemctl start cds-prep@a                                            # if stopped
nginx -t && systemctl reload nginx
```

`/opt/cds-prep/.deploy-slot` records which slot the last deploy left live.

## Files

| here | installed at | notes |
| --- | --- | --- |
| `deploy.sh` | `/opt/cds-prep/deploy.sh` | **Deliberately gitignored at its installed path** — see the hazard below |
| `slot-start.sh` | run from the repo | Maps slot letter → port for the unit; no install step |
| `systemd/cds-prep@.service` | `/etc/systemd/system/cds-prep@.service` | Template. Instantiated as `cds-prep@a` / `cds-prep@b` |
| `nginx/cds-prep-upstream.conf` | `/etc/nginx/conf.d/cds-prep-upstream.conf` | The switch. Rewritten by `deploy.sh` |
| `nginx/prepcadet.in` | `/etc/nginx/sites-available/prepcadet.in` | symlink into `sites-enabled/`, then `nginx -t && systemctl reload nginx` |

## Migrating the live box from the single-unit setup

The running box still uses the old `cds-prep.service` on :3100. This is the
one-time cutover. Do it at a quiet moment; it ends with a few seconds of
downtime exactly once, and never again after that.

```bash
cd /opt/cds-prep && git pull

# 1. New units and the upstream switch, not yet in charge of anything.
install -m 644 ops/systemd/cds-prep@.service /etc/systemd/system/
install -m 644 ops/nginx/cds-prep-upstream.conf /etc/nginx/conf.d/
systemctl daemon-reload

# 2. Build slot B while the old service keeps serving from .next on :3100.
NEXT_DIST_DIR=.next-b npm run build

# 3. Start slot B on :3101 and prove it before anything points at it.
systemctl start cds-prep@b
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/    # expect 200

# 4. Point nginx at :3101 and take the old service out.
sed -i 's/:3100;/:3101;/' /etc/nginx/conf.d/cds-prep-upstream.conf
install -m 644 ops/nginx/prepcadet.in /etc/nginx/sites-available/
nginx -t && systemctl reload nginx
curl -sf -o /dev/null -w '%{http_code}\n' https://prepcadet.in/     # expect 200

systemctl disable --now cds-prep          # the old single unit, retired
systemctl enable cds-prep@a cds-prep@b    # so a reboot restores the live one
echo b > /opt/cds-prep/.deploy-slot

# 5. Only now swap in the blue/green deploy script.
install -m 700 ops/deploy.sh /opt/cds-prep/deploy.sh
```

To back out at any point before step 5: `systemctl start cds-prep`, put the
upstream back to `:3100`, reload nginx.

Slot A gets built by the first real deploy after this, which will alternate to it.

## The hazard: deploy.sh must not be a tracked file at its installed path

`deploy.sh` runs `git reset --hard`, and **bash reads a script incrementally as
it executes it**. If the running script were itself tracked in the working tree,
a deploy that changed `deploy.sh` would rewrite the file underneath the running
shell and it would resume at a byte offset that now points at different code.
That failure is intermittent, silent, and lands mid-deploy.

So the copy in this directory is the canonical, reviewable one, and the operational
copy at `/opt/cds-prep/deploy.sh` is gitignored. To update the deploy logic: edit
`ops/deploy.sh`, commit it, then copy it into place by hand:

```bash
install -m 700 /opt/cds-prep/ops/deploy.sh /opt/cds-prep/deploy.sh
```

That copy step is manual on purpose. It is the one thing here that should not
happen automatically.

## Secrets

`/opt/cds-prep/.env.production.local` is read by the systemd unit via
`EnvironmentFile=` and is **not** in this repo and must never be. `.env.example`
at the repo root lists every variable the app reads and what breaks without each.

## Restoring this box from nothing

```bash
git clone https://github.com/Sagar3079/cds-prep.git /opt/cds-prep
cd /opt/cds-prep && npm ci && npm run build

# secrets: recreate from .env.example, then
install -m 600 <your-env-file> /opt/cds-prep/.env.production.local

install -m 700 ops/deploy.sh /opt/cds-prep/deploy.sh
install -m 644 ops/systemd/cds-prep.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now cds-prep

install -m 644 ops/nginx/prepcadet.in /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/prepcadet.in /etc/nginx/sites-enabled/
certbot --nginx -d prepcadet.in -d www.prepcadet.in
nginx -t && systemctl reload nginx
```

The deploy key's `authorized_keys` entry needs the forced command, so a leaked
key can trigger a deploy and nothing else:

```
command="/opt/cds-prep/deploy.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc ssh-ed25519 AAAA...
```

## Android releases

Pushing a `v*` tag builds the signed APK and publishes it as a GitHub Release —
`.github/workflows/android.yml`. Before that, the only public download was a
Release someone made by hand once, while CI produced an expiring artifact behind
a login, and nothing noticed when the two drifted.

```bash
git tag v1.1.0 && git push origin v1.1.0
```

- `versionCode` is `git rev-list --count HEAD` — monotonic, and a property of
  the repo rather than of a CI counter, so it survives the workflow being
  recreated and reproduces locally. `versionName` comes from the tag.
- The asset **must** stay named `cds-prep.apk`. `prepcadet.in/download/android`
  redirects to `releases/latest/download/cds-prep.apk`, which resolves by asset
  name; rename it and the download 404s silently.
- The release is published non-draft and non-prerelease, because
  `releases/latest` skips both.
- A tag build **fails** if the `ANDROID_KEYSTORE_*` secrets are missing, rather
  than publishing a debug-signed APK that would fail Digital Asset Links
  verification and refuse to upgrade over an installed release.

## Known rough edges

- **`npm ci` runs against the live tree.** It is skipped unless
  `package-lock.json` actually changed between the deployed commit and the
  target, which is most deploys — but when it does run, it repopulates
  `node_modules` under the live slot. A registry outage there fails the build,
  which is handled: the live slot keeps serving and the deploy exits non-zero.
- **Both slots share one checkout**, so `git reset --hard` moves source files
  under the running slot. In production Next serves from its build directory and
  does not re-read `src/`, so this is benign — but it is the reason the two
  slots have separate build directories and not separate checkouts.
- **The first deploy after the migration builds a slot from scratch**, so it is
  slower than steady state.
