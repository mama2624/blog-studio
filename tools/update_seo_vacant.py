#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 검색광고 API → 작업실 「🕳️ 내 글 순위 · 빈집 기회」 의 vacant[] 만 새로 채운다.

● 무엇을 하나
  네이버 검색광고 keywordstool(무료, HMAC-SHA256 서명)로 후보 키워드의 월간 검색량
  (PC+모바일)·경쟁도(낮음/보통/높음)를 받아 오고, 내 블로그 전체 글목록 제목과 대조해
  **검색량은 있는데 내가 쓴 글이 없는 키워드**만 골라 data/seo-opportunities.json 의
  vacant[] 에 넣는다. (① 바로 쓸 만한 빈집 주제)

● 절대 건드리지 않는 것
  · boost[]  — 크리(@keuli8) 님 측이 매일 20:30 에 채우는 '② 보강할 내 글' 19건.
    이 스크립트는 boost 를 읽기만 하고, 파일을 쓸 때 원래 있던 값을 **그대로** 다시 쓴다.
  · readme[] — 작업실이 읽는 설명문. 기존 값이 있으면 그대로 둔다.
  즉 바뀌는 키는 vacant / source.naverAd / source.vacant / updatedAt / notes 뿐이다.

● 키(절대 저장소에 넣지 않는다)
  환경변수 NAVER_AD_CUSTOMER_ID · NAVER_AD_ACCESS_LICENSE · NAVER_AD_SECRET_KEY
  (GitHub Actions → Settings → Secrets and variables → Actions 에 등록된 값)
  로컬에서 볼 때는 --customer/--license/--secret 플래그로도 받는다(값을 셸 기록에 남기지 말 것).

● 실행 (저장소 루트에서)
  python3 tools/update_seo_vacant.py --dry-run     # 저장 없이 결과만 확인
  python3 tools/update_seo_vacant.py               # data/seo-opportunities.json 갱신

● 입력 파일
  data/my-posts.txt          내 블로그 전체 글목록 (제목 | URL | 발행일, 총 4,912편 스냅샷)
  tools/seo-seed-keywords.json 후보 키워드 씨앗(주제별 + 이번 달·다음 달 시즌 키워드)

● 규칙
  · 검색량 = monthlyPcQcCnt + monthlyMobileQcCnt ('< 10' 은 5 로 본다)
  · 경쟁도 = compIdx (낮음/중간/높음 → 낮음/보통/높음)
  · 내 글 수 = 글 제목에 그 키워드가 들어간 편수(공백·기호 무시). 0편일 때만 빈집으로 올린다.
  · 정렬 = 검색량 × 경쟁도 가중치(낮음 1.4 · 보통 1.15 · 높음 1.0), 기본 상위 20개
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_seo_opportunities import load_posts  # 글목록 파서 재사용 (형식 동일)

KST = timezone(timedelta(hours=9))
API_HOST = "https://api.searchad.naver.com"
API_URI = "/keywordstool"
COMP_WEIGHT = {"낮음": 1.4, "보통": 1.15, "높음": 1.0}
COMP_LABEL = {"낮음": "낮음", "중간": "보통", "높음": "높음"}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "seo-opportunities.json")
POSTS = os.path.join(ROOT, "data", "my-posts.txt")
SEEDS = os.path.join(ROOT, "tools", "seo-seed-keywords.json")


# ────────────────────────────── 서명·호출 ──────────────────────────────
def signature(secret: str, timestamp: str, method: str, uri: str) -> str:
    msg = f"{timestamp}.{method}.{uri}"
    digest = hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def keywordstool(hints: list[str], customer: str, license_: str, secret: str, show_detail: bool = True) -> list[dict]:
    """hintKeywords(최대 5개) → relatedKeywordList"""
    ts = str(int(time.time() * 1000))
    query = urllib.parse.urlencode(
        {"hintKeywords": ",".join(hints[:5]), "showDetail": "1" if show_detail else "0"}
    )
    req = urllib.request.Request(f"{API_HOST}{API_URI}?{query}")
    req.add_header("X-Timestamp", ts)
    req.add_header("X-API-KEY", license_)
    req.add_header("X-Customer", customer)
    req.add_header("X-Signature", signature(secret, ts, "GET", API_URI))
    req.add_header("Content-Type", "application/json; charset=UTF-8")
    with urllib.request.urlopen(req, timeout=25) as r:
        body = json.loads(r.read().decode("utf-8"))
    return body.get("keywordList") or []


