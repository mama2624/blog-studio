#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""🔥 실시간 화제템 집합소 수집기 (v2.1.0 · 2026-11-18)

작업실 `🔥 실시간 화제템 집합소` 탭이 읽는 data/hot-items.json 을 만든다.
키·계정·유료 API 없이 **0원 공개 소스 2곳**만 쓴다 (크리 님 2026-11-18 실측 기준).

  1) 클리앙 알뜰구매  https://www.clien.net/service/board/jirum
     - 실판매 딜: 제목·가격·몰·댓글·조회·추천·게시판 분류(상품정보/이벤트정보)까지 파싱
     - robots: `Allow: /service/board/` + `Disallow: /*?*` → **1페이지만**, 쿼리 붙은 주소는 쓰지 않는다
  2) 핫허브 RSS        https://hothub.app/rss.xml
     - 커뮤니티(에펨·더쿠·디시·클리앙 등) 지금 뜨는 글 25건 — 상품·가격은 없음(화제성 보조)

넣지 않은 소스 (전부 2026-11-18 실측에서 막힘 — 다시 넣지 말 것)
  쿠팡 403 · 알구몬 Cloudflare 챌린지 · 뽐뿌 403 · 쿨엔조이 무응답 · 어미새 JS 렌더 ·
  에펨 430 · 아카라이브 403 · 다나와·올리브영·오늘의집·G마켓 403 · 무신사·지그재그·11번가 불가 ·
  토스 쇼핑 웹 랭킹 없음 · 네이버 쇼핑 418/로그인 벽
  네이버 데이터랩 쇼핑인기검색어는 기술적으로 200이지만 **robots Disallow** 라서 쓰지 않는다.
  대신 '지금 뜨는 키워드'(data/realtime-trends.json)를 배지·점수에만 엮는다 — 크롤링 0회.

쓰기
  python3 tools/fetch_hot_items.py                # data/hot-items.json (+ 하루 1개 history)
  python3 tools/fetch_hot_items.py --dry-run      # 저장 없이 콘솔 요약
  python3 tools/fetch_hot_items.py --out /tmp/hot.json --no-history
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "data", "hot-items.json")
HISTORY_DIR = os.path.join(ROOT, "data", "hot-items-history")
REALTIME_PATH = os.path.join(ROOT, "data", "realtime-trends.json")

KST = timezone(timedelta(hours=9))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "close",
}

SOURCES = [
    {"id": "clien_jirum", "name": "클리앙 알뜰구매", "kind": "deal",
     "url": "https://www.clien.net/service/board/jirum",
     "note": "실판매 딜 — 가격·몰·댓글은 제목/게시판 기준이라 '추정'으로 표시"},
    {"id": "hothub", "name": "핫허브 인기글", "kind": "hot",
     "url": "https://hothub.app/rss.xml",
     "note": "커뮤니티 지금 뜨는 글 — 상품·가격 없음"},
]

