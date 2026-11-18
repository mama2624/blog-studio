#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 홈판('추천 관심사') 인기글 수집기 (v1.9.7)

비로그인(로그아웃) 상태로 네이버 홈 PC 레이아웃(https://www.naver.com/?mobile)을
받아, '추천 관심사' 판에 서버가 실어 보내는 카드(EAGER-DATA["PC-FEED-WRAPPER"])에서
글 제목·주소·매체·판 이름을 그대로 뽑는다. 로그인·동의·개인화는 건드리지 않는다.

  · 한 번 요청하면 판(tab) 하나가 통째로 실려 온다(추천 / 리빙 / 건강 / 책방 / 패션뷰티 …).
    어느 판이 실릴지는 요청마다 달라서, 여러 번 받아 판을 모은 뒤 주소로 중복을 지운다.
  · 클립(숏폼)·해피빈 펀딩·쇼핑 카드·웹툰/웹소설 목록·도서 베스트 목록은 '글'이 아니라서 뺀다.
  · 남는 것은 제목·주소·매체명·판 이름뿐이다(본문·회원 정보 없음).

만드는 것 (data/naver-homefeed.json)
  - observed: 오늘 모은 글 목록(제목·주소·매체·판·매체 종류)
  - stats:   제목 공식 실측(길이·숫자·따옴표·물음표·조건 한정·반전 신호어·1인칭·금지어 끝맺음)
             + 7각도 분포 + 판 분포 + 매체 분포
  - promptBlock: 작업실·구글 스크립트가 프롬프트에 그대로 넣는 짧은 관찰 문장
  - history: 최근 14일 요약(각도 비율·제목 숫자 비율·판 분포) — 추세 비교용

쓰기 (워크스페이스 루트에서)
  python3 repos/blog-studio/tools/fetch_naver_homefeed.py            # data/naver-homefeed.json 저장
  python3 repos/blog-studio/tools/fetch_naver_homefeed.py --dry-run  # 저장 없이 결과만
  python3 repos/blog-studio/tools/fetch_naver_homefeed.py --pages 4 --out /tmp/x.json

GitHub Actions(.github/workflows/naver-homefeed.yml)가 매일 04:40 KST 에 이 스크립트를
돌리고, 바뀐 내용이 있을 때만 커밋한다. 피클 스케줄·유료 API·로그인은 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "data", "naver-homefeed.json")
KST = timezone(timedelta(hours=9))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
HOME_URL = "https://www.naver.com/?mobile"
MAX_HISTORY = 14
MAX_ITEMS = 260

# 판(tab) 코드 → 화면에 보이는 이름 (CAS-MINICONTENT-PC-TAB-META 실측)
PANELS = {
    "RECOMMEND": "추천·구독",
    "HEALTH": "건강",
    "LIVINGHOME": "리빙",
    "BEAUTY": "패션뷰티",
    "CULTURE": "책방",
    "LECTURE": "지식+",
    "RECIPE": "레시피",
    "CARGAME": "자동차",
    "WEBTOON": "웹툰",
    "GAMEAPP": "게임",
}

# '글'이 아닌 카드 — 제목 공식 분석에서 뺀다(분석 문서의 제외 기준과 같다)
DROP_BLOCK_TOKENS = (
    "FUNDING", "SHOPPING", "BEST-SELLER", "SHORTFORM", "WEBTOON", "NOVEL",
    "PRODUCT", "MALL", "AD-", "BANNER",
)

# 4대 블로그 소재 축 — 판 이름과 제목 단어로 나눈다(참고용 분류)
MATTERS = [
    ("리빙·살림", ["리빙", "인테리어", "청소", "수납", "세탁", "이불", "커튼", "현관", "욕실", "주방", "살림", "가스레인지", "인덕션", "정리"]),
    ("먹거리·장보기", ["식비", "장보기", "마트", "코스트코", "이마트", "레시피", "반찬", "김장", "배추", "먹거리", "먹어", "요리", "간식", "커피", "빵", "제철"]),
    ("건강·질병", ["건강", "혈압", "혈당", "콜레스테롤", "LDL", "관절", "허리", "수면", "면역", "단백질", "다이어트", "감기", "독감", "영양", "비타민", "치료", "증상", "병원"]),
    ("패션·뷰티", ["패션", "패딩", "코트", "니트", "코디", "스타일", "화장", "피부", "네일", "헤어", "향수", "뷰티", "화장품", "옷"]),
    ("경제·제도·돈", ["지원금", "연금", "보험", "세금", "연말정산", "금리", "대출", "월급", "연봉", "환급", "청약", "부동산", "주식", "코스피", "물가", "카드"]),
    ("육아·교육", ["육아", "아이", "초등", "중등", "고등", "수능", "입시", "학원", "영재", "아들", "딸", "엄마"]),
    ("자기계발·심리", ["인생", "심리", "자존감", "습관", "관계", "말투", "마음", "사람들", "성공", "행복", "감정"]),
    ("여행·축제", ["여행", "축제", "숙소", "호텔", "온천", "당일치기", "코스", "맛집", "드라이브"]),
    ("연예·화제", ["배우", "가수", "아이돌", "드라마", "예능", "결혼", "이혼", "열애", "연예", "영화"]),
]

