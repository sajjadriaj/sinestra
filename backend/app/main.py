from collections import Counter
from datetime import datetime
from pathlib import Path
import mimetypes, os, re, uuid, zipfile, httpx
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, or_
from sqlalchemy.orm import Session
from .database import Base, engine, get_db
from .models import Book, Chapter, Progress, Highlight, Bookmark, Setting
from .schemas import ProgressIn, HighlightIn, BookmarkIn, AskIn, SettingsIn, NoteIn
from .services.parsers import parse_book

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Sinestra API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
UPLOADS = Path(os.getenv("UPLOAD_DIR", "./data/books")); UPLOADS.mkdir(parents=True, exist_ok=True)
OPENROUTER = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemma-4-31b-it:free"

def setting(db:Session, key:str, default:str="") -> str:
    s = db.get(Setting, key); return s.value if s and s.value else default
def openrouter_key(db:Session) -> str:
    return setting(db, "openrouter_key", os.getenv("OPENROUTER_API_KEY", ""))

def chat(db:Session, system:str, prompt:str, max_tokens:int=600):
    """One place that talks to OpenRouter. Returns (answer, failed)."""
    key=openrouter_key(db)
    if not key: return "", True
    try:
        r=httpx.post(f"{OPENROUTER}/chat/completions",timeout=90,headers={"Authorization":f"Bearer {key}","X-Title":"Sinestra"},
          json={"model":setting(db,"openrouter_model",DEFAULT_MODEL),"max_tokens":max_tokens,"messages":[{"role":"system","content":system},{"role":"user","content":prompt}]})
        r.raise_for_status(); return r.json()["choices"][0]["message"]["content"].strip() or "(empty response)", False
    except httpx.HTTPStatusError as exc:
        try: detail=exc.response.json()["error"]["message"]
        except Exception: detail=exc.response.text[:200]
        return f"OpenRouter returned {exc.response.status_code}: {detail}", True
    except Exception as exc:
        return f"Could not reach OpenRouter: {exc}", True

def serialize(book: Book):
    return {"id":book.id,"title":book.title,"author":book.author,"format":book.format,"created_at":book.created_at,"last_opened_at":book.last_opened_at,
      "cover_url":f"/api/books/{book.id}/asset/{book.cover_url}" if book.cover_url else None,
      "progress": ({"chapter_index":book.progress.chapter_index,"locator":book.progress.locator,"percentage":book.progress.percentage} if book.progress else {"chapter_index":0,"locator":"","percentage":0}),
      "chapters":[{"id":c.id,"title":c.title,"position":c.position,"content":c.content} for c in book.chapters],
      "highlights":[{"id":h.id,"chapter_index":h.chapter_index,"text":h.text,"anchor":h.anchor,"color":h.color,"note":h.note} for h in book.highlights],
      "bookmarks":[{"id":b.id,"chapter_index":b.chapter_index,"locator":b.locator,"label":b.label} for b in book.bookmarks]}

def get_book(book_id:int, db:Session):
    book=db.get(Book,book_id)
    if not book: raise HTTPException(404,"Book not found")
    return book

@app.get("/api/health")
def health(): return {"status":"ok"}
@app.get("/api/books")
def list_books(db:Session=Depends(get_db)): return [serialize(x) for x in db.scalars(select(Book).order_by(Book.created_at.desc())).all()]
@app.get("/api/books/{book_id}")
def read_book(book_id:int, db:Session=Depends(get_db)):
    book=get_book(book_id,db); book.last_opened_at=datetime.utcnow(); db.commit(); return serialize(book)
