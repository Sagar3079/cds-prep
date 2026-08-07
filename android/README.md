# CDS Prep — Android (Trusted Web Activity)

This wraps https://prepcadet.in in a Trusted Web Activity (TWA): a thin native shell
(`com.google.androidbrowserhelper:androidbrowserhelper:2.7.2`, `LauncherActivity`) that hands the
URL straight to Chrome's rendering engine with no browser chrome. There is no custom Activity or
UI code in this module — every behavior (URL, colors, splash screen) is declared as manifest
`meta-data` and read by the library at runtime. If you're looking for "the app's code," it's
`app/src/main/AndroidManifest.xml`.

## Prerequisites this repo doesn't (and can't) verify

- **Digital Asset Links.** The chrome-less experience only activates once Chrome verifies, in
  both directions, that this app and prepcadet.in trust each other. This project handles the
  app→site half (`asset_statements` in `res/values/strings.xml`). The site→app half is a
  `/.well-known/assetlinks.json` file that must be deployed on prepcadet.in itself (outside this
  repo) declaring this app's `applicationId` (`in.prepcadet.app`) and the SHA-256 certificate
  fingerprint of whatever key you sign the release build with. Until that file is live, the app
  still works — it just falls back to a normal Custom Tab with a visible URL bar instead of full
  screen.
- **Android SDK / Android Studio.** Not installed on the machine these files were written on, so
  none of this has been built or run. The Gradle wrapper (`gradlew`/`gradlew.bat` +
  `gradle/wrapper/gradle-wrapper.jar`) is real, downloaded from the official Gradle 8.14.5 tag —
  running `./gradlew` will fetch the actual Gradle distribution and the Android SDK components
  AGP needs, same as any fresh checkout.

## Building locally

```bash
cd android
./gradlew assembleDebug      # unsigned-but-installable debug APK, always works, no secrets needed
./gradlew assembleRelease    # release APK — signed IF the four env vars below are set, unsigned otherwise
./gradlew bundleRelease      # release .aab, same signing behavior, what you'd actually upload to Play
```

Debug builds sign with the auto-generated `~/.android/debug.keystore`, so `assembleDebug` never
needs configuration — that's what makes it safe as a CI smoke test on a bare checkout.

## Release signing

`app/build.gradle` reads four values, checking an environment variable first and a Gradle
property (`-P` flag, or `~/.gradle/gradle.properties`) second, so the same script works
unmodified on a laptop and in CI:

| Variable            | Meaning                                                  |
|----------------------|-----------------------------------------------------------|
| `KEYSTORE_FILE`      | Path to the `.jks`/`.keystore` file (absolute, or relative to `android/app/`) |
| `KEYSTORE_PASSWORD`  | Password for that keystore                                |
| `KEY_ALIAS`          | Alias of the signing key inside it                         |
| `KEY_PASSWORD`       | Password for that specific key (may differ from the store password) |

If all four are present **and** the file at `KEYSTORE_FILE` actually exists, `assembleRelease`
and `bundleRelease` produce a signed artifact. If any are missing, the release build still
succeeds — it just produces an unsigned artifact, so CI can validate the build graph and lint
without secrets, and a separate signing step (or a rerun with secrets injected) does the actual
signing. No keystore or password is ever committed — see `.gitignore`.

Generating a new upload key (do this once, then store the file and passwords outside git —
a secrets manager, CI's encrypted-secrets store, etc.):

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore cds-prep-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then either export the four env vars before invoking Gradle, or pass them as `-P` properties:

```bash
export KEYSTORE_FILE=/secure/path/cds-prep-upload.jks
export KEYSTORE_PASSWORD=...
export KEY_ALIAS=upload
export KEY_PASSWORD=...
./gradlew bundleRelease
```

To get the SHA-256 fingerprint for the site's `assetlinks.json` (see above):

```bash
keytool -list -v -keystore cds-prep-upload.jks -alias upload
```

## Project layout

```
android/
  settings.gradle, build.gradle, gradle.properties   # root Gradle config (Groovy DSL throughout)
  gradle/wrapper/                                    # pinned to Gradle 8.14.5
  app/
    build.gradle                                     # compileSdk/minSdk/targetSdk 35/21/35, signing
    proguard-rules.pro
    src/main/
      AndroidManifest.xml                            # the actual app — TWA config lives here
      res/values/strings.xml                          # app_name + Digital Asset Links statement
      res/values/colors.xml                            # brand accent (#2F6BFF) + splash background
      res/xml/filepaths.xml                             # FileProvider paths for splash handoff
      res/mipmap-anydpi-v26/ic_launcher.xml              # adaptive icon (API 26+)
      res/mipmap/ic_launcher.xml                         # flat fallback icon (API 21-25)
      res/drawable/ic_launcher_foreground.xml, splash.xml # vector mark, no bitmaps
```

## Bumping versions later

- **App version:** `versionCode`/`versionName` in `app/build.gradle` — bump both for every Play
  Store upload, `versionCode` must strictly increase.
- **androidbrowserhelper:** check `https://dl.google.com/android/maven2/com/google/androidbrowserhelper/androidbrowserhelper/maven-metadata.xml`
  for the current `<release>` before bumping; it ships from Google's Maven, not Maven Central.
- **Gradle/AGP:** this project intentionally pins the last Gradle 8.x line (wrapper 8.14.5, AGP
  8.13.2) rather than the Gradle/AGP 9.x that's current as of this writing, since 9.x is a bigger
  jump (new dependency-resolution defaults, dropped legacy behaviors) not worth taking on for a
  TWA shell with no build logic of its own.