# 7각도 — 작업실 v1.9.7 TITLE_TREND 와 같은 이름·같은 판정 규칙
ANGLES = [
    ("①", "생활 속 실수·손해 회피", r"(그냥|몰라서|모르고|했다가|하다가|손해|큰일|낭패|위험|아깝|아까|더\s*냈|날렸|실수|후회|놓치면|놓쳤|바가지|비싸게|잘못)"),
    ("②", "확인 1가지", r"(\d+\s*가지|한\s*가지|1가지|확인해|확인해야|체크|점검|꼭\s*(넣|챙|보|확인)|먼저\s*확인)"),
    ("③", "반전·상식 뒤집기", r"(아니었다|아니었|말고|대신|다고\?|반대|생각보다|의외|알고\s*사|이게\s*맞나)"),
    ("④", "공감·내 얘기", r"(저만|나만|혹시|하는\s*사람만|요즘\s*\d+대는|보통\s*(엄마|사람)|유독|다들)"),
    ("⑤", "시즌·시의성", r"(올겨울|이번\s*(달|주|겨울)|1[012]월|연말|겨울|수능|김장|D-\d+|마감|다음\s*주|요즘)"),
    ("⑥", "따옴표 인용·말맛", r"[\"“”‘’'「」]"),
    ("⑦", "숫자 실험·기록", r"(살아보|써보|해보|기록|\d+\s*(일|주|개월|년)\s*(동안|만에)|한\s*달|\d+\s*만\s*원.*(살|써|쓰)|실험)"),
]
ANGLE_RE = [(n, k, re.compile(p)) for n, k, p in ANGLES]

DIGIT_RE = re.compile(r"\d")
MONEY_RE = re.compile(r"\d[\d,]*\s*(만\s*원|원|%|배|kg|㎏|cm|개|가지|명|위|시간|분|초|일|주|개월|년|살|도|점)")
LIMIT_RE = re.compile(r"(~만|라면|부터|하는\s*사람|인\s*경우|라도|이면|에게|분들|만\s|만한)")
FLIP_RE = re.compile(r"(아니었다|아니었|말고|대신|다고\?|반대|의외|알고\s*사)")
FIRST_RE = re.compile(r"(샀습니다|살아보|해봤|먹어봤|써봤|가봤|갔더니|봤더니|알았|했더니|저는|제가)")
VAGUE_RE = re.compile(r"(이것|이거|이\s*제도|이\s*생각|이\s*한|이\s*습관|이\s*음식|이\s*성분|이\s*동작|이\s*제품)")
BRAND_HINT = re.compile(r"[A-Z]{2,}|코스트코|이마트|파리바게뜨|스타벅스|쿠팡|삼성|LG|현대|롯데|신세계|다이소|올리브영|무신사|국민연금|건강보험|근로장려금|기초연금|실손|청약|수능|LDL|HDL|당뇨|고혈압|갑상선|대상포진|요양원|장기요양")
ENDING_BAD = ("후기", "추천해줘", "모음집", "추천", "모음")


