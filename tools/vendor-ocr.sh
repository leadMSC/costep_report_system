#!/usr/bin/env bash
# 글자 인식(OCR) 도구를 vendor/ocr 에 복사한다 — 외부 CDN 대신 같은 도메인에서 받기 위함(핸드오프 §2·§8).
# 약 12MB 바이너리라 저장소에는 올리지 않고(.gitignore), 배포 전에 이 스크립트로 만든다.
# 고정 버전: tesseract.js 5.1.1 · tesseract.js-core 5.1.1 · @tesseract.js-data/kor·eng 1.0.0 (4.0.0_best_int)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && npm init -y >/dev/null && npm i --silent tesseract.js@5.1.1 tesseract.js-core@5.1.1 @tesseract.js-data/kor@1.0.0 @tesseract.js-data/eng@1.0.0 )
OUT="$ROOT/vendor/ocr"
rm -rf "$OUT" && mkdir -p "$OUT/lang"
cp "$TMP/node_modules/tesseract.js/dist/tesseract.min.js" "$TMP/node_modules/tesseract.js/dist/worker.min.js" "$OUT/"
for f in tesseract-core-simd-lstm.wasm.js tesseract-core-lstm.wasm.js; do cp "$TMP/node_modules/tesseract.js-core/$f" "$OUT/"; done
cp "$TMP/node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz" "$TMP/node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz" "$OUT/lang/"
cp "$TMP/node_modules/tesseract.js/LICENSE.md" "$OUT/LICENSE-tesseract.js.md" 2>/dev/null || true
# gzip 매직(1F 8B) 확인
for g in "$OUT"/lang/*.gz; do [ "$(head -c2 "$g" | od -An -tx1 | tr -d ' \n')" = "1f8b" ] || { echo "gzip 아님: $g"; exit 1; }; done
( cd "$OUT" && sha256sum *.js lang/*.gz > SHA256SUMS )
du -sh "$OUT"