# ------------------------------------------------------------------
# 카테고리 — 제목에 걸린 낱말 길이의 합으로 고른다(구체 낱말이 이긴다).
#   '커피머신'은 디지털(5) > 식품(2), '커피'는 식품.
#   blog: 이 카테고리 상품을 리뷰하기에 맞는 블로그 id (작업실이 그 카드로 넘어간다)
# ------------------------------------------------------------------
CATEGORIES = [
    ("beauty", "뷰티·미용", "💄", "mama2624", [
        "크림", "앰플", "세럼", "로션", "스킨", "에센스", "마스크팩", "팩", "향수", "립", "쿠션",
        "파운데이션", "샴푸", "컨디셔너", "트리트먼트", "바디워시", "치약", "칫솔", "면도", "화장품",
        "선크림", "핸드크림", "아이크림", "네일", "헤어", "염색", "드라이기", "고데기", "미용",
    ]),
    ("fashion", "패션·잡화", "👕", "mama2624", [
        "패딩", "코트", "자켓", "재킷", "니트", "가디건", "셔츠", "맨투맨", "후드", "바지", "청바지",
        "스커트", "원피스", "신발", "운동화", "슬리퍼", "부츠", "가방", "지갑", "모자", "양말",
        "내복", "속옷", "브라", "패션", "의류", "유니클로", "무신사", "스파오", "스니커즈", "유니폼",
        "굿즈", "머플러", "장갑", "벨트", "시계", "안경", "선글라스",
    ]),
    ("digital", "디지털·가전", "📱", "mama2624", [
        "노트북", "태블릿", "아이패드", "갤럭시", "아이폰", "이어폰", "헤드폰", "스피커", "충전",
        "보조배터리", "모니터", "키보드", "마우스", "공기청정기", "가습기", "제습기", "정수기",
        "청소기", "냉장고", "세탁기", "건조기", "에어프라이어", "전자레인지", "밥솥", "커피머신",
        "프린터", "워치", "워치페이스", "ssd", "usb", "케이블", "어댑터", "리모컨", "무선", "스탠드",
        "tv", "티비", "프로젝터", "블루투스", "충전기", "면도기", "게임", "콘솔", "플스", "닌텐도",
        "스팀", "iap", "앱", "구독", "리딤",
    ]),
    ("food", "식품·식재료", "🍎", "2sunshines", [
        "커피", "아메리카노", "라떼", "녹차", "홍차", "생수", "음료", "주스", "맥주", "와인", "소주",
        "과자", "초콜릿", "빵", "케이크", "아이스크림", "치킨", "떡갈비", "햄", "소시지", "참치",
        "김", "라면", "즉석", "밀키트", "쌀", "채소", "과일", "사과", "배", "감귤", "딸기", "포도",
        "수박", "고기", "삼겹살", "소고기", "닭", "생선", "새우", "젓갈", "김치", "장아찌", "꿀",
        "오일", "소스", "양념", "식품", "먹거리", "샌드위치", "도시락", "만두", "피자", "버거",
    ]),
    ("living", "생활·리빙", "🧺", "mama2624", [
        "수납", "정리", "행거", "옷걸이", "빨래", "세제", "섬유유연제", "청소", "걸레", "밀대",
        "수세미", "행주", "휴지", "물티슈", "키친타월", "비누", "샤워", "욕실", "매트", "이불",
        "베개", "커튼", "블라인드", "단열", "방한", "손난로", "핫팩", "텀블러", "보온", "프라이팬",
        "냄비", "그릇", "주방", "수저", "도마", "식탁", "의자", "책상", "소파", "쇼파", "화장대",
        "서랍", "선반", "조명", "전구", "건전지", "멀티탭", "방향제", "탈취", "모기", "벌레",
        "수건", "실내화", "우산", "장우산", "생활", "살림", "정수", "가구", "침구",
    ]),
    ("health", "건강·의료", "🩺", "2sunshines", [
        "마사지", "안마", "혈압", "혈당", "체온", "온열", "찜질", "파스", "보호대", "테이핑",
        "휠체어", "의료", "영양", "유산균", "비타민", "오메가", "콜라겐", "루테인", "마그네슘",
        "칼슘", "단백질", "홍삼", "한방", "건강", "다이어트", "체중", "스텐트", "안대", "수면",
    ]),
    ("baby", "출산·육아", "🍼", "mama2624", [
        "기저귀", "분유", "이유식", "유아", "아기", "키즈", "아동", "장난감", "레고", "유모차",
        "카시트", "젖병", "육아", "출산",
    ]),
    ("sports", "스포츠·레저", "⚽", "2sunshines", [
        "등산", "캠핑", "텐트", "자전거", "러닝", "운동", "헬스", "요가", "필라테스", "수영",
        "골프", "낚시", "테니스", "배드민턴", "축구", "야구", "농구", "스포츠", "레저", "헬멧",
    ]),
    ("travel", "여행·숙박", "✈️", "2sunshines", [
        "호텔", "리조트", "숙소", "항공", "비행기", "제주", "부산", "강원", "여행", "투어",
        "입장권", "크루즈", "배편", "캠핑장", "펜션", "숙박", "티켓",
    ]),
    ("auto", "자동차·용품", "🚗", "mama2624", [
        "타이어", "엔진오일", "와이퍼", "세차", "카매트", "블랙박스", "내비", "주차", "자동차",
        "부동액", "광택", "오토",
    ]),
    ("money", "금융·혜택", "💰", "jiyn74", [
        "카드", "포인트", "캐시백", "환급", "지원금", "보험", "대출", "예금", "적금", "상품권",
        "기프트카드", "쿠폰", "할인코드", "페이", "구독",
    ]),
    ("book", "도서·교육", "📚", "mama2624", [
        "도서", "책", "북클럽", "전자책", "ebook", "강의", "인강", "문제집", "수험", "토익", "영어",
        "출판",
    ]),
    ("etc", "기타", "•", "mama2624", []),
]
CAT_MAP = {c[0]: {"id": c[0], "label": c[1], "emoji": c[2], "blog": c[3]} for c in CATEGORIES}