def http_get(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(urllib.parse.urlparse(url).geturl() if False else url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": "https://www.naver.com/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    for enc in ("utf-8", "cp949"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "ignore")


def eager_block(page: str, key: str):
    """window["EAGER-DATA"]["KEY"] = {...}; 덩어리를 그대로 떼어 JSON 으로 읽는다."""
    marker = 'window["EAGER-DATA"]["%s"] = ' % key
    i = page.find(marker)
    if i < 0:
        return None
    start = page.find("=", i) + 1
    end = page.find("\nwindow[", start)
    if end < 0:
        end = page.find(";</script>", start)
    blob = page[start:end].strip().rstrip(";").strip()
    try:
        return json.loads(blob)
    except Exception:  # noqa: BLE001
        return None


def panel_of(code: str) -> tuple[str, str]:
    """PC-FEED-HEALTH-AIRS-PAGE-1 → ('HEALTH', '건강')"""
    parts = (code or "").split("-")
    key = ""
    for p in parts:
        if p in PANELS:
            key = p
            break
    if not key:
        m = re.match(r"PC-FEED-([A-Z]+)", code or "")
        key = m.group(1) if m else "기타"
    return key, PANELS.get(key, "기타")


def media_of(url: str) -> str:
    if "blog.naver.com" in url:
        return "블로그"
    if "in.naver.com" in url:
        return "인플루언서"
    if "cafe.naver.com" in url:
        return "카페"
    if "n.news.naver.com" in url or "news.naver.com" in url:
        return "뉴스"
    return "기타"


def count_raw_cards(node) -> int:
    n = 0
    if isinstance(node, dict):
        if node.get("@type") == "MATERIAL-PC-FEED":
            n += 1
        for v in node.values():
            n += count_raw_cards(v)
    elif isinstance(node, list):
        for x in node:
            n += count_raw_cards(x)
    return n


def walk_blocks(node, out, panel_key="", panel_name=""):
    """블록 트리를 훑어 글 카드(MATERIAL-PC-FEED)를 모은다."""
    if isinstance(node, dict):
        code = node.get("@code") or ""
        if code.startswith("PC-FEED-"):
            panel_key, panel_name = panel_of(code)
        if any(t in code for t in DROP_BLOCK_TOKENS) and code.startswith("PC-FEED-"):
            return  # 펀딩·쇼핑·도서목록·웹툰 목록은 '글'이 아니다
        mats = node.get("materials")
        if isinstance(mats, list):
            for m in mats:
                if not isinstance(m, dict):
                    continue
                if m.get("@type") not in (None, "MATERIAL-PC-FEED"):
                    continue
                url = (m.get("url") or "").strip()
                title = re.sub(r"\s+", " ", (m.get("title") or "")).strip()
                if not url or not title:
                    continue
                if "m.naver.com/shorts" in url or "clip.naver.com" in url:
                    continue  # 클립(숏폼)
                if not url.startswith("https://") or not any(
                        h in url for h in ("blog.naver.com", "in.naver.com", "cafe.naver.com", "news.naver.com")):
                    continue  # 쇼핑·펀딩·기부 카드(네이버 글 주소가 아니다)
                if not (8 <= len(title) <= 70):
                    continue  # 카드 본문·설명이 섞인 제목은 홈판 제목이 아니다
                out.append({
                    "title": title,
                    "url": url,
                    "source": ((m.get("source") or {}).get("name") or "").strip(),
                    "panel": panel_name or "기타",
                    "panelKey": panel_key or "기타",
                    "media": media_of(url),
                    "block": code,
                })
        for v in node.values():
            walk_blocks(v, out, panel_key, panel_name)
    elif isinstance(node, list):
        for x in node:
            walk_blocks(x, out, panel_key, panel_name)


def collect(pages: int, gap: float, sleep_first: float = 0.0) -> tuple[list, list]:
    items, seen, log = [], set(), []
    for n in range(pages):
        try:
            page = http_get(HOME_URL)
        except Exception as e:  # noqa: BLE001
            log.append({"request": n + 1, "ok": False, "error": str(e)[:160]})
            time.sleep(gap)
            continue
        feed = eager_block(page, "PC-FEED-WRAPPER")
        if feed is None:
            log.append({"request": n + 1, "ok": False, "error": "PC-FEED-WRAPPER 없음(차단 또는 구조 변경)"})
            time.sleep(gap)
            continue
        got = []
        walk_blocks(feed, got)
        new = 0
        for it in got:
            if it["url"] in seen:
                continue
            seen.add(it["url"])
            items.append(it)
            new += 1
        log.append({
            "request": n + 1, "ok": True, "bytes": len(page),
            "raw": count_raw_cards(feed), "cards": len(got), "new": new,
            "panels": sorted({i["panel"] for i in got}),
        })
        if len(items) >= MAX_ITEMS:
            break
        time.sleep(gap + random.uniform(0, 1.5))
    return items, log


def matter_of(title: str, panel: str) -> str:
    for name, words in MATTERS:
        for w in words:
            if w in title:
                return name
    return {"리빙": "리빙·살림", "건강": "건강·질병", "패션뷰티": "패션·뷰티",
            "책방": "자기계발·심리", "지식+": "자기계발·심리", "추천·구독": "연예·화제"}.get(panel, "기타")


def pct(n: int, d: int) -> float:
    return round(n * 100.0 / d, 1) if d else 0.0


def analyse(items: list) -> dict:
    n = len(items)
    lens = [len(i["title"]) for i in items] or [0]
    def has(regex, text):
        return bool(regex.search(text))
    counts = {
        "digit": sum(1 for i in items if DIGIT_RE.search(i["title"])),
        "money": sum(1 for i in items if MONEY_RE.search(i["title"])),
        "quote": sum(1 for i in items if has(ANGLE_RE[5][2], i["title"])),
        "question": sum(1 for i in items if "?" in i["title"] or "？" in i["title"]),
        "exclaim": sum(1 for i in items if "!" in i["title"]),
        "limit": sum(1 for i in items if LIMIT_RE.search(i["title"])),
        "flip": sum(1 for i in items if FLIP_RE.search(i["title"])),
        "vague": sum(1 for i in items if VAGUE_RE.search(i["title"])),
        "first": sum(1 for i in items if FIRST_RE.search(i["title"])),
        "brand": sum(1 for i in items if BRAND_HINT.search(i["title"])),
        "badEnding": sum(1 for i in items if i["title"].rstrip(" .!?").endswith(ENDING_BAD)),
        "questionOnly": 0,
    }
    # 각도 분포 (한 제목이 여러 각도에 걸칠 수 있다 — 분석 문서와 같은 방식)
    angles = []
    for num, name, regex in ANGLE_RE:
        hit = [i for i in items if regex.search(i["title"])]
        angles.append({"n": num, "k": name, "count": len(hit), "pct": pct(len(hit), n),
                       "examples": [h["title"] for h in hit[:3]]})
    panels = {}
    for i in items:
        panels[i["panel"]] = panels.get(i["panel"], 0) + 1
    media = {}
    for i in items:
        media[i["media"]] = media.get(i["media"], 0) + 1
    matters = {}
    for i in items:
        m = matter_of(i["title"], i["panel"])
        matters[m] = matters.get(m, 0) + 1
    buckets = {"~24자": 0, "25~36자": 0, "37~44자": 0, "45~50자": 0, "51자~": 0}
    for L in lens:
        if L <= 24:
            buckets["~24자"] += 1
        elif L <= 36:
            buckets["25~36자"] += 1
        elif L <= 44:
            buckets["37~44자"] += 1
        elif L <= 50:
            buckets["45~50자"] += 1
        else:
            buckets["51자~"] += 1
    return {
        "total": n,
        "len": {"min": min(lens), "median": int(statistics.median(lens)),
                "mean": round(statistics.mean(lens), 1), "max": max(lens), "buckets": buckets},
        "counts": counts,
        "rates": {k: pct(v, n) for k, v in counts.items()},
        "angles": angles,
        "panels": panels,
        "media": media,
        "matters": matters,
    }


def prompt_block(stats: dict, items: list, observed_at: str) -> str:
    """작업실·구글 스크립트 프롬프트에 그대로 넣는 짧은 관찰(1,200자 안쪽)."""
    if not stats["total"]:
        return ""
    r = stats["rates"]
    L = stats["len"]
    order = sorted(stats["panels"].items(), key=lambda kv: -kv[1])[:5]
    lines = []
    lines.append("[📊 네이버 홈판 인기글 실측 — %s 비로그인 수집 %d건]" % (observed_at, stats["total"]))
    lines.append("· 판 분포: " + " · ".join("%s %d" % (k, v) for k, v in order))
    lines.append("· 매체: " + " · ".join("%s %d%%" % (k, pct(v, stats["total"]))
                                        for k, v in sorted(stats["media"].items(), key=lambda kv: -kv[1])))
    top_bucket = max(L["buckets"].items(), key=lambda kv: kv[1])
    lines.append("· 제목 길이: 최소 %d자 / 중앙 %d자 / 최대 %d자 — 가장 많은 구간 %s %d건(%s%%)"
                 % (L["min"], L["median"], L["max"], top_bucket[0], top_bucket[1],
                    pct(top_bucket[1], stats["total"])))
    lines.append("· 제목 장치: 숫자 %s%% · 금액·수치 %s%% · 따옴표 %s%% · 조건 한정 %s%% · 반전 %s%% · 고유명사 %s%%"
                 % (r["digit"], r["money"], r["quote"], r["limit"], r["flip"], r["brand"]))
    lines.append("· 7각도 실측: " + " ".join("%s%s%%" % (a["n"], ("%.0f" % a["pct"])) for a in stats["angles"]))
    lines.append("· 이번 실측에서 '후기'로 끝나는 제목은 %d건 — 홈판에서 가장 약한 끝맺음이다" % stats["counts"]["badEnding"])
    lines.append("· 실제 제목 예(그대로 베끼지 말고 각도·길이·숫자 감각만 참고):")
    picked, used_ex = 0, set()
    for a in sorted(stats["angles"], key=lambda x: -x["count"]):
        for ex in a["examples"][:2]:
            if picked >= 4:
                break
            if ex in used_ex:
                continue
            used_ex.add(ex)
            lines.append("  " + a["n"] + " " + ex[:70])
            picked += 1
            break
    return "\n".join(lines)


def load_prev(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def build(pages: int, gap: float, out_path: str) -> dict:
    now = datetime.now(KST)
    items, log = collect(pages, gap)
    stats = analyse(items)
    ok_requests = sum(1 for l in log if l.get("ok"))
    prev = load_prev(out_path)
    history = [h for h in (prev.get("history") or []) if isinstance(h, dict)]
    today = now.strftime("%Y-%m-%d")
    summary = {
        "date": today,
        "total": stats["total"],
        "angles": {a["n"]: a["pct"] for a in stats["angles"]},
        "digitRate": stats["rates"]["digit"],
        "medianLen": stats["len"]["median"],
        "panels": stats["panels"],
    }
    history = [h for h in history if h.get("date") != today] + [summary]
    history = history[-MAX_HISTORY:]

    payload = {
        "version": "v1.9.7",
        "observedAt": now.strftime("%Y-%m-%d %H:%M"),
        "observedDate": today,
        "source": "네이버 홈 PC 레이아웃 '추천 관심사' 판 · 비로그인",
        "sourceUrl": HOME_URL,
        "how": ("비로그인 브라우저로 www.naver.com/?mobile 를 여러 번 받아, 서버가 실어 보내는 "
                "EAGER-DATA['PC-FEED-WRAPPER'] 카드에서 제목·주소·매체·판 이름만 뽑는다. "
                "로그인·동의·개인화는 쓰지 않는다."),
        "requests": {"total": pages, "ok": ok_requests, "log": log},
        "ok": ok_requests > 0 and stats["total"] > 0,
        "stats": stats,
        "items": items[:MAX_ITEMS],
        "promptBlock": prompt_block(stats, items, now.strftime("%Y-%m-%d")),
        "history": history,
    }
    if not payload["ok"]:
        # 오늘 수집이 실패하면 지난 관찰을 지우지 않는다 — 작업실은 마지막 성공분으로 계속 돈다.
        payload["stats"] = prev.get("stats") or stats
        payload["items"] = prev.get("items") or items
        payload["promptBlock"] = prev.get("promptBlock") or ""
        payload["observedAt"] = prev.get("observedAt") or payload["observedAt"]
        payload["observedDate"] = prev.get("observedDate") or payload["observedDate"]
        payload["stale"] = True
    return payload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=10, help="홈을 몇 번 받을지 (기본 10)")
    ap.add_argument("--gap", type=float, default=3.0, help="요청 사이 대기 초 (기본 3)")
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 결과만")
    ap.add_argument("--out", default=DEFAULT_OUT)
    a = ap.parse_args()

    payload = build(max(1, a.pages), max(0.5, a.gap), a.out)
    if a.dry_run:
        print(json.dumps({k: payload[k] for k in ("ok", "observedAt", "stats", "promptBlock", "requests")},
                         ensure_ascii=False, indent=1)[:6000])
        return 0 if payload["ok"] else 1
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("저장: %s · %d건 · 요청 %d/%d 성공 · 판 %s"
          % (a.out, payload["stats"]["total"], payload["requests"]["ok"], payload["requests"]["total"],
             ",".join(payload["stats"]["panels"])))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
