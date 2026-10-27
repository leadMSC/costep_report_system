"""MSC 리포트 글자 인식 서버 — PaddleOCR 모델(PP-OCRv4 글줄 찾기 + PP-OCRv5 한글 읽기)을 RapidOCR(ONNX)로 돌린다.

- POST /ocr/api  (본문: JPEG·PNG 그림, 머리: Authorization: Bearer <Supabase 로그인 토큰>)
  → {"text": "줄\\n줄…", "lines": [{"t": 글, "s": 확신도, "b": [x0,y0,x1,y1]}…], "ms": 걸린 시간}
- 그림·읽은 글은 디스크·로그에 남기지 않는다(메모리에서 읽고 바로 버림). 로그는 시각·크기·걸린 시간·결과 상태만.
- 승인된 사용자(profiles.role 이 pending·blocked 가 아님)만. 한 번에 한 장(같은 서버의 다른 운영 서비스 보호).
"""
import json
import logging
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR

SB_URL = os.environ.get('MSC_SB_URL', 'https://yddencwikwzllnsoalbg.supabase.co')
SB_KEY = os.environ.get('MSC_SB_KEY', 'sb_publishable_xuAfRW1_ARpYH25N0mYm5A_IOL2Y1mp')   # 공개용 키(브라우저에도 있는 값)
PORT = int(os.environ.get('MSC_OCR_PORT', '3410'))
MAX_BYTES = 15 * 1024 * 1024
MAX_SIDE = 2400
ORIGINS = {'https://costepmsc-report.com', 'http://localhost:5180', 'http://127.0.0.1:5180'}

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
log = logging.getLogger('msc-ocr')

ENGINE = RapidOCR(params={
    'Det.ocr_version': OCRVersion.PPOCRV4, 'Det.model_type': ModelType.MOBILE,
    'Rec.ocr_version': OCRVersion.PPOCRV5, 'Rec.lang_type': LangRec.KOREAN, 'Rec.model_type': ModelType.MOBILE,
    'Global.use_cls': False, 'Global.log_level': 'error',   # 방향 판별은 끔 — 켜면 반듯한 줄도 뒤집어 읽어 줄이 빠짐(시험 11줄 중 4줄)
})
LOCK = threading.Semaphore(1)
AUTH_CACHE = {}   # 토큰 → (확인 시각, 통과 여부). 5분
AUTH_LOCK = threading.Lock()


def _get(url, token):
    req = urllib.request.Request(url, headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode('utf-8'))


def authorized(token):
    if not token or len(token) > 4096:
        return False
    now = time.time()
    with AUTH_LOCK:
        hit = AUTH_CACHE.get(token)
        if hit and now - hit[0] < 300:
            return hit[1]
    ok = False
    try:
        user = _get(SB_URL + '/auth/v1/user', token)
        uid = user.get('id')
        if uid:
            rows = _get(SB_URL + '/rest/v1/profiles?select=role&id=eq.' + uid, token)
            ok = bool(rows) and rows[0].get('role') not in ('pending', 'blocked', None)
    except Exception:
        ok = False
    with AUTH_LOCK:
        if len(AUTH_CACHE) > 500:
            AUTH_CACHE.clear()
        AUTH_CACHE[token] = (now, ok)
    return ok


def group_lines(boxes, txts, scores):
    """글 조각을 줄로: 세로 가운데가 겹치면 같은 줄, 줄 안은 왼쪽부터. 간격이 넓으면 칸 나눔(두 칸 띄움)."""
    items = []
    for b, t, s in zip(boxes, txts, scores):
        xs, ys = [p[0] for p in b], [p[1] for p in b]
        items.append({'t': t, 's': round(float(s), 3), 'b': [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]})
    items.sort(key=lambda it: (it['b'][1] + it['b'][3]) / 2)
    rows = []
    for it in items:
        cy, h = (it['b'][1] + it['b'][3]) / 2, it['b'][3] - it['b'][1]
        for row in rows:
            if abs(row['cy'] - cy) < max(6, min(row['h'], h) * 0.5):
                row['items'].append(it)
                row['cy'] = (row['cy'] * (len(row['items']) - 1) + cy) / len(row['items'])
                break
        else:
            rows.append({'cy': cy, 'h': h, 'items': [it]})
    out = []
    for row in rows:
        row['items'].sort(key=lambda it: it['b'][0])
        line, prev = '', None
        for it in row['items']:
            if prev is not None:
                gap = it['b'][0] - prev['b'][2]
                line += '  ' if gap > max(prev['b'][3] - prev['b'][1], 12) * 1.2 else ' '
            line += it['t']
            prev = it
        out.append(line)
    return out, items


class Handler(BaseHTTPRequestHandler):
    server_version = 'msc-ocr'

    def log_message(self, fmt, *args):   # 기본 접속 로그(경로·주소) 끔 — 아래에서 필요한 것만
        pass

    def _cors(self):
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip('/') == '/ocr/health':
            return self._json(200, {'ok': True})
        self._json(404, {'error': 'not found'})

    def do_POST(self):
        t0 = time.time()
        if self.path.rstrip('/') != '/ocr/api':
            return self._json(404, {'error': 'not found'})
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_BYTES:
            return self._json(413, {'error': '그림이 없거나 너무 커요(15MB 이하)'})
        token = (self.headers.get('Authorization') or '').replace('Bearer ', '', 1).strip()
        data = self.rfile.read(n)
        if not authorized(token):
            log.info('deny bytes=%d', n)
            return self._json(401, {'error': '로그인(승인된 계정)이 필요해요'})
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        del data
        if img is None:
            return self._json(400, {'error': '그림을 읽지 못했어요(JPEG·PNG)'})
        h, w = img.shape[:2]
        if max(h, w) > MAX_SIDE:
            k = MAX_SIDE / max(h, w)
            img = cv2.resize(img, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA)
        if not LOCK.acquire(timeout=90):
            return self._json(503, {'error': '지금 다른 서류를 읽는 중이에요 — 잠시 뒤 다시'})
        try:
            r = ENGINE(img)
        except Exception as e:
            log.info('fail %s', type(e).__name__)
            return self._json(500, {'error': '글자 인식 중 오류'})
        finally:
            LOCK.release()
            del img
        boxes, txts, scores = (r.boxes, r.txts, r.scores) if r.txts else ([], [], [])
        lines, items = group_lines(boxes, txts, scores)
        ms = int((time.time() - t0) * 1000)
        log.info('ok %dx%d pieces=%d ms=%d', w, h, len(items), ms)
        self._json(200, {'text': '\n'.join(lines), 'lines': items, 'ms': ms})


if __name__ == '__main__':
    ENGINE(np.full((64, 256, 3), 255, np.uint8))   # 모델 미리 올림(첫 요청 지연 방지)
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    log.info('msc-ocr listening 127.0.0.1:%d', PORT)
    srv.serve_forever()
