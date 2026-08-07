# Intentionally empty. androidbrowserhelper ships its own consumer-rules.pro inside the AAR
# (merged automatically by AGP), and this app has no reflection-based code of its own — no
# Gson/Moshi models, no WebView JS bridges — that R8 could strip incorrectly. Add rules here
# only if `assembleRelease` (with minifyEnabled true) crashes at runtime in a way debug doesn't;
# that's the signal something got stripped that shouldn't have been.
