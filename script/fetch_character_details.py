#!/usr/bin/env python3
import json
import sys
import time
import html
import re
import random
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

BASE_URL = (
    "https://act-api-takumi-static.mihoyo.com/hoyowiki/genshin/wapi/entry_page"
    "?app_sn=ys_obc&entry_page_id={entry_page_id}&lang=zh-cn"
)

SCRIPT_DIR = Path(__file__).parent
IN_FILE = SCRIPT_DIR / "characters.json"
OUT_FILE = SCRIPT_DIR.parent / "prisma" / "seed-data" / "characters.json"
BASE_SEED_FILE = SCRIPT_DIR.parent / "prisma" / "seed-data" / "characters.base.json"

ELEMENT_MAP = {
    "火": "PYRO",
    "水": "HYDRO",
    "风": "ANEMO",
    "雷": "ELECTRO",
    "草": "DENDRO",
    "冰": "CRYO",
    "岩": "GEO",
}

WEAPON_MAP = {
    "单手剑": "SWORD",
    "双手剑": "CLAYMORE",
    "长柄武器": "POLEARM",
    "弓": "BOW",
    "弓箭": "BOW",
    "法器": "CATALYST",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _find_items_with_kv(obj, path, out):
    if isinstance(obj, list):
        for item in obj:
            _find_items_with_kv(item, path, out)
        return
    if not isinstance(obj, dict):
        return

    # Capture key-value styled lists
    if {"name", "value"}.issubset(obj.keys()):
        name = obj.get("name")
        value = obj.get("value")
        if isinstance(name, str) and value is not None:
            out.append((path, name, _to_text(value)))

    for k, v in obj.items():
        _find_items_with_kv(v, path + [str(k)], out)


def _collect_named_sections(obj, path, out):
    if isinstance(obj, list):
        # list of dicts with name/title + desc/content
        if obj and all(isinstance(x, dict) for x in obj):
            for item in obj:
                name = item.get("name") or item.get("title")
                desc = item.get("desc") or item.get("description") or item.get("text") or item.get("content")
                if isinstance(name, str) and desc is not None:
                    out.append((path, name, _to_text(desc)))
        for item in obj:
            _collect_named_sections(item, path, out)
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            _collect_named_sections(v, path + [str(k)], out)


def _to_text(value):
    if isinstance(value, list):
        parts = [_to_text(v) for v in value]
        return "\n".join([p for p in parts if p])
    if isinstance(value, dict):
        # common text fields
        for key in ("text", "content", "desc", "description", "value"):
            if key in value and isinstance(value[key], str):
                return value[key]
        # fallback to JSON string for unexpected structure
        return json.dumps(value, ensure_ascii=False)
    if value is None:
        return ""
    return str(value)


def _find_first_string(obj, keys):
    if isinstance(obj, dict):
        for k in keys:
            if k in obj and isinstance(obj[k], str):
                return obj[k]
        for v in obj.values():
            found = _find_first_string(v, keys)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_first_string(item, keys)
            if found:
                return found
    return ""


def _parse_fe_ext_filters(data):
    page = data.get("data", {}).get("page", {})
    ext = page.get("ext", {})
    fe_ext = ext.get("fe_ext")
    obj = fe_ext
    if isinstance(obj, str):
        s = obj
        for _ in range(2):
            try:
                obj = json.loads(s)
                break
            except json.JSONDecodeError:
                s = s.replace('\\"', '"').replace("\\\\", "\\")
        if isinstance(obj, str):
            try:
                obj = json.loads(html.unescape(obj))
            except json.JSONDecodeError:
                pass
    if not isinstance(obj, dict):
        return {}

    texts = []

    def walk(o):
        if isinstance(o, dict):
            filt = o.get("filter")
            if isinstance(filt, dict) and "text" in filt:
                texts.append(filt.get("text"))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(obj)

    filters = {}
    for t in texts:
        arr = None
        if isinstance(t, list):
            arr = t
        elif isinstance(t, str):
            try:
                arr = json.loads(t)
            except json.JSONDecodeError:
                try:
                    arr = json.loads(html.unescape(t))
                except json.JSONDecodeError:
                    arr = None
        if not arr:
            continue
        for item in arr:
            if not isinstance(item, str) or "/" not in item:
                continue
            key, value = item.split("/", 1)
            if key and value and key not in filters:
                filters[key] = value
    return filters


def _strip_html(text):
    if not text:
        return ""
    s = html.unescape(text)
    s = html.unescape(s)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</p\s*>", "\n", s, flags=re.I)
    for _ in range(2):
        s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("\\u00a0", " ").replace("\u00a0", " ")
    s = re.sub(r"\[?\s*详情\s*\]?", "", s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def _safe_json_loads(value):
    if not isinstance(value, str):
        return value
    s = value
    for _ in range(2):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            s = s.replace('\\"', '"').replace("\\\\", "\\")
    try:
        return json.loads(html.unescape(s))
    except json.JSONDecodeError:
        return value


def _collect_base_info_from_modules(modules):
    pairs = []

    def walk(o):
        if isinstance(o, dict):
            attr = o.get("attr")
            if isinstance(attr, list):
                for item in attr:
                    if not isinstance(item, dict):
                        continue
                    key = item.get("key")
                    value = item.get("value")
                    if isinstance(key, str) and value is not None:
                        pairs.append((key, _to_text(value)))
            if "name" in o and "value" in o and isinstance(o["name"], str):
                pairs.append((o["name"], _to_text(o["value"])))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for module in modules or []:
        comps = module.get("components") if isinstance(module, dict) else None
        if not isinstance(comps, list):
            continue
        for comp in comps:
            if not isinstance(comp, dict):
                continue
            data = comp.get("data")
            parsed = _safe_json_loads(data)
            if isinstance(parsed, (dict, list)):
                walk(parsed)
    return pairs


def _collect_tables_from_modules(modules, module_name):
    tables = []
    for module in modules or []:
        if not isinstance(module, dict):
            continue
        name = module.get("name", "")
        if name != module_name:
            continue
        comps = module.get("components")
        if not isinstance(comps, list):
            continue
        for comp in comps:
            if not isinstance(comp, dict):
                continue
            parsed = _safe_json_loads(comp.get("data"))
            if isinstance(parsed, dict) and "tables" in parsed:
                tables.extend(parsed.get("tables") or [])
    return tables


def _collect_role_talent(modules):
    items = []
    for module in modules or []:
        if not isinstance(module, dict):
            continue
        if module.get("name") != "天赋":
            continue
        comps = module.get("components")
        if not isinstance(comps, list):
            continue
        for comp in comps:
            if not isinstance(comp, dict):
                continue
            if comp.get("component_id") != "role_talent":
                continue
            parsed = _safe_json_loads(comp.get("data"))
            if not isinstance(parsed, dict):
                continue
            for item in parsed.get("list") or []:
                if not isinstance(item, dict):
                    continue
                tab_name = item.get("tab_name") or ""
                desc = _strip_html(item.get("desc") or "")
                attr = item.get("attr") or {}
                rows = []
                if isinstance(attr, dict):
                    for row in attr.get("row") or []:
                        if not row:
                            continue
                        rows.append(_strip_html(row[0]))
                detail = "\n".join([desc] + rows).strip()
                if tab_name:
                    items.append((tab_name, detail))
    return items


def _collect_nodule_sections(nodules):
    sections = []

    def walk(o):
        if isinstance(o, dict):
            name = o.get("title") or o.get("name")
            desc = o.get("content") or o.get("text") or o.get("desc") or o.get("description")
            if isinstance(name, str) and desc is not None:
                sections.append((name, _to_text(desc)))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(nodules)
    return sections


def _extract_fields(data):
    kv_list = []
    _find_items_with_kv(data, [], kv_list)

    # Build label map
    label_map = {}
    for path, name, value in kv_list:
        if not name or not value:
            continue
        label_map[name] = value

    # Additional labeled info from "title"/"desc" pairs
    named_sections = []
    _collect_named_sections(data, [], named_sections)
    page = data.get("data", {}).get("page", {})
    nodules = page.get("nodules")
    if nodules:
        named_sections.extend(_collect_nodule_sections(nodules))
    modules = page.get("modules") or []
    for name, value in _collect_base_info_from_modules(modules):
        if name and value:
            label_map.setdefault(name, value)

    def pick_label(candidates):
        for c in candidates:
            if c in label_map:
                return label_map[c]
        # Try from named_sections if label appears as name
        for _, name, value in named_sections:
            if name in candidates and value:
                return value
        return ""

    region = pick_label(["地区", "所属地区", "国籍"])
    affiliation = pick_label(["所属", "所属势力", "所属机构", "所属城邦", "所属国家"])
    vision_affiliation = pick_label(["神之眼所属", "神之眼", "元素之眼", "神之眼类型"])
    element = pick_label(["元素", "元素属性"])
    position = pick_label(["定位", "定位/称号", "称号"])
    weapon = pick_label(["武器", "武器类型", "武器类别"])

    fe_filters = _parse_fe_ext_filters(data)
    if not region:
        region = fe_filters.get("地区", "")
    if not affiliation:
        affiliation = fe_filters.get("所属", "")
    if not vision_affiliation:
        vision_affiliation = fe_filters.get("神之眼所属", "")
    if not element:
        element = fe_filters.get("元素", "")
    if not weapon:
        weapon = fe_filters.get("武器", "")

    talents = {}
    constellations = {}
    for path, name, value in named_sections:
        path_str = "/".join(path).lower()
        if "talent" in path_str or "天赋" in path_str or "skill" in path_str:
            talents[name] = value
        elif "constellation" in path_str or "命之座" in path_str:
            constellations[name] = value

    # Parse module tables for 天赋/命之座 (HTML content)
    for table in _collect_tables_from_modules(modules, "天赋"):
        rows = table.get("row") or []
        for row in rows:
            if not row:
                continue
            title = _strip_html(row[0])
            body = _strip_html(row[1]) if len(row) > 1 else ""
            if title:
                talents[title] = body
    for title, detail in _collect_role_talent(modules):
        if title and detail:
            talents.setdefault(title, detail)
    for table in _collect_tables_from_modules(modules, "命之座"):
        rows = table.get("row") or []
        for row in rows:
            if not row:
                continue
            title = _strip_html(row[0])
            body = _strip_html(row[1]) if len(row) > 1 else ""
            if title:
                constellations[title] = body

    page_name = page.get("name")
    return {
        "name": page_name or _find_first_string(data, ["name", "title"]),
        "地区": region,
        "所属": affiliation,
        "神之眼所属": vision_affiliation,
        "元素": element,
        "定位": position,
        "武器类型": weapon,
        "天赋": talents,
        "命之座": constellations,
    }


def fetch_detail(character_id):
    url = BASE_URL.format(entry_page_id=character_id)
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def fetch_detail_with_retry(character_id, retries=3, backoff=0.8):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            return fetch_detail(character_id)
        except HTTPError as e:
            last_err = e
            retryable = e.code == 429 or 500 <= e.code <= 599
            if not retryable:
                raise
        except (URLError, json.JSONDecodeError) as e:
            last_err = e
        if attempt < retries:
            time.sleep(backoff * attempt)
    raise last_err


def main():
    rarity_by_name = {}
    id_by_name = {}
    if BASE_SEED_FILE.exists():
        try:
            base_data = json.loads(BASE_SEED_FILE.read_text(encoding="utf-8"))
            if isinstance(base_data, list):
                for item in base_data:
                    name = item.get("name")
                    rarity = item.get("rarity")
                    if isinstance(name, str) and isinstance(rarity, int):
                        rarity_by_name[name] = rarity
                    if isinstance(name, str) and item.get("id"):
                        id_by_name[name] = item.get("id")
        except json.JSONDecodeError:
            pass

    try:
        with open(IN_FILE, "r", encoding="utf-8") as f:
            characters = json.load(f)
    except FileNotFoundError:
        print(f"Missing {IN_FILE}", file=sys.stderr)
        return 1

    avatar_by_id = {}
    rarity_by_id = {}
    name_by_id = {}
    for item in characters:
        cid = item.get("character_id")
        if cid is None:
            continue
        avatar_by_id[str(cid)] = item.get("character_avatar")
        rarity_by_id[str(cid)] = item.get("rarity")
        name_by_id[str(cid)] = item.get("character_name")

    results = []
    failed_ids = []
    for idx, item in enumerate(characters, 1):
        character_id = item.get("character_id")
        if not character_id:
            continue
        try:
            data = fetch_detail_with_retry(character_id)
            fields = _extract_fields(data)
            name = fields.get("name") or name_by_id.get(str(character_id))
            if not name:
                raise ValueError(f"Missing name for {character_id}")

            element = ELEMENT_MAP.get(fields.get("元素"))
            weapon = WEAPON_MAP.get(fields.get("武器类型"))
            rarity = rarity_by_id.get(str(character_id)) or rarity_by_name.get(name)

            seed_item = {
                "id": id_by_name.get(name) or str(character_id),
                "name": name,
                "element": element,
                "weaponType": weapon,
                "rarity": int(rarity) if rarity is not None else None,
                "region": fields.get("地区"),
                "affiliation": fields.get("所属"),
                "visionAffiliation": fields.get("神之眼所属"),
                "role": fields.get("定位"),
                "talents": fields.get("天赋"),
                "constellations": fields.get("命之座"),
                "imageUrl": avatar_by_id.get(str(character_id)),
            }

            results.append(seed_item)
            print(f"[{idx}/{len(characters)}] OK {character_id}")
        except (HTTPError, URLError, ValueError) as e:
            print(f"[{idx}/{len(characters)}] FAIL {character_id}: {e}", file=sys.stderr)
            failed_ids.append(character_id)
        except json.JSONDecodeError as e:
            print(f"[{idx}/{len(characters)}] FAIL {character_id}: invalid JSON {e}", file=sys.stderr)
            failed_ids.append(character_id)

        time.sleep(0.3 + random.random() * 0.4)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(results)} items to {OUT_FILE}")
    if failed_ids:
        print(f"Failed IDs ({len(failed_ids)}): {failed_ids}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
