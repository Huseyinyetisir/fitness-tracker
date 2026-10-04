#!/usr/bin/env bash
# Builds the Android APK from the command line — Android Studio is not needed.
#
#   npm run android:debug     debug APK, signed with the SDK's debug key
#   npm run android:release   release APK, signed with your key (see README)
set -euo pipefail

variant="${1:-debug}"
case "$variant" in
  debug) task=assembleDebug ;;
  release) task=assembleRelease ;;
  *) echo "Usage: scripts/android.sh debug|release" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || fail "Capacitor 8 needs Node 22 or newer (this is Node $node_major). With fnm: fnm use 22"

[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] ||
  fail "ANDROID_HOME is not set. Point it at your Android SDK — see README, \"Android build\"."

# Capacitor 8's Gradle build needs JDK 21. Use JAVA_HOME when it is one;
# otherwise find one, without changing the machine's default Java.
java_major() { "$1/bin/java" -version 2>&1 | awk -F'"' '/version/ { split($2, v, "."); print v[1]; exit }'; }
if [ -z "${JAVA_HOME:-}" ] || [ "$(java_major "$JAVA_HOME")" != "21" ]; then
  candidate="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  if [ -z "$candidate" ] && command -v brew >/dev/null; then
    candidate="$(brew --prefix openjdk@21 2>/dev/null)/libexec/openjdk.jdk/Contents/Home"
  fi
  [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] || fail "JDK 21 not found. Install it with: brew install openjdk@21"
  export JAVA_HOME="$candidate"
fi

if [ "$variant" = release ] && [ ! -f android/keystore.properties ]; then
  fail "android/keystore.properties is missing, so the release APK cannot be signed. See README, \"Release signing\"."
fi

npm run build
npx cap sync android
(cd android && ./gradlew --quiet "$task")

apk="$(find android/app/build/outputs/apk/"$variant" -name '*.apk' | head -n 1)"
echo
echo "APK: $apk"
