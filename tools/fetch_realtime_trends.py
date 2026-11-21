#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""실시간 키워드 수집기 (v1.9.0)

무료 공개 소스만으로 지연님 4대 블로그에 바로 쓸 수 있는 실시간 키워드를 모아
data/realtime-trends.json 을 만든다. GitHub Actions(.github/workflows/realtime-trends.yml)가
매시간 이 스크립트를 실행하고, 바뀐 내용이 있을 때만 자동 커밋한다.

소스 (2026-11-17 실측으로 살아 있는 것만)
  1. 구글 트렌드 한국 RSS  https://trends.google.com/trending/rss?geo=KR
  2. 시그널 실시간 검색어  https://api.signal.bz/news/realtime
  3. 네이버 많이 본 뉴스    https://news.naver.com/main/ranking/popularDay.naver
  4. 네이트 언론사 랭킹     https://news.nate.com/rank/interest?sc=du

만드는 것
  - keywords: 실시간 검색어 + 기사 제목에서 뽑은 4대 블로그 맞춤 키워드(중복 제거·점수순)
  - news: 지금 주요 뉴스 헤드라인(정치·사건 포함 — 화면에서 눈으로 확인하는 용도)
  - sources: 소스별 성공/실패 상태 (하나가 죽어도 나머지로 계속 진행)

쓰기
  python3 tools/fetch_realtime_trends.py                # data/realtime-trends.json 저장
  python3 tools/fetch_realtime_trends.py --dry-run      # 저장 없이 결과만 확인
  python3 tools/fetch_realtime_trends.py --out /tmp/x.json
