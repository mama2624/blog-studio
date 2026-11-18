#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""기존 글 자동 내부링크 수집기 (v1.9.9)

지연님 블로그의 **공개 RSS**만 읽어, 작업실이 '함께 보면 좋은 글' 내부링크로
쓸 최근 발행글 목록(제목·주소·발행일·태그·요약)을 모아 data/internal-links.json
에 남긴다. 로그인·유료 API·피클 스케줄은 쓰지 않는다.

대상 (2026-11-18 실측으로 살아 있는 공개 피드)
  · 생활픽스          mama2624     https://rss.blog.naver.com/mama2624.xml
  · 행복한긍정씨      jiyn74       https://rss.blog.naver.com/jiyn74.xml
  · 긍정예찬          2sunshines   https://rss.blog.naver.com/2sunshines.xml
  · Gold Queen(영문)  goldqueen    https://www.gold-queen.com/feeds/posts/default?alt=rss
  · 부자닷컴(한국어)    subgoldqueen https://sub.gold-queen.com/feeds/posts/default?alt=rss
    (2026-11-18 실측: 피드는 200 으로 응답하지만 아직 발행글이 0편 — "표시할 글이 없습니다".
     수집기는 이걸 실패가 아니라 '빈 피드'로 기록하고, 첫 글이 올라오면 자동으로 목록에 들어간다.)

  ✗ 긍정사랑(000jinjin000 / jinjin2624)은 **일부러 뺀다** — 지연님 지시.
    긍정사랑 원고의 내부링크는 작업실 화면에서 201편 관리대장(js/jinjin-posts.js)
    에서 직접 고르는 기존 방식을 그대로 쓴다. 이 수집기는 긍정사랑 주소를
    한 번도 요청하지 않는다(EXCLUDED 목록으로 못 박아 둔다).

만드는 것 (data/internal-links.json)
  - collectedAt / collectedDate : 수집 시각(KST) · 날짜 — 하루 한 번 가드에 쓴다
  - blogs  : 블로그별 상태(성공/실패·글 수)
  - items  : 글 목록 {blog, title, url, date, tags, summary, keywords}
  - stats  : 블로그별·전체 글 수

쓰기 (워크스페이스 루트에서)
  python3 repos/blog-studio/tools/fetch_internal_links.py             # 저장
  python3 repos/blog-studio/tools/fetch_internal_links.py --dry-run   # 저장 없이 확인
  python3 repos/blog-studio/tools/fetch_internal_links.py --out /tmp/x.json

