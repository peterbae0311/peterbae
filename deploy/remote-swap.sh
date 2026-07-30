#!/bin/bash
# 서버에서 실행됨. GitHub Actions가 빌드한 결과물을 안전하게 교체 배포한다.
#
# 왜 이런 방식인가: 예전에는 서버에서 직접 `npm run build`를 실행했는데, 빌드 도중
# .next 안의 파일이 하나씩 덮어써지는 사이 PM2가 계속 재시작을 시도하다가 아직
# 다 안 써진 파일(prerender-manifest.json 등)을 읽어서 크래시가 반복된 적이 있다
# (career 앱이 11시간 동안 144번 재시작됨).
#
# 이 스크립트는 새 빌드를 완전히 별도 디렉토리(<app>-new)에 다 준비해놓고,
# 준비가 100% 끝난 뒤에만 mv로 통째로 교체한다. mv는 원자적이라 교체 순간에
# "반쯤 된 상태"가 존재하지 않고, 기존에 돌던 프로세스는 이미 열어둔 파일
# 핸들로 계속 안전하게 실행되다가 pm2 reload 시점에만 새 디렉토리를 읽는다.
#
# node_modules는 CI 아티팩트에 이미 포함되어 있어 서버에서 npm ci를 돌리지 않는다
# (RAM 500MB 서버에서 6개 앱이 동시에 npm ci를 돌리다 SSH 연결이 끊기는 문제가 있었음).

set -euo pipefail

APP="$1"
ARCHIVE="$2"
APPS_DIR="$HOME/apps"

cd "$APPS_DIR"
rm -rf "${APP}-new"
mkdir "${APP}-new"
tar -xzf "$ARCHIVE" -C "${APP}-new"

# 서버에 이미 있는 .env(실제 시크릿)는 그대로 유지 — CI 아티팩트에는 .env를 담지 않는다.
if [ -f "${APP}/.env" ]; then
  cp "${APP}/.env" "${APP}-new/.env"
fi

cd "$APPS_DIR"
rm -rf "${APP}-old"
if [ -d "$APP" ]; then
  mv "$APP" "${APP}-old"
fi
mv "${APP}-new" "$APP"

pm2 reload "$APP" --update-env

rm -f "$ARCHIVE"
echo "deployed: $APP"