# 쇼핑몰 이름 추정 — 제목 앞 [태그] 우선
MALL_HINTS = {
    "쿠팡": "쿠팡", "네이버": "네이버", "토스": "토스", "toss": "토스", "알리": "알리익스프레스",
    "아마존": "아마존", "무신사": "무신사", "올리브영": "올리브영", "11번가": "11번가",
    "지마켓": "G마켓", "g마켓": "G마켓", "ssg": "SSG", "컬리": "컬리", "롯데온": "롯데온",
    "떠리몰": "떠리몰", "두타온": "두타온", "다이소": "다이소", "이마트": "이마트", "홈플러스": "홈플러스",
    "이케아": "이케아", "유니클로": "유니클로", "자라": "자라", "스파오": "스파오", "코스트코": "코스트코",
    "sec": "SEC", "모티브": "모티브 출판사", "한국": "", "애플": "애플", "삼성": "삼성",
}
NON_MALL_TAGS = {"ios", "android", "ios/android", "wearos", "pc", "steam", "epic", "ps5", "ps4",
                 "switch", "web", "mac", "window", "windows", "무료", "정보", "알림", "이벤트"}

# 커뮤니티 이름 (핫허브 RSS 는 주소만 준다)
COMMUNITY = {
    "www.fmkorea.com": "에펨코리아", "fmkorea.com": "에펨코리아",
    "theqoo.net": "더쿠", "www.theqoo.net": "더쿠",
    "gall.dcinside.com": "디시인사이드", "www.dcinside.com": "디시인사이드",
    "www.clien.net": "클리앙", "clien.net": "클리앙",
    "www.ppomppu.co.kr": "뽐뿌", "www.ruliweb.com": "루리웹", "bbs.ruliweb.com": "루리웹",
    "www.bobaedream.co.kr": "보배드림", "damoang.net": "다모앙", "www.inven.co.kr": "인벤",
    "www.instiz.net": "인스티즈", "mlbpark.donga.com": "MLB파크", "www.humoruniv.com": "웃긴대학",
    "www.dogdrip.co.kr": "개드립", "www.todayhumor.co.kr": "오늘의유머", "www.82cook.com": "82cook",
    "www.slrclub.com": "SLR클럽", "www.etoland.co.kr": "이토랜드", "www.cook82.com": "82cook",
    "www.ygosu.com": "와이고수", "www.teamblind.com": "블라인드", "www.nate.com": "네이트판",
}

KEEP_HOURS = 72      # 이보다 오래된 딜은 목록에서 뺀다(3일)
MAX_DEALS = 80       # 파일에 담아 두는 최대 딜 수
HISTORY_KEEP_DAYS = 7


# ==================================================================
# HTTP
# ==================================================================
def fetch(url, method="GET", data=None, headers=None, timeout=20):
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=(data.encode() if data else None), headers=h, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            if "gzip" in (r.headers.get("Content-Encoding") or ""):
                try:
                    raw = gzip.decompress(raw)
                except Exception:  # noqa: BLE001
                    pass
            return r.status, raw, int((time.time() - t0) * 1000), ""
    except urllib.error.HTTPError as e:
        raw = b""
        try:
            raw = e.read()
        except Exception:  # noqa: BLE001
            pass
        return e.code, raw, int((time.time() - t0) * 1000), str(e)[:120]
    except Exception as e:  # noqa: BLE001
        return None, b"", int((time.time() - t0) * 1000), type(e).__name__ + ": " + str(e)[:120]