@app.post("/api/books",status_code=201)
async def upload_book(file:UploadFile=File(...),db:Session=Depends(get_db)):
    data=await file.read()
    stored=f"{uuid.uuid4().hex}{Path(file.filename or '').suffix.lower()}"; path=UPLOADS/stored; path.write_bytes(data)
    try: title,author,chapters,cover=parse_book(file.filename or "book.txt",path)
    except Exception as exc: path.unlink(missing_ok=True); raise HTTPException(422,str(exc))
    book=Book(title=title,author=author,format=Path(stored).suffix[1:].upper(),filename=stored,cover_url=cover)
    book.chapters=[Chapter(title=t,content=c,position=i) for i,(t,c) in enumerate(chapters)]
    book.progress=Progress(); db.add(book); db.commit(); db.refresh(book); return serialize(book)
@app.get("/api/books/{book_id}/asset/{asset:path}")
def book_asset(book_id:int,asset:str,db:Session=Depends(get_db)):
    """Cover art and figures, streamed straight out of the uploaded EPUB."""
    book=get_book(book_id,db)
    try:
        with zipfile.ZipFile(UPLOADS/book.filename) as archive:
            # exact-name lookup against the archive index, so "../" can never escape the zip
            if asset not in archive.namelist(): raise HTTPException(404,"Asset not found")
            data=archive.read(asset)
    except (zipfile.BadZipFile,FileNotFoundError): raise HTTPException(404,"Asset not found")
    return Response(data,media_type=mimetypes.guess_type(asset)[0] or "application/octet-stream",headers={"Cache-Control":"public, max-age=604800"})
@app.delete("/api/books/{book_id}",status_code=204)
def delete_book(book_id:int,db:Session=Depends(get_db)):
    book=get_book(book_id,db); path=UPLOADS/book.filename; db.delete(book); db.commit(); path.unlink(missing_ok=True); return Response(status_code=204)
@app.put("/api/books/{book_id}/progress")
def save_progress(book_id:int,data:ProgressIn,db:Session=Depends(get_db)):
    book=get_book(book_id,db); p=book.progress or Progress(book_id=book_id); p.chapter_index=data.chapter_index;p.locator=data.locator;p.percentage=max(0,min(100,data.percentage));p.updated_at=datetime.utcnow();db.add(p);db.commit();return {"chapter_index":p.chapter_index,"locator":p.locator,"percentage":p.percentage}
@app.post("/api/books/{book_id}/highlights",status_code=201)
def add_highlight(book_id:int,data:HighlightIn,db:Session=Depends(get_db)):
    get_book(book_id,db); h=Highlight(book_id=book_id,**data.model_dump());db.add(h);db.commit();db.refresh(h);return {"id":h.id,**data.model_dump()}
@app.put("/api/highlights/{highlight_id}")
def edit_highlight(highlight_id:int,data:NoteIn,db:Session=Depends(get_db)):
    h=db.get(Highlight,highlight_id)
    if not h: raise HTTPException(404,"Highlight not found")
    if data.note is not None: h.note=data.note
    if data.color: h.color=data.color
    db.commit();return {"id":h.id,"chapter_index":h.chapter_index,"text":h.text,"anchor":h.anchor,"color":h.color,"note":h.note}
@app.delete("/api/highlights/{highlight_id}",status_code=204)
def remove_highlight(highlight_id:int,db:Session=Depends(get_db)):
    h=db.get(Highlight,highlight_id)
    if not h: raise HTTPException(404,"Highlight not found")
    db.delete(h);db.commit();return Response(status_code=204)
@app.get("/api/books/{book_id}/export.md")
def export_markdown(book_id:int,db:Session=Depends(get_db)):
    book=get_book(book_id,db); titles={c.position:c.title for c in book.chapters}
    lines=[f"# {book.title}",f"*{book.author}*",""]
    for chapter_index in sorted({h.chapter_index for h in book.highlights}):
        lines.append(f"## {titles.get(chapter_index,f'Chapter {chapter_index+1}')}\n")
        for h in book.highlights:
            if h.chapter_index!=chapter_index: continue
            lines.append("> "+h.text.replace("\n","\n> "))
            if h.note: lines.append(f"\n{h.note}")
            lines.append("")
    if not book.highlights: lines.append("_No highlights yet._")
    name=re.sub(r"[^\w.-]+","-",book.title).strip("-") or "book"
    return Response("\n".join(lines),media_type="text/markdown; charset=utf-8",headers={"Content-Disposition":f'attachment; filename="{name}.md"'})