def _qc(v) -> int:
    """'< 10' 같은 표기를 수로. 모르면 0."""
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v or "").replace(",", "").strip()
    if s.startswith("<"):
        return 5
    m = re.search(r"\d+", s)
    return int(m.group()) if m else 0


# ────────────────────────────── 후보 키워드 ──────────────────────────────
def norm(text: str) -> str:
    """비교용 정규화 — 공백·기호·대소문자 무시."""
    return re.sub(r"[^0-9a-z가-힣]", "", (text or "").lower())


def load_seeds(now: datetime) -> list[tuple[str, str]]:
    """[(키워드, 대상 블로그)] — 주제별 씨앗 + 이번 달·다음 달 시즌 씨앗."""
    with open(SEEDS, encoding="utf-8") as f:
        cfg = json.load(f)
    out: list[tuple[str, str]] = []
    for group in cfg.get("groups", []):
        blog = group.get("blog", "")
        for kw in group.get("keywords", []):
            out.append((kw, blog))
    seasonal = cfg.get("seasonal", {})
    for offset in (0, 1):
        month = (now + timedelta(days=31 * offset)).month
        for row in seasonal.get(str(month), []):
            out.append((row["keyword"], row.get("blog", "")))
    # 중복 제거(순서 유지)
    seen, uniq = set(), []
    for kw, blog in out:
        k = kw.strip()
        if not k or k in seen:
            continue
        seen.add(k)
        uniq.append((k, blog))
    return uniq


def count_my_posts(posts: dict, keyword: str) -> int:
    """글 제목에 키워드가 들어간 편수."""
    nk = norm(keyword)
    if not nk:
        return 0
    return sum(1 for p in posts.values() if nk in norm(p["title"]))


# ────────────────────────────── 추천 제목·각도 ──────────────────────────────
TITLE_RULES = [
    (r"비용|가격|얼마|요금|월세|보험료|수수료|견적",
     "{kw}, 2026년 기준 실제 금액과 조건 한 번에 정리",
     "항목 · 기준 · 금액 3열 표를 첫 화면에 넣고, 첫 문단에 대표 금액과 기준일을 먼저 쓰기"),
    (r"신청|자격|조건|대상|지급|환급|감면",
     "{kw} 조건과 신청 순서, 해당되는지 3문항으로 먼저 확인",
     "'내가 받을 수 있나' 3문항 체크리스트 → 필요 서류 표 → 신청 순서 4단계로 구성"),
    (r"증상|통증|아프|질환|병원|검사|수치|수술|치료|약",
     "{kw} 증상과 검사 순서, 병원 가기 전에 알아둘 세 가지",
     "정상범위 · 높으면 의심할 것 · 다음 검사 3열 표와 '집에서 확인할 신호' 소제목 넣기"),
    (r"식단|음식|레시피|요리|반찬|재료|영양",
     "{kw} 메뉴 7일치와 장보기 목록, 한 끼 몇 g인지까지",
     "7일 식단표 + 장보기 목록 표를 넣고, 1인분 양(g)을 숫자로 명시하기"),
    (r"축제|행사|일정|개최|공연|전시|페스티벌",
     "{kw} 일정·장소·주차까지, 올해 바뀐 것부터",
     "일정·장소·요금·주차 4열 표를 넣고, 작년 정보는 '작년 기준'으로 표시하기"),
    (r"방법|하는법|절차|준비|신고",
     "{kw} 하는 방법 5단계, 처음 하는 사람이 틀리는 지점",
     "단계별 표(무엇을 · 어디서 · 준비물)와 마감·기한을 첫 문단에 넣기"),
    (r"비교|차이|추천|순위|고르는",
     "{kw} 비교, 가격·성능·취소 규정 3열로 정리",
     "비교표 하나로 결론을 먼저 내고, '이런 경우엔 B' 예외를 붙이기"),
]