# ==================================================================
# 작은 파서들
# ==================================================================
def text_of(fragment):
    return re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", fragment or "")).strip()


def html_unescape(s):
    return (str(s or "").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", '"').replace("&#39;", "'").replace("&#034;", '"')
            .replace("&nbsp;", " ").replace("&#x27;", "'"))


def parse_num(s):
    """'4,835' · '4.6 M' · '1.2k' → 정수"""
    s = str(s or "").replace(",", "").strip()
    m = re.search(r"([\d.]+)\s*([kKmM]?)", s)
    if not m:
        return 0
    try:
        n = float(m.group(1))
    except ValueError:
        return 0
    unit = m.group(2).lower()
    if unit == "k":
        n *= 1000
    elif unit == "m":
        n *= 1000000
    return int(n)


def parse_price(title):
    """제목에서 가격 뽑기 — '13,900원' · '$109' · '109달러'"""
    t = str(title or "")
    m = re.search(r"([0-9][0-9,]{2,9})\s*원", t)
    if m:
        try:
            return int(m.group(1).replace(",", "")), "KRW"
        except ValueError:
            pass
    m = re.search(r"\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)", t)
    if m:
        try:
            return int(float(m.group(1).replace(",", ""))), "USD"
        except ValueError:
            pass
    m = re.search(r"([0-9][0-9,]{2,9})\s*달러", t)
    if m:
        try:
            return int(m.group(1).replace(",", "")), "USD"
        except ValueError:
            pass
    return None, None


def parse_discount(title):
    m = re.search(r"(\d{1,2})\s*%", str(title or ""))
    if not m:
        return None
    v = int(m.group(1))
    return v if 1 <= v <= 99 else None


def guess_mall(title):
    m = re.match(r"\s*\[([^\]]{1,24})\]", str(title or ""))
    if m:
        tag = m.group(1).strip()
        if tag.lower() in NON_MALL_TAGS or "/" in tag:
            return ""
        for k, v in MALL_HINTS.items():
            if k.lower() in tag.lower() and v:
                return v
        return tag
    for k, v in MALL_HINTS.items():
        if v and k.lower() in str(title or "").lower():
            return v
    return ""


