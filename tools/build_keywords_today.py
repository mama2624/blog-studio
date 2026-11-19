#!/usr/bin/env python3
"""오늘자 80선 리포트(Markdown) → data/keywords-today.json 변환기.

매일 06시 정기 작업이 만드는
`지연님_4대블로그_오늘자_기준제시형_키워드제목80선_MMDD.md` 를 읽어
블로그 4대 × 각 20개(총 80개) 키워드·추천 제목·유입 포인트·제목 3선을
작업실이 바로 읽는 JSON으로 만든다.

사용:
    python3 tools/build_keywords_today.py ../../downloads/지연님_..._1117.md
    python3 tools/build_keywords_today.py <md> --out data/keywords-today.json

규칙
- `# [PART n] 블로그명 (계정)` 으로 블로그를 가른다.
- `## 번호. 제목` 이 한 항목. 번호는 1~80 그대로 쓴다.
- 키워드 조합의 첫 번째 [ ] 를 메인 키워드로 삼아 주제 입력칸 기본값으로 쓴다.
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# PART 제목의 계정 → 블로그 id
ACCOUNT_TO_ID = {
    "mama2624": "mama2624",
    "2sunshines": "2sunshines",
    "jiyn74": "jiyn74",
    "jinjin2624": "jinjin2624",
}
BLOG_ORDER = ["mama2624", "jiyn74", "2sunshines", "jinjin2624"]

# 이지웍스랩 빈집털이 점검에서 '경쟁 적음/1순위'로 배정된 항목 (회차마다 갱신)
VACANT = {
    ("jiyn74", 51): "이지웍스랩 11-19 · 월 5,790 / 오늘 5건 · 1순위",
    ("jiyn74", 53): "이지웍스랩 11-19 · 당월 167,910 / 오늘 0 · 빈집",
    ("mama2624", 15): "이지웍스랩 11-19 · 당월 181,725 / 오늘 0 · 빈집",
    ("2sunshines", 34): "이지웍스랩 11-19 · 당월 94,029 / 오늘 0 · 빈집",
}


def clean(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def parse_part(line):
    m = re.search(r"\[PART\s*\d+\]\s*(.+?)\s*\(([A-Za-z0-9_]+)\)", line)
    if m:
        return ACCOUNT_TO_ID.get(m.group(2))
    return None


def parse_items(text):
    blogs = {b: [] for b in BLOG_ORDER}
    current_blog = None
    blocks = []
    cur = None
    for raw in text.replace("\r", "").split("\n"):
        line = raw.rstrip()
        if line.startswith("# [PART"):
            current_blog = parse_part(line)
            cur = None
            continue
        m = re.match(r"^##\s*(\d{1,2})\.\s*(.+?)\s*$", line)
        if m and current_blog:
            cur = {
                "blog": current_blog,
                "no": int(m.group(1)),
                "title": clean(m.group(2)),
                "lines": [],
            }
            blocks.append(cur)
            continue
        if cur is not None:
            cur["lines"].append(line)

    for b in blocks:
        blog, no = b["blog"], b["no"]
        body = "\n".join(b["lines"])
        kw_line = re.search(r"\*\*키워드 조합\*\*\s*:\s*(.+)", body)
        keywords = []
        if kw_line:
            for part in re.split(r"\s*\+\s*", kw_line.group(1)):
                k = clean(part.strip().strip("[]"))
                if k:
                    keywords.append(k)
        point_m = re.search(r"\*\*유입 포인트\*\*\s*:\s*(.+)", body)
        point = clean(point_m.group(1)) if point_m else ""
        internal_m = re.search(r"\*\*내부링크 추천\*\*\s*:\s*(.+)", body)
        internal = clean(internal_m.group(1)) if internal_m else ""
        title_block = re.search(r"\*\*제목 3선\*\*\s*\n([\s\S]+?)(?:\n-\s*\*\*|\n\n|$)", body)
        titles = []
        if title_block:
            for line in title_block.group(1).split("\n"):
                t = re.match(r"^\s*\d+[).]\s*(.+?)\s*$", line)
                if t:
                    titles.append(clean(t.group(1)))
        title = b["title"]
        main, _, sub = title.partition(": ")
        vacant = VACANT.get((blog, no), "")
        item = {
            "no": no,
            "keyword": keywords[0] if keywords else main,
            "title": title,
            "sub": clean(sub) if sub else "",
            "keywords": keywords,
            "titles": titles,
            "point": point,
            "tag": "빈집/06시80선" if vacant else "06시80선",
        }
        if vacant:
            item["vacant"] = vacant
        if internal:
            item["internal"] = internal
        blogs[blog].append(item)

    for b in blogs.values():
        b.sort(key=lambda x: x["no"])
    return blogs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("md", help="오늘자 80선 마크다운 경로")
    ap.add_argument("--out", default="data/keywords-today.json")
    ap.add_argument("--date", default="", help="YYYY-MM-DD (기본: 파일 이름의 MMDD)")
    ap.add_argument("--updated", default="", help="업데이트 시각 표기")
    args = ap.parse_args()

    md_path = Path(args.md)
    text = md_path.read_text(encoding="utf-8")
    blogs = parse_items(text)

    total = sum(len(v) for v in blogs.values())
    counts = {k: len(v) for k, v in blogs.items()}
    if total != 80 or any(c != 20 for c in counts.values()):
        print(f"[경고] 블로그별 20개가 아닙니다: {counts} (합계 {total})", file=sys.stderr)

    # 날짜: 파일 이름 끝의 MMDD 또는 첫 줄의 '기준일'
    date = args.date
    if not date:
        m = re.search(r"(\d{2})(\d{2})\.md$", md_path.name)
        m2 = re.search(r"기준일\s*:\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", text)
        if m2:
            date = f"{m2.group(1)}-{int(m2.group(2)):02d}-{int(m2.group(3)):02d}"
        elif m:
            date = f"{datetime.now().year}-{m.group(1)}-{m.group(2)}"

    data = {
        "date": date,
        "updatedAt": args.updated or datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": "매일 06시 80선 · 이지웍스랩·나에오",
        "perBlog": 20,
        "total": total,
        "blogs": blogs,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"저장: {out} · {date} · 합계 {total}")
    for b in BLOG_ORDER:
        first = blogs[b][0] if blogs[b] else {}
        print(f"  {b}: {len(blogs[b])}개 · 1번 [{first.get('keyword','')}] {first.get('title','')[:40]}")
        missing = [i["no"] for i in blogs[b] if not i["titles"] or not i["keyword"]]
        if missing:
            print(f"    [경고] 비어 있는 항목: {missing}", file=sys.stderr)


if __name__ == "__main__":
    main()