"""

from __future__ import annotations

import argparse
import html as H
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "data", "realtime-trends.json")

# v2.3.7 (2026-11-22) — 키워드 '급상승·신규' 판정용. 이번 실행이 덮어쓸 파일(=지난 실행의 결과)을
#   읽어 순위표를 잡아 둔다. 워크플로가 매시 이 JSON 을 커밋하므로 1시간 전과 비교된다.
PREV_FILE = DEFAULT_OUT

KST = timezone(timedelta(hours=9))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

SOURCES = [
    {"id": "google_trends", "name": "구글 트렌드", "url": "https://trends.google.com/trending/rss?geo=KR"},
    {"id": "signal", "name": "시그널", "url": "https://api.signal.bz/news/realtime"},
    {"id": "naver", "name": "네이버 많이 본 뉴스", "url": "https://news.naver.com/main/ranking/popularDay.naver"},
    {"id": "nate", "name": "네이트 랭킹", "url": "https://news.nate.com/rank/interest?sc=du"},
    {"id": "feeds", "name": "연예·건강 RSS", "url": "https://www.slist.kr/rss/allArticle.xml"},
]

# 연예·생활·건강 전문지 — 일반 랭킹에 잘 안 뜼는 생활픽스·건강 키워드를 보충한다
FEEDS = [
    ("연예·생활", "https://www.slist.kr/rss/allArticle.xml"),
    ("건강", "https://www.doctorsnews.co.kr/rss/allArticle.xml"),
]

# 네이버 많이 본 뉴스만으로는 연예·건강이 적어서, 섹션 면을 같이 본다
NAVER_SECTIONS = [("101", "경제"), ("103", "생활·문화"), ("105", "IT·과학")]

SHORTCUTS = [
    # v1.9.4 (2026-11-18) — 핫허브를 맨 앞에 (지연님 요청: 실시간 사이트 바로가기에 추가)
    {"id": "hothub", "name": "🔥 핫허브", "url": "https://hothub.app/"},
    {"id": "google_trends", "name": "구글 트렌드 한국", "url": "https://trends.google.com/trends/trendingsearches/daily?geo=KR"},
    {"id": "signal", "name": "시그널 실시간", "url": "https://signal.bz/"},
    {"id": "nate", "name": "네이트 이슈", "url": "https://news.nate.com/rank/interest?sc=du"},
    {"id": "naver", "name": "네이버 많이 본", "url": "https://news.naver.com/main/ranking/popularDay.naver"},
]

BLOGS = [
    {"id": "mama2624", "name": "생활픽스", "emoji": "🏠"},
    {"id": "jiyn74", "name": "행복한긍정씨", "emoji": "💰"},
    {"id": "2sunshines", "name": "긍정예찬", "emoji": "🥗"},
    {"id": "jinjin2624", "name": "긍정사랑", "emoji": "🩺"},
]

# ---------------------------------------------------------------------------
# 4대 블로그 분류 사전
#   (정규식, 화면에 넣을 키워드, 블로그 id 목록)
#   긴 패턴이 먼저 걸리도록 정렬해서 쓴다.
# ---------------------------------------------------------------------------
LEXICON = [
    # --- 생활픽스 mama2624 : 살림·리빙·패션미용·연예 ---
    (r"그래미|빌보드| 신곡|앨범 컴백|컴백", "가요계 컴백", ["mama2624"]),
    (r"넷플릭스|시리즈 공개| 드라마 화제", "드라마 추천", ["mama2624"]),
    (r"올리브영|색조|뷰티", "화장품 신제품", ["mama2624"]),
    (r"크리스마스|산타|트리 장식|연말 분위기", "크리스마스 트리", ["mama2624"]),
    (r"한파|영하|첫눈|대설|결빙|추위", "한파 대비", ["mama2624"]),
    (r"보습|건조|보습크림", "겨울 보습 관리", ["mama2624"]),
    (r"난방비|보일러|도시가스|온수", "겨울 난방비", ["mama2624"]),
    (r"전기요금|관리비|공과금", "겨울 관리비", ["mama2624", "jiyn74"]),
    (r"단열|결로|이중창|문풍지", "창문 단열", ["mama2624"]),
    (r"가습기|제습기|공기청정기|미세먼지", "가습기 관리", ["mama2624"]),
    (r"이불|세탁|빨래|건조기", "이불 빨래", ["mama2624"]),
    (r"패딩|코트|패션|의류|신발", "겨울 패딩", ["mama2624"]),
    (r"화장품|스킨케어|세럼|앰플|립밤", "겨울 스킨케어", ["mama2624"]),
    (r"헤어|염색|펌|미용실", "헤어 스타일", ["mama2624"]),
    (r"인테리어|리모델링|가구|수납|정리 수납", "집 정리 수납", ["mama2624"]),
    (r"이사 비용|이사 준비|포장이사", "이사 비용", ["mama2624"]),
    (r"다이어트|체중 감량|살 빼", "다이어트 식단", ["2sunshines", "mama2624"]),
    (r"열애|결혼 발표|결혼식|이혼|재혼", "연예인 결혼", ["mama2624"]),
    (r"영화 개봉|박스오피스|흥행", "영화 추천", ["mama2624"]),
    (r"콘서트|팬미팅|시상식", "콘서트 예매", ["mama2624"]),
    (r"추석|설날|명절|차례상", "명절 준비", ["mama2624", "2sunshines"]),
    (r"블랙프라이데이|연말 할인|세일", "연말 할인 정보", ["mama2624"]),

    # --- 행복한긍정씨 jiyn74 : 경제·복지·정책·부동산·보험 ---
    (r"주담대|주택담보대출|담보\s*대출|가계대출|코픽스|대출금리|대출 한도", "주담대 금리", ["jiyn74"]),
    (r"기준금리|금리 인하|금리 인상|한국은행", "기준금리 전망", ["jiyn74"]),
    (r"전세사기|전세|월세|보증금", "전세 시세", ["jiyn74"]),
    (r"아파트|집값|재건축|재개발|청약|분양|부동산", "아파트 값", ["jiyn74"]),
    (r"종부세|종합부동산세|재산세|양도세|양도소득세|취득세", "부동산 세금", ["jiyn74"]),
    (r"연말정산|소득공제|세액공제|13월의 월급", "연말정산 환급", ["jiyn74"]),
    (r"상속세|증여세|상속", "상속세·증여세", ["jiyn74"]),
    (r"근로장려금|장려금", "근로장려금 신청", ["jiyn74"]),
    (r"기초연금|국민연금|퇴직연금|연금", "연금 수령액", ["jiyn74"]),
    (r"건강보험|건보료|실손보험|보험료", "실손보험 갱신", ["jiyn74"]),
    (r"지원금|보조금|수당|급여 신청|신청 대상|정부 지원", "정부 지원금", ["jiyn74"]),
    (r"코스피|코스닥|증시|주가|주식", "코스피 급락", ["jiyn74"]),
    (r"환율|달러|원화", "환율 전망", ["jiyn74"]),
    (r"비트코인|가상자산|코인|업비트|빗썸", "비트코인 시세", ["jiyn74"]),
    (r"금값|금 시세|골드바|금테크", "금값 시세", ["jiyn74"]),
    (r"물가|장바구니|소비자물가", "장바구니 물가", ["jiyn74"]),
    (r"최저임금|임금", "최저임금", ["jiyn74"]),
    (r"청년 지원|청년정책|청년도약|청년", "청년 지원금", ["jiyn74"]),
    (r"노후|은퇴|퇴직", "노후 준비", ["jiyn74"]),
    (r"카드 혜택|캐시백|포인트 적립", "카드 혜택", ["jiyn74"]),
    (r"면세점|면세", "면세점 쇼핑", ["jiyn74"]),

    # --- 긍정예찬 2sunshines : 식단·식재료·영양·생활건강·여행 ---
    (r"혈당|인슐린 저항|혈당 스파이크", "혈당 낮추는 식단", ["2sunshines"]),
    (r"단백질 섭취|단백질 음식|근력 운동", "단백질 섭취량", ["2sunshines"]),
    (r"김장|절임배추|배추", "김장 배추 보관", ["2sunshines"]),
    (r"면역력|유산균|영양제", "겨울 면역력 음식", ["2sunshines"]),
    (r"제철 과일|제철 음식|귤|딸기|굴|방어", "제철 음식", ["2sunshines"]),
    (r"온천|스파", "온천 여행지", ["2sunshines"]),
    (r"여행지|여행 준비|제주|강원|국내여행|해외여행", "겨울 여행지", ["2sunshines"]),
    (r"걷기|만보|스트레칭|홈트", "겨울 실내 운동", ["2sunshines"]),
    (r"숙면|수면", "수면 습관", ["2sunshines"]),
    (r"식이섬유|장 건강|변비", "식이섬유 섭취", ["2sunshines"]),
    (r"나트륨|소금 폭탄|가공식품", "나트륨 줄이는 식단", ["2sunshines"]),
    (r"돌아기|이유식|아이 간식", "아이 간식", ["mama2624", "2sunshines"]),
    (r"카페인", "카페인 섭취량", ["2sunshines"]),
    (r"식단|레시피|반찬|건강식", "겨울 건강식단", ["2sunshines"]),

    # --- 긍정사랑 jinjin2624 : 질병·증상·의학 ---
    (r"독감|인플루엔자|예방접종|백신", "독감 예방접종", ["jinjin2624"]),
    (r"감기|기침|콧물|인후통|목 통증", "감기 증상", ["jinjin2624"]),
    (r"고혈압|혈압", "고혈압 관리", ["jinjin2624"]),
    (r"당뇨", "당뇨병 증상", ["jinjin2624"]),
    (r"위염|역류성 식도염|속쓰림|위식도", "위염 증상", ["jinjin2624"]),
    (r"장염|설사|복통", "장염 증상", ["jinjin2624"]),
    (r"대상포진", "대상포진 초기증상", ["jinjin2624"]),
    (r"오십견|어깨 통증", "오십견 증상", ["jinjin2624"]),
    (r"관절|디스크|허리 통증|무릎", "관절·디스크", ["jinjin2624"]),
    (r"심근경색|협심증|가슴 통증", "심근경색 전조증상", ["jinjin2624"]),
    (r"뇌졸중|뇌경색|중풍", "뇌졸중 초기증상", ["jinjin2624"]),
    (r"치매|건망증", "치매 초기증상", ["jinjin2624"]),
    (r"갑상선", "갑상선 기능 저하증", ["jinjin2624"]),
    (r"공황|불안장애", "공황장애 초기증상", ["jinjin2624"]),
    (r"우울증|우울감", "우울증 증상", ["jinjin2624"]),
    (r"폐렴|기관지|천식", "폐렴 초기증상", ["jinjin2624"]),
    (r"코로나|확진", "코로나 증상", ["jinjin2624"]),
    (r"수족구|마이코플라스마|RSV|호흡기 감염", "수족구 증상", ["jinjin2624"]),
    (r"건강검진|내시경|암 검진|국가암검진", "국가건강검진 항목", ["jinjin2624"]),
    (r"암|종양", "암 초기증상", ["jinjin2624"]),
    (r"간염|간경화|지방간", "지방간 증상", ["jinjin2624"]),
    (r"빈혈|어지럼증", "빈혈 증상", ["jinjin2624"]),
    (r"척추관협착증|협착증|추간공", "척추관협착증 증상", ["jinjin2624"]),
    (r"홍역", "홍역 예방접종", ["jinjin2624"]),
    (r"요로결석|방광염|신장", "요로결석 증상", ["jinjin2624"]),
]

LEXICON = sorted(LEXICON, key=lambda e: -len(e[0]))

# 키워드로 쓰지 않는 정치·사건·사고 (헤드라인 목록에는 그대로 남긴다)
NOISE = re.compile(
    r"특검|내란|탄핵|국무회의|국회|대통령|장관|여당|야당|선거|공소청|검찰|경찰청|구속|체포|"
    r"사망|숨져|숨진|참변|살인|폭행|성폭력|마약|음주운전|화재|붕괴|총격|전쟁|북한|김정은|"
    r"트럼프|관세|반도체|엔비디아|AI|인공지능|수능|예비소집|커닝|부정행위|시험"
)


# ---------------------------------------------------------------------------
# 수집 도구
# ---------------------------------------------------------------------------
def http_get(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/rss+xml, application/xml, text/html, application/json;q=0.9, */*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    # 네이버·네이트는 EUC-KR로 내려온다. 깨진 글자가 적은 쪽을 고른다.
    best, best_bad = None, None
    for enc in ("utf-8", "euc-kr", "cp949"):
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        bad = text[:20000].count("\ufffd")
        if best is None or bad < best_bad:
            best, best_bad = text, bad
        if bad == 0:
            break
    return best if best is not None else raw.decode("utf-8", "replace")


def clean(text: str) -> str:
    text = H.unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("…", " ").replace("·", "·")
    return re.sub(r"\s+", " ", text).strip()


def norm_key(text: str) -> str:
    """중복 판정용 — 공백·따옴표·문장부호 제거."""
    return re.sub(r"[\s'\"“”‘’\[\](){}<>·,.\-—:;!?…]", "", text or "").lower()


def rss_items(xml: str):
    """구글 트렌드 RSS — item 1개 = 급상승 검색어 1개."""
    out = []
    for block in re.findall(r"<item>(.*?)</item>", xml, re.S):
        def tag(name):
            m = re.search(r"<%s>(.*?)</%s>" % (name, name), block, re.S)
            return clean(m.group(1)) if m else ""
        keyword = tag("title")
        if not keyword:
            continue
        news = []
        for ni in re.findall(r"<ht:news_item>(.*?)</ht:news_item>", block, re.S):
            def ntag(name):
                m = re.search(r"<%s>(.*?)</%s>" % (name, name), ni, re.S)
                return clean(m.group(1)) if m else ""
            url = ntag("ht:news_item_url")
            title = ntag("ht:news_item_title")
            if title:
                news.append({"t": title, "u": url, "s": ntag("ht:news_item_source")})
        traffic = tag("ht:approx_traffic")
        out.append({"keyword": keyword, "traffic": traffic, "news": news[:2]})
    return out


def signal_items(payload: str):
    data = json.loads(payload)
    out = []
    for row in data.get("top10") or []:
        kw = clean(row.get("keyword") or "")
        if not kw:
            continue
        out.append({
            "keyword": kw,
            "rank": int(row.get("rank") or 0),
            "state": row.get("state") or "",
        })
    return out


def rss_headlines(xml: str):
    """일반 RSS — 기사 제목 + 링크만 쓴다(트렌드가 아니라 최신 기사)."""
    out = []
    for block in re.findall(r"<item>(.*?)</item>", xml, re.S)[:20]:
        def tag(name):
            m = re.search(r"<%s>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</%s>" % (name, name), block, re.S)
            return clean(m.group(1)) if m else ""
        title, link = tag("title"), tag("link")
        if title and link:
            out.append({"title": title, "url": link, "press": ""})
    return out


def naver_section_items(page: str):
    """네이버 섹션 면(news.naver.com/section/{sid}) 제목 + 링크 + 언론사."""
    """네이버 섹션 면(news.naver.com/section/{sid}) 제목 + 링크 + 언론사."""
    out = []
    for m in re.finditer(
            r'<a href="(https://n\.news\.naver\.com/mnews/article/[^"]+)" class="sa_text_title[^"]*"[^>]*>(.*?)</a>',
            page, re.S):
        title = clean(re.sub(r"<[^>]+>", "", m.group(2)))
        if not title:
            continue
        tail = page[m.end():m.end() + 600]
        press = re.search(r'class="sa_text_press"[^>]*>(.*?)</span>', tail, re.S)
        out.append({"title": title, "url": m.group(1),
                    "press": clean(press.group(1)) if press else ""})
    return out


def naver_items(page: str):
    """네이버 많이 본 뉴스 — 언론사 블록마다 5개씩, 제목 + 언론사."""
    out = []
    marks = [(m.start(), clean(m.group(1))) for m in re.finditer(r'rankingnews_name">([^<]+)<', page)]
    for idx, (pos, press) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(page)
        seg = page[pos:end]
        for m in re.finditer(r'<a href="(https://n\.news\.naver\.com/article/[^"]+)" class="list_title[^"]*"[^>]*>([^<]+)</a>', seg):
            title = clean(m.group(2))
            if title:
                out.append({"title": title, "url": m.group(1), "press": press})
    return out


def nate_items(page: str):
    """네이트 언론사 랭킹 — h2.tit 제목 + 언론사."""
    out = []
    for m in re.finditer(
        r'<a href="(//news\.nate\.com/view/[^"]+)" class="lt1"[^>]*>(.*?)</a>', page, re.S):
        url, body = m.group(1), m.group(2)
        t = re.search(r'<h2[^>]*class="tit"[^>]*>(.*?)</h2>', body, re.S)
        title = clean(t.group(1)) if t else ""
        if not title:
            continue
        if url.startswith("//"):
            url = "https:" + url
        out.append({"title": title, "url": url, "press": ""})
    # 언론사 이름은 a 바깥 span.medium 에 있다
    for item, m in zip(out, re.finditer(r'<span class="medium">([^<]+)<em>', page)):
        item["press"] = clean(m.group(1))
    return out


# ---------------------------------------------------------------------------
# 분류
# ---------------------------------------------------------------------------
def classify(text: str):
    """문장에서 블로그 맞춤 키워드를 뽑는다. (키워드, 블로그목록) 최대 2개."""
    found, used = [], set()
    for pattern, keyword, blogs in LEXICON:
        if keyword in used:
            continue
        if re.search(pattern, text):
            found.append((keyword, list(blogs)))
            used.add(keyword)
        if len(found) >= 2:
            break
    return found


def blogs_of(text: str):
    tags = []
    for pattern, keyword, blogs in LEXICON:
        if re.search(pattern, text):
            for b in blogs:
                if b not in tags:
                    tags.append(b)
    return tags


def state_label(state: str) -> str:
    s = (state or "").strip()
    if s in ("+", "up"):
        return "▲"
    if s in ("-", "down"):
        return "▼"
    if s in ("n", "new", "N"):
        return "NEW"
    return ""


def parse_traffic(v: str) -> int:
    m = re.search(r"([\d,.]+)\s*([KMB]?)", (v or "").replace("+", ""))
    if not m:
        return 0
    try:
        n = float(m.group(1).replace(",", ""))
    except ValueError:
        return 0
    mult = {"K": 1000, "M": 1000000, "B": 1000000000}.get(m.group(2), 1)
    return int(n * mult)


def load_prev_ranks(path: str):
    """지난 실행이 커밋해 둔 keywords 의 순위표 {정규화키워드: 순위} + 생성 시각.

    파일이 없거나(첫 실행) 읽을 수 없으면 ({}, "") 를 돌려주고, 그러면 이번 실행은
    신규/급상승 배지를 붙이지 않는다(없는 사실을 만들지 않는다).
    """
    try:
        with open(path, encoding="utf-8") as f:
            j = json.load(f)
    except Exception:  # noqa: BLE001
        return {}, ""
    ranks = {}
    for it in j.get("keywords") or []:
        k = norm_key(it.get("k") or "")
        try:
            r = int(it.get("rank") or 0)
        except (TypeError, ValueError):
            r = 0
        if k and r:
            ranks[k] = r
    return ranks, str(j.get("generated_at") or "")


def mark_prev(picked, prev_ranks) -> list:
    """뽑힌 키워드에 지난 수집 대비 prev(순위)·delta(계단)·new(신규) 를 붙인다 (v2.3.7).

    · prev  = 지난 수집에서의 순위(없으면 0)
    · delta = 오른 계단 수(지난 순위 - 지금 순위). 화면은 2계단 이상만 보여 준다.
    · new   = 지난 수집에 없던 키워드. 지난 파일이 없으면(첫 실행) 아무 데도 붙이지 않는다.
    """
    for it in picked:
        p = prev_ranks.get(norm_key(it["k"]))
        it["prev"] = int(p or 0)
        it["delta"] = (it["prev"] - it["rank"]) if (p and it["rank"]) else 0
        it["new"] = bool(prev_ranks) and p is None
    return picked


def prev_report(prev_at: str) -> dict:
    """비교 기준 시각·경과 분 — 화면은 6시간이 넘은 비교를 '급상승'으로 쓰지 않는다."""
    if not prev_at:
        return {"generated_at": "", "count": 0, "age_minutes": 0}
    try:
        t = datetime.fromisoformat(prev_at)
        if t.tzinfo is None:
            t = t.replace(tzinfo=KST)
        age = int(max(0, (datetime.now(KST) - t).total_seconds()) // 60)
    except Exception:  # noqa: BLE001
        age = 0
    return {"generated_at": prev_at, "age_minutes": age}


def build() -> dict:
    now = datetime.now(KST)
    keywords: dict[str, dict] = {}
    news: list[dict] = []
    status = []

    def add_keyword(kw: str, src: str, score: float, blogs=None, news_items=None,
                    traffic="", state="", rank=0):
        kw = (kw or "").strip(" ,·…\"'“”")
        if len(kw) < 2:
            return None
        key = norm_key(kw)
        if not key:
            return None
        if NOISE.search(kw) and not blogs:
            return None
        item = keywords.get(key)
        if item is None:
            item = {
                "k": kw, "blogs": [], "src": [], "score": 0.0,
                "traffic": "", "state": "", "rank": 0, "news": [],
            }
            keywords[key] = item
        item["score"] = max(item["score"], float(score)) + (0 if src in item["src"] else 4)
        if src not in item["src"]:
            item["src"].append(src)
        for b in (blogs or blogs_of(kw)):
            if b not in item["blogs"]:
                item["blogs"].append(b)
        if traffic and not item["traffic"]:
            item["traffic"] = traffic
        if state and not item["state"]:
            item["state"] = state
        if rank and (not item["rank"] or rank < item["rank"]):
            item["rank"] = rank
        for n in (news_items or []):
            if n.get("t") and len(item["news"]) < 2 and all(n["t"] != x["t"] for x in item["news"]):
                item["news"].append(n)
        return item

    def add_news(title, url, press, src, rank):
        title = clean(title)
        if len(title) < 8:
            return
        if any(norm_key(title) == norm_key(x["t"]) for x in news):
            return
        news.append({
            "t": title[:120], "u": url, "s": press or "", "src": src,
            "blogs": blogs_of(title), "rank": rank,
        })

    # 1) 구글 트렌드 -----------------------------------------------------
    try:
        rows = rss_items(http_get(SOURCES[0]["url"]))
        for i, r in enumerate(rows):
            add_keyword(r["keyword"], "구글 트렌드", 100 - i * 4,
                        traffic=r["traffic"], state="NEW" if i < 3 else "", rank=i + 1,
                        news_items=r["news"])
            for n in r["news"]:
                add_news(n["t"], n["u"], n["s"], "구글 트렌드", 0)
        status.append({"id": "google_trends", "name": "구글 트렌드", "ok": True,
                       "count": len(rows), "error": ""})
    except Exception as e:  # noqa: BLE001
        status.append({"id": "google_trends", "name": "구글 트렌드", "ok": False,
                       "count": 0, "error": str(e)[:120]})

    # 2) 시그널 실시간 검색어 --------------------------------------------
    try:
        rows = signal_items(http_get(SOURCES[1]["url"]))
        for r in rows:
            add_keyword(r["keyword"], "시그널", 92 - r["rank"] * 3,
                        state=state_label(r["state"]), rank=r["rank"])
        status.append({"id": "signal", "name": "시그널", "ok": True,
                       "count": len(rows), "error": ""})
    except Exception as e:  # noqa: BLE001
        status.append({"id": "signal", "name": "시그널", "ok": False,
                       "count": 0, "error": str(e)[:120]})

    # 3) 네이버 많이 본 뉴스 + 섹션 면 -----------------------------------
    try:
        rows = naver_items(http_get(SOURCES[2]["url"]))
        labels = []
        for sid, label in NAVER_SECTIONS:
            try:
                extra = naver_section_items(http_get("https://news.naver.com/section/%s" % sid))
                labels.append("%s %d" % (label, len(extra)))
                rows.extend(extra)
            except Exception as e:  # noqa: BLE001
                labels.append("%s 실패" % label)
                print("[warn] 네이버 %s 섹션: %s" % (label, e), file=sys.stderr)

        freq: dict[str, int] = {}
        uniq_title = set()
        for i, r in enumerate(rows):
            add_news(r["title"], r["url"], r["press"], "네이버", i + 1)
            key = norm_key(r["title"])
            if key in uniq_title:
                continue
            uniq_title.add(key)
            for kw, blogs in classify(r["title"]):
                freq[kw] = freq.get(kw, 0) + 1
                add_keyword(kw, "네이버", 52 + min(freq[kw], 8) * 5, blogs=blogs)
        status.append({"id": "naver", "name": "네이버 많이 본 뉴스", "ok": True,
                       "count": len(rows), "error": "", "detail": " · ".join(labels)})
    except Exception as e:  # noqa: BLE001
        status.append({"id": "naver", "name": "네이버 많이 본 뉴스", "ok": False,
                       "count": 0, "error": str(e)[:120]})

    # 4) 네이트 랭킹 -----------------------------------------------------
    try:
        rows = nate_items(http_get(SOURCES[3]["url"]))
        freq = {}
        for i, r in enumerate(rows):
            add_news(r["title"], r["url"], r["press"], "네이트", i + 1)
            for kw, blogs in classify(r["title"]):
                freq[kw] = freq.get(kw, 0) + 1
                add_keyword(kw, "네이트", 50 + min(freq[kw], 6) * 5, blogs=blogs)
        status.append({"id": "nate", "name": "네이트 랭킹", "ok": True,
                       "count": len(rows), "error": ""})
    except Exception as e:  # noqa: BLE001
        status.append({"id": "nate", "name": "네이트 랭킹", "ok": False,
                       "count": 0, "error": str(e)[:120]})

    # 5) 연예·건강 전문지 RSS -------------------------------------------
    try:
        got = 0
        freq = {}
        names = []
        for label, url in FEEDS:
            try:
                extra = rss_headlines(http_get(url))
            except Exception as e:  # noqa: BLE001
                names.append("%s 실패" % label)
                print("[warn] %s RSS: %s" % (label, e), file=sys.stderr)
                continue
            got += len(extra)
            names.append("%s %d" % (label, len(extra)))
            for i, r in enumerate(extra):
                add_news(r["title"], r["url"], "", label, 50 + i)
                for kw, blogs in classify(r["title"]):
                    freq[kw] = freq.get(kw, 0) + 1
                    add_keyword(kw, label, 40 + min(freq[kw], 6) * 4, blogs=blogs)
        status.append({"id": "feeds", "name": "연예·건강 RSS", "ok": got > 0,
                       "count": got, "error": "", "detail": " · ".join(names)})
    except Exception as e:  # noqa: BLE001
        status.append({"id": "feeds", "name": "연예·건강 RSS", "ok": False,
                       "count": 0, "error": str(e)[:120]})

    if not any(s["ok"] for s in status):
        raise SystemExit("모든 소스 수집 실패 — data/realtime-trends.json 을 덮어쓰지 않습니다.")

    # --- 정리: 블로그 맞춤 키워드 우선, 블로그별 최소 확보 ---------------
    items = list(keywords.values())
    for it in items:
        it["score"] = round(it["score"], 1)

    matched = sorted([i for i in items if i["blogs"]], key=lambda x: -x["score"])
    general = sorted([i for i in items if not i["blogs"]], key=lambda x: -x["score"])

    picked: list[dict] = []
    seen = set()

    def take(it):
        nk = norm_key(it["k"])
        if nk in seen:
            return
        seen.add(nk)
        picked.append(it)

    # 블로그마다 상위 6개는 반드시 들어가게 (필터 화면이 비지 않도록)
    for blog in BLOGS:
        mine = [i for i in matched if blog["id"] in i["blogs"]]
        for it in mine[:6]:
            take(it)

    # 그다음 전체 점수순으로 34개까지
    for it in matched:
        if len([p for p in picked if p["blogs"]]) >= 34:
            break
        if it["blogs"]:
            take(it)

    # 일반 이슈는 8개까지 뒤에 붙인다 (전체 탭에서만 보임)
    for it in general[:8]:
        take(it)

    picked.sort(key=lambda x: (-len(x["blogs"]), -x["score"], x["k"]))
    for i, it in enumerate(picked):
        it["rank"] = i + 1

    # v2.3.7 (2026-11-22) — 🏷️ 급상승·신규 배지: 지난 수집본(보통 1시간 전)의 순위와 견준다.
    #   · prev  = 지난 수집에서의 순위(없으면 0)
    #   · delta = 오른 계단 수(지난 순위 - 지금 순위). 내려간 것은 음수지만 화면은 상승만 보여 준다.
    #   · new   = 지난 수집에 없던 키워드
    #   지난 파일이 없으면(첫 실행) 셋 다 0/False 로 두어 배지를 붙이지 않는다.
    prev_ranks, prev_at = load_prev_ranks(PREV_FILE)
    mark_prev(picked, prev_ranks)

    # 헤드라인: 네이버·네이트 상위 + 구글 트렌드 관련 기사 — 같은 언론사가 독점하지 않게
    order = {"네이버": 0, "구글 트렌드": 1, "연예·생활": 2, "건강": 2, "네이트": 3}
    news.sort(key=lambda n: (order.get(n["src"], 4), n["rank"] or 999))
    headlines, seen_h, per_press = [], set(), {}
    for n in news:
        k = norm_key(n["t"])
        if k in seen_h:
            continue
        press = n["s"] or n["src"]
        if per_press.get(press, 0) >= 1:
            continue
        per_press[press] = per_press.get(press, 0) + 1
        seen_h.add(k)
        n.pop("rank", None)
        headlines.append(n)
        if len(headlines) >= 8:
            break
    # 그래도 자리가 남으면 같은 언론사 두 번째 기사로 채운다
    if len(headlines) < 6:
        for n in news:
            k = norm_key(n["t"])
            if k in seen_h:
                continue
            seen_h.add(k)
            n.pop("rank", None)
            headlines.append(n)
            if len(headlines) >= 6:
                break

    blog_counts = {}
    for blog in BLOGS:
        blog_counts[blog["id"]] = len([i for i in picked if blog["id"] in i["blogs"]])

    # v1.9.7 (2026-11-18) — 네이버 홈판 인기글 관찰을 하루 한 번 같이 담는다.
    #   이미 있는 파일에 '오늘 관찰'이 들어 있으면 그대로 쓰고(매시 실행에서 다시 받지 않는다),
    #   날짜가 바뀌었거나 없으면 fetch_naver_homefeed 로 한 번 모은다(약 30~60초).
    homefeed = current_homefeed()

    # v1.9.9 (2026-11-18) — 기존 글 자동 내부링크('함께 보면 좋은 글') 목록도 같이 담는다.
    #   새 워크플로 파일을 푸시할 권한이 없어서, 이 워크플로가 커밋하는 이 JSON 안에
    #   internalLinks 필드로 실어 보낸다(작업실은 이 필드를 읽는다).
    internal = current_internal_links()

    # v2.1.0 (2026-11-18) — 🔥 실시간 화제템 집합소(클리앙 알뜰구매 + 핫허브 인기글)도 같이 담는다.
    #   새 워크플로 파일을 푸시할 권한이 없어서(workflows 권한 없음), 이 워크플로가 커밋하는
    #   이 JSON 안에 hotItems 필드로 실어 보낸다. 작업실은 더 새로운 쪽을 골라 읽는다.
    hot = current_hot_items([k["k"] for k in picked])

    prev_info = prev_report(prev_at)
    prev_info["count"] = len(prev_ranks)

    out = {
        "version": "1.3",
        "studio": "2.3.7",
        "prev": prev_info,
        "generated_at": now.isoformat(timespec="seconds"),
        "generated_label": "%d월 %d일 %s 기준" % (now.month, now.day, now.strftime("%H:%M")),
        "auto_note": "매시 10분 GitHub Actions 자동 갱신",
        "sources": [{**s, "url": next((u["url"] for u in SOURCES if u["id"] == s["id"]), "")}
                    for s in status],
        "shortcuts": SHORTCUTS,
        "blogs": [{**b, "count": blog_counts.get(b["id"], 0)} for b in BLOGS],
        "keywords": picked,
        "news": headlines,
        "stats": {
            "keywords": len(picked),
            "matched": len([i for i in picked if i["blogs"]]),
            "general": len([i for i in picked if not i["blogs"]]),
            "headlines": len(headlines),
        },
        "homefeed": homefeed,
        "internalLinks": internal,
        "hotItems": hot,
    }
    return out


def current_homefeed():
    """오늘(KST) 홈판 관찰을 돌려준다. 이미 오늘 것이 있으면 다시 받지 않는다.

    홈판 수집기는 tools/fetch_naver_homefeed.py 에 있고, 같은 폴더에서 그대로 불러 쓴다.
    수집이 실패해도 realtime-trends 는 그대로 만들어진다(그 항목만 빠지거나 지난 관찰이 남는다).
    """
    out_path = os.path.join(ROOT, "data", "naver-homefeed.json")
    today = datetime.now(KST).strftime("%Y-%m-%d")
    try:
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
        if prev.get("observedDate") == today and prev.get("promptBlock"):
            return _compact_homefeed(prev)
    except Exception:  # noqa: BLE001
        prev = None
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_naver_homefeed", os.path.join(ROOT, "tools", "fetch_naver_homefeed.py"))
        hf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hf)
        fresh = hf.build(6, 2.0, out_path)
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(fresh, f, ensure_ascii=False, indent=1)
                f.write("\n")
        except Exception:  # noqa: BLE001
            pass
        return _compact_homefeed(fresh)
    except Exception as e:  # noqa: BLE001
        print("  홈판 관찰 수집 실패: %s" % str(e)[:120])
        return _compact_homefeed(prev) if prev else None


def current_internal_links():
    """오늘(KST) 기존 글 자동 내부링크 목록을 돌려준다.

    수집기는 tools/fetch_internal_links.py 에 있고, 같은 폴더에서 그대로 불러 쓴다.
    하루 한 번만 실제로 RSS 를 읽는다 — ① data/internal-links.json 이 오늘 것이면 그대로,
    ② 아니면 이 파일(data/realtime-trends.json)에 실려 커밋된 internalLinks 가 오늘 것이면 그대로,
    ③ 둘 다 아니면 새로 모은다. ③이 매시 실행에서 되풀이되지 않도록 ②를 두는 이유는,
    워크플로가 internal-links.json 은 커밋하지 않고 이 JSON 만 커밋하기 때문이다.
    수집이 실패해도 realtime-trends 는 그대로 만들어진다(그 항목만 지난 목록이 된다).
    """
    today = datetime.now(KST).strftime("%Y-%m-%d")
    out_path = os.path.join(ROOT, "data", "internal-links.json")

    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_internal_links", os.path.join(ROOT, "tools", "fetch_internal_links.py"))
        il = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(il)
    except Exception as e:  # noqa: BLE001
        print("  기존 글 수집기 불러오기 실패: %s" % str(e)[:120])
        return _prev_internal()

    try:
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
        if prev.get("collectedDate") == today and prev.get("items"):
            return il.compact(prev)
    except Exception:  # noqa: BLE001
        pass

    prev_trends = _prev_internal()
    if prev_trends and prev_trends.get("collectedDate") == today and prev_trends.get("items"):
        return prev_trends

    try:
        fresh = il.build(out_path)
        try:
            il.save(fresh, out_path)
        except Exception:  # noqa: BLE001
            pass
        return il.compact(fresh)
    except Exception as e:  # noqa: BLE001
        print("  기존 글 수집 실패: %s" % str(e)[:120])
        return prev_trends


def _prev_internal():
    """지난 실행이 커밋해 둔 realtime-trends.json 안의 internalLinks."""
    try:
        with open(DEFAULT_OUT, encoding="utf-8") as f:
            j = json.load(f)
        got = j.get("internalLinks")
        return got if isinstance(got, dict) else None
    except Exception:  # noqa: BLE001
        return None


def _prev_hot():
    """지난 실행이 커밋해 둔 realtime-trends.json 안의 hotItems."""
    try:
        with open(DEFAULT_OUT, encoding="utf-8") as f:
            j = json.load(f)
        got = j.get("hotItems")
        return got if isinstance(got, dict) else None
    except Exception:  # noqa: BLE001
        return None


def current_hot_items(keywords=None):
    """🔥 실시간 화제템 집합소 (v2.1.0 · 2026-11-18)

    수집기는 tools/fetch_hot_items.py 에 있고, 같은 폴더에서 그대로 불러 쓴다.
    소스는 클리앙 알뜰구매 1페이지(robots: 1페이지·쿼리 금지) + 핫허브 RSS 두 곳뿐이며,
    네이버 데이터랩은 robots 규칙상 쓰지 않는다. 한 소스가 실패해도 나머지로 계속 가고,
    둘 다 실패하면 지난 실행의 hotItems 를 그대로 돌려준다(빈 화면 금지).
    """
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_hot_items", os.path.join(ROOT, "tools", "fetch_hot_items.py"))
        hi = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hi)
    except Exception as e:  # noqa: BLE001
        print("  화제템 수집기 불러오기 실패: %s" % str(e)[:120])
        return _prev_hot()
    try:
        payload = hi.build(save=True, history=True, keywords=keywords)
        # 화제글은 스냅샷(hot-items.json)과 같은 25건까지 실어 보낸다 — 화면 건수가 파일마다 달라지지 않게
        return hi.compact(payload, max_deals=40, max_hot=30)
    except Exception as e:  # noqa: BLE001
        print("  화제템 수집 실패: %s" % str(e)[:120])
        return _prev_hot()


def _compact_homefeed(hf):
    """realtime-trends.json 에 넣을 만큼만 남긴다(제목 40건 + 통계 + 프롬프트 블록)."""
    if not hf:
        return None
    items = (hf.get("items") or [])[:40]
    return {
        "version": hf.get("version"),
        "observedAt": hf.get("observedAt"),
        "observedDate": hf.get("observedDate"),
        "stale": bool(hf.get("stale")),
        "ok": bool(hf.get("ok")),
        "stats": hf.get("stats"),
        "promptBlock": hf.get("promptBlock"),
        "items": [{"title": i.get("title"), "url": i.get("url"),
                   "panel": i.get("panel"), "media": i.get("media")} for i in items],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="실시간 키워드 수집 → data/realtime-trends.json")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    global PREV_FILE
    PREV_FILE = args.out          # v2.3.7 — 덮어쓰기 전 파일을 급상승 비교 기준으로 읽는다

    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=1)

    print("[realtime-trends] %s" % data["generated_label"])
    for s in data["sources"]:
        print("  %-16s %s  %3d건 %s" % (s["name"], "OK  " if s["ok"] else "FAIL",
                                        s["count"], s["error"]))
    print("  키워드 %d개 (블로그 맞춤 %d · 일반 %d) / 헤드라인 %d개"
          % (data["stats"]["keywords"], data["stats"]["matched"],
             data["stats"]["general"], data["stats"]["headlines"]))
    print("  블로그별: " + " · ".join("%s %d" % (b["name"], b["count"]) for b in data["blogs"]))
    pv = data.get("prev") or {}
    if pv.get("generated_at"):
        news = len([k for k in data["keywords"] if k.get("new")])
        ups = len([k for k in data["keywords"] if (k.get("delta") or 0) >= 2])
        multi = len([k for k in data["keywords"] if len(k.get("src") or []) >= 2])
        print("  급상승 비교: 지난 수집 %s (%d분 전) · 신규 %d개 · 2계단↑ %d개 · 2곳+ 동시 %d개"
              % (pv["generated_at"], pv.get("age_minutes", 0), news, ups, multi))
    else:
        print("  급상승 비교: 지난 수집본 없음 — 이번 실행은 NEW·▲계단 배지를 붙이지 않습니다")
    hf = data.get("homefeed") or {}
    if hf.get("stats"):
        print("  홈판 관찰: %s · %d건 · 판 %s" % (hf.get("observedAt"), hf["stats"].get("total", 0),
                                              ",".join(hf["stats"].get("panels", {}))))
    il = data.get("internalLinks") or {}
    if il.get("stats"):
        print("  기존 글(내부링크): %s · %d건 · %s"
              % (il.get("collectedAt"), il["stats"].get("total", 0),
                 " · ".join("%s %d" % (k, v) for k, v in (il["stats"].get("blogs") or {}).items())))
    ho = data.get("hotItems") or {}
    if ho.get("stats"):
        hs = ho["stats"]
        print("  화제템: %s · 딜 %d건(상품 %d·정보 %d) · 화제글 %d건"
              % (ho.get("generated_at"), hs.get("deals", 0), hs.get("deals_product", 0),
                 hs.get("deals_info", 0), hs.get("hot_posts", 0)))
        for s in ho.get("sources") or []:
            print("     %-16s %s %3d건 %s" % (s.get("name"), "OK  " if s.get("ok") else "FAIL",
                                            s.get("count", 0), s.get("error") or ""))
    for b in data["blogs"]:
        mine = [k["k"] for k in data["keywords"] if b["id"] in k["blogs"]][:5]
        print("   %-8s %s" % (b["name"], ", ".join(mine)))

    if args.dry_run:
        print("(--dry-run: 저장하지 않았습니다)")
        return 0

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    os.replace(tmp, args.out)
    print("저장: %s (%.1f KB)" % (args.out, len(text.encode("utf-8")) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
