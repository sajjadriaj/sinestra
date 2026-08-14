import{useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode}from'react';
import{ArrowLeft,BookOpen,Bookmark,ChevronLeft,ChevronRight,Copy,Download,Highlighter,Library,Menu,MessageCircle,Moon,PanelLeftClose,Play,Search,Settings2,Sparkles,Sun,Trash2,Upload,Users,X}from'lucide-react';
import{api,type Book,type Entry,type Highlight,type Settings}from'./lib/api';

type Theme='light'|'dark'|'night';
const prefs:{theme?:Theme;size?:number;line?:number}=(()=>{try{return JSON.parse(localStorage.getItem('sinestra:prefs')||'{}')}catch{return{}}})();
export default function App(){
 const[books,setBooks]=useState<Book[]>([]),[active,setActive]=useState<Book|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[undo,setUndo]=useState<{book:Book;timer:number}|null>(null);
 useEffect(()=>{api.books().then(setBooks).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 const upload=async(f:File)=>{setError('');try{const b=await api.upload(f);setBooks(v=>[b,...v]);setActive(b)}catch(e){setError(e instanceof Error?e.message:'Upload failed')}};
 // ponytail: delete stays local for 8s, so Undo is a state revert instead of a re-upload
 const remove=(book:Book)=>{setBooks(v=>v.filter(b=>b.id!==book.id));setUndo({book,timer:window.setTimeout(()=>{setUndo(null);api.remove(book.id).catch(e=>{setError(e instanceof Error?e.message:'Delete failed');setBooks(v=>[book,...v])})},8000)})};
 const restore=()=>{if(!undo)return;clearTimeout(undo.timer);setBooks(v=>[undo.book,...v]);setUndo(null)};
 if(active)return <Reader initial={active} onBack={()=>{setActive(null);api.books().then(setBooks)}}/>;
 return <>
  <LibraryView books={books} loading={loading} error={error} onOpen={setActive} onUpload={upload} onRemove={remove}/>
  {undo&&<div className="undo-toast" role="status"><span>Removed “{undo.book.title}”</span><button onClick={restore}>Undo</button></div>}
 </>;
}

function LibraryView({books,loading,error,onOpen,onUpload,onRemove}:{books:Book[];loading:boolean;error:string;onOpen:(b:Book)=>void;onUpload:(f:File)=>void;onRemove:(b:Book)=>void}){
 const input=useRef<HTMLInputElement>(null),[query,setQuery]=useState(''),[grid,setGrid]=useState(true),[sort,setSort]=useState('recent');
 const shown=books.filter(b=>(b.title+' '+b.author).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?a.author.localeCompare(b.author):new Date(b.last_opened_at||b.created_at).getTime()-new Date(a.last_opened_at||a.created_at).getTime());
 return <main className="library-shell" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)onUpload(f)}}>
  <header className="library-header"><a className="wordmark"><BookOpen/> Sinestra</a>{books.length>0&&<button className="primary small" onClick={()=>input.current?.click()}><Upload/> Add book</button>}</header>
  <input ref={input} hidden type="file" accept=".epub,.pdf,.txt,.md" onChange={e=>e.target.files?.[0]&&onUpload(e.target.files[0])}/>
  {error&&<div className="error" role="alert">{error}</div>}
  {!loading&&books.length===0?<section className="empty"><div className="empty-mark"><Library/></div><p className="eyebrow">Your library</p><h1>Add a book and start reading.</h1><p>Build a quiet home for the books that matter to you.</p><button className="primary" onClick={()=>input.current?.click()}><Upload/> Upload book</button><small>EPUB · PDF · TXT · Markdown</small><span>or drop a file anywhere</span></section>:
  <section className="library"><div className="library-title"><div><p className="eyebrow">Your library</p><h1>Books worth returning to.</h1></div><div className="library-actions"><label className="search"><Search/><input aria-label="Search library" placeholder="Search your library" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Sort books" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently read</option><option value="title">Title</option><option value="author">Author</option></select><button className="icon" aria-label="Toggle view" onClick={()=>setGrid(!grid)}><Menu/></button></div></div>
   <div className={grid?'book-grid':'book-list'}>{shown.map((b)=><article className="book-card" key={b.id}><button className="cover" aria-label={`Open ${b.title}`} onClick={()=>onOpen(b)} style={{'--hue':`${(b.id*47)%360}`} as CSSProperties}>{b.cover_url?<img src={b.cover_url} alt="" loading="lazy"/>:<><span className="cover-rule"/><strong>{b.title}</strong><em>{b.author}</em></>}</button><div className="book-meta"><div><h2>{b.title}</h2><p>{b.author}</p></div><button className="icon more" aria-label={`Remove ${b.title}`} title="Remove from library" onClick={()=>onRemove(b)}><Trash2/></button></div><div className="card-progress"><i style={{width:`${b.progress.percentage}%`}}/><span>{Math.round(b.progress.percentage)}% read</span></div></article>)}</div>
  </section>}
 </main>
}

