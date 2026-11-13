"""'둘 중 하나(にぶいち系)' 가챠 자동 목록 → public/data/nibuichi.json  (1시간마다 GitHub Actions)

요청 예절 (2026-10-05 에 과한 요청으로 429 차단을 겪었다):
 - 실행 한 번에 목록 조회만(50개씩 5~6페이지, 페이지 사이 1.5초). 경품 조회는 하지 않는다.
 - 429 면 즉시 멈추고 이전 JSON 을 그대로 둔다.
 - 썸네일은 이미지 저장소(storage.googleapis.com)에서 받고, 다시 올리지 않는다. 이미 읽은 가챠는 다시 읽지 않는다.

배당('이기면 받는 pt')은 썸네일 글자에만 있다. 무료 OCR(RapidOCR = PaddleOCR 모델의 ONNX 판)로
숫자·"pt"·"1/2" 를 읽어 후보를 만든다. 화면에서는 '자동 인식 · 확인' 으로만 보여주고 사용자가 확정한다.

    python scripts/fetch_nibuichi.py           # 갱신
    python scripts/fetch_nibuichi.py --reocr   # 저장된 결과 무시하고 전부 다시 읽기
"""
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "nibuichi.json"
CACHE = ROOT / ".cache" / "thumbs"          # 검증용 로컬 캐시 (커밋하지 않음)
GQL = "https://api.prd.oripa.clove.jp/graphql"
QUERY = (ROOT / "scripts" / "ordered_oripas.graphql").read_text(encoding="utf-8")
HEAD = {"Content-Type": "application/json", "Origin": "https://oripa.clove.jp", "Referer": "https://oripa.clove.jp/",
        "User-Agent": "Mozilla/5.0 (twochoice-lab; personal non-commercial)"}
requests_made = 0


def list_all():
    global requests_made
    nodes, after = [], None
    for _ in range(8):
        requests_made += 1
        r = requests.post(GQL, headers=HEAD, timeout=30, json={
            "operationName": "orderedOripasWithPagination", "query": QUERY,
            "variables": {"after": after, "first": 50, "sort": "RECOMMEND", "where": {
                "category": "POKEMON", "includeNewUserOripas": False, "includeRequiredAchievementOripas": True,
                "selectedLanguage": "en", "tagIds": []}}})
        if r.status_code == 429:
            raise SystemExit("429 — 요청 제한. 이번 실행은 멈추고 기존 데이터를 유지한다.")
        d = r.json()
        if d.get("errors"):
            raise SystemExit(f"GraphQL 오류: {str(d['errors'])[:200]}")
        c = d["data"]["orderedOripasWithPagination"]
        nodes += c["nodes"]
        if not c["pageInfo"]["hasNextPage"]:
            break
        after = c["pageInfo"]["endCursor"]
        time.sleep(1.5)
    return nodes


# OCR 은 천 단위 쉼표를 자주 '.' 나 ':' 로 읽는다 (1,800 → "1.800", 14,000 → "14:000"). 세 자리 묶음이면 쉼표로 본다.
NUM = re.compile(r"(\d{1,3}(?:[.,:]\d{3})+|\d{2,7})")
ODDS = re.compile(r"1\s*/\s*(\d{1,2}(?:\.\d)?)")
ODDS_19 = re.compile(r"(?<!\d)1?\s*/?\s*1\s*[.,]\s*[9S](?![\d.,:])")   # "1/1.9" 가 "11.9"·"1/1.S" 로 읽히는 경우


def restricted(n):
    """아무나 못 누르는 가챠는 목록에서 뺀다: 신규 가입 전용, 1인·1일 횟수 제한, 랭크 제한, 충전 조건, 잭팟 티켓 필요."""
    return bool(n.get("forNewUser") or n.get("maxDrawsPerUser") or n.get("maxDrawsPerDay") or n.get("isUserLimited")
                or n.get("isDaily") or n.get("requiredRankName") or n.get("requiredAchievementType")
                or (n.get("requiredJackpotTicketCount") or 0) > 0)


def plausible(v, price, p):
    """니부이치 배당다움: 끝자리가 딱 떨어지고(1,000 이상은 100 단위), 환원율이 78~110%."""
    return not (price >= 1000 and v % 100) and 0.78 <= v * (p or 0.5) / price <= 1.1


def scan(boxes, price, cands, odds):
    """OCR 상자들에서 확률(1/N)과 배당 후보를 모은다. 점수 = OCR 신뢰도 + 'pt' 가 붙어 있으면 가산."""
    for i, (_, t, s) in enumerate(boxes):
        for m in ODDS.finditer(t):
            den = float(m.group(1))
            if 1.5 <= den <= 20:
                odds.append((s, den))
        if ODDS_19.search(t):
            odds.append((s + 0.1, 1.9))
        for m in NUM.finditer(t.replace(" ", "")):
            v = int(re.sub(r"[.,:]", "", m.group(1)))
            if t.strip().startswith("1/") or not (price < v <= price * 10):
                continue
            near = " ".join(x[1] for x in boxes[max(0, i - 1): i + 2]).lower()
            cands.append((s + (0.5 if "pt" in near or "p" in t.lower() else 0), v))


