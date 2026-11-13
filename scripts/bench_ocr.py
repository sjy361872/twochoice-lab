"""썸네일 배당 읽기 방식 비교 (정답표 tests/ocr_truth.json, 사람이 49장을 직접 보고 만든 값).
  python scripts/bench_ocr.py ocr            # RapidOCR (지금 방식)
  python scripts/bench_ocr.py gemini MODEL   # Gemini 비전 (GEMINI_API_KEY 필요, .env.local 에서 읽음)
결과는 .cache/bench_<이름>.json 에 저장 → summary 로 표를 만든다.
  python scripts/bench_ocr.py summary
지표
  정답   : 화면에 보여준 값이 정답과 같음
  오답   : 화면에 보여줬는데 틀림  ← 0 이어야 한다 (틀린 배당은 손실 계산을 망친다)
  숨김   : 확신이 없어 '직접 입력'으로 돌림 (틀리진 않지만 자동화 실패)
"""
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
TRUTH = json.loads((ROOT / "tests" / "ocr_truth.json").read_text(encoding="utf-8"))
THUMBS = ROOT / ".cache" / "thumbs"
OUTDIR = ROOT / ".cache"


def same_odds(p, odds):
    return p is not None and abs(1 / p - odds) < 0.05


def run_ocr():
    from PIL import Image
    from rapidocr_onnxruntime import RapidOCR
    import fetch_nibuichi as F
    ocr = RapidOCR()
    rows = []
    for t in TRUTH:
        t0 = time.time()
        payout, p, conf, _ = F.read_odds(ocr, Image.open(THUMBS / f"{t['id']}.jpg"), t["price"])
        rows.append({"id": t["id"], "payout": payout, "p": p, "show": conf >= 0.5, "sec": round(time.time() - t0, 2)})
    return rows


def run_gemini(model):
    import fetch_nibuichi as F   # 실전과 같은 함수(프롬프트·축소)로 잰다
    key = F.gemini_key()
    rows = []
    for t in TRUTH:
        t0 = time.time()
        try:
            v, den = F.gemini_read(model, key, F.small_jpeg(THUMBS / f"{t['id']}.jpg"), t["price"])
            rows.append({"id": t["id"], "payout": v, "p": (1 / den) if den else None, "show": v is not None,
                         "sec": round(time.time() - t0, 2)})
        except Exception as e:
            rows.append({"id": t["id"], "payout": None, "p": None, "show": False, "err": str(e)})
        time.sleep(4.5 if "lite" in model else 12.5)
    return rows


def plausible(v, price):
    return v is not None and 1.55 <= v / price <= 1.85 and not (price >= 1000 and v % 100)


def score(rows, gate=None):
    by = {r["id"]: r for r in rows}
    ok = bad = hid = 0
    wrong = []
    for t in TRUTH:
        r = by[t["id"]]
        show = r["show"] and (gate is None or gate(r, t))
        if not show:
            hid += 1
        elif r["payout"] == t["payout"] and same_odds(r["p"], t["odds"]):
            ok += 1
        else:
            bad += 1
            wrong.append(f"{t['name']}({t['price']}): {r['payout']} 1/{round(1 / r['p'], 1) if r['p'] else '?'}  (정답 {t['payout']} 1/{t['odds']})")
    return ok, bad, hid, wrong


def summary():
    res = {}
    for f in sorted(OUTDIR.glob("bench_*.json")):
        res[f.stem[6:]] = json.loads(f.read_text(encoding="utf-8"))
    n = len(TRUTH)
    lines = [f"{'방식':34} 정답  오답  숨김   (총 {n})"]
    rng = lambda r, t: plausible(r["payout"], t["price"])
    for name, rows in res.items():
        for label, gate in ((name, None), (name + " + 배당범위(1.55~1.85배)", rng)):
            ok, bad, hid, wrong = score(rows, gate)
            lines.append(f"{label:34} {ok:4} {bad:5} {hid:5}")
            for w in wrong:
                lines.append(f"      ✗ {w}")
    names = list(res)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = {r["id"]: r for r in res[names[i]]}, {r["id"]: r for r in res[names[j]]}
            agree = lambda r, t, b=b: (r["payout"] == b[t["id"]]["payout"] and r["p"] and b[t["id"]]["p"]
                                       and abs(1 / r["p"] - 1 / b[t["id"]]["p"]) < 0.05 and plausible(r["payout"], t["price"]))
            rows = [dict(r, show=True) for r in res[names[i]]]
            ok, bad, hid, wrong = score(rows, agree)
            lines.append(f"{(names[i] + ' = ' + names[j] + ' 일치만'):34} {ok:4} {bad:5} {hid:5}")
            for w in wrong:
                lines.append(f"      ✗ {w}")
    print("\n".join(lines))


if __name__ == "__main__":
    what = sys.argv[1]
    if what == "summary":
        summary()
    else:
        rows = run_ocr() if what == "ocr" else run_gemini(sys.argv[2])
        name = "ocr" if what == "ocr" else sys.argv[2]
        (OUTDIR / f"bench_{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
        print(f"{name}: 저장 {len(rows)}개, 평균 {sum(r.get('sec', 0) for r in rows) / len(rows):.1f}초/장")
