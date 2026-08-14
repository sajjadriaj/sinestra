import posixpath, re, zipfile
from pathlib import Path
from bs4 import BeautifulSoup

BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "li", "pre", "dd", "dt"]

def _split_text(text: str):
    parts = [p.strip() for p in re.split(r"(?im)(?=^\s*(?:chapter|part)\s+[\wivxlcdm]+\b)", text) if p.strip()]
    out = []
    for i, part in enumerate(parts):
        title, _, rest = part.partition("\n")  # the heading line becomes the title, not the first paragraph
        out.append((title.strip()[:120] or f"Chapter {i+1}", rest.strip() or part))
    return out or [("Text", text)]

def _strip_heading(title: str, paras: list):
    """Drop the printed chapter heading — the reader already shows the title above the text."""
    key = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    while paras and len(paras[0]) < 90 and (
            re.fullmatch(r"(?i)\s*(chapter|part|section|book)\s+[\divxlcm]+\.?\s*", paras[0])
            or (key(paras[0]) and key(paras[0]) in key(title))):
        paras.pop(0)
    return paras

def _text(el):
    """Inline tags carry no implicit space — a drop-cap <span>C</span>alling must read "Calling"."""
    for br in el.find_all("br"): br.replace_with(" ")
    return re.sub(r"\s+", " ", el.get_text("")).strip()

def _doc_title(soup, fallback):
    head = soup.find(["h1", "h2", "h3"])
    if head and head.get_text(strip=True): return _text(head)[:120]
    first = next((t for t in (_text(b) for b in soup.find_all(BLOCKS) if not b.find(BLOCKS)) if t), "")
    if not first: return fallback
    cut = re.split(r"[:;—.,]", first)[0].strip()  # "The Elegant Universe: Superstrings, …" -> "The Elegant Universe"
    if 12 <= len(cut) <= 60: return cut
    return first if len(first) <= 60 else first[:60].rstrip() + "…"

def _toc_entries(toc):
    """Flatten the NCX/nav tree into (href, title) in reading order."""
    out = []
    for item in toc:
        if isinstance(item, (tuple, list)):
            head, kids = item[0], item[1] if len(item) > 1 else []
            if getattr(head, "href", None): out.append((head.href, head.title or ""))
            out += _toc_entries(kids)
        elif getattr(item, "href", None):
            out.append((item.href, item.title or ""))
    return out

def _split_doc(soup, marks, base=""):
    """Walk the document in order, cutting a new section wherever a TOC anchor lands.

    Anchors are usually buried deep (calibre wraps them in <a id> inside one giant div), so
    the whole tree is scanned rather than the top-level children. The leading section carries
    the anchorless TOC title if the file has one, else None — the caller decides what that is.
    """
    ids = {a: t for a, t in marks if a}
    sections = [(next((t for a, t in marks if not a), None), [])]
    seen = set()
    for el in (soup.body or soup).descendants:
        name = getattr(el, "name", None)
        if not name: continue
        if name in ("img", "image"):
            src = el.get("src") or el.get("xlink:href") or el.get("href")
            # the figure itself is content — carry it as a marker the reader turns back into an <img>
            if src: sections[-1][1].append(f"[[img:{posixpath.normpath(posixpath.join(base, src))}|{el.get('alt','')}]]")
        elif name in BLOCKS and not el.find(BLOCKS):
            hit = next((n["id"] for n in [el] + el.find_all(id=True) if n.get("id") in ids and n["id"] not in seen), None)
            if hit: seen.add(hit); sections.append((ids[hit], []))
            text = _text(el)
            if text: sections[-1][1].append(text)
        elif el.get("id") in ids and el["id"] not in seen:
            seen.add(el["id"]); sections.append((ids[el["id"]], []))
    return sections