type Mark={h:Highlight;frag:string;tail:boolean};
// A selection can span paragraphs, so each highlight is matched fragment by fragment against the
// paragraph it landed in — that is what makes a highlight survive a reload, a resize, and a retype.
function paint(text:string,marks:Mark[],open:(h:Highlight,e:React.MouseEvent)=>void):ReactNode{
 if(!marks.length)return text;
 const out:ReactNode[]=[];let at=0;
 for(;;){
  let best=-1,hit:Mark|undefined;
  for(const m of marks){const i=text.indexOf(m.frag,at);if(i>=0&&(best<0||i<best)){best=i;hit=m}}
  if(!hit)break;
  if(best>at)out.push(text.slice(at,best));
  out.push(<mark key={`${hit.h.id}-${best}`} className={hit.h.color} tabIndex={0} role="button" title={hit.h.note||'Highlight'} onClick={e=>open(hit!.h,e)}>{hit.frag}{hit.tail&&hit.h.note&&<sup className="note-dot">✳</sup>}</mark>);
  at=best+hit.frag.length;
 }
 return out.length?[...out,text.slice(at)]:text;
}

function Reader({initial,onBack}:{initial:Book;onBack:()=>void}){
 const isMobile=()=>typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 900px)').matches;
 const[book,setBook]=useState(initial),[chapter,setChapter]=useState(initial.progress.chapter_index||0),[toc,setToc]=useState(()=>!isMobile()),[ai,setAi]=useState(false),[settings,setSettings]=useState(false),[theme,setTheme]=useState<Theme>(prefs.theme||'light'),[size,setSize]=useState(prefs.size||(isMobile()?17:19)),[line,setLine]=useState(prefs.line||1.7),[sel,setSel]=useState<{text:string;x:number;y:number;below:boolean;arrow:number}|null>(null),[tab,setTab]=useState<'contents'|'highlights'|'people'>('contents'),[search,setSearch]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<{chapter_index:number;chapter:string;excerpt:string}[]>([]),[page,setPage]=useState(0),[pages,setPages]=useState(1),[toast,setToast]=useState(''),[note,setNote]=useState<{h:Highlight;x:number;y:number}|null>(null),[people,setPeople]=useState<Entry[]>([]),[open,setOpen]=useState(''),[seed,setSeed]=useState(''),[recap,setRecap]=useState('');
 const art=useRef<HTMLElement>(null),head=useRef<HTMLParagraphElement>(null),tail=useRef<HTMLSpanElement>(null),backwards=useRef(false),down=useRef({x:0,y:0,touch:false}),wheelAt=useRef(0);
 // resume lands where you stopped in the chapter you stopped in — as a fraction, since a phone
 // and a laptop cut the same chapter into different numbers of pages
 const saved=/page:(\d+)(?:\/of:(\d+))?/.exec(initial.progress.locator||'');
 const start=useRef(initial.progress.chapter_index||0),resume=useRef({page:+(saved?.[1]||0),of:+(saved?.[2]||0)});
 const current=book.chapters[chapter]||book.chapters[0],percentage=book.chapters.length?((chapter+(page+1)/pages)/book.chapters.length)*100:0;
 useEffect(()=>{document.documentElement.dataset.theme=theme;return()=>{delete document.documentElement.dataset.theme}},[theme]);
 useEffect(()=>{localStorage.setItem('sinestra:prefs',JSON.stringify({theme,size,line}))},[theme,size,line]);
 useEffect(()=>{const t=setTimeout(()=>api.progress(book.id,{chapter_index:chapter,locator:`chapter:${chapter}/page:${page}/of:${pages}`,percentage}),600);return()=>clearTimeout(t)},[book.id,chapter,page,percentage]);
 useEffect(()=>{setPage(0);if(chapter!==start.current)resume.current={page:0,of:0}},[chapter]);
 // welcome back — only worth showing when there is something behind you to forget
 useEffect(()=>{if(start.current>0)api.recap(initial.id,start.current).then(r=>setRecap(r.recap)).catch(()=>{})},[initial.id]);
 useEffect(()=>{if(tab==='people')api.dossier(book.id,chapter).then(setPeople).catch(()=>setPeople([]))},[tab,book.id,chapter]);
 // ponytail: one column the exact width of the viewport, so the overflow columns ARE the pages
 useEffect(()=>{const el=art.current;if(!el)return;
  const measure=()=>{el.style.columnWidth=`${el.clientWidth}px`;const pitch=el.clientWidth;if(!pitch)return;
   const n=Math.max(1,Math.round(((tail.current?.offsetLeft||0)-(head.current?.offsetLeft||0))/pitch)+1),last=backwards.current;backwards.current=false;
   // resume survives every re-measure until the reader turns a page — StrictMode re-runs this effect
   const r=chapter===start.current?resume.current:{page:0,of:0};
   const want=r.of>1?Math.min(n-1,Math.round(r.page/r.of*n)):Math.min(r.page,n-1);
   setPages(n);setPage(p=>want?want:last?n-1:Math.min(p,n-1))};
  measure();document.fonts?.ready.then(measure);
  const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()},[current?.id,size,line,chapter]);
 const go=(delta:number)=>{resume.current={page:0,of:0};setRecap('');const next=page+delta;
  if(next<0){if(chapter>0){backwards.current=true;setChapter(chapter-1)}return}
  if(next>=pages){if(chapter<book.chapters.length-1)setChapter(chapter+1);return}
  setPage(next)};
 const goRef=useRef(go);goRef.current=go;
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement).matches('input,textarea'))return;
  if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();goRef.current(1)}
  if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();goRef.current(-1)}
  if(e.key.toLowerCase()==='a')setAi(v=>!v);if(e.key.toLowerCase()==='t')setSettings(v=>!v);if(e.key==='Escape'){setAi(false);setSettings(false);setSearch(false)}};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[]);
 // swipe and edge-tap are touch-only; on a mouse they would fight text selection
 const grab=(e:React.PointerEvent)=>{setRecap('');down.current={x:e.clientX,y:e.clientY,touch:e.pointerType!=='mouse'}};
 const release=(e:React.PointerEvent)=>{const{x,y,touch}=down.current,dx=e.clientX-x,dy=e.clientY-y;
  if(!touch||!window.getSelection()?.isCollapsed)return;
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))return go(dx<0?1:-1);
  if(Math.abs(dx)<9&&Math.abs(dy)<9){const w=e.currentTarget.clientWidth;if(e.clientX<w*.3)go(-1);else if(e.clientX>w*.7)go(1)}};
 const wheel=(e:React.WheelEvent)=>{const now=Date.now();if(now-wheelAt.current<380)return;const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(Math.abs(d)<10)return;wheelAt.current=now;go(d>0?1:-1)};
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),1900);return()=>clearTimeout(t)},[toast]);
 const mark=()=>api.bookmark(book.id,{chapter_index:chapter,locator:`page:${page}`,label:`${current?.title||'Bookmark'} · p.${page+1}`}).then(()=>setToast('Bookmarked'),()=>setToast('Could not bookmark'));
 const marks=useMemo(()=>book.highlights.filter(h=>h.chapter_index===chapter).flatMap(h=>{
  const parts=h.text.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>2);
  return parts.map((frag,i)=>({h,frag,tail:i===parts.length-1}))}),[book.highlights,chapter]);
 // ponytail: memoised so a page turn re-renders the transform, not several thousand paragraphs
 const body=useMemo(()=>{const text=current?.content||'',split=text.split(/\n{2,}/).filter(p=>p.trim());
  return (split.length>1?split:text.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter(Boolean)).map((p,i)=>{
   const fig=/^\[\[img:([^|\]]+)\|?([^\]]*)\]\]$/.exec(p.trim());
   return fig?<figure key={i}><img src={`/api/books/${book.id}/asset/${fig[1]}`} alt={fig[2]}/>{fig[2]&&<figcaption>{fig[2]}</figcaption>}</figure>
    :<p key={i}>{paint(p,marks,(h,e)=>setNote({h,x:e.clientX,y:e.clientY}))}</p>})},[current?.content,marks,book.id]);
 const selected=sel?.text||'';
 // ponytail: rect-anchored floating menu; re-reads the live range on every event, so scroll just re-anchors it
 const select=()=>{const s=window.getSelection(),text=s?.toString().trim()||'';if(!text||!s?.rangeCount)return setSel(null);const r=s.getRangeAt(0).getBoundingClientRect();if(!r.width||r.bottom<72||r.top>innerHeight-40)return setSel(null);const below=r.top<108,cx=r.left+r.width/2,x=Math.min(Math.max(cx,110),innerWidth-110);setSel({text,x,y:below?r.bottom:r.top,below,arrow:cx-x})};
 useEffect(()=>{const events=['mouseup','touchend','keyup'],up=(e:Event)=>{if((e.target as HTMLElement).closest?.('.selection-menu'))return;setTimeout(select)},move=()=>select();events.forEach(t=>addEventListener(t,up));addEventListener('scroll',move,true);return()=>{events.forEach(t=>removeEventListener(t,up));removeEventListener('scroll',move,true)}},[]);
 const keep=async(color:string,text:string)=>{const h=await api.highlight(book.id,{chapter_index:chapter,text,anchor:`quote:${text.slice(0,80)}`,color,note:''});
  setBook(b=>({...b,highlights:[...b.highlights,h]}));setSel(null);window.getSelection()?.removeAllRanges();return h};
 const addHighlight=(color='yellow')=>{if(selected)keep(color,selected).catch(()=>setToast('Could not highlight'))};
 // ask-in-margin: the answer is stored as the note on the highlight, so it survives the session
 const explain=async()=>{const text=selected;if(!text)return;setToast('Reading the passage…');
  try{const h=await keep('note',text),r=await api.ask(book.id,{question:'Explain this passage in two short sentences.',selected_text:text,chapter_index:chapter,spoiler_protection:true});
   const saved=await api.note(h.id,{note:r.answer});setBook(b=>({...b,highlights:b.highlights.map(x=>x.id===h.id?saved:x)}));setToast('Note added')}
  catch{setToast('Could not add note')}};
 const drop=(h:Highlight)=>{setNote(null);setBook(b=>({...b,highlights:b.highlights.filter(x=>x.id!==h.id)}));api.unhighlight(h.id).catch(()=>setToast('Could not remove'))};
 const doSearch=async()=>{if(query.trim())setResults(await api.search(book.id,query))};
 const speak=()=>{speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(current?.content||'');utter.rate=1;speechSynthesis.speak(utter)};
 return <div className="reader-app">
  <header className="reader-toolbar"><div><button className="icon" aria-label="Back to library" onClick={onBack}><ArrowLeft/></button><button className="icon" aria-label="Toggle contents" onClick={()=>setToc(!toc)}>{toc?<PanelLeftClose/>:<Menu/>}</button></div><div className="reader-title"><strong>{book.title}</strong><span>{current?.title}</span></div><div><button className="icon" aria-label="Search book" onClick={()=>setSearch(!search)}><Search/></button><button className="icon" aria-label="Read aloud" onClick={speak}><Play/></button><button className="icon" aria-label="Bookmark page" onClick={mark}><Bookmark/></button><button className="icon" aria-label="Ask AI" onClick={()=>setAi(!ai)}><MessageCircle/></button><button className="icon" aria-label="Reader appearance" onClick={()=>setSettings(!settings)}><Settings2/></button></div></header>
  <div className="reader-body">
   {toc&&<><button className="panel-scrim" aria-label="Close contents" onClick={()=>setToc(false)}/><aside className="toc-panel"><div className="mobile-sheet-handle"/><div className="toc-book"><span>{book.format}</span><h2>{book.title}</h2><p>{book.author}</p></div><div className="tabs"><button className={tab==='contents'?'active':''} onClick={()=>setTab('contents')}>Contents</button><button className={tab==='highlights'?'active':''} onClick={()=>setTab('highlights')}>Notes</button><button className={tab==='people'?'active':''} onClick={()=>setTab('people')}>Who’s who</button></div>
   {tab==='contents'&&<nav>{book.chapters.map(c=><button className={c.position===chapter?'active':''} key={c.id} onClick={()=>{setChapter(c.position);if(isMobile())setToc(false)}}><span>{String(c.position+1).padStart(2,'0')}</span>{c.title}</button>)}</nav>}
   {tab==='highlights'&&<div className="highlights-list">{book.highlights.length?<><a className="export" href={`/api/books/${book.id}/export.md`} download><Download/> Export as Markdown</a>{book.highlights.map(h=><div className="row" key={h.id}><button onClick={()=>{setChapter(h.chapter_index);if(isMobile())setToc(false)}}><mark className={h.color}>{h.text}</mark>{h.note&&<small>{h.note}</small>}</button><button className="icon" aria-label="Remove highlight" onClick={()=>drop(h)}><Trash2/></button></div>)}</>:<p>Highlights and AI notes gather here, ready to export.</p>}</div>}
   {tab==='people'&&<div className="dossier">{people.length?people.map(e=><div key={e.name}><button onClick={()=>setOpen(open===e.name?'':e.name)}><b>{e.name}</b><span>{e.count}×</span></button>{open===e.name&&<div className="dossier-body"><p>{e.first}</p><button className="linkish" onClick={()=>{setChapter(e.chapter_index);if(isMobile())setToc(false)}}>First seen in {e.chapter}</button><button className="linkish" onClick={()=>{setSeed(`Who or what is ${e.name}?`);setAi(true);if(isMobile())setToc(false)}}>Ask AI</button></div>}</div>):<p>Names and terms build up here as you read — nothing from further ahead than your current chapter.</p>}</div>}<div className="toc-progress"><span>{Math.round(percentage)}%</span><i><b style={{width:`${percentage}%`}}/></i></div></aside></>}
   <main className="reading-stage" onPointerDown={grab} onPointerUp={release} onWheel={wheel}>
    <div className="page-view"><article ref={art} style={{fontSize:size,lineHeight:line,'--page':page} as CSSProperties}><p className="chapter-kicker" ref={head}>{String(chapter+1).padStart(2,'0')} / {String(book.chapters.length).padStart(2,'0')}</p><h1>{current?.title}</h1>{body}<span className="page-end" ref={tail} aria-hidden="true"/></article></div>
    <footer className="page-bar"><button className="icon" aria-label="Previous page" disabled={chapter===0&&page===0} onClick={()=>go(-1)}><ChevronLeft/></button><span className="page-where">{current?.title}</span><span className="page-count">{page+1} / {pages}</span><button className="icon" aria-label="Next page" disabled={chapter>=book.chapters.length-1&&page>=pages-1} onClick={()=>go(1)}><ChevronRight/></button></footer>
   </main>
   {ai&&<><button className="panel-scrim ai-scrim" aria-label="Close AI panel" onClick={()=>{setAi(false);setSeed('')}}/><AI book={book} chapter={chapter} selected={selected} seed={seed} close={()=>{setAi(false);setSeed('')}} navigate={setChapter}/></>}
   {recap&&<div className="recap-card" role="status"><strong><Sparkles/> Where you left off</strong><p>{recap}</p><button className="primary small" onClick={()=>setRecap('')}>Continue reading</button></div>}
  </div>
  {sel&&<div className={`selection-menu${sel.below?' below':''}`} role="toolbar" aria-label="Selection actions" style={{left:sel.x,top:sel.y,'--arrow':`${sel.arrow}px`} as CSSProperties} onMouseDown={e=>e.preventDefault()}><button onClick={()=>addHighlight()}><Highlighter/> Highlight</button><button onClick={explain}><Sparkles/> Explain</button><button onClick={()=>setAi(true)}><MessageCircle/> Ask AI</button><button onClick={()=>navigator.clipboard?.writeText(sel.text)}><Copy/> Copy</button></div>}
  {note&&<><button className="note-scrim" aria-label="Close note" onClick={()=>setNote(null)}/><div className="note-pop" style={{left:Math.min(Math.max(note.x,148),innerWidth-148),top:Math.min(note.y+16,innerHeight-190)}}><p>{note.h.note||'Highlighted — no note yet.'}</p><div><button className="linkish" onClick={()=>{setSeed(`About this passage: “${note.h.text.slice(0,240)}”`);setAi(true);setNote(null)}}>Ask more</button><button className="linkish" onClick={()=>drop(note.h)}>Remove</button></div></div></>}
  {settings&&<div className="settings-pop"><div className="popover-head"><strong>Settings</strong><button className="icon" onClick={()=>setSettings(false)}><X/></button></div><label>Theme</label><div className="theme-row"><button onClick={()=>setTheme('light')} className={theme==='light'?'active':''}><Sun/>Light</button><button onClick={()=>setTheme('dark')} className={theme==='dark'?'active':''}><Moon/>Dark</button><button onClick={()=>setTheme('night')} className={theme==='night'?'active':''}><Moon/>Night</button></div><label htmlFor="size">Text size</label><input id="size" type="range" min="15" max="28" value={size} onChange={e=>setSize(+e.target.value)}/><label htmlFor="line">Line spacing</label><input id="line" type="range" min="1.4" max="2.2" step=".1" value={line} onChange={e=>setLine(+e.target.value)}/><hr/><AiSettings/></div>}
  {search&&<div className="search-panel"><div><input autoFocus placeholder="Search inside this book" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()}/><button className="icon" onClick={()=>setSearch(false)}><X/></button></div>{results.map((r,i)=><button key={i} onClick={()=>{setChapter(r.chapter_index);setSearch(false)}}><strong>{r.chapter}</strong><span>{r.excerpt}</span></button>)}</div>}
  {toast&&<div className="reader-toast" role="status">{toast}</div>}
  <div className="reading-line"><i style={{width:`${percentage}%`}}/></div>
 </div>
}

