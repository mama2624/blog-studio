#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""서치콘솔 실적 → 작업실 「🕳 내 글 순위 · 빈집 기회」 데이터 생성기 (v2.4.6)

작업실(https://mama2624.github.io/blog-studio/)은 정적 웹이라 서치콘솔 API를 직접
부르지 않는다. 이 스크립트가 서치콘솔에서 내려받은 **실적 CSV(ZIP)** 와
**내 블로그 전체 글목록**을 대조해 data/seo-opportunities.json 한 파일을 만든다.

■ 입력
  1) 서치콘솔 실적 ZIP — mama2624@gmail.com 서치콘솔 → 실적 → 28일 → 내보내기 → CSV 다운로드
     · sc-domain:gold-queen.com (blog.gold-queen.com·in.gold-queen.com·sub·www·saju·link 전부 포함)
     · 티스토리 URL 속성(blog-gold-queen.tistory.com 등)을 따로 내려받았으면 --zip 을 여러 번 준다
     · ZIP 안에서 '페이지.csv'(페이지별 클릭·노출·CTR·게재순위)와 '검색어 수.csv'를 읽는다
  2) 내 블로그 전체 글목록 txt — '제목 | URL | 발행일' 형식(다운로드 받은 그대로)
  3) (선택) 확인된 검색어 지도 JSON — 서치콘솔에서 검색어 행을 눌러 '페이지' 탭으로 내려가면
     그 검색어가 어떤 글로 노출됐는지 확인된다. 확인된 것만 {"페이지URL": "검색어"} 로 적어 두면
     표의 '키워드' 칸이 채워진다. 확인하지 못한 글은 지어내지 않고 null(=확인 필요)로 둔다.

■ 규칙 (data/seo-opportunities.json 의 readme·config.js BS.SEO_OPP.rules 와 같다)
  · boost[] = 내 글목록에 있는 실제 글 중, 최근 28일 평균 게재순위 4~15위 + 노출 1회 이상
  · 1~3위는 이미 1페이지, 16위 이하는 '새 글' 대상이라 넣지 않는다
  · 노출 1회짜리 잡음은 기본 --min-impressions 2 로 거른다
  · 값이 확인되지 않으면 0이나 추정치 대신 null
  · vacant[] 는 네이버 검색광고 API 연동 전까지 비워 둔다

■ 쓰기 (저장소 루트에서)
  python3 tools/build_seo_opportunities.py \
      --zip downloads/gold-queen.com-Performance-on-Search-2026-11-26.zip \
      --posts downloads/내_블로그_전체_글목록_2026-11-25.txt \
      --keyword-map tools/seo-keyword-map.json \
      --dry-run
  (--dry-run 을 빼면 data/seo-opportunities.json 에 저장한다)

■ 정렬
  · 노출 × 순위 가중치(6~8위 1.5 · 4~5·9~12위 1.25 · 그 밖 1.0) 점수 내림차순
    → '조금만 고치면 1페이지 첫 화면'인 글을 위로 올린다
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlsplit

KST = timezone(timedelta(hours=9))
VERSION = "v2.4.6"
BAND_MIN, BAND_MAX = 4.0, 15.0   # 보강 추천 구간(평균 게재순위)

# 서치콘솔이 보는 호스트 → 글목록에 적힌 호스트 (티스토리 개인 도메인 ↔ 티스토리 주소)
HOST_ALIAS = {
    "blog.gold-queen.com": "blog-gold-queen.tistory.com",
    "in.gold-queen.com": "in-gold-queen.tistory.com",
    "gold-queen.com": "blog-gold-queen.tistory.com",   # 티스토리 루트 도메인 시절 주소
}