def suggest(keyword: str) -> tuple[str, str]:
    for pattern, title, angle in TITLE_RULES:
        if re.search(pattern, keyword):
            return title.format(kw=keyword), angle
    return (
        f"{keyword}, 지금 검색하는 사람이 가장 궁금해하는 다섯 가지",
        "첫 3줄에 결론·숫자를 먼저 쓰고, 소제목 4~5개 중 하나를 표로 바꾸기",
    )


# ────────────────────────────── 조립 ──────────────────────────────
STOP = {"뜻", "의미", "영어로", "한자", "유래"}


def build(rows_by_keyword: dict, posts: dict, args) -> list[dict]:
    total_posts = len(posts)
    out = []
    for kw, info in rows_by_keyword.items():
        vol = info["volume"]
        if vol < args.min_volume:
            continue
        if len(norm(kw)) < 2 or any(s in kw for s in STOP):
            continue
        mine = count_my_posts(posts, kw)
        if mine > 0:
            continue
        title, angle = suggest(kw)
        comp = info["competition"]
        out.append({
            "keyword": kw,
            "volume": vol,
            "pc": info["pc"],
            "mobile": info["mobile"],
            "competition": comp,
            "myPosts": mine,
            "blog": info.get("blog", ""),
            "title": title,
            "angle": f"{title} — {angle}",
            "reason": (
                f"월 검색량 {vol:,}회(PC {info['pc']:,} · 모바일 {info['mobile']:,})인데 "
                f"내 글 {total_posts:,}편 제목에 '{kw}'가 없습니다."
            ),
            "_score": round(vol * COMP_WEIGHT.get(comp, 1.0), 1),
        })
    out.sort(key=lambda r: (-r["_score"], -r["volume"], r["keyword"]))
    for r in out:
        r.pop("_score", None)
    return out[: args.max] if args.max else out


