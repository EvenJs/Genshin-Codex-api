# -*- coding: utf-8 -*-
import json
import re
import time
import html as html_lib
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen, Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError

SCRIPT_DIR = Path(__file__).parent
CATEGORIES_PATH = SCRIPT_DIR.parent / "prisma" / "seed-data" / "achievementCategories.json"
OUT_PATH = SCRIPT_DIR.parent / "prisma" / "seed-data" / "achievements.json"
BASE_URL = "https://wiki.biligame.com/ys/"

OPENER = build_opener(HTTPCookieProcessor())
JINA_PREFIX = "https://r.jina.ai/http://"

def fetch_html(url: str, retries: int = 4, delay: float = 1.0) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://wiki.biligame.com/ys/",
        "Connection": "keep-alive",
    }
    last_err = None
    for attempt in range(retries):
        try:
            req = Request(url, headers=headers)
            with OPENER.open(req, timeout=20) as resp:
                return resp.read().decode("utf-8", "ignore")
        except HTTPError as err:
            last_err = err
            # Some pages return 567 via anti-bot; fall back to Jina AI proxy.
            if err.code == 567:
                try:
                    proxy_url = JINA_PREFIX + url.replace("https://", "").replace("http://", "")
                    with OPENER.open(proxy_url, timeout=20) as resp:
                        return resp.read().decode("utf-8", "ignore")
                except Exception as proxy_err:
                    last_err = proxy_err
            time.sleep(delay * (2 ** attempt))
        except Exception as err:
            last_err = err
            time.sleep(delay * (2 ** attempt))
    raise last_err

def strip_tags(html: str) -> str:
    html = html.replace("<br />", "\n").replace("<br/>", "\n").replace("<br>", "\n")
    text = re.sub(r"<[^>]+>", "", html)
    text = html_lib.unescape(text)
    # Normalize non-breaking spaces and collapse runs of spaces
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()

def normalize_description(text: str, html_unescaped: str) -> str:
    # Prefer extracting from HTML up to the first <br>
    html_match = re.search(r"成就说明[:：](.*?)(<br\s*/?>|</p>)", html_unescaped, re.DOTALL | re.IGNORECASE)
    if html_match:
        return strip_tags(html_match.group(1)).strip()
    match = re.search(r"成就说明[:：]\s*(.*)", text, re.DOTALL)
    if not match:
        return text.strip()
    desc = match.group(1).strip()
    for marker in ("成就奖励", "实装版本"):
        if marker in desc:
            desc = desc.split(marker, 1)[0].strip()
    desc = desc.splitlines()[0].strip()
    return desc

def parse_achievement_block(title: str, block: str):
    """Parse a single achievement block and return the achievement dict."""
    p_match = re.search(r"<p>(.*?)</p>", block, re.DOTALL | re.IGNORECASE)
    p_html = p_match.group(1) if p_match else ""
    if not p_html:
        return None
    p_html_unescaped = html_lib.unescape(p_html).replace("\xa0", " ").replace("&nbsp;", " ")
    p_text = strip_tags(p_html)

    # Skip if no achievement description
    if "成就说明" not in p_text and "成就奖励" not in p_text:
        return None

    # Normalize multiplication symbol variants
    p_text_norm = (
        p_text.replace("×", "x")
        .replace("✕", "x")
        .replace("✖", "x")
        .replace("＊", "x")
        .replace("＊", "x")
    )
    p_text_norm = re.sub(r"[\r\n]+", " ", p_text_norm)

    desc_raw = p_text

    reward_amount = None
    reward_match = re.search(r"[xX]\s*(\d+)", p_text_norm)
    if reward_match:
        reward_amount = int(reward_match.group(1))

    version = ""
    version_match = re.search(r"实装版本[:：]\s*([0-9.]+)", p_text_norm)
    if version_match:
        version = version_match.group(1)
    else:
        version_match = re.search(r"实装版本[:：]\s*([0-9.]+)", p_html_unescaped)
        if version_match:
            version = version_match.group(1)

    hint = ""
    hint_match = re.search(r'<div class="tishi"[^>]*>(.*?)</div>', block, re.DOTALL | re.IGNORECASE)
    if hint_match:
        hint = strip_tags(hint_match.group(1))

    return {
        "name": title,
        "description": normalize_description(desc_raw, p_html_unescaped),
        "rewardPrimogems": reward_amount,
        "version": version or "1.0",
        "guide": hint,
    }

def parse_achievements(html_text: str):
    results = []

    # Method 1: Match bwiki-collection blocks
    bwiki_pattern = re.compile(
        r'<div class="bwiki-collection"[^>]*data-collectionlist="achievement"[^>]*data-collection="([^"]+)"[^>]*>',
        re.IGNORECASE,
    )
    bwiki_matches = list(bwiki_pattern.finditer(html_text))

    if bwiki_matches:
        for i, m in enumerate(bwiki_matches):
            title = html_lib.unescape(m.group(1)).strip()
            next_start = bwiki_matches[i + 1].start() if i + 1 < len(bwiki_matches) else len(html_text)
            block = html_text[m.end():next_start]
            achievement = parse_achievement_block(title, block)
            if achievement:
                results.append(achievement)
        return results

    # Method 2: Match h3 headlines (mw-headline)
    h3_pattern = re.compile(
        r'<h3[^>]*>.*?<span[^>]*class="mw-headline"[^>]*id="([^"]+)"[^>]*>([^<]*)</span>.*?</h3>',
        re.IGNORECASE | re.DOTALL,
    )
    h3_matches = list(h3_pattern.finditer(html_text))

    for i, m in enumerate(h3_matches):
        title = html_lib.unescape(m.group(2)).strip()
        # Skip section headers like "普通成就", "隐藏成就" etc
        if title in ("普通成就", "隐藏成就", "邀约成就", "秘境成就", "主线成就", "相关链接"):
            continue
        next_start = h3_matches[i + 1].start() if i + 1 < len(h3_matches) else len(html_text)
        block = html_text[m.end():next_start]
        achievement = parse_achievement_block(title, block)
        if achievement:
            results.append(achievement)

    return results

def build_url(name: str) -> str:
    # The wiki accepts unescaped Chinese in most cases, but we encode to be safe.
    return BASE_URL + quote(name, safe="")

def main():
    with open(CATEGORIES_PATH, "r", encoding="utf-8") as f:
        categories = json.load(f)

    all_items = []
    failed = []
    total = len(categories)
    for idx, cat in enumerate(categories):
        name = cat.get("name") or cat.get("title")
        if not name:
            continue
        page_title = cat.get("title") or name
        url = build_url(page_title)
        print(f"[{idx + 1}/{total}] Fetching: {page_title}")
        try:
            html_text = fetch_html(url)
            items = parse_achievements(html_text)
            for item in items:
                item["category"] = name
                item["source"] = url
            all_items.extend(items)
            print(f"  -> Found {len(items)} achievements")
        except Exception as e:
            print(f"  -> Failed: {e}")
            failed.append(name)
        # Be polite to avoid triggering anti-bot
        time.sleep(0.4 if idx % 5 else 0.8)

    # Add id to each item
    for i, item in enumerate(all_items, start=1):
        item["id"] = f"ach-{i:04d}"

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_items, f, ensure_ascii=False, indent=2)

    print(f"\ncategories: {total}")
    print(f"success: {total - len(failed)}")
    print(f"failed: {len(failed)}")
    if failed:
        print(f"failed categories: {failed}")
    print(f"items: {len(all_items)}")
    print(f"output: {OUT_PATH}")

if __name__ == "__main__":
    main()