DEFAULT_README = [
    "이 파일은 작업실(https://mama2624.github.io/blog-studio/)의 '🕳️ 내 글 순위 · 빈집 기회' 표가 읽는 유일한 데이터입니다.",
    "작업실은 정적 웹이라 서치콘솔·검색광고 API를 직접 부르지 않습니다. GitHub Actions(또는 크리 님 점검 파이프라인)가 하루 1회 이 파일을 갱신합니다.",
    "vacant[] (① 바로 쓸 만한 빈집 주제): keyword, volume(월 검색량), competition(낮음/보통/높음), myPosts(내 글 수), title 또는 angle(추천 각도·제목), reason. 검색량이 있는데 내 글 목록에 같은 주제가 없는 키워드만 넣습니다.",
    "boost[] (② 보강하면 1페이지 갈 내 글): title, url, keyword, rank(구글 평균 순위 4~20), impressions, clicks, advice(보강할 것). 1~3위는 이미 1페이지, 21위 이하는 새 글 대상이라 넣지 않습니다.",
    "값을 확인하지 못했으면 0이나 추정값 대신 null로 둡니다. 작업실은 null을 '확인 필요'로 표시합니다.",
    "키(서치콘솔 서비스 계정·네이버 검색광고 API 키)는 이 저장소에 넣지 않고 GitHub Secrets에만 둡니다.",
]


# ────────────────────────────── 입력 읽기 ──────────────────────────────
def _members(zf: zipfile.ZipFile, prefix: str) -> list[str]:
    names = [n for n in zf.namelist() if os.path.basename(n).startswith(prefix)]
    # '검색어 수.csv' 처럼 공백이 들어간 이름도 잡는다
    return names


def read_export(zip_path: str) -> dict:
    """서치콘솔 CSV ZIP 하나 → {'pages': [...], 'queries': [...], 'range': {...}}"""
    with zipfile.ZipFile(zip_path) as zf:
        page_name = next(iter(_members(zf, "페이지")), None)
        if not page_name:
            raise SystemExit(f"[중단] {zip_path} 안에 '페이지.csv'가 없습니다. 서치콘솔 실적 → 내보내기 → CSV 로 받은 ZIP인지 확인해 주세요.")
        pages = _read_csv(zf.read(page_name))
        q_name = next(iter(_members(zf, "검색어")), None)
        queries = _read_csv(zf.read(q_name)) if q_name else []
        f_name = next(iter(_members(zf, "필터")), None)
        filter_rows = _read_csv(zf.read(f_name)) if f_name else []
        c_name = next(iter(_members(zf, "차트")), None)
        chart_rows = _read_csv(zf.read(c_name)) if c_name else []
    meta = {}
    for row in filter_rows[1:]:
        if len(row) >= 2:
            meta[row[0].strip()] = row[1].strip()
    dates = [r[0].strip() for r in chart_rows[1:] if r and re.match(r"\d{4}-\d{2}-\d{2}", r[0].strip())]
    return {"pages": pages, "queries": queries, "filter": meta, "zip": os.path.basename(zip_path),
            "range": (dates[0], dates[-1]) if dates else (None, None)}


def _read_csv(raw: bytes) -> list[list[str]]:
    text = raw.decode("utf-8-sig", errors="replace")
    return [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]


def to_page_rows(rows: list[list[str]]) -> list[dict]:
    """'페이지.csv' → [{url, clicks, impressions, ctr, rank}]"""
    out = []
    for r in rows[1:]:
        if len(r) < 5 or not r[0].startswith("http"):
            continue
        out.append({
            "url": r[0].strip(),
            "clicks": _int(r[1]),
            "impressions": _int(r[2]),
            "ctr": r[3].strip() or None,
            "rank": _float(r[4]),
        })
    return out


