#!/usr/bin/env bash
# 운영 반영: 커밋본(HEAD)에 버전 표시(커밋 번호·시각)를 넣어 VPS 에 올리고, 운영에서 실제로 내려받은 파일로 확인한다.
# 사용: bash tools/deploy.sh   (리드디벨롭 폴더에서, 작업 폴더가 깨끗해야 함)
# - 서버 설정(Caddy)·다른 서비스는 건드리지 않는다. 이전본은 index.html.prev 로 남긴다.
# - 열어 둔 탭은 옛 코드로 계속 돈다 → 앱이 버전 표시를 1분마다 비교해 '새 버전이 올라왔어요' 를 띄운다.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="C:/Users/Belief-desktop/.ssh/salespt_vps"
HOST="root@76.13.183.45"
DIR="/var/www/msc-report"
URL="https://costepmsc-report.com/"
SRC="코스텝_경영진단_리드디벨롭.html"

if [ -n "$(git status --porcelain -- "$SRC")" ]; then echo "중단: $SRC 에 커밋 안 한 변경이 있음"; exit 1; fi
REV=$(git rev-parse --short HEAD)
BUILD="$REV $(date '+%Y-%m-%d %H:%M')"
TMP=$(mktemp)
git show "HEAD:$SRC" > "$TMP"
n=$(grep -c '<meta name="msc-build" content="dev">' "$TMP" || true)
if [ "$n" != "1" ]; then echo "중단: 버전 표시 자리(msc-build=dev)가 $n 개"; rm -f "$TMP"; exit 1; fi
sed -i "s|<meta name=\"msc-build\" content=\"dev\">|<meta name=\"msc-build\" content=\"$BUILD\">|" "$TMP"
WANT=$(sha256sum "$TMP" | cut -c1-16)

scp -q -i "$KEY" "$TMP" "$HOST:$DIR/index.html.new"
ssh -i "$KEY" "$HOST" "cd $DIR && cp -p index.html index.html.prev && mv index.html.new index.html && chmod 644 index.html"
rm -f "$TMP"

# 운영에서 실제로 내려받은 파일(캐시 우회)로 확인
GOT=$(curl -s -H 'Cache-Control: no-cache' "$URL?_v=$(date +%s)" | sha256sum | cut -c1-16)
LIVE=$(curl -s "$URL?_v=$(date +%s)" | grep -o '<meta name="msc-build" content="[^"]*">' | sed 's/.*content="\([^"]*\)".*/\1/')
echo "버전: $LIVE"
echo "해시: 올린 파일 $WANT / 운영에서 받은 파일 $GOT"
[ "$WANT" = "$GOT" ] && echo "확인: 운영 = 커밋 $REV" || { echo "실패: 운영 파일이 다름"; exit 1; }
echo "다른 서비스: 경영일지 $(curl -s -o /dev/null -w '%{http_code}' https://salesptlog.online/) · 모아워크 $(curl -s -o /dev/null -w '%{http_code}' https://www.moa-work.com/)"
echo "안내: 이미 열려 있는 탭은 새로고침해야 새 버전이 돈다(1분 안에 '새 버전' 알림이 뜸)"
