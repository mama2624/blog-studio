#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""실시간-키워드-제목-발굴-젬 — 정본에서 사본·붙여넣기 파일·해시를 다시 만든다.

  python3 repos/blog-studio/tools/build_keyword_gem.py

· 정본: gems/keyword-gem-original-062624.txt  (mama062624@gmail.com 스킬 지침)
· 사본: gems/keyword-gem-copy-062624.txt      (mama2624@gmail.com 사본 — 첫 줄만 다르다)
· 붙여넣기: work/bs253/keyword-gem-v253-062624.txt / -copy.txt (제미나이 편집기에 붙이는 파일)
· 로그:  gems/keyword-gem-meta.json (글자 수·bytes·sha256 — 테스트가 이 값을 본다)

정본을 고치면 이 스크립트만 돌리면 사본·붙여넣기 파일·해시가 한 번에 맞춰진다.
"""
import hashlib
import json
import os

ROOT = "/workspace"
REPO = os.path.join(ROOT, "repos/blog-studio")
GEMS = os.path.join(REPO, "gems")
ORIG = os.path.join(GEMS, "keyword-gem-original-062624.txt")
COPY = os.path.join(GEMS, "keyword-gem-copy-062624.txt")
META = os.path.join(GEMS, "keyword-gem-meta.json")
PASTE_DIR = os.path.join(ROOT, "work/bs253")
PASTE_ORIG = os.path.join(PASTE_DIR, "keyword-gem-v253-062624.txt")
PASTE_COPY = os.path.join(PASTE_DIR, "keyword-gem-v253-062624-copy.txt")

COPY_HEADER = ("※ 이 Gem은 mama062624@gmail.com의 '실시간 키워드·제목 발굴 젬'을 그대로 복제한 "
               "사본입니다. [원본: mama062624@gmail.com]")


def stat(text):
    return {
        "chars": len(text),
        "bytes": len(text.encode("utf-8")),
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "lines": text.count("\n") + 1,
    }


def main():
    orig_text = open(ORIG, encoding="utf-8").read().rstrip("\n")
    lines = orig_text.split("\n")
    old = lines[0]
    lines[0] = COPY_HEADER
    copy_text = "\n".join(lines)
    open(COPY, "w", encoding="utf-8").write(copy_text + "\n")

    os.makedirs(PASTE_DIR, exist_ok=True)
    open(PASTE_ORIG, "w", encoding="utf-8").write(orig_text)
    open(PASTE_COPY, "w", encoding="utf-8").write(copy_text + "\n")

    meta = {
        "name": "실시간-키워드-제목-발굴-젬",
        "updated": "2026-11-29",
        "note": "2026-11-29 — 경제·복지·취업·청약 글감용 정부 공식 1차 소스 3갈래 추가"
                "(나라일터·잡알리오 / 정책브리핑·보조금24·부처 보도자료 / 청약홈). "
                "v2.5.3 규칙·해시는 그대로 두고 키워드 젬 본문에만 [공식 1차 소스] 절과 검색 실행 순서 한 줄을 더했다.",
        "copyHeader": COPY_HEADER,
        "original": dict(stat(orig_text), file="gems/keyword-gem-original-062624.txt"),
        "copy": dict(stat(copy_text), file="gems/keyword-gem-copy-062624.txt"),
        "paste": {
            "original": os.path.relpath(PASTE_ORIG, ROOT),
            "copy": os.path.relpath(PASTE_COPY, ROOT),
        },
    }
    meta["replacedCopyHeader"] = old
    open(META, "w", encoding="utf-8").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    for k in ("original", "copy"):
        s = meta[k]
        print("%-8s %5d자 %6d bytes %s  %s" % (k, s["chars"], s["bytes"], s["sha256"], s["file"]))
    assert meta["original"]["chars"] != meta["copy"]["chars"]


if __name__ == "__main__":
    main()