def _int(v: str):
    try:
        return int(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _float(v: str):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def load_posts(path: str) -> tuple[dict, int]:
    """글목록 txt → ({'호스트+경로': {title,url,date}}, 전체 편수)"""
    posts: dict[str, dict] = {}
    total = 0
    with open(path, encoding="utf-8") as f:
        head = f.readline()
        m = re.search(r"총\s*([\d,]+)\s*편", head)
        if m:
            total = int(m.group(1).replace(",", ""))
        f.seek(0)
        for line in f:
            line = line.rstrip("\n")
            parts = [p.strip() for p in line.split(" | ")]
            if len(parts) < 3 or not parts[1].startswith("http"):
                continue
            key = post_key(parts[1])
            if not key:
                continue
            posts[key] = {"title": parts[0], "url": unquote(parts[1]), "date": parts[2]}
    return posts, (total or len(posts))


def post_key(url: str) -> str | None:
    u = unquote(url.strip())
    p = urlsplit(u)
    if not p.netloc:
        return None
    host = p.netloc.lower()
    host = HOST_ALIAS.get(host, host)
    path = p.path.rstrip("/")
    return f"{host}{path}"


def is_post_url(url: str) -> bool:
    """태그·카테고리·페이지네이션·홈은 '글'이 아니므로 뺀다."""
    p = urlsplit(unquote(url))
    path = p.path
    if p.query and "page=" in p.query:
        return False
    if path in ("", "/"):
        return False
    if re.search(r"/(tag|category|search|label|archive)(/|$)", path):
        return False
    if "/entry/" in path:            # 티스토리
        return True
    if re.search(r"/\d{4}/\d{2}/.+\.html$", path):   # 구글 블로거
        return True
    return False


# ────────────────────────────── 보강 조언 ──────────────────────────────
TOPIC_RULES = [
    # (정규식, 조언 문구) — 위에서부터 먼저 맞는 규칙 하나만 쓴다(구체적인 규칙을 위에 둔다)
    (r"\bvs\b|차이|비교|다를까|무엇일까",
     "'무엇인지 → A와 B 차이 → 고르는 기준' 순서로 소제목을 다시 세우고, '항목 | A | B' 3열 비교표를 하나 넣기"),
    (r"비타민|영양제|섭취량",
     "'권장량 · 검사로 확인할 수치 · 과잉 시 주의' 3열 표와 식품 예시를 넣고, 제목을 검색어에 맞춰 짧게"),
    (r"검사.*(비용|가격|얼마|청구)|(비용|가격|청구).*검사",
     "검사별 '목적 · 소요시간 · 비용 범위 · 보험 적용' 4열 표를 첫 화면에 넣고, 제목 앞에 '비용'과 금액 예시를 넣기"),
    (r"검사.*(준비|체크)|(준비|체크).*검사",
     "검사 전 '금식 여부 · 복용 중인 약 · 소요시간'을 3행 체크리스트 표로 만들고, 당일 준비물을 한 줄로 정리하기"),
    (r"간수치|간\s*기능|지방간|간경화|술|회복",
     "'실제로 회복되는 데 걸리는 기간'을 표(수치 구간·기간·조건)로 보여주고, 첫 문단에 결론부터 쓰기"),
    (r"검사|수치|정상범위|AST|ALT|감마지티피|CA19-9|아밀라아제|리파아제",
     "검사 항목별 '정상범위 · 높으면 의심할 것 · 다음 검사' 3열 표를 첫 화면에 넣고, 제목에 '정상범위'를 붙이기"),
    (r"숙박|호텔|모텔|예약|야놀자|여기어때|숙소",
     "수수료 · 취소 규정 · 쿠폰 중복 여부를 3열 비교표로 넣고, 예시 가격에는 기준 날짜를 함께 적기"),
    (r"방법|습관|생활\s*수칙|비법",
     "'무엇을 · 얼마나 · 주의할 점' 3열 표로 방법을 정리하고, 첫 3줄에 결론과 수치를 쓰기"),
    (r"준비물|챙길|체크리스트",
     "준비물을 '필수 / 있으면 좋음 / 현장 구매' 3열 표로 바꾸고, 요금·운영시간에는 [기준 시점]을 붙이기"),
    (r"여행|제주|축제|워터파크|피서|공항|항공|캠핑",
     "올해 일정·가격·운영시간을 [기준 시점]과 함께 첫 문단에 다시 넣고, 작년 정보는 '작년 기준'으로 표시하기"),
    (r"보험|실비|산정특례|진료비|의료비",
     "청구 조건과 필요 서류를 표로 만들고, '내가 받을 수 있는지' 3문항 체크리스트를 넣기"),
    (r"배터리|전기차",
     "확인 절차를 3단계 표로 만들고(차대번호 → 인증 정보 → 제조사), 차종별 배터리 표를 덧붙이기"),
    (r"사진|촬영|카메라",
     "촬영 설정(셔터·ISO·조리개)과 장소·시간대를 표로 정리하고, 예시 사진 자리를 위치별로 표시하기"),
    (r"주식|재테크|금리|연금|적금|세금|환율",
     "숫자 예시 계산 1개(원금·기간·세후)를 표로 넣어 검색어에 바로 답하기"),
    (r"날씨|옷차림|계절|여름|겨울",
     "월별 기준표(기온·옷차림·준비물)를 표로 바꾸고, 제목에 해당 월을 넣기"),
]

GENERIC_ADVICE = "첫 3줄에 결론·수치를 먼저 쓰고, 소제목 4~5개 중 하나를 표로 바꾸기"


def band_lead(rank: float, clicks: int) -> str:
    if rank <= 5:
        return f"{rank:.1f}위 · 1페이지 상단 — 제목·스니펫만 다듬어도 2~3위권"
    if rank <= 8:
        return f"{rank:.1f}위 · 1페이지 중하단" + (
            " — 클릭 0이라 제목·메타 설명 승부" if clicks == 0 else " — 상위 5위 안으로 끌어올리기")
    if rank <= 12:
        return f"{rank:.1f}위 · 1페이지 아래쪽 — 표·소제목·내부링크 보강으로 2페이지 이탈 막기"
    return f"{rank:.1f}위 · 2페이지 초입 — 최신성·제목 보강으로 1페이지 재진입"


def josa(word: str, with_batchim: str, without_batchim: str) -> str:
    """받침 유무에 따라 조사를 고른다 ('비용' + 을 → '비용을')."""
    if not word:
        return without_batchim
    ch = word[-1]
    if not ("가" <= ch <= "힣"):
        return without_batchim
    return with_batchim if (ord(ch) - ord("가")) % 28 else without_batchim


def make_advice(title: str, rank: float, impressions: int, clicks: int, keyword: str | None) -> str:
    bits = [band_lead(rank, clicks)]
    if keyword:
        bits.append(f"확인된 검색어 '{keyword}'{josa(keyword, '을', '를')} 제목 앞 30자와 첫 문단에 그대로 넣기")
    for pattern, text in TOPIC_RULES:
        if re.search(pattern, title, re.IGNORECASE):
            bits.append(text)
            break
    else:
        bits.append(GENERIC_ADVICE)
    if clicks == 0 and impressions >= 5:
        bits.append("메타 설명에 숫자·기간을 넣어 클릭 유도")
    return " · ".join(bits)


# ────────────────────────────── 조립 ──────────────────────────────
def score(impr: int, rank: float) -> float:
    if 6 <= rank <= 8:
        w = 1.5
    elif 4 <= rank <= 5 or 9 <= rank <= 12:
        w = 1.25
    else:
        w = 1.0
    return round(impr * w, 3)


def build(args) -> dict:
    posts, post_total = load_posts(args.posts)
    keyword_map = {}
    if args.keyword_map and os.path.exists(args.keyword_map):
        with open(args.keyword_map, encoding="utf-8") as f:
            keyword_map = {post_key(k) or k: v for k, v in json.load(f).items()}

    pages: dict[str, dict] = {}
    used_zips = []
    ranges = []
    for zp in args.zip:
        exp = read_export(zp)
        used_zips.append(exp["zip"])
        if exp["range"][0]:
            ranges.append(f"{exp['range'][0]}~{exp['range'][1]}")
        for row in to_page_rows(exp["pages"]):
            key = post_key(row["url"])
            if not key:
                continue
            prev = pages.get(key)
            if prev:    # 같은 글을 두 속성이 보고하면 노출이 큰 쪽을 남긴다(중복 합산 금지)
                if (row["impressions"] or 0) <= (prev["impressions"] or 0):
                    continue
            row["key"] = key
            pages[key] = row

    boost = []
    skipped = {"not_post": 0, "no_match": 0, "out_of_band": 0, "low_impressions": 0}
    for key, row in pages.items():
        if not is_post_url(row["url"]):
            skipped["not_post"] += 1
            continue
        if key not in posts:
            skipped["no_match"] += 1
            continue
        rank = row["rank"]
        if rank is None or not (BAND_MIN <= rank <= BAND_MAX):
            skipped["out_of_band"] += 1
            continue
        if (row["impressions"] or 0) < args.min_impressions:
            skipped["low_impressions"] += 1
            continue
        meta = posts[key]
        kw = keyword_map.get(key)
        boost.append({
            "title": meta["title"],
            "url": row["url"],
            "keyword": kw,
            "rank": round(rank, 2),
            "impressions": row["impressions"],
            "clicks": row["clicks"] if row["clicks"] is not None else None,
            "advice": make_advice(meta["title"], rank, row["impressions"] or 0, row["clicks"] or 0, kw),
            "_score": score(row["impressions"] or 0, rank),
            "_date": meta["date"],
        })
    boost.sort(key=lambda r: (-r["_score"], r["rank"], -(r["impressions"] or 0)))
    for r in boost:
        r.pop("_score", None)
        r.pop("_date", None)
    if args.max and len(boost) > args.max:
        boost = boost[: args.max]

    now = datetime.now(KST)
    readme = DEFAULT_README
    if os.path.exists(args.out):
        try:
            with open(args.out, encoding="utf-8") as f:
                old = json.load(f)
            if isinstance(old.get("readme"), list) and old["readme"]:
                readme = old["readme"]
        except (OSError, json.JSONDecodeError):
            pass

    data = {
        "version": VERSION,
        "updatedAt": now.strftime("%Y-%m-%d %H:%M"),
        "status": "ready",
        "source": {
            "searchConsole": True,
            "naverAd": False,
            "posts": post_total,
        },
        "vacant": [],
        "boost": boost,
        "readme": readme,
        "notes": (
            f"서치콘솔 실적(최근 28일: {args.window or (ranges[0] if ranges else '내보내기 기준')}) 페이지 CSV와 내 블로그 글목록"
            f" {post_total:,}편을 대조해 평균 게재순위 {BAND_MIN:.0f}~{BAND_MAX:.0f}위·노출 {args.min_impressions}회 이상인 글만 담았습니다. "
            f"수집 ZIP: {', '.join(used_zips)}. "
            "키워드는 서치콘솔에서 검색어→페이지로 확인된 것만 넣고 나머지는 null(확인 필요)입니다. "
            "네이버 블로그 3곳은 서치콘솔 속성이 없어 구글 순위 데이터가 없습니다. "
            "vacant[]는 네이버 검색광고 API 연동 전까지 비어 있습니다."
        ),
    }
    stats = {"pages": len(pages), "boost": len(boost), "posts": post_total, "skipped": skipped}
    return data, stats


def main() -> int:
    ap = argparse.ArgumentParser(description="서치콘솔 실적 + 글목록 → data/seo-opportunities.json")
    ap.add_argument("--zip", action="append", required=True,
                    help="서치콘솔 실적 CSV ZIP (여러 속성이면 반복 지정)")
    ap.add_argument("--posts", required=True, help="내 블로그 전체 글목록 txt (제목 | URL | 발행일)")
    ap.add_argument("--keyword-map", default=None, help="확인된 검색어 지도 JSON {'페이지URL': '검색어'}")
    ap.add_argument("--min-impressions", type=int, default=2, help="보강 후보 최소 노출수 (기본 2)")
    ap.add_argument("--max", type=int, default=20, help="boost 최대 행 수 (기본 20, 0이면 제한 없음)")
    ap.add_argument("--window", default=None, help="notes 에 적을 기준 기간 문자열")
    ap.add_argument("--out", default="data/seo-opportunities.json", help="저장 경로")
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 요약만 출력")
    args = ap.parse_args()

    data, stats = build(args)
    print(f"pages={stats['pages']} boost={stats['boost']} posts={stats['posts']} skipped={stats['skipped']}")
    for r in data["boost"][:5]:
        print(f"  {r['rank']:>5}위 {r['impressions']:>3}노출 {r['clicks']}클릭 | {r['title'][:46]} | kw={r['keyword']}")
    if args.dry_run:
        print("[dry-run] 저장하지 않았습니다.")
        print(json.dumps(data, ensure_ascii=False, indent=2)[:1200])
        return 0
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"saved → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