def clean_topic(title):
    """딜 제목 → 글 주제로 쓸 상품명 (앞 [몰] 태그·끝 (가격)·19금 표시 제거)"""
    t = html_unescape(title or "").strip()
    t = re.sub(r"^(19금|19)\s*", "", t)
    t = re.sub(r"^\s*\[[^\]]{1,24}\]\s*", "", t)
    t = re.sub(r"\s*\(\s*(?:₩|\$)?\s*[0-9][0-9,\.]*\s*(?:원|달러|%|usd)?\s*(?:대)?\s*\)\s*$", "", t, flags=re.I)
    t = re.sub(r"\s*[-~]\s*[0-9]{1,2}\s*%\s*(?:할인|세일)?\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip(" -·,")
    return t or html_unescape(title or "").strip()


def category_of(title):
    t = str(title or "").lower()
    best, best_score = CAT_MAP["etc"], 0
    for cid, label, emoji, blog, pats in CATEGORIES:
        score = 0
        for p in pats:
            if p and p in t:
                score += len(p)
        if score > best_score:
            best_score = score
            best = CAT_MAP[cid]
    return best


def community_of(url):
    try:
        host = urllib.parse.urlsplit(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""
    return COMMUNITY.get(host) or host


def rfc822_to_kst(s):
    """'Wed, 18 Nov 2026 05:54:00 GMT' → '2026-11-18 14:54' (KST)"""
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z"):
        try:
            dt = datetime.strptime(str(s).strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")
        except Exception:  # noqa: BLE001
            continue
    return str(s or "").strip()[:24]


# ==================================================================
# 1) 클리앙 알뜰구매
# ==================================================================
def collect_clien(timeout=25):
    src = {"id": "clien_jirum", "name": "클리앙 알뜰구매",
           "url": SOURCES[0]["url"], "ok": False, "count": 0,
           "ms": 0, "error": "", "stale": False, "items": []}
    st, raw, ms, err = fetch(SOURCES[0]["url"], timeout=timeout)
    src["ms"] = ms
    if st != 200 or len(raw) < 10000:
        src["error"] = err or "HTTP %s / %d bytes" % (st, len(raw))
        return src
    page = raw.decode("utf-8", "ignore")
    seen_url, seen_title = set(), set()
    for chunk in re.split(r'<div class="list_item', page)[1:]:
        head = chunk[:chunk.find('"')] if '"' in chunk[:40] else chunk[:24]
        if "notice" in head:      # 공지·홍보 글은 뺀다
            continue
        m = re.search(r'class="list_subject"[^>]*?(?:title="([^"]*)")?[^>]*>(.*?)</a>', chunk, re.S)
        title = ""
        if m:
            title = html_unescape(m.group(1) or text_of(m.group(2)))
        if not title:
            continue
        href = re.search(r'href="(/service/board/jirum/(\d+))', chunk)
        if not href:
            continue
        sn = href.group(2)
        url = "https://www.clien.net" + href.group(1)     # 쿼리스트링은 붙이지 않는다(robots)
        key_title = re.sub(r"\s+", "", title).lower()
        if url in seen_url or key_title in seen_title:
            continue
        seen_url.add(url)
        seen_title.add(key_title)

        nick = re.search(r'class="nickname"[^>]*>\s*(?:<span[^>]*>)?\s*([^<]*)<', chunk)
        views = re.search(r'class="hit">([^<]*)<', chunk)
        votes = re.search(r'class="list_votes"><i[^>]*></i>\s*([\d,\.]+)', chunk)
        cmt = re.search(r'data-comment-count="?(\d+)', chunk) or re.search(r'title="댓글\s*([\d,]+)\s*개"', chunk)
        ts = re.search(r'class="timestamp">([^<]*)<', chunk)
        ccat = re.search(r'class="icon_keyword"[^>]*>([^<]*)</a>', chunk)
        prev = re.search(r'<div class="list_preview"><pre>(.*?)</pre>', chunk, re.S)

        clien_cat = html_unescape(ccat.group(1).strip()) if ccat else ""
        price, cur = parse_price(title)
        mall = guess_mall(title)
        disc = parse_discount(title)
        topic = clean_topic(title)
        cat = category_of(title + " " + topic)
        preview = html_unescape(text_of(prev.group(1)))[:160] if prev else ""
        is_product = bool(price is not None or disc is not None or mall or clien_cat == "상품정보")
        src["items"].append({
            "id": "clien_" + sn,
            "sn": sn,
            "source": "clien_jirum",
            "source_name": "클리앙 알뜰구매",
            "title": title,
            "topic": topic,
            "url": url,
            "author": html_unescape(text_of(nick.group(1))) if nick else "",
            "views": parse_num(views.group(1)) if views else 0,
            "votes": parse_num(votes.group(1)) if votes else 0,
            "comments": parse_num(cmt.group(1)) if cmt else 0,
            "posted_at": (ts.group(1).strip() if ts else ""),
            "price": price,
            "currency": cur,
            "discount_pct": disc,
            "mall": mall,
            "clien_category": clien_cat,
            "category": cat["id"],
            "category_label": cat["label"],
            "category_emoji": cat["emoji"],
            "blog": cat["blog"],
            "is_product": is_product,
            "adult": bool(re.match(r"^\s*19\s*금", title)),
            "kind": "deal" if is_product else "info",
            "preview": preview,
            "matched_keywords": [],
            "score": 0.0,
        })
    src["ok"] = bool(src["items"])
    src["count"] = len(src["items"])
    if not src["ok"] and not src["error"]:
        src["error"] = "목록 파싱 0건(구조 변경 의심)"
    return src


# ==================================================================
# 2) 핫허브 RSS
# ==================================================================
def collect_hothub(timeout=20):
    src = {"id": "hothub", "name": "핫허브 인기글", "url": SOURCES[1]["url"], "ok": False,
           "count": 0, "ms": 0, "error": "", "stale": False, "items": []}
    st, raw, ms, err = fetch(SOURCES[1]["url"], timeout=timeout)
    src["ms"] = ms
    if st != 200 or not raw:
        src["error"] = err or "HTTP %s / %d bytes" % (st, len(raw))
        return src
    xml = raw.decode("utf-8", "ignore")
    for block in re.findall(r"<item>(.*?)</item>", xml, re.S):
        t = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", block, re.S)
        l = re.search(r"<link>(.*?)</link>", block, re.S)
        p = re.search(r"<pubDate>(.*?)</pubDate>", block, re.S)
        if not t:
            continue
        title = html_unescape(text_of(t.group(1)))[:140]
        url = html_unescape((l.group(1) if l else "").strip())
        cat = category_of(title)
        src["items"].append({
            "id": "hothub_" + re.sub(r"\W+", "", url)[-24:],
            "source": "hothub",
            "source_name": "핫허브",
            "title": title,
            "topic": title,
            "url": url,
            "community": community_of(url),
            "published": rfc822_to_kst(p.group(1)) if p else "",
            "category": cat["id"],
            "category_label": cat["label"],
            "category_emoji": cat["emoji"],
            "blog": cat["blog"],
            "matched_keywords": [],
            "score": 0.0,
        })
    src["ok"] = bool(src["items"])
    src["count"] = len(src["items"])
    if not src["ok"] and not src["error"]:
        src["error"] = "RSS 항목 0건"
    return src


# ==================================================================
# 키워드 엮기 · 점수
# ==================================================================
def load_keyword_pool():
    """data/realtime-trends.json 의 '지금 뜨는 키워드' — 크롤링 0회로 배지·점수에만 쓴다."""
    try:
        with open(REALTIME_PATH, encoding="utf-8") as f:
            j = json.load(f)
        return [k.get("k", "") for k in (j.get("keywords") or []) if k.get("k")]
    except Exception:  # noqa: BLE001
        return []


def enrich(items, keywords):
    pool = [k for k in dict.fromkeys(keywords) if len(k) >= 2]
    for it in items:
        title = it.get("title", "")
        hit = [k for k in pool if k in title][:4]
        it["matched_keywords"] = hit
        s = 0.0
        s += it.get("comments", 0) * 2
        s += min(it.get("views", 0) * 0.01, 50)
        s += min(it.get("votes", 0) * 2, 40)
        if it.get("discount_pct"):
            s += min(it["discount_pct"], 70) * 0.3
        s += len(hit) * 10
        if it.get("is_product"):
            s += 8
        if it.get("price"):
            s += 4
        it["score"] = round(s, 1)
    return sorted(items, key=lambda x: -x.get("score", 0))


# ==================================================================
# 합치기 (지난 수집 유지 · 중복 제거)
# ==================================================================
def merge_deals(new_items, prev_deals, now, now_dt):
    """같은 주소는 한 번만. first_seen 은 처음 본 시각으로 유지, last_seen 갱신."""
    by_url = {}
    for old in prev_deals or []:
        if not isinstance(old, dict) or not old.get("url"):
            continue
        by_url[old["url"]] = dict(old)
    fresh = 0
    for it in new_items:
        url = it.get("url")
        if not url:
            continue
        prev = by_url.get(url)
        if prev:
            keep_first = prev.get("first_seen") or now
            merged = dict(prev)
            merged.update(it)                 # 최신 파싱값으로 갱신
            merged["first_seen"] = keep_first
            merged["last_seen"] = now
            merged["is_new"] = False
            by_url[url] = merged
        else:
            it["first_seen"] = now
            it["last_seen"] = now
            it["is_new"] = True
            by_url[url] = it
            fresh += 1

    limit = now_dt - timedelta(hours=KEEP_HOURS)
    kept = []
    for it in by_url.values():
        ls = parse_iso(it.get("last_seen")) or limit
        if ls < limit:
            continue
        kept.append(it)
    kept.sort(key=lambda x: (get_sort_iso(x.get("last_seen")), x.get("score", 0)), reverse=True)
    kept = kept[:MAX_DEALS]
    # 화면 순서는 '오늘 뜨거운 순' — 새로 들어온 것을 조금 더 쳐 준다
    for it in kept:
        if it.get("is_new"):
            it["score"] = round(it.get("score", 0) + 6, 1)
    kept.sort(key=lambda x: (x.get("score", 0), get_sort_iso(x.get("last_seen"))), reverse=True)
    return kept, fresh


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s))
    except Exception:  # noqa: BLE001
        return None


def get_sort_iso(s):
    d = parse_iso(s)
    return d or datetime(1970, 1, 1, tzinfo=KST)


# ==================================================================
# 파일 읽기/쓰기
# ==================================================================
def load_prev(out_path=None):
    for path in [out_path or DEFAULT_OUT, REALTIME_PATH]:
        try:
            with open(path, encoding="utf-8") as f:
                j = json.load(f)
            if isinstance(j, dict) and j.get("deals") is not None:
                return j
            if isinstance(j, dict) and isinstance(j.get("hotItems"), dict):
                return j["hotItems"]
        except Exception:  # noqa: BLE001
            continue
    return {}


def write_history(payload, now):
    try:
        os.makedirs(HISTORY_DIR, exist_ok=True)
        day = now.strftime("%Y-%m-%d")
        path = os.path.join(HISTORY_DIR, day + ".json")
        prev = {}
        try:
            with open(path, encoding="utf-8") as f:
                prev = json.load(f)
        except Exception:  # noqa: BLE001
            prev = {}
        seen_urls = {d.get("url") for d in (prev.get("deals") or [])}
        acc = list(prev.get("deals") or [])
        for d in payload.get("deals") or []:
            if d.get("url") in seen_urls:
                continue
            seen_urls.add(d.get("url"))
            acc.append({
                "title": d.get("title"), "url": d.get("url"), "price": d.get("price"),
                "currency": d.get("currency"), "mall": d.get("mall"),
                "category": d.get("category_label"), "first_seen": d.get("first_seen"),
                "is_product": d.get("is_product"), "score": d.get("score"),
            })
        acc = acc[:400]
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"date": day, "updated_at": now.isoformat(timespec="seconds"),
                       "count": len(acc), "stats": payload.get("stats"), "deals": acc},
                      f, ensure_ascii=False, indent=1)
            f.write("\n")
        # 오래된 history 정리(7일)
        cutoff = (now - timedelta(days=HISTORY_KEEP_DAYS)).strftime("%Y-%m-%d")
        for name in os.listdir(HISTORY_DIR):
            if not re.match(r"^\d{4}-\d{2}-\d{2}\.json$", name):
                continue
            if name[:10] < cutoff:
                try:
                    os.remove(os.path.join(HISTORY_DIR, name))
                except OSError:
                    pass
    except Exception as e:  # noqa: BLE001
        print("  (history 저장 건너뜀: %s)" % str(e)[:80])