function AiSettings(){
 const[cfg,setCfg]=useState<Settings|null>(null),[models,setModels]=useState<{id:string;name:string}[]>([]),[key,setKey]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{api.settings().then(setCfg).catch(e=>setStatus(e instanceof Error?e.message:'Settings unavailable'));api.models().then(setModels).catch(()=>{})},[]);
 const save=async(patch:object)=>{setStatus('Saving…');try{setCfg(await api.saveSettings(patch));setKey('');setStatus('Saved')}catch(e){setStatus(e instanceof Error?e.message:'Save failed')}};
 if(!cfg)return <p className="settings-note">{status||'Loading…'}</p>;
 // ponytail: key lives server-side; the browser only ever sees the last 4 characters
 return <><label htmlFor="or-key">OpenRouter API key</label>
  <div className="key-row"><input id="or-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder={cfg.configured?`Saved · ${cfg.key_hint}${cfg.from_env?' (env)':''}`:'sk-or-v1-…'}/><button className="primary" disabled={!key.trim()} onClick={()=>save({api_key:key})}>Save</button></div>
  <label htmlFor="or-model">Model</label>
  <select id="or-model" value={cfg.model} onChange={e=>save({model:e.target.value})}>{[...(cfg.model&&!models.some(m=>m.id===cfg.model)?[{id:cfg.model,name:cfg.model}]:[]),...models].map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
  <p className="settings-note">{status||(cfg.configured?'Answers come from OpenRouter.':'No key yet — answers stay in offline mock mode.')}{cfg.configured&&!cfg.from_env&&<> · <button className="linkish" onClick={()=>save({api_key:''})}>Remove key</button></>}</p></>;
}

