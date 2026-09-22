#!/usr/bin/env bash
# 클라우드 샌드박스(리눅스 x64)에서 APK 를 빌드할 수 있게 JDK 17 · Gradle 8.11.1 · Android SDK 를
# 홈 밑(~/.ledger-tools)에 깐다. root 권한 없이 돌고, 이미 깔린 것은 건너뛴다.
#
#   bash tools/setup-android.sh          # 설치
#   source ~/.ledger-tools/env.sh        # 이 셸에 JAVA_HOME / ANDROID_HOME / PATH 적용
#   gradle assembleDebug --no-daemon     # 빌드
#
# 버전은 CI(.github/workflows/build-apk.yml)와 app/build.gradle 에 맞춘다:
# JDK 17, Gradle 8.11.1, compileSdk 36, AGP 8.9.1 기본 build-tools 35.0.0.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TOOLS=${LEDGER_TOOLS:-$HOME/.ledger-tools}
JDK=$TOOLS/jdk17
GRADLE=$TOOLS/gradle-8.11.1
SDK=$TOOLS/android-sdk
CLT_URL=https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

case "$(uname -m)" in
  x86_64)  ARCH=x64 ;;
  aarch64) ARCH=aarch64; echo "주의: arm64 에서는 build-tools(aapt2)가 x64 전용이라 빌드가 실패할 수 있다." ;;
  *) echo "지원하지 않는 아키텍처: $(uname -m)"; exit 1 ;;
esac

mkdir -p "$TOOLS"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# unzip 이 없는 환경도 있어서 python 으로 대신한다
unzipq() {
  if command -v unzip >/dev/null 2>&1; then unzip -q "$1" -d "$2"
  else python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  fi
}

if [ ! -x "$JDK/bin/java" ]; then
  echo "▶ JDK 17 (Temurin) 받는 중"
  curl -fsSL -o "$TMP/jdk.tgz" "https://api.adoptium.net/v3/binary/latest/17/ga/linux/$ARCH/jdk/hotspot/normal/eclipse"
  mkdir -p "$JDK"
  tar -xzf "$TMP/jdk.tgz" -C "$JDK" --strip-components=1
fi

if [ ! -x "$GRADLE/bin/gradle" ]; then
  echo "▶ Gradle 8.11.1 받는 중"
  curl -fsSL -o "$TMP/gradle.zip" https://services.gradle.org/distributions/gradle-8.11.1-bin.zip
  unzipq "$TMP/gradle.zip" "$TOOLS"
  chmod +x "$GRADLE/bin/gradle"
fi

SDKMGR=$SDK/cmdline-tools/latest/bin/sdkmanager
if [ ! -x "$SDKMGR" ]; then
  echo "▶ Android 명령줄 도구 받는 중"
  curl -fsSL -o "$TMP/clt.zip" "$CLT_URL"
  unzipq "$TMP/clt.zip" "$TMP/clt"
  mkdir -p "$SDK/cmdline-tools"
  mv "$TMP/clt/cmdline-tools" "$SDK/cmdline-tools/latest"
  chmod +x "$SDK/cmdline-tools/latest/bin/"*
fi

export JAVA_HOME=$JDK
export ANDROID_HOME=$SDK
export PATH=$JDK/bin:$GRADLE/bin:$PATH

echo "▶ SDK 라이선스 동의 + platform-tools / android-36 / build-tools 35.0.0"
# yes 는 상대가 먼저 닫으면 SIGPIPE 로 끝나서 pipefail 에 걸린다 — 그건 실패가 아니다
(yes 2>/dev/null || true) | "$SDKMGR" --licenses >/dev/null
"$SDKMGR" "platform-tools" "platforms;android-36" "build-tools;35.0.0" >/dev/null

# AGP 는 ANDROID_HOME 이나 local.properties 의 sdk.dir 로 SDK 를 찾는다 (gitignore 됨)
echo "sdk.dir=$SDK" > "$ROOT/local.properties"

cat > "$TOOLS/env.sh" <<EOF
export JAVA_HOME=$JDK
export ANDROID_HOME=$SDK
export PATH=$JDK/bin:$GRADLE/bin:\$PATH
EOF

echo
echo "완료. 빌드 전에 이 셸에 적용:  source $TOOLS/env.sh"
echo "확인:  java -version && gradle --version"
echo "빌드:  cd $ROOT && gradle assembleDebug --no-daemon"