@app.post("/api/books/{book_id}/bookmarks",status_code=201)
def add_bookmark(book_id:int,data:BookmarkIn,db:Session=Depends(get_db)):
    get_book(book_id,db); b=Bookmark(book_id=book_id,**data.model_dump());db.add(b);db.commit();db.refresh(b);return {"id":b.id,**data.model_dump()}
@app.get("/api/books/{book_id}/search")
def search_book(book_id:int,q:str,db:Session=Depends(get_db)):
    get_book(book_id,db); chapters=db.scalars(select(Chapter).where(Chapter.book_id==book_id,Chapter.content.ilike(f"%{q}%"))).all();results=[]
    for c in chapters:
        idx=c.content.lower().find(q.lower()); results.append({"chapter_index":c.position,"chapter":c.title,"excerpt":c.content[max(0,idx-80):idx+len(q)+120]})
    return results
@app.get("/api/settings")
def read_settings(db:Session=Depends(get_db)):
    key=openrouter_key(db)
    return {"configured":bool(key),"key_hint":f"…{key[-4:]}" if key else "","from_env":bool(key) and not setting(db,"openrouter_key"),"model":setting(db,"openrouter_model",DEFAULT_MODEL)}
@app.put("/api/settings")
def write_settings(data:SettingsIn,db:Session=Depends(get_db)):
    if data.api_key is not None: db.merge(Setting(key="openrouter_key",value=data.api_key.strip()))
    if data.model: db.merge(Setting(key="openrouter_model",value=data.model))
    db.commit(); return read_settings(db)
@app.get("/api/models")
def free_models():
    # ponytail: live list, so a retired free model never lingers in a hardcoded array
    try: data=httpx.get(f"{OPENROUTER}/models",timeout=15).raise_for_status().json()["data"]
    except Exception: return [{"id":DEFAULT_MODEL,"name":DEFAULT_MODEL}]
    return sorted(({"id":m["id"],"name":m.get("name") or m["id"]} for m in data if m["id"].endswith(":free")),key=lambda m:m["name"])
@app.post("/api/books/{book_id}/ask")
def ask_book(book_id:int,data:AskIn,db:Session=Depends(get_db)):
    get_book(book_id,db); stmt=select(Chapter).where(Chapter.book_id==book_id)
    if data.spoiler_protection: stmt=stmt.where(Chapter.position<=data.chapter_index)
    chapters=db.scalars(stmt.order_by(Chapter.position)).all();terms=set(re.findall(r"[a-z]{4,}",data.question.lower()))
    ranked=sorted(chapters,key=lambda c:sum(c.content.lower().count(t) for t in terms),reverse=True)[:3]
    sources=[{"chapter_index":c.position,"chapter":c.title,"excerpt":c.content[:260]} for c in ranked]
    context=data.selected_text or (sources[0]["excerpt"] if sources else "the text read so far")
    if not openrouter_key(db): return {"answer":f"Based on the book, this passage points to: {context[:300]}","sources":sources,"mock":True}
    prompt=("Excerpts from the book:\n\n"+"\n\n".join(f"[{c.title}]\n{c.content[:2000]}" for c in ranked)
      +f"\n\nSelected passage:\n{data.selected_text or '(none)'}\n\nQuestion: {data.question}")
    system=("You answer questions about a book using only the excerpts supplied. If they do not contain the answer, say so plainly instead of guessing. "
      f"The reader is partway through chapter {data.chapter_index+1} — never mention anything beyond the excerpts. Under 150 words, no preamble.")
    answer,failed=chat(db,system,prompt)
    return {"answer":answer,"sources":sources,**({"error":True} if failed else {})}