function AI({book,chapter,selected,seed,close,navigate}:{book:Book;chapter:number;selected:string;seed:string;close:()=>void;navigate:(n:number)=>void}){
 const[q,setQ]=useState(''),[messages,setMessages]=useState<{role:string;text:string;error?:boolean;sources?:{chapter_index:number;chapter:string}[]}[]>([]),[busy,setBusy]=useState(false),[safe,setSafe]=useState(true);
 const ask=async(question=q)=>{if(!question.trim())return;setMessages(m=>[...m,{role:'user',text:question}]);setQ('');setBusy(true);try{const r=await api.ask(book.id,{question,selected_text:selected,chapter_index:chapter,spoiler_protection:safe});setMessages(m=>[...m,{role:'assistant',text:r.answer,error:r.error,sources:r.error?undefined:r.sources}])}catch(e){setMessages(m=>[...m,{role:'assistant',error:true,text:e instanceof Error?e.message:'Request failed'}])}finally{setBusy(false)}};
 // a question handed in from the dossier or a margin note asks itself on open
 const fire=useRef(ask);fire.current=ask;
 useEffect(()=>{if(seed)fire.current(seed)},[seed]);
 return <aside className="ai-panel"><div className="ai-head"><div><span className="ai-dot"/>Reader companion</div><button className="icon" aria-label="Close AI" onClick={close}><X/></button></div>{selected&&<blockquote><span>Selected passage</span>“{selected}”</blockquote>}<div className="chips">{['Explain','Simplify','Context','Why is this important?'].map(x=><button key={x} onClick={()=>ask(x)}>{x}</button>)}</div><div className="messages">{messages.length===0&&<div className="ai-welcome"><MessageCircle/><h3>Ask about what you’re reading.</h3><p>I’ll keep answers grounded in the book and behind your current reading position.</p></div>}{messages.map((m,i)=><div key={i} className={`message ${m.role}${m.error?' failed':''}`}><p>{m.text}</p>{m.sources?.map((s,j)=><button key={j} onClick={()=>navigate(s.chapter_index)}>Show source · {s.chapter}</button>)}</div>)}{busy&&<div className="thinking">Reading the context…</div>}</div><div className="spoiler"><label><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/> Spoiler protection</label><span>Through chapter {chapter+1}</span></div><form onSubmit={e=>{e.preventDefault();ask()}}><textarea aria-label="Ask about the book" value={q} onChange={e=>setQ(e.target.value)} placeholder="Ask about this book…"/><button disabled={busy||!q.trim()}>Ask</button></form></aside>
}