# ==================================================================
# build
# ==================================================================
def build(out_path=None, keywords=None, prev=None, save=True, history=True):
    now_dt = datetime.now(KST)
    now = now_dt.isoformat(timespec="seconds")
    out_path = out_path or DEFAULT_OUT
    keywords = keywords if keywords is not None else load_keyword_pool()
    prev = prev if prev is not None else load_prev(out_path)
    prev_deals = prev.get("deals") or []
    prev_hot = prev.get("hot_posts") or []

    clien = collect_clien()
    hothub = collect_hothub()

    if not clien["ok"] and prev_deals:
        clien["stale"] = True
        clien["error"] = (clien["error"] + " · 지난 수집 유지") if clien["error"] else "지난 수집 유지"
    if not hothub["ok"] and prev_hot:
        hothub["stale"] = True
        hothub["error"] = (hothub["error"] + " · 지난 수집 유지") if hothub["error"] else "지난 수집 유지"

    deals, fresh = merge_deals(enrich(clien["items"], keywords), prev_deals, now, now_dt)

    hot_items = enrich(hothub["items"], keywords) if hothub["ok"] else []
    if not hot_items:
        hot_items = prev_hot

    # 오늘(3일) 모인 것 중 상품성 있는 것 / 정보글 나누기
    products = [d for d in deals if d.get("is_product")]
    infos = [d for d in deals if not d.get("is_product")]
    today = now_dt.strftime("%Y-%m-%d")
    today_new = [d for d in deals if str(d.get("first_seen", ""))[:10] == today]

    payload = {
        "version": "1.0",
        "studio": "2.1.0",
        "generated_at": now,
        "generated_label": "%d월 %d일 %s 기준" % (now_dt.month, now_dt.day, now_dt.strftime("%H:%M")),
        "auto_note": "매시 10분 GitHub Actions 자동 갱신 · 0원 공개 소스 2곳",
        "keep_hours": KEEP_HOURS,
        "sources": [{k: v for k, v in s.items() if k != "items"} for s in (clien, hothub)],
        "stats": {
            "deals": len(deals),
            "deals_product": len(products),
            "deals_info": len(infos),
            "deals_new": len(today_new),
            "clien_now": clien.get("count", 0) if not clien.get("stale") else 0,
            "hot_posts": len(hot_items),
            "keywords": len([k for k in keywords if k]),
            "matched": len([d for d in deals if d.get("matched_keywords")]),
        },
        "keywords": [{"k": k} for k in [kk for kk in keywords if kk][:40]],
        "deals": deals,
        "hot_posts": hot_items[:30],
        "notes": [
            "가격·재고·할인은 원문(클리앙 글) 제목 기준이고, 우리가 실시간으로 확인한 값이 아닙니다 — 원문에서 확인하세요.",
            "무료앱·리딤·정보글은 상품이 아니라 '정보'로 따로 묶었습니다.",
            "네이버 데이터랩 쇼핑인기검색어는 robots 규칙상 쓰지 않습니다(키워드 없이 클리앙+핫허브만).",
            "쿠팡·알구몬·뽐뿌·다나와 등은 2026-11-18 실측에서 전부 차단되어 넣지 않았습니다.",
        ],
    }

    if save:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        tmp = out_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, out_path)
        if history:
            write_history(payload, now_dt)
    return payload