def _cover(book):
    """The publisher's own cover art, in the three places EPUBs hide it."""
    from ebooklib import ITEM_COVER, ITEM_IMAGE
    for item in book.get_items_of_type(ITEM_COVER): return item.get_name()
    for _, attrs in book.get_metadata("OPF", "cover"):
        item = book.get_item_with_id(attrs.get("content", ""))
        if item is not None: return item.get_name()
    return next((i.get_name() for i in book.get_items_of_type(ITEM_IMAGE) if "cover" in i.get_name().lower()), None)

def _epub_chapters(book):
    from ebooklib import ITEM_DOCUMENT
    toc = {}
    for href, title in _toc_entries(book.toc):
        # ponytail: footnote back-links are titled "1", "2", … — letterless titles are never chapters
        if not re.search(r"[^\W\d_]", title): continue
        name, _, anchor = href.partition("#")
        toc.setdefault(Path(name).name, []).append((anchor, title.strip()))
    chapters, pending = [], None
    for entry in book.spine:  # spine is reading order; the manifest is not
        item = book.get_item_with_id(entry[0] if isinstance(entry, (tuple, list)) else entry)
        if item is None or item.get_type() != ITEM_DOCUMENT: continue
        stem = Path(item.get_name()).stem
        soup = BeautifulSoup(item.get_content(), "html.parser")
        marks = toc.get(Path(item.get_name()).name, [])
        sections = _split_doc(soup, marks, posixpath.dirname(item.get_name()))
        if sum(len(p) for _, paras in sections for p in paras) * 2 < len(soup.get_text(strip=True)):
            sections = [(sections[0][0], [soup.get_text("\n", strip=True)])]  # markup we can't read as blocks
        for i, (title, paras) in enumerate(sections):
            from_toc = title is not None
            if title is None:
                # a chapter whose anchor is the last thing in the previous file starts here
                if i == 0 and pending: title, pending = pending, None
                # otherwise a split file starting mid-chapter: its lead-in belongs to the previous one
                elif i == 0 and chapters and any(a for a, _ in marks):
                    chapters[-1] = (chapters[-1][0], "\n\n".join([chapters[-1][1], *paras])); continue
                else: title = _doc_title(soup, stem)
            text = "\n\n".join(_strip_heading(title, paras))
            # skips title pages and stray markup — but a plate page is all figure and almost no text
            if len(text) > 80 or "[[img:" in text: chapters.append((title, text))
            elif from_toc: pending = title  # only a real TOC anchor may name the next file's opening
    return chapters

def parse_book(filename: str, path: Path):
    """`path` is the stored upload — ebooklib only reads EPUBs from a real file path, never bytes.

    Returns (title, author, [(chapter title, text)], cover) where cover names an entry inside the
    uploaded file, served back later by /api/books/{id}/asset/{name}.
    """
    suffix = Path(filename).suffix.lower()
    title = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    author = "Unknown author"
    if suffix in {".txt", ".md"}:
        return title, author, _split_text(path.read_bytes().decode("utf-8", errors="replace")), None
    if suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        meta = reader.metadata or {}
        title = meta.get("/Title") or title
        author = meta.get("/Author") or author
        return title, author, [(f"Page {i+1}", page.extract_text() or "") for i, page in enumerate(reader.pages)], None
    if suffix == ".epub":
        try:
            from ebooklib import epub
            book = epub.read_epub(str(path))
            title = (book.get_metadata("DC", "title") or [(title, {})])[0][0]
            author = (book.get_metadata("DC", "creator") or [(author, {})])[0][0]
            return title, author, _epub_chapters(book) or [("Book", "")], _cover(book)
        except Exception:
            with zipfile.ZipFile(path) as archive:
                docs = [n for n in archive.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
                chapters = [(Path(n).stem, BeautifulSoup(archive.read(n), "html.parser").get_text("\n", strip=True)) for n in docs]
                return title, author, [(a, b) for a, b in chapters if b], None
    raise ValueError("Supported formats: EPUB, PDF, TXT, and Markdown")