def merge_notes(old: str, vacant_n: int, checked: int, ok_batches: int, fails: int, stamp: str) -> str:
    base = (old or "").replace("vacant[]는 네이버 검색광고 API 연동 전까지 비어 있습니다.", "").strip()
    add = (
        f"vacant[]는 네이버 검색광고 keywordstool(HMAC-SHA256, 씨앗 {checked}개 · 성공 {ok_batches}회"
        f"{f' · 실패 {fails}회' if fails else ''})에서 월 검색량·경쟁도를 받아 내 글 제목과 대조해 "
        f"{vacant_n}건을 넣었습니다(기준 {stamp}). boost[]는 크리 님 측 수집분을 그대로 보존합니다."
    )
    return (base + " " + add).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="네이버 검색광고 API → vacant[] 갱신 (boost[] 보존)")
    ap.add_argument("--customer", default=os.environ.get("NAVER_AD_CUSTOMER_ID", ""))
    ap.add_argument("--license", dest="license_", default=os.environ.get("NAVER_AD_ACCESS_LICENSE", ""))
    ap.add_argument("--secret", default=os.environ.get("NAVER_AD_SECRET_KEY", ""))
    ap.add_argument("--min-volume", type=int, default=1000, help="빈집 후보 최소 월 검색량 (기본 1000)")
    ap.add_argument("--max", type=int, default=20, help="vacant 최대 행 수 (기본 20, 0이면 제한 없음)")
    ap.add_argument("--sleep", type=float, default=0.3, help="API 호출 간격(초)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    missing = [n for n, v in (("NAVER_AD_CUSTOMER_ID", args.customer),
                              ("NAVER_AD_ACCESS_LICENSE", args.license_),
                              ("NAVER_AD_SECRET_KEY", args.secret)) if not v]
    if missing:
        print(f"[중단] 환경변수/플래그가 없습니다: {', '.join(missing)}", file=sys.stderr)
        print("  GitHub Secrets 에 등록되어 있는지 확인해 주세요.", file=sys.stderr)
        return 2

    now = datetime.now(KST)
    seeds = load_seeds(now)
    if not os.path.exists(POSTS):
        print(f"[중단] {POSTS} 가 없습니다(내 블로그 글목록).", file=sys.stderr)
        return 2
    posts, post_total = load_posts(POSTS)
    print(f"내 글 {post_total:,}편 · 씨앗 키워드 {len(seeds)}개")

    rows: dict[str, dict] = {}
    ok = fails = 0
    batches = [seeds[i:i + 5] for i in range(0, len(seeds), 5)]
    for bi, batch in enumerate(batches, 1):
        words = [kw for kw, _ in batch]
        blog = batch[0][1]
        try:
            items = keywordstool(words, args.customer, args.license_, args.secret)
            ok += 1
        except urllib.error.HTTPError as e:
            fails += 1
            print(f"  [{bi}/{len(batches)}] HTTP {e.code} — {words[0]} 등", file=sys.stderr)
            continue
        except Exception as e:  # noqa: BLE001 — 네트워크·JSON 오류 모두 다음 묶음으로
            fails += 1
            print(f"  [{bi}/{len(batches)}] 실패 {type(e).__name__}: {e}", file=sys.stderr)
            continue
        for it in items:
            kw = (it.get("relKeyword") or "").strip()
            if not kw:
                continue
            pc = _qc(it.get("monthlyPcQcCnt"))
            mo = _qc(it.get("monthlyMobileQcCnt"))
            comp = COMP_LABEL.get(str(it.get("compIdx") or "").strip(), "확인 필요")
            prev = rows.get(kw)
            if prev and prev["volume"] >= pc + mo:
                continue
            rows[kw] = {"pc": pc, "mobile": mo, "volume": pc + mo, "competition": comp, "blog": blog}
        if bi < len(batches):
            time.sleep(args.sleep)
    print(f"API 성공 {ok}회 · 실패 {fails}회 · 받은 키워드 {len(rows):,}개")

    if ok == 0:
        print("[중단] API 응답을 한 번도 받지 못했습니다. 기존 vacant[]를 그대로 둡니다.", file=sys.stderr)
        return 3

    vacant = build(rows, posts, args)
    print(f"빈집 후보 {len(vacant)}건 (월 검색량 {args.min_volume:,}회 이상 · 내 글 제목에 없음)")
    for r in vacant[:10]:
        print(f"  {r['volume']:>9,}회 {r['competition']:<3} {r['keyword']}")

    if args.dry_run:
        print("[dry-run] 저장하지 않았습니다.")
        print(json.dumps(vacant[:3], ensure_ascii=False, indent=2))
        return 0

    old = {}
    if os.path.exists(DATA):
        with open(DATA, encoding="utf-8") as f:
            old = json.load(f)
    stamp = now.strftime("%Y-%m-%d %H:%M")
    data = dict(old)                     # ← boost[]·readme[] 등 기존 키를 그대로 물려받는다
    data.setdefault("version", "v2.4.6")
    data["status"] = "ready"
    data["updatedAt"] = stamp
    src = dict(old.get("source") or {})
    src["naverAd"] = True
    src["posts"] = src.get("posts") or post_total
    src["vacant"] = {
        "updatedAt": stamp,
        "seeds": len(seeds),
        "keywordsSeen": len(rows),
        "minVolume": args.min_volume,
        "source": "naver-searchad-keywordstool",
    }
    data["source"] = src
    data["vacant"] = vacant              # ← 여기만 새로 채운다
    data["notes"] = merge_notes(old.get("notes", ""), len(vacant), len(seeds), ok, fails, stamp)
    data.setdefault("boost", old.get("boost", []))   # 만약 boost 가 없던 파일이면 빈 배열 유지

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"saved → {DATA} (vacant {len(vacant)}건 · boost {len(data.get('boost') or [])}건 보존)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