def compact(payload, max_deals=40, max_hot=20):
    """data/realtime-trends.json 에 실어 보낼 만큼만 남긴다(워크플로가 그 파일만 커밋하기 때문)."""
    if not payload:
        return None
    drop = ("preview",)
    return {
        "version": payload.get("version"),
        "studio": payload.get("studio"),
        "generated_at": payload.get("generated_at"),
        "generated_label": payload.get("generated_label"),
        "auto_note": payload.get("auto_note"),
        "keep_hours": payload.get("keep_hours"),
        "sources": payload.get("sources"),
        "stats": payload.get("stats"),
        "keywords": payload.get("keywords"),
        "notes": payload.get("notes"),
        "deals": [{k: v for k, v in d.items() if k not in drop}
                  for d in (payload.get("deals") or [])[:max_deals]],
        "hot_posts": (payload.get("hot_posts") or [])[:max_hot],
    }


def main():
    ap = argparse.ArgumentParser(description="화제템(클리앙 알뜰구매 + 핫허브) 수집 → data/hot-items.json")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-history", action="store_true")
    args = ap.parse_args()

    payload = build(out_path=args.out, save=not args.dry_run, history=not args.no_history)
    st = payload["stats"]
    print("[hot-items] %s" % payload["generated_label"])
    for s in payload["sources"]:
        print("  %-16s %s  이번 %3d건 %s" % (s["name"], "OK  " if s["ok"] else "FAIL",
                                          s.get("count", 0), s.get("error") or ""))
    print("  딜 %d건(상품 %d · 정보 %d · 오늘 새로 %d) / 화제글 %d건 / 키워드 %d개 중 %d건 제목에 걸림"
          % (st["deals"], st["deals_product"], st["deals_info"], st["deals_new"],
             st["hot_posts"], st["keywords"], st["matched"]))
    for d in (payload["deals"] or [])[:8]:
        price = ("%s%s" % (format(d["price"], ","), "원" if d.get("currency") == "KRW" else " 달러")) \
            if d.get("price") else "-"
        print("  · [%s] %-44s | %s | %s | 댓글%d" % (d.get("category_label"), d.get("title", "")[:44],
                                                   d.get("mall") or "-", price, d.get("comments", 0)))
    if args.dry_run:
        print("(--dry-run: 저장하지 않았습니다)")
        return 0
    print("저장: %s" % args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