def read_odds(ocr, img: Image.Image, price: int):
    """썸네일에서 '받는 pt' 후보와 확률을 고른다.
    1차: 전체 이미지. 2차(배당이나 확률을 못 찾았을 때): 확률 문구가 주로 있는 아래 띠를 확대해서 다시.
    10/27 검증(45개, 썸네일과 직접 대조)에서 나온 실수 유형을 반영했다 — 쉼표를 '.'/':' 로 읽음,
    '1/1.9' 를 '11.9'·'1/1.S' 로 읽음, 아래 띠 글자를 통째로 놓침."""
    rgb = img.convert("RGB")
    res, _ = ocr(np.array(rgb))
    boxes = list(res or [])
    cands, odds = [], []
    scan(boxes, price, cands, odds)
    p_now = (1 / max(odds)[1]) if odds else None
    if not odds or not any(plausible(v, price, p_now) for _, v in cands):
        w, h = rgb.size
        band = rgb.crop((0, int(h * 0.68), w, h))
        bh = band.size[1]
        for part in (band.resize((w * 2, bh * 2)), band.crop((0, 0, w // 2, bh)).resize((w * 2, bh * 4))):
            res2, _ = ocr(np.array(part))
            b2 = list(res2 or [])
            boxes += b2
            scan(b2, price, cands, odds)
            p_now = (1 / max(odds)[1]) if odds else None
            if odds and any(plausible(v, price, p_now) for _, v in cands):
                break
    p = (1 / max(odds)[1]) if odds else None
    # 그럴듯한 후보를 우선, 그다음 점수 순
    cands.sort(key=lambda c: (plausible(c[1], price, p), c[0]), reverse=True)
    payout, conf = None, 0.0
    if cands:
        payout = cands[0][1]
        top = cands[0][0]
        rivals = [c for c in cands[1:] if c[1] != payout and plausible(c[1], price, p)]
        conf = min(1.0, top / 1.5) * (0.7 if rivals and top - rivals[0][0] < 0.3 else 1)
        # 그럴듯함 검사: 통과하면 최소 0.6 (화면에 '자동 인식 · 확인'으로 뜸), 실패하면 크게 깎아 숨긴다.
        #   10/27 검증에서 틀린 값(15053·32965·121873·2112164)은 전부 실패, 맞는 값은 전부 통과했다.
        conf = max(conf, 0.6) if plausible(payout, price, p) else conf * 0.3
    return payout, p, round(conf, 2), [t for _, t, _ in boxes]


def main():
    t0 = time.time()
    reocr = "--reocr" in sys.argv
    if "--offline" in sys.argv:   # 저장된 목록·썸네일로 OCR 만 다시 (API 요청 0번) — 규칙을 고친 뒤 검증용
        saved = json.loads(OUT.read_text(encoding="utf-8"))["items"]
        nibu = [{"id": x["id"], "name": x["name"], "price": x["price"], "remaining": x["remaining"], "quantity": x["quantity"], "thumbnail": {"ko": ["cached"]}} for x in saved]
        reocr = True
    else:
        all_nodes = list_all()
        tagged = [n for n in all_nodes if any(t.get("titleJa") == "にぶいち系" for t in (n.get("cachedTags") or []))]
        nibu = [n for n in tagged if not restricted(n)]
        print(f"목록 {len(all_nodes)}개 · '둘 중 하나' {len(tagged)}개 중 참여 제한 {len(tagged) - len(nibu)}개 제외")
    print(f"'둘 중 하나' {len(nibu)}개 · API 요청 {requests_made}번")
    prev = {}
    if OUT.exists() and not reocr:
        prev = {x["id"]: x for x in json.loads(OUT.read_text(encoding="utf-8")).get("items", [])}
    ocr = None
    CACHE.mkdir(parents=True, exist_ok=True)
    items = []
    for n in nibu:
        old = prev.get(n["id"])
        base = {"id": n["id"], "name": n["name"], "price": n["price"], "remaining": n.get("remaining"),
                "quantity": n.get("quantity"), "url": f"https://oripa.clove.jp/ko/oripa/All/{n['id']}"}
        if old and old.get("price") == n["price"] and old.get("ocr_v") == 6:
            items.append({**old, **base})
            continue
        th = n.get("thumbnail") or {}
        url = next((th[k][0] for k in ("ko", "ja", "en") if th.get(k)), None)
        payout = p = None
        conf, texts = 0.0, []
        if url:
            try:
                f = CACHE / f"{n['id']}.jpg"
                if not f.exists():
                    f.write_bytes(requests.get(url, timeout=30).content)
                    time.sleep(0.3)
                ocr = ocr or RapidOCR()
                payout, p, conf, texts = read_odds(ocr, Image.open(f), n["price"])
            except Exception as e:  # 한 장 실패로 전체를 멈추지 않는다
                print("  썸네일 실패", n["name"], e)
        items.append({**base, "payout": payout, "p": p, "confidence": conf, "ocr_v": 6, "ocr_text": texts[:40]})
        print(f"  {n['price']:>7}pt {n['name'][:26]:<26} → {payout or '?'} {('1/%g' % (1 / p)) if p else ''} (신뢰 {conf})")
    items.sort(key=lambda x: x["price"])
    OUT.write_text(json.dumps({"fetchedAt": datetime.now(timezone.utc).isoformat(), "items": items},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"완료 {time.time() - t0:.0f}초 · API 요청 총 {requests_made}번")


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    main()
