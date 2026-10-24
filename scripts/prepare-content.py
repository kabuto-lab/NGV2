"""Turn the locally archived Next Genium pages into safe, compact Astro data."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "content" / "pages.json"
TARGET = Path(__file__).resolve().parents[1] / "src" / "data" / "pages.json"
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def local_asset(src: str) -> str | None:
    if not src or src.startswith("data:"):
        return None
    if src.startswith("http"):
        path = urlparse(src).path
        if path.startswith("/wp-content/"):
            return "__SITE_ASSETS__" + path.removeprefix("/wp-content/")
        return None
    marker = "assets/"
    if marker in src:
        return "__SITE_ASSETS__" + src.split(marker, 1)[1]
    return None


def external_links(soup: BeautifulSoup) -> list[dict[str, str]]:
    found = []
    seen = set()
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        label = clean(anchor.get_text(" ", strip=True))
        if not label or not (href.startswith("https://") or href.startswith("mailto:")):
            continue
        if href.startswith("https://next-genium.com/"):
            continue
        if href in seen:
            continue
        found.append({"label": label, "href": href})
        seen.add(href)
    return found


def extract_blocks(soup: BeautifulSoup, include_leaf_div: bool = False) -> list[dict[str, str]]:
    blocks = []
    last = None
    tags = list(HEADINGS) + ["p", "li", "img"] + (["div"] if include_leaf_div else [])
    for element in soup.find_all(tags):
        if element.name == "div" and element.find(["div", "p", "li", "img"] + list(HEADINGS)):
            continue
        if element.name == "li" and element.find(list(HEADINGS) + ["p"]):
            continue  # Accordion entries: capture their headings and paragraphs instead.
        if element.name in HEADINGS | {"p"} and element.find_parent(["p"]):
            continue
        if element.name == "li" and element.find_parent(["li"]):
            continue
        if element.name == "img":
            src = local_asset(element.get("src", ""))
            if not src:
                continue
            block = {"type": "image", "src": src, "alt": clean(element.get("alt", ""))}
        else:
            value = clean(element.get_text(" ", strip=True))
            if not value:
                continue
            if "Форма на исходном сайте / Form on original site" in value:
                continue
            kind = "heading" if element.name in HEADINGS else "item" if element.name == "li" else "paragraph"
            block = {"type": kind, "text": value}
        # The source contains duplicated headings in tab labels and their panels.
        signature = (block["type"], block.get("text", block.get("src")))
        if signature == last:
            continue
        last = signature
        blocks.append(block)
    return blocks


def main() -> None:
    pages = json.loads(SOURCE.read_text(encoding="utf-8"))
    manifest = []
    for page in pages:
        path = page["path"].removesuffix("index.html").strip("/")
        if path in {"en", "ru"}:
            continue
        locale, _, subpath = path.partition("/")
        if locale not in {"en", "ru"} or not subpath:
            continue
        route = ("ru/" if locale == "ru" else "") + subpath
        section = subpath.split("/", 1)[0]
        soup = BeautifulSoup(page["html"], "html.parser")
        blocks = extract_blocks(soup, section == "policy")
        first_image = next((b["src"] for b in blocks if b["type"] == "image"), None)
        manifest.append({
            "route": route,
            "locale": locale,
            "section": section,
            "slug": subpath.split("/")[-1],
            "depth": subpath.count("/") + 1 + (locale == "ru"),
            "title": clean(page.get("heading") or page.get("title") or subpath),
            "description": clean(page.get("description") or ""),
            "hero": first_image,
            "blocks": blocks,
            "links": external_links(soup),
        })
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Prepared {len(manifest)} inner pages -> {TARGET} ({TARGET.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
