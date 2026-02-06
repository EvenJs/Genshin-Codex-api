#!/usr/bin/env python3
import json
import sys
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, quote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

URL = "https://wiki.biligame.com/ys/%E5%9C%A3%E9%81%97%E7%89%A9%E5%9B%BE%E9%89%B4"

SCRIPT_DIR = Path(__file__).parent
DEFAULT_OUT_FILE = SCRIPT_DIR / "../prisma/seed-data/artifact-sets.json"
DEFAULT_EXISTING = SCRIPT_DIR / "../prisma/seed-data/artifact-sets.json"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _load_existing_id_map(path: Path):
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    mapping = {}
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            id_value = item.get("id")
            if name and id_value:
                mapping[name] = id_value
    return mapping


def _slugify_fallback(name: str):
    # ASCII-only fallback when pypinyin is unavailable.
    return quote(name, safe="").replace("%", "_").lower()


def _slugify(name: str):
    try:
        from pypinyin import lazy_pinyin  # type: ignore

        parts = [p for p in lazy_pinyin(name) if p]
        return "_".join(parts).lower()
    except Exception:
        return _slugify_fallback(name)


def _clean_text(text: str):
    text = re.sub(r"\s+", " ", text or "")
    return text.strip()


def _get_html(url: str):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(req, timeout=20) as resp:
            return resp.read().decode("utf-8")
    except HTTPError as e:
        print(f"HTTP error: {e.code}", file=sys.stderr)
    except URLError as e:
        print(f"Network error: {e.reason}", file=sys.stderr)
    return None


class _RowParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self._in_row = False
        self._row = None
        self._td_index = -1
        self._in_td = False
        self._capture_text = False
        self._capture_text_align_left = False
        self._current_text = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "tr":
            classes = attrs_dict.get("class", "")
            has_params = "data-param1" in attrs_dict or "data-param2" in attrs_dict
            if "divsort" in classes.split() or has_params:
                # Some rows may omit explicit </tr> tags; close any open row.
                if self._in_row and self._row:
                    if self._in_td:
                        text = _clean_text("".join(self._current_text))
                        self._row["tds"][self._td_index]["text"] = text
                        if self._capture_text_align_left and text:
                            self._row["left_cells"].append(text)
                    self.rows.append(self._row)
                self._in_row = True
                self._row = {
                    "attrs": attrs_dict,
                    "tds": [],
                    "left_cells": [],
                }
                self._td_index = -1
        if not self._in_row:
            return
        if tag == "td":
            self._td_index += 1
            self._in_td = True
            self._current_text = []
            style = attrs_dict.get("style", "")
            self._capture_text_align_left = "text-align:left" in style.replace(" ", "")
            self._row["tds"].append({"attrs": attrs_dict, "text": "", "links": []})
        if tag == "a" and self._in_td:
            title = attrs_dict.get("title")
            href = attrs_dict.get("href")
            if title:
                self._row["tds"][self._td_index]["links"].append(
                    {"title": title, "href": href}
                )
        if tag == "img" and self._in_td:
            src = attrs_dict.get("src")
            if src:
                self._row["tds"][self._td_index]["img"] = src
        if self._in_td and self._capture_text_align_left:
            self._capture_text = True

    def handle_endtag(self, tag):
        if tag == "td" and self._in_td:
            text = _clean_text("".join(self._current_text))
            self._row["tds"][self._td_index]["text"] = text
            if self._capture_text_align_left and text:
                self._row["left_cells"].append(text)
            self._in_td = False
            self._capture_text = False
            self._capture_text_align_left = False
            self._current_text = []
        if tag == "tr" and self._in_row:
            self.rows.append(self._row)
            self._in_row = False
            self._row = None
            self._td_index = -1
            self._in_td = False
            self._capture_text = False
            self._capture_text_align_left = False
            self._current_text = []

    def handle_data(self, data):
        if self._in_td and self._capture_text:
            self._current_text.append(data)


def _parse_rows(html: str):
    parser = _RowParser()
    parser.feed(html)
    if parser._in_row and parser._row:
        if parser._in_td:
            text = _clean_text("".join(parser._current_text))
            parser._row["tds"][parser._td_index]["text"] = text
            if parser._capture_text_align_left and text:
                parser._row["left_cells"].append(text)
        parser.rows.append(parser._row)
    return parser.rows


def _parse_rarity(row):
    rarities = []
    for key in ("data-param1", "data-param2"):
        value = row["attrs"].get(key)
        if value:
            try:
                rarities.append(int(value))
            except ValueError:
                pass
    if not rarities:
        for td in row["tds"]:
            classes = td["attrs"].get("class", "")
            if "hidden-xs" in classes.split():
                text = td.get("text", "")
                for part in text.split("/"):
                    try:
                        rarities.append(int(part))
                    except ValueError:
                        pass
                break
    return sorted(set(rarities))


def _parse_tags(row):
    raw = row["attrs"].get("data-param3") or ""
    tags = [t.strip() for t in raw.split(",") if t.strip()]
    return tags


def _parse_name(row):
    # Prefer hidden-xs title in the name column.
    for td in row["tds"]:
        classes = td["attrs"].get("class", "")
        if "hidden-xs" in classes.split():
            links = td.get("links", [])
            if links:
                return links[0].get("title")
    for td in row["tds"]:
        links = td.get("links", [])
        if links:
            return links[0].get("title")
    return None


def _parse_img_url(row):
    for td in row["tds"]:
        if "img" in td:
            return td.get("img")
    return None


def _parse_bonuses(row):
    bonuses = []
    for text in row.get("left_cells", []):
        if text:
            bonuses.append(_clean_text(text))
    two_piece = bonuses[0] if len(bonuses) > 0 else None
    four_piece = bonuses[1] if len(bonuses) > 1 else None
    return two_piece, four_piece


def main():
    url = URL
    out_file = DEFAULT_OUT_FILE
    existing_file = DEFAULT_EXISTING

    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--url" and i + 1 < len(args):
            url = args[i + 1]
        if arg == "--out" and i + 1 < len(args):
            out_file = Path(args[i + 1])
        if arg == "--existing" and i + 1 < len(args):
            existing_file = Path(args[i + 1])

    html = _get_html(url)
    if not html:
        return 1

    rows = _parse_rows(html)
    if not rows:
        print("No artifact rows found.", file=sys.stderr)
        return 1

    name_to_id = _load_existing_id_map(existing_file)
    result = []

    for row in rows:
        name = _parse_name(row)
        if not name:
            continue
        rarity = _parse_rarity(row)
        two_piece, four_piece = _parse_bonuses(row)
        img_url = _parse_img_url(row)
        tags = _parse_tags(row)

        artifact_id = name_to_id.get(name)
        if not artifact_id:
            artifact_id = _slugify(name)

        result.append(
            {
                "id": artifact_id,
                "imgUrl": img_url,
                "name": name,
                "rarity": rarity,
                "twoPieceBonus": two_piece,
                "fourPieceBonus": four_piece,
                "tags": tags,
                "sourceUrl": f"https://wiki.biligame.com/ys/{quote(name, safe='')}",
            }
        )

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(result)} items to {out_file}")
    if any(item["id"] not in name_to_id.values() for item in result):
        print(
            "Note: Some ids were generated automatically. "
            "Consider adding them to artifact-sets.json for stable ids.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