GitHub Actions 는 새 워크플로 파일을 푸시할 권한이 없어서, 이미 돌고 있는
.github/workflows/realtime-trends.yml 이 매시 실행하는 tools/fetch_realtime_trends.py
가 이 스크립트를 불러 data/realtime-trends.json 의 internalLinks 필드로 함께
커밋한다(그 워크플로는 data/realtime-trends.json 만 git add 한다).
"""

from __future__ import annotations

import argparse
import email.utils
import html as H
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "data", "internal-links.json")
KST = timezone(timedelta(hours=9))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

MAX_PER_BLOG = 40          # RSS 는 50건까지 주지만 작업실 매칭에는 40건이면 충분하다
SUMMARY_CHARS = 160        # 요약은 키워드 매칭용이라 길게 둘 필요가 없다

# ---------------------------------------------------------------------------
# 수집 대상 — 여기 없는 블로그는 절대 요청하지 않는다
# ---------------------------------------------------------------------------
BLOGS = [
    {"id": "mama2624", "name": "생활픽스", "emoji": "🏠", "kind": "naver",
     "home": "https://blog.naver.com/mama2624",
     "feed": "https://rss.blog.naver.com/mama2624.xml"},
    {"id": "jiyn74", "name": "행복한긍정씨", "emoji": "💰", "kind": "naver",
     "home": "https://blog.naver.com/jiyn74",
     "feed": "https://rss.blog.naver.com/jiyn74.xml"},
    {"id": "2sunshines", "name": "긍정예찬", "emoji": "🥗", "kind": "naver",
     "home": "https://blog.naver.com/2sunshines",
     "feed": "https://rss.blog.naver.com/2sunshines.xml"},
    # 구글 블로거 — gold-queen.com 이 blogspot 영문 블로그로 연결돼 있다(2026-11-16 실측)
    {"id": "goldqueen", "name": "Gold Queen (Daily Health & Pain Guide)", "emoji": "🌙",
     "kind": "blogger", "home": "https://www.gold-queen.com/",
     "feed": "https://www.gold-queen.com/feeds/posts/default?alt=rss"},
    # 구글 블로거 — sub.gold-queen.com 은 한국어 블로그 '부자닷컴'(2026-11-18 확인)
    {"id": "subgoldqueen", "name": "부자닷컴 (sub.gold-queen.com)", "emoji": "🪙",
     "kind": "blogger", "home": "https://sub.gold-queen.com/",
     "feed": "https://sub.gold-queen.com/feeds/posts/default?alt=rss"},
]

# 지연님 지시로 제외 — 수집 대상에서도, 작업실 자동 내부링크에서도 뺀다
EXCLUDED = [
    {"id": "jinjin2624", "account": "000jinjin000", "name": "긍정사랑",
     "why": "지연님 지시(2026-11-18) — 긍정사랑은 자동 내부링크에서 제외. 작업실 관리대장에서 직접 고른다."},
]

# 제목·태그에서 뽑은 키워드 중 매칭에 도움이 안 되는 말
STOPWORDS = {
    "방법", "정보", "정리", "확인", "비교", "추천", "이유", "경우", "때문", "이것",
    "저것", "우리", "오늘", "지금", "최신", "완전", "정말", "진짜", "대한", "관련",
    "알아보기", "총정리", "꿀팁", "노하우", "모음", "가이드", "체크", "포인트",
    "이렇게", "어떻게", "무엇", "어디", "얼마", "하나", "가지", "위한", "하는",
}


# ---------------------------------------------------------------------------
# RSS 읽기
# ---------------------------------------------------------------------------
def http_get(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def plain(text: str) -> str:
    """HTML/CDATA 를 걷어 낸 한 줄 텍스트."""
    s = H.unescape(text or "")
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?is)<br\s*/?>", " ", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = H.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_url(url: str) -> str:
    """네이버 RSS 링크의 ?fromRss=true&trackingCode=rss 를 떼어 낸다."""
    u = (url or "").strip()
    u = re.sub(r"[?&](fromRss|trackingCode)=[^&]*", "", u)
    u = u.rstrip("?&")
    return u


def kst_date(pub: str) -> str:
    """'Wed, 18 Nov 2026 15:00:00 +0900' → '2026-11-18' (KST 기준)."""
    try:
        dt = email.utils.parsedate_to_datetime((pub or "").strip())
        if dt is None:
            raise ValueError("no date")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(KST).strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        return ""


def split_tags(it) -> list:
    """네이버 <tag>는 쉼표로 이어진 한 줄, 블로거 <category>는 여러 개."""
    out = []
    for el in it.findall("tag"):
        for t in re.split(r"[,|]", el.text or ""):
            t = t.strip()
            if t:
                out.append(t)
    for el in it.findall("category"):
        t = (el.text or "").strip()
        if t:
            out.append(t)
    seen, keep = set(), []
    for t in out:
        k = t.replace(" ", "").lower()
        if k and k not in seen:
            seen.add(k)
            keep.append(t)
    return keep[:12]


def title_keywords(title: str, tags: list) -> list:
    """매칭에 쓸 키워드 — 태그 + 제목의 두 글자 이상 낱말(흔한 말은 뺀다)."""
    words = []
    for w in re.split(r"[^0-9A-Za-z가-힣]+", title or ""):
        w = w.strip()
        if len(w) >= 2 and w not in STOPWORDS:
            words.append(w)
    out, seen = [], set()
    for w in tags + words:
        k = w.replace(" ", "").lower()
        if k in seen or k in STOPWORDS:
            continue
        seen.add(k)
        out.append(w)
    return out[:16]


def parse_feed(raw: bytes, blog: dict) -> list:
    root = ET.fromstring(raw)
    ch = root.find("channel")
    if ch is None:
        raise ValueError("channel 없음")
    out = []
    for it in ch.findall("item"):
        title = plain(it.findtext("title") or "")
        if not title:
            continue
        guid = clean_url(it.findtext("guid") or "")
        link = clean_url(it.findtext("link") or "")
        # 네이버는 guid 가 곧 글 주소(쿼리 없음), 블로거 guid 는 tag: 형식이라 link 를 쓴다
        url = guid if guid.startswith("http") else link
        if not url.startswith("http"):
            continue
        tags = split_tags(it)
        desc = plain(it.findtext("description") or "")
        out.append({
            "blog": blog["id"],
            "title": title,
            "url": url,
            "date": kst_date(it.findtext("pubDate") or ""),
            "tags": tags,
            "summary": desc[:SUMMARY_CHARS],
            "keywords": title_keywords(title, tags),
        })
    # 같은 주소 중복 제거
    seen, keep = set(), []
    for it in out:
        if it["url"] in seen:
            continue
        seen.add(it["url"])
        keep.append(it)
    return keep[:MAX_PER_BLOG]


def collect() -> tuple[list, list]:
    """블로그별로 피드를 받아 (전체 글, 블로그 상태) 를 돌려준다."""
    items, status = [], []
    for blog in BLOGS:
        row = {"id": blog["id"], "name": blog["name"], "emoji": blog["emoji"],
               "kind": blog["kind"], "feed": blog["feed"], "home": blog["home"],
               "ok": False, "count": 0, "error": "", "note": ""}
        try:
            got = parse_feed(http_get(blog["feed"]), blog)
            # 피드가 200 으로 응답했는데 글이 0편인 경우(새 블로거)는 실패가 아니다 —
            # 첫 글이 올라오면 다음 수집에서 자동으로 들어온다.
            row["ok"] = True
            row["count"] = len(got)
            if not got:
                row["note"] = "발행글 없음(다음 수집에서 자동 반영)"
            items.extend(got)
        except urllib.error.HTTPError as e:
            row["error"] = "HTTP %s" % e.code
        except Exception as e:  # noqa: BLE001
            row["error"] = str(e)[:120]
        status.append(row)
    # 최신 발행일 순(같으면 블로그 순서 유지) — 작업실은 자기 블로그 글만 골라 쓴다
    items.sort(key=lambda x: (x.get("date") or "", x.get("blog") or ""), reverse=True)
    return items, status


# ---------------------------------------------------------------------------
# 저장·가드
# ---------------------------------------------------------------------------
def load_prev(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def build(out_path: str = DEFAULT_OUT) -> dict:
    now = datetime.now(KST)
    items, status = collect()
    ok_any = any(s["ok"] for s in status)
    per_blog = {s["id"]: s["count"] for s in status}
    payload = {
        "version": "v1.9.9",
        "collectedAt": now.strftime("%Y-%m-%d %H:%M"),
        "collectedDate": now.strftime("%Y-%m-%d"),
        "source": "지연님 블로그 공개 RSS 5곳(네이버 3 + 구글 블로거 2) · 로그인 없음",
        "how": ("공개 RSS 의 item 에서 제목·주소·발행일·태그·요약만 뽑는다. 본문은 저장하지 않는다. "
                "긍정사랑(000jinjin000)은 지연님 지시로 수집 대상에서 제외했다."),
        "excluded": EXCLUDED,
        "blogs": status,
        "ok": ok_any and len(items) > 0,
        "stats": {"total": len(items), "blogs": per_blog,
                  "okBlogs": sum(1 for s in status if s["ok"]), "feeds": len(status)},
        "items": items,
    }
    if not payload["ok"]:
        # 오늘 수집이 실패하면 지난 목록을 지우지 않는다 — 작업실은 마지막 성공분으로 계속 돈다.
        prev = load_prev(out_path)
        if prev.get("items"):
            payload["items"] = prev["items"]
            payload["stats"] = prev.get("stats") or payload["stats"]
            payload["blogs"] = prev.get("blogs") or payload["blogs"]
            payload["collectedAt"] = prev.get("collectedAt") or payload["collectedAt"]
            payload["collectedDate"] = prev.get("collectedDate") or payload["collectedDate"]
            payload["stale"] = True
    return payload


def compact(il: dict) -> dict:
    """data/realtime-trends.json 에 함께 실을 만큼만 남긴다."""
    if not il:
        return None
    return {
        "version": il.get("version"),
        "collectedAt": il.get("collectedAt"),
        "collectedDate": il.get("collectedDate"),
        "stale": bool(il.get("stale")),
        "ok": bool(il.get("ok")),
        "stats": il.get("stats"),
        "blogs": [{"id": b.get("id"), "name": b.get("name"), "emoji": b.get("emoji"),
                   "kind": b.get("kind"), "home": b.get("home"),
                   "ok": b.get("ok"), "count": b.get("count"), "note": b.get("note") or ""}
                  for b in (il.get("blogs") or [])],
        "excluded": il.get("excluded") or EXCLUDED,
        "items": [{"blog": i.get("blog"), "title": i.get("title"), "url": i.get("url"),
                   "date": i.get("date"), "tags": i.get("tags") or [],
                   "summary": i.get("summary") or "",
                   "keywords": i.get("keywords") or []} for i in (il.get("items") or [])],
    }


def save(payload: dict, out_path: str) -> None:
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, out_path)


def main() -> int:
    ap = argparse.ArgumentParser(description="기존 글 자동 내부링크 수집 → data/internal-links.json")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 결과만")
    a = ap.parse_args()

    payload = build(a.out)
    print("[internal-links] %s · %d건" % (payload["collectedAt"], payload["stats"]["total"]))
    for b in payload["blogs"]:
        print("  %-22s %s  %3d건 %s" % (b["name"], "OK  " if b["ok"] else "FAIL",
                                        b["count"], b["error"] or b["note"]))
    print("  제외: " + ", ".join("%s(%s)" % (e["name"], e["account"]) for e in EXCLUDED))

    if a.dry_run:
        for it in payload["items"][:8]:
            print("   · [%s] %s — %s" % (it["blog"], it["title"][:48], it["date"]))
        print("(--dry-run: 저장하지 않았습니다)")
        return 0 if payload["ok"] else 1

    save(payload, a.out)
    print("저장: %s (%.1f KB)" % (a.out, os.path.getsize(a.out) / 1024))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
