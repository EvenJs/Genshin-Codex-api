#!/usr/bin/env python3
import json
import sys
import time
import html
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

URL = "https://act-api-takumi-static.mihoyo.com/common/blackboard/ys_obc/v1/home/content/list?app_sn=ys_obc&channel_id=25"

SCRIPT_DIR = Path(__file__).parent
OUT_FILE = SCRIPT_DIR / "characters.json"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _find_items(obj):
    # Find the first list of dicts that contain required keys.
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            sample = obj[0]
            if {"content_id", "title", "icon"}.issubset(sample.keys()):
                return obj
        for item in obj:
            found = _find_items(item)
            if found is not None:
                return found
    elif isinstance(obj, dict):
        for _, value in obj.items():
            found = _find_items(value)
            if found is not None:
                return found
    return None


def _collect_filter_texts(obj, out):
    if isinstance(obj, dict):
        filt = obj.get("filter")
        if isinstance(filt, dict) and "text" in filt:
            out.append(filt.get("text"))
        for v in obj.values():
            _collect_filter_texts(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _collect_filter_texts(v, out)


def _collect_strings(obj, out):
    if isinstance(obj, dict):
        for v in obj.values():
            _collect_strings(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _collect_strings(v, out)
    elif isinstance(obj, str):
        out.append(obj)


def _extract_rarity(item):
    texts = []
    _collect_filter_texts(item, texts)
    # Also scan any string fields for embedded filter JSON
    _collect_strings(item, texts)

    for t in texts:
        arr = None
        if isinstance(t, list):
            arr = t
        elif isinstance(t, str):
            s = html.unescape(t)
            if "星级/四星" in s:
                return 4
            if "星级/五星" in s:
                return 5
            try:
                arr = json.loads(s)
            except json.JSONDecodeError:
                try:
                    arr = json.loads(s.replace('\\"', '"').replace("\\\\", "\\"))
                except json.JSONDecodeError:
                    arr = None
        if not arr:
            continue
        for entry in arr:
            if not isinstance(entry, str):
                continue
            if entry.startswith("星级/"):
                value = entry.split("/", 1)[1]
                if value == "五星":
                    return 5
                if value == "四星":
                    return 4
    return None


def main():
    req = Request(URL, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
    except HTTPError as e:
        print(f"HTTP error: {e.code}", file=sys.stderr)
        return 1
    except URLError as e:
        print(f"Network error: {e.reason}", file=sys.stderr)
        return 1

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        return 1

    items = _find_items(data)
    if items is None:
        print("Could not locate character list in response.", file=sys.stderr)
        return 1

    result = []
    for item in items:
        result.append(
            {
                "character_id": item.get("content_id"),
                "character_avatar": item.get("icon"),
                "character_name": item.get("title"),
                "rarity": _extract_rarity(item),
            }
        )

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(result)} items to {OUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