# ponytail: a proper noun is a word that is nearly always capitalised — no model needed, and
# because it is built only from chapters already read it cannot spoil anything by construction.
LETTER=r"[^\W\d_]"  # unicode-aware, so Schrödinger is one word and not "Schr"
WORD=re.compile(rf"{LETTER}(?:{LETTER}|[’'-]){{2,}}")
RUN=re.compile(rf"(?:[A-Z](?:{LETTER}|[’'-]){{2,}}\s+){{0,2}}[A-Z](?:{LETTER}|[’'-]){{2,}}")
def _stem(word:str): return re.sub(r"[’']s$","",word.lower())  # Einstein and Einstein's are one person
@app.get("/api/books/{book_id}/dossier")
def dossier(book_id:int,chapter_index:int=0,db:Session=Depends(get_db)):
    get_book(book_id,db)
    chapters=db.scalars(select(Chapter).where(Chapter.book_id==book_id,Chapter.position<=chapter_index).order_by(Chapter.position)).all()
    upper,lower,opener,label=Counter(),Counter(),Counter(),Counter()
    for c in chapters:
        for m in WORD.finditer(c.content):
            word=m.group(); stem=_stem(word)
            if not word[0].isupper(): lower[stem]+=1; continue
            upper[stem]+=1
            near=c.content[max(0,m.start()-4):m.start()].rstrip()
            if not near or near[-1] in '.?!"”': opener[stem]+=1
            if re.match(r"\s+[\dIVX]",c.content[m.end():m.end()+3]): label[stem]+=1  # "Chapter 6", "Figure 3.1"
    # a name is capitalised almost always, is not only a sentence opener ("However"), and is not a
    # cross-reference label — those are always followed by a number
    named=lambda w:(s:=_stem(w)) and upper[s]>=4 and upper[s]>=5*lower[s] and opener[s]<.9*upper[s] and label[s]<.5*upper[s]
    entries={}
    for c in chapters:
        for run in RUN.finditer(c.content):
            words=[re.sub(r"[’']s$","",w) for w in run.group().split() if named(w)]
            if not words: continue
            name=" ".join(words)
            entry=entries.setdefault(name,{"name":name,"count":0,"chapter_index":c.position,"chapter":c.title,"first":""})
            entry["count"]+=1
            if not entry["first"]: entry["first"]="…"+c.content[max(0,run.start()-110):run.end()+190].strip()+"…"
    return sorted((e for e in entries.values() if e["count"]>=3),key=lambda e:-e["count"])[:40]
@app.get("/api/books/{book_id}/recap")
def recap(book_id:int,chapter_index:int=0,refresh:bool=False,db:Session=Depends(get_db)):
    """Where you left off, from the chapters already read. Cached so re-opening a book is free."""
    book=get_book(book_id,db)
    read=[c for c in book.chapters if c.position<chapter_index]
    if not read: return {"recap":"","chapters":0}
    cache=f"recap:{book_id}:{chapter_index}"
    cached=setting(db,cache)
    if cached and not refresh: return {"recap":cached,"chapters":len(read),"cached":True}
    if not openrouter_key(db):  # no key: the last whole sentences of the chapter you finished
        tail=" ".join(re.split(r"(?<=[.!?])\s+",read[-1].content[-460:])[1:]).strip() or read[-1].content[-320:].strip()
        return {"recap":f"You stopped after “{read[-1].title}”. {tail}","chapters":len(read),"mock":True}
    prompt="\n\n".join(f"[{c.title}]\n{c.content[:3000]}" for c in read[-4:])
    system=("Remind a reader what happened in the part of the book they have already read, so they can pick it back up. "
      "Second person, present tense, 3 short sentences, no preamble, no spoilers beyond the excerpts given.")
    answer,failed=chat(db,system,prompt,320)
    if failed: return {"recap":answer,"chapters":len(read),"error":True}
    db.merge(Setting(key=cache,value=answer)); db.commit()
    return {"recap":answer,"chapters":len(read)}
