# -*- coding: utf-8 -*-
import json
import re
import html as html_lib
from urllib.parse import urljoin
from urllib.request import urlopen, Request

URL = "https://wiki.biligame.com/ys/%E6%88%90%E5%B0%B1%E7%B3%BB%E7%BB%9F"
BASE = "https://wiki.biligame.com"
OUT_PATH = "Genshin-Codex-api/script/achievementCategories.json"

def fetch_html(url: str) -> str:
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0"
    })
    with urlopen(req) as resp:
        return resp.read().decode("utf-8", "ignore")

def _pick_img_src(tag: str) -> str:
    if not tag:
        return ""
    # Try common lazy-load attributes first
    for attr in ("data-src", "data-original", "data-lazy-src", "data-lazy", "data-url", "src"):
        m = re.search(rf'{attr}="([^"]+)"', tag)
        if m:
            return m.group(1)
    return ""

def parse_items(html_text: str):
    items = []
    parts = html_text.split('<div class="acBox">')
    for chunk in parts[1:]:
        back_tag = re.search(r'<img[^>]*class="acBack"[^>]*>', chunk)
        icon_tag = re.search(r'<img[^>]*class="acImg"[^>]*>', chunk)
        text = re.search(r'<div class="acText">(.*?)</div>', chunk, re.DOTALL)
        link = re.search(r'<a href="([^"]+)"[^>]*title="([^"]*)"', chunk)

        name = html_lib.unescape(text.group(1).strip()) if text else ""
        href = link.group(1) if link else ""
        title = html_lib.unescape(link.group(2)) if link else ""
        background = _pick_img_src(back_tag.group(0)) if back_tag else ""
        icon = _pick_img_src(icon_tag.group(0)) if icon_tag else ""

        # 跳过无效块
        if not (name or href):
            continue

        items.append({
            "name": name,
            "title": title or name,
            "link": urljoin(BASE, href) if href else "",
            "icon": icon,
            "background": background,
        })
    return items

def main():
    html_text = fetch_html(URL)
    items = parse_items(html_text)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f"items: {len(items)}")
    print(f"output: {OUT_PATH}")

if __name__ == "__main__":
    main()
