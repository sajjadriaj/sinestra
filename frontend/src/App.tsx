import{useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode}from'react';
import{ArrowLeft,BookOpen,Bookmark,ChevronLeft,ChevronRight,Copy,Download,Highlighter,LayoutGrid,Library,List,Menu,MessageCircle,PanelLeftClose,Play,Search,Settings2,Sparkles,Square,Trash2,Upload,X}from'lucide-react';
import{api,type Book,type Entry,type Highlight,type Settings}from'./lib/api';

type Theme='light'|'dark'|'night';
const THEMES:[Theme,string][]=[['light','Light'],['dark','Dark'],['night','Night']];
const prefs:{theme?:Theme;size?:number;line?:number}=(()=>{try{return JSON.parse(localStorage.getItem('sinestra:prefs')||'{}')}catch{return{}}})();
const savePrefs=(patch:object)=>{try{localStorage.setItem('sinestra:prefs',JSON.stringify(Object.assign(prefs,patch)))}catch{/* private mode */}};
const message=(e:unknown,fallback:string)=>e instanceof Error?e.message:fallback;
const isMobile=()=>typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 900px)').matches;
const prefersDark=()=>typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches;
// a match painted inside an excerpt, so a search result shows why it matched
const hit=(text:string,q:string):ReactNode=>{const i=q?text.toLowerCase().indexOf(q.toLowerCase()):-1;return i<0?text:<>{text.slice(0,i)}<mark>{text.slice(i,i+q.length)}</mark>{text.slice(i+q.length)}</>};

export default function App(){
 const[books,setBooks]=useState<Book[]>([]),[active,setActive]=useState<Book|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[undo,setUndo]=useState<{book:Book;timer:number}|null>(null),[theme,setTheme]=useState<Theme>(prefs.theme||(prefersDark()?'dark':'light'));
 useEffect(()=>{api.books().then(setBooks).catch(e=>setError(message(e,'Could not load your library'))).finally(()=>setLoading(false))},[]);
 // the theme belongs to the whole app, so the library you come back to matches the page you left
 useEffect(()=>{document.documentElement.dataset.theme=theme;savePrefs({theme});document.querySelector('meta[name=theme-color]')?.setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()||'#faf8f2')},[theme]);
 useEffect(()=>{if(!error)return;const t=setTimeout(()=>setError(''),6000);return()=>clearTimeout(t)},[error]);
 const upload=async(f:File)=>{setError('');setBusy(true);try{const b=await api.upload(f);setBooks(v=>[b,...v]);setActive(b)}catch(e){setError(message(e,'Upload failed'))}finally{setBusy(false)}};
 // ponytail: delete stays local for 8s, so Undo is a state revert instead of a re-upload
 const remove=(book:Book)=>{setBooks(v=>v.filter(b=>b.id!==book.id));setUndo({book,timer:window.setTimeout(()=>{setUndo(u=>u?.book.id===book.id?null:u);api.remove(book.id).catch(e=>{setError(message(e,'Delete failed'));setBooks(v=>[book,...v])})},8000)})};
 const restore=()=>{if(!undo)return;clearTimeout(undo.timer);setBooks(v=>[undo.book,...v]);setUndo(null)};
 // GET marks the book opened, which is what "Recently read" sorts by
 const open=(b:Book)=>{setActive(b);api.book(b.id).catch(()=>{})};
 if(active)return <Reader initial={active} theme={theme} setTheme={setTheme} onBack={()=>{setActive(null);api.books().then(setBooks).catch(()=>{})}}/>;
 return <>
  <LibraryView books={books} loading={loading} busy={busy} error={error} onDismiss={()=>setError('')} onOpen={open} onUpload={upload} onRemove={remove}/>
  {undo&&<div className="undo-toast" role="status"><span>Removed “{undo.book.title}”</span><button onClick={restore}>Undo</button></div>}
 </>;
}

function LibraryView({books,loading,busy,error,onDismiss,onOpen,onUpload,onRemove}:{books:Book[];loading:boolean;busy:boolean;error:string;onDismiss:()=>void;onOpen:(b:Book)=>void;onUpload:(f:File)=>void;onRemove:(b:Book)=>void}){
 const input=useRef<HTMLInputElement>(null),[query,setQuery]=useState(''),[grid,setGrid]=useState(true),[sort,setSort]=useState('recent'),[drag,setDrag]=useState(false);
 const shown=books.filter(b=>(b.title+' '+b.author).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='author'?a.author.localeCompare(b.author):new Date(b.last_opened_at||b.created_at).getTime()-new Date(a.last_opened_at||a.created_at).getTime());
 const pick=()=>input.current?.click(),add=<button className="primary" disabled={busy} onClick={pick}><Upload/>{busy?'Adding…':books.length?'Add book':'Upload book'}</button>;
 return <main className="library-shell" onDragOver={e=>{e.preventDefault();if(!drag)setDrag(true)}} onDragLeave={e=>{if(!e.relatedTarget)setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f&&!busy)onUpload(f)}}>
  <header className="library-header"><span className="wordmark"><BookOpen/> Sinestra</span>{books.length>0&&<span className="small-add">{add}</span>}</header>
  {/* value reset, so choosing the same file again after a failed upload still fires */}
  <input ref={input} hidden type="file" accept=".epub,.pdf,.txt,.md" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)onUpload(f)}}/>
  {error&&<div className="error" role="alert"><span>{error}</span><button className="icon" aria-label="Dismiss" onClick={onDismiss}><X/></button></div>}
  {loading?<p className="library-loading" role="status">Opening your library…</p>:books.length===0?<section className="empty"><div className="empty-mark"><Library/></div><h1>Add a book and start reading.</h1><p>Sinestra keeps the help inside the book — who’s who, answers, and recaps drawn only from what you’ve already read.</p>{add}<small>EPUB · PDF · TXT · Markdown — or drop a file anywhere</small></section>:
  <section className="library"><div className="library-title"><h1>Books worth returning to.</h1><div className="library-actions"><label className="search"><Search/><input type="search" aria-label="Search library" placeholder="Search your library" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Sort books" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently read</option><option value="title">Title</option><option value="author">Author</option></select><button className="icon" aria-label={grid?'Show as list':'Show as grid'} title={grid?'Show as list':'Show as grid'} onClick={()=>setGrid(!grid)}>{grid?<List/>:<LayoutGrid/>}</button></div></div>
   {shown.length===0&&<p className="library-none">Nothing in your library matches “{query.trim()}”.</p>}
   <div className={grid?'book-grid':'book-list'}>{shown.map((b)=>{const pct=Math.round(b.progress.percentage);return <article className="book-card" key={b.id}><button className="cover" aria-label={`Open ${b.title}`} onClick={()=>onOpen(b)} style={{'--hue':`${(b.id*47)%360}`} as CSSProperties}>{b.cover_url?<img src={b.cover_url} alt="" loading="lazy"/>:<><span className="cover-rule"/><strong>{b.title}</strong><em>{b.author}</em></>}</button><div className="book-meta"><div><h2 title={b.title}>{b.title}</h2><p>{b.author}</p></div><button className="icon more" aria-label={`Remove ${b.title}`} title="Remove from library" onClick={()=>onRemove(b)}><Trash2/></button></div><div className="card-progress"><i style={{width:`${b.progress.percentage}%`}}/><span>{pct>=100?'Finished':pct>0?`${pct}% read`:'Not started'}</span></div></article>})}</div>
  </section>}
  {drag&&<div className="drop-veil" aria-hidden="true"><div><Upload/><p>Drop to add to your library</p><small>EPUB · PDF · TXT · Markdown</small></div></div>}
 </main>
}

type Mark={h:Highlight;frag:string;tail:boolean};
// A selection can span paragraphs, so each highlight is matched fragment by fragment against the
// paragraph it landed in — that is what makes a highlight survive a reload, a resize, and a retype.
function paint(text:string,marks:Mark[],open:(h:Highlight,x:number,y:number)=>void):ReactNode{
 if(!marks.length)return text;
 const out:ReactNode[]=[];let at=0;
 for(;;){
  let best=-1,hit:Mark|undefined;
  for(const m of marks){const i=text.indexOf(m.frag,at);if(i>=0&&(best<0||i<best)){best=i;hit=m}}
  if(!hit)break;
  const{h}=hit;
  if(best>at)out.push(text.slice(at,best));
  out.push(<mark key={`${h.id}-${best}`} className={h.color} tabIndex={0} role="button" aria-label={h.note?`Highlight with note: ${h.note}`:'Highlight'} onClick={e=>open(h,e.clientX,e.clientY)} onKeyDown={e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();open(h,r.left+r.width/2,r.bottom)}}>{hit.frag}{hit.tail&&h.note&&<sup className="note-dot">✳</sup>}</mark>);
  at=best+hit.frag.length;
 }
 return out.length?[...out,text.slice(at)]:text;
}

function Reader({initial,theme,setTheme,onBack}:{initial:Book;theme:Theme;setTheme:(t:Theme)=>void;onBack:()=>void}){
 const[book,setBook]=useState(initial),[chapter,setChapter]=useState(initial.progress.chapter_index||0),[toc,setToc]=useState(()=>!isMobile()),[ai,setAi]=useState(false),[settings,setSettings]=useState(false),[size,setSize]=useState(prefs.size||(isMobile()?17:19)),[line,setLine]=useState(prefs.line||1.7),[sel,setSel]=useState<{text:string;x:number;y:number;below:boolean;arrow:number}|null>(null),[tab,setTab]=useState<'contents'|'highlights'|'people'>('contents'),[search,setSearch]=useState(false),[query,setQuery]=useState(''),[results,setResults]=useState<{chapter_index:number;chapter:string;excerpt:string}[]|null>(null),[searching,setSearching]=useState(false),[page,setPage]=useState(0),[pages,setPages]=useState(1),[toast,setToast]=useState(''),[note,setNote]=useState<{h:Highlight;x:number;y:number}|null>(null),[people,setPeople]=useState<Entry[]|null>(null),[open,setOpen]=useState(''),[seed,setSeed]=useState(''),[passage,setPassage]=useState(''),[recap,setRecap]=useState(''),[speaking,setSpeaking]=useState(false);
 const art=useRef<HTMLElement>(null),head=useRef<HTMLParagraphElement>(null),tail=useRef<HTMLSpanElement>(null),backwards=useRef(false),seek=useRef(''),down=useRef({x:0,y:0,touch:false}),wheelAt=useRef(0);
 // resume lands where you stopped in the chapter you stopped in — as a fraction, since a phone
 // and a laptop cut the same chapter into different numbers of pages
 const parse=(loc='')=>{const m=/page:(\d+)(?:\/of:(\d+))?/.exec(loc);return{page:+(m?.[1]||0),of:+(m?.[2]||0)}};
 const start=useRef(initial.progress.chapter_index||0),resume=useRef(parse(initial.progress.locator));
 const current=book.chapters[chapter]||book.chapters[0],percentage=book.chapters.length?((chapter+(page+1)/pages)/book.chapters.length)*100:0;
 const position={chapter_index:chapter,locator:`chapter:${chapter}/page:${page}/of:${pages}`,percentage};
 useEffect(()=>{savePrefs({size,line})},[size,line]);
 useEffect(()=>{const t=setTimeout(()=>api.progress(book.id,position).catch(()=>{}),600);return()=>clearTimeout(t)},[book.id,chapter,page,pages]);
 useEffect(()=>{setPage(0);if(chapter!==start.current)resume.current={page:0,of:0}},[chapter]);
 // welcome back — only worth showing when there is something behind you to forget, and never an error
 useEffect(()=>{if(start.current>0)api.recap(initial.id,start.current).then(r=>{if(!r.error&&r.recap)setRecap(r.recap)}).catch(()=>{})},[initial.id]);
 useEffect(()=>{if(tab==='people'){setPeople(null);api.dossier(book.id,chapter).then(setPeople).catch(()=>setPeople([]))}},[tab,book.id,chapter]);
 useEffect(()=>()=>{if('speechSynthesis'in window)speechSynthesis.cancel()},[]);
 // the page a piece of text sits on, read off the laid-out columns
 const pageOf=(text:string)=>{const el=art.current,q=text.toLowerCase().slice(0,60);if(!el||!q)return -1;const n=[...el.querySelectorAll('p,figure')].find(n=>n.textContent?.toLowerCase().includes(q)) as HTMLElement|undefined;return n&&el.clientWidth?Math.max(0,Math.round((n.offsetLeft-(head.current?.offsetLeft||0))/el.clientWidth)):-1};
 // ponytail: one column the exact width of the viewport, so the overflow columns ARE the pages
 useEffect(()=>{const el=art.current;if(!el)return;
  const measure=()=>{el.style.columnWidth=`${el.clientWidth}px`;const pitch=el.clientWidth;if(!pitch)return;
   const n=Math.max(1,Math.round(((tail.current?.offsetLeft||0)-(head.current?.offsetLeft||0))/pitch)+1),last=backwards.current;backwards.current=false;
   // resume survives every re-measure until the reader turns a page — StrictMode re-runs this effect
   const r=chapter===start.current?resume.current:{page:0,of:0};
   let want=r.of>1?Math.min(n-1,Math.round(r.page/r.of*n)):Math.min(r.page,n-1);
   if(seek.current){const at=pageOf(seek.current);seek.current='';if(at>=0)want=Math.min(at,n-1)}
   setPages(n);setPage(p=>want?want:last?n-1:Math.min(p,n-1))};
  measure();document.fonts?.ready.then(measure);
  const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()},[current?.id,size,line,chapter]);
 // one way to land anywhere: a chapter, then either a saved page fraction or a passage to find
 const jump=(ch:number,{loc='',text=''}:{loc?:string;text?:string}={})=>{setRecap('');setSearch(false);if(isMobile())setToc(false);
  const r=parse(loc);
  if(ch===chapter){const at=text?pageOf(text):r.of>1?Math.round(r.page/r.of*pages):r.page;if(at>=0)setPage(Math.min(at,pages-1));return}
  start.current=ch;resume.current=r;seek.current=text;setChapter(ch)};
 const go=(delta:number)=>{resume.current={page:0,of:0};setRecap('');const next=page+delta;
  if(next<0){if(chapter>0){backwards.current=true;setChapter(chapter-1)}return}
  if(next>=pages){if(chapter<book.chapters.length-1)setChapter(chapter+1);return}
  setPage(next)};
 const toggleAi=()=>{if(!ai)setPassage(sel?.text||'');else{setSeed('');setPassage('')}setAi(!ai)};
 const closeAll=()=>{setAi(false);setSeed('');setPassage('');setSettings(false);setSearch(false);setNote(null);setSel(null);if(isMobile())setToc(false)};
 const cmd=useRef({go,toggleAi,closeAll});cmd.current={go,toggleAi,closeAll};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape')return cmd.current.closeAll();
  const t=e.target as HTMLElement;
  // shortcuts never steal a modified key (Ctrl+A, Cmd+T), a text field, or Space on a focused control
  if(e.ctrlKey||e.metaKey||e.altKey||t.closest?.('input,textarea,select,[contenteditable=true]'))return;
  if(e.key===' '&&t.closest?.('button,a,[role=button]'))return;
  if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();cmd.current.go(1)}
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();cmd.current.go(-1)}
  else if(e.key.toLowerCase()==='a')cmd.current.toggleAi();else if(e.key.toLowerCase()==='t')setSettings(v=>!v)};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[]);
 // swipe and edge-tap are touch-only; on a mouse they would fight text selection
 const grab=(e:React.PointerEvent)=>{setRecap('');down.current={x:e.clientX,y:e.clientY,touch:e.pointerType!=='mouse'}};
 const release=(e:React.PointerEvent)=>{const{x,y,touch}=down.current,dx=e.clientX-x,dy=e.clientY-y;
  if(!touch||!window.getSelection()?.isCollapsed)return;
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))return go(dx<0?1:-1);
  // a tap on a highlight or a control is meant for it, not for the page edge under it
  if((e.target as HTMLElement).closest('mark,button,a'))return;
  if(Math.abs(dx)<9&&Math.abs(dy)<9){const w=e.currentTarget.clientWidth;if(e.clientX<w*.3)go(-1);else if(e.clientX>w*.7)go(1)}};
 const wheel=(e:React.WheelEvent)=>{const now=Date.now();if(now-wheelAt.current<380)return;const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(Math.abs(d)<10)return;wheelAt.current=now;go(d>0?1:-1)};
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),1900);return()=>clearTimeout(t)},[toast]);
 const mark=()=>api.bookmark(book.id,{chapter_index:chapter,locator:`page:${page}/of:${pages}`,label:`${current?.title||'Bookmark'} · p.${page+1}`}).then(b=>{setBook(v=>({...v,bookmarks:[...v.bookmarks,b]}));setToast('Bookmarked')},()=>setToast('Could not bookmark'));
 const unmark=(id:number)=>{setBook(v=>({...v,bookmarks:v.bookmarks.filter(b=>b.id!==id)}));api.unbookmark(id).catch(()=>setToast('Could not remove bookmark'))};
 const marks=useMemo(()=>book.highlights.filter(h=>h.chapter_index===chapter).flatMap(h=>{
  const parts=h.text.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>2);
  return parts.map((frag,i)=>({h,frag,tail:i===parts.length-1}))}),[book.highlights,chapter]);
 // ponytail: memoised so a page turn re-renders the transform, not several thousand paragraphs
 const body=useMemo(()=>{const text=current?.content||'',split=text.split(/\n{2,}/).filter(p=>p.trim());
  return (split.length>1?split:text.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter(Boolean)).map((p,i)=>{
   const fig=/^\[\[img:([^|\]]+)\|?([^\]]*)\]\]$/.exec(p.trim());
   return fig?<figure key={i}><img src={`/api/books/${book.id}/asset/${fig[1]}`} alt={fig[2]}/>{fig[2]&&<figcaption>{fig[2]}</figcaption>}</figure>
    :<p key={i}>{paint(p,marks,(h,x,y)=>setNote({h,x,y}))}</p>})},[current?.content,marks,book.id]);
 const selected=sel?.text||'';
 // ponytail: rect-anchored floating menu; re-reads the live range on every event, so scroll just re-anchors it
 const select=()=>{const s=window.getSelection(),text=s?.toString().trim()||'';if(!text||!s?.rangeCount||!art.current?.contains(s.anchorNode))return setSel(null);const r=s.getRangeAt(0).getBoundingClientRect();if(!r.width||r.bottom<72||r.top>innerHeight-40)return setSel(null);const below=r.top<108,cx=r.left+r.width/2,x=Math.min(Math.max(cx,110),innerWidth-110);setSel({text,x,y:below?r.bottom:r.top,below,arrow:cx-x})};
 useEffect(()=>{const events=['mouseup','touchend','keyup'],up=(e:Event)=>{if((e.target as HTMLElement).closest?.('.selection-menu'))return;setTimeout(select)},move=()=>select();events.forEach(t=>addEventListener(t,up));addEventListener('scroll',move,true);return()=>{events.forEach(t=>removeEventListener(t,up));removeEventListener('scroll',move,true)}},[]);
 const keep=async(color:string,text:string)=>{const h=await api.highlight(book.id,{chapter_index:chapter,text,anchor:`quote:${text.slice(0,80)}`,color,note:''});
  setBook(b=>({...b,highlights:[...b.highlights,h]}));setSel(null);window.getSelection()?.removeAllRanges();return h};
 const addHighlight=(color='yellow')=>{if(selected)keep(color,selected).catch(()=>setToast('Could not highlight'))};
 // ask-in-margin: the answer is stored as the note on the highlight, so it survives the session
 const explain=async()=>{const text=selected;if(!text)return;setToast('Reading the passage…');
  try{const h=await keep('note',text),r=await api.ask(book.id,{question:'Explain this passage in two short sentences.',selected_text:text,chapter_index:chapter,spoiler_protection:true});
   if(r.error){setToast('Highlighted — the explanation failed');return}
   const saved=await api.note(h.id,{note:r.answer});setBook(b=>({...b,highlights:b.highlights.map(x=>x.id===h.id?saved:x)}));setToast('Note added')}
  catch{setToast('Could not add note')}};
 const copy=(text:string)=>{navigator.clipboard?.writeText(text).then(()=>setToast('Copied'),()=>setToast('Could not copy'));setSel(null)};
 const drop=(h:Highlight)=>{setNote(null);setBook(b=>({...b,highlights:b.highlights.filter(x=>x.id!==h.id)}));api.unhighlight(h.id).catch(()=>setToast('Could not remove'))};
 const doSearch=async()=>{const q=query.trim();if(!q)return;setSearching(true);try{setResults(await api.search(book.id,q))}catch{setResults(null);setToast('Search failed')}finally{setSearching(false)}};
 const canSpeak='speechSynthesis'in window;
 const speak=()=>{if(speaking){speechSynthesis.cancel();setSpeaking(false);return}
  const utter=new SpeechSynthesisUtterance((current?.content||'').replace(/\[\[img:[^\]]*\]\]/g,''));utter.onend=utter.onerror=()=>setSpeaking(false);speechSynthesis.cancel();speechSynthesis.speak(utter);setSpeaking(true)};
 // save where you are before leaving, so the library you land on shows it
 const back=()=>{if(canSpeak)speechSynthesis.cancel();api.progress(book.id,position).catch(()=>{}).finally(onBack)};
 const askAbout=(q:string,text='')=>{setPassage(text);setSeed(q);setAi(true);setNote(null);if(isMobile())setToc(false)};
 const tool=(label:string,on:boolean,click:()=>void,icon:ReactNode)=><button className="icon" aria-label={label} title={label} aria-pressed={on} onClick={click}>{icon}</button>;
 const notes=book.highlights.length+book.bookmarks.length;
 return <div className="reader-app">
  <header className="reader-toolbar"><div><button className="icon" aria-label="Back to library" title="Back to library" onClick={back}><ArrowLeft/></button>{tool('Toggle contents',toc,()=>setToc(!toc),toc?<PanelLeftClose/>:<Menu/>)}</div><div className="reader-title"><strong>{book.title}</strong><span>{current?.title}</span></div><div>{tool('Search book',search,()=>setSearch(!search),<Search/>)}{canSpeak?tool(speaking?'Stop reading aloud':'Read aloud',speaking,speak,speaking?<Square/>:<Play/>):<button className="icon" aria-label="Read aloud" title="This browser cannot read aloud" disabled><Play/></button>}<button className="icon" aria-label="Bookmark page" title="Bookmark page" onClick={mark}><Bookmark/></button>{tool('Ask AI',ai,toggleAi,<MessageCircle/>)}{tool('Reader appearance',settings,()=>setSettings(!settings),<Settings2/>)}</div></header>
  <div className="reader-body">
   {toc&&<><button className="panel-scrim" aria-label="Close contents" onClick={()=>setToc(false)}/><aside className="toc-panel" aria-label="Book panel"><div className="mobile-sheet-handle"/><div className="toc-book"><span>{book.format}</span><h2>{book.title}</h2><p>{book.author}</p></div><div className="tabs" role="tablist">{([['contents','Contents'],['highlights',notes?`Notes · ${notes}`:'Notes'],['people','Who’s who']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
   {tab==='contents'&&<nav aria-label="Chapters">{book.chapters.map(c=><button className={c.position===chapter?'active':''} aria-current={c.position===chapter?'true':undefined} key={c.id} onClick={()=>jump(c.position)}><span>{String(c.position+1).padStart(2,'0')}</span>{c.title}</button>)}</nav>}
   {tab==='highlights'&&<div className="highlights-list">{notes?<>
    {book.bookmarks.length>0&&<><h3>Bookmarks</h3>{book.bookmarks.map(b=><div className="row" key={b.id}><button onClick={()=>jump(b.chapter_index,{loc:b.locator})}><Bookmark className="row-icon"/>{b.label}</button><button className="icon" aria-label={`Remove bookmark ${b.label}`} onClick={()=>unmark(b.id)}><Trash2/></button></div>)}</>}
    {book.highlights.length>0&&<><h3>Highlights<a className="export" href={`/api/books/${book.id}/export.md`} download><Download/> Export</a></h3>{book.highlights.map(h=><div className="row" key={h.id}><button onClick={()=>jump(h.chapter_index,{text:h.text.split(/\n/)[0]})}><mark className={h.color}>{h.text}</mark>{h.note&&<small>{h.note}</small>}</button><button className="icon" aria-label="Remove highlight" onClick={()=>drop(h)}><Trash2/></button></div>)}</>}
   </>:<p>Bookmarks, highlights, and margin notes gather here. Select any passage to start; notes export to Markdown.</p>}</div>}
   {tab==='people'&&<div className="dossier">{people===null?<p role="status">Gathering names from the chapters behind you…</p>:people.length?people.map(e=><div key={e.name}><button aria-expanded={open===e.name} onClick={()=>setOpen(open===e.name?'':e.name)}><b>{e.name}</b><span>{e.count}×</span></button>{open===e.name&&<div className="dossier-body"><p>{e.first}</p><button className="linkish" onClick={()=>jump(e.chapter_index,{text:e.name})}>First seen in {e.chapter}</button><button className="linkish" onClick={()=>askAbout(`Who or what is ${e.name}?`)}>Ask AI</button></div>}</div>):<p>Names and terms build up here as you read — nothing from further ahead than your current chapter.</p>}</div>}<div className="toc-progress"><span>{Math.round(percentage)}%</span><i><b style={{width:`${percentage}%`}}/></i></div></aside></>}
   <main className="reading-stage" onPointerDown={grab} onPointerUp={release} onWheel={wheel}>
    <div className="page-view"><article ref={art} style={{fontSize:size,lineHeight:line,'--page':page} as CSSProperties}><p className="chapter-kicker" ref={head}>{String(chapter+1).padStart(2,'0')} / {String(book.chapters.length).padStart(2,'0')}</p><h1>{current?.title}</h1>{body}<span className="page-end" ref={tail} aria-hidden="true"/></article></div>
    <footer className="page-bar"><button className="icon" aria-label="Previous page" disabled={chapter===0&&page===0} onClick={()=>go(-1)}><ChevronLeft/></button><span className="page-where">{current?.title}</span><span className="page-count" aria-live="polite">{page+1} / {pages}</span><button className="icon" aria-label="Next page" disabled={chapter>=book.chapters.length-1&&page>=pages-1} onClick={()=>go(1)}><ChevronRight/></button></footer>
   </main>
   {ai&&<><button className="panel-scrim ai-scrim" aria-label="Close AI panel" onClick={toggleAi}/><AI book={book} chapter={chapter} passage={passage} clearPassage={()=>setPassage('')} seed={seed} close={toggleAi} navigate={ch=>jump(ch)}/></>}
   {recap&&<div className="recap-card" role="status"><strong><Sparkles/> Where you left off</strong><p>{recap}</p><button className="primary small" onClick={()=>setRecap('')}>Continue reading</button></div>}
  </div>
  {sel&&<div className={`selection-menu${sel.below?' below':''}`} role="toolbar" aria-label="Selection actions" style={{left:sel.x,top:sel.y,'--arrow':`${sel.arrow}px`} as CSSProperties} onMouseDown={e=>e.preventDefault()}><button onClick={()=>addHighlight()}><Highlighter/> Highlight</button><button onClick={explain}><Sparkles/> Explain</button><button onClick={()=>{setPassage(sel.text);setAi(true);setSel(null)}}><MessageCircle/> Ask AI</button><button onClick={()=>copy(sel.text)}><Copy/> Copy</button></div>}
  {note&&<><button className="note-scrim" aria-label="Close note" onClick={()=>setNote(null)}/><div className="note-pop" role="dialog" aria-label="Highlight" style={{left:Math.min(Math.max(note.x,160),innerWidth-160),top:Math.min(note.y+16,innerHeight-200)}}><blockquote>{note.h.text}</blockquote>{note.h.note?<p>{note.h.note}</p>:<p className="muted">No note yet.</p>}<div><button className="linkish" onClick={()=>askAbout('Tell me more about this passage.',note.h.text)}>Ask more</button><button className="linkish" onClick={()=>copy(note.h.text)}>Copy</button><button className="linkish danger" onClick={()=>drop(note.h)}>Remove</button></div></div></>}
  {settings&&<div className="settings-pop" role="dialog" aria-label="Reader appearance"><div className="popover-head"><strong>Appearance</strong><button className="icon" aria-label="Close appearance" onClick={()=>setSettings(false)}><X/></button></div>
   <label>Theme</label><div className="theme-row">{THEMES.map(([id,label])=><button key={id} aria-pressed={theme===id} onClick={()=>setTheme(id)} className={theme===id?'active':''}><span className={`swatch ${id}`} aria-hidden="true">Aa</span>{label}</button>)}</div>
   <label htmlFor="size">Text size <output>{size}px</output></label><div className="range"><small aria-hidden="true">A</small><input id="size" type="range" min="15" max="28" value={size} onChange={e=>setSize(+e.target.value)}/><span aria-hidden="true">A</span></div>
   <label htmlFor="line">Line spacing <output>{line.toFixed(1)}</output></label><input id="line" type="range" min="1.4" max="2.2" step=".1" value={line} onChange={e=>setLine(+e.target.value)}/><hr/><AiSettings/></div>}
  {search&&<div className="search-panel" role="dialog" aria-label="Search this book"><form onSubmit={e=>{e.preventDefault();doSearch()}}><Search aria-hidden="true"/><input type="search" autoFocus aria-label="Search inside this book" placeholder="Search inside this book" value={query} onChange={e=>{setQuery(e.target.value);setResults(null)}}/><button className="icon" type="button" aria-label="Close search" onClick={()=>setSearch(false)}><X/></button></form>
   {searching?<p className="search-note" role="status">Searching…</p>:results&&<p className="search-note" role="status">{results.length?`${results.length} chapter${results.length>1?'s':''} mention “${query.trim()}”`:`No chapter mentions “${query.trim()}”.`}</p>}
   {results?.map((r,i)=><button key={i} onClick={()=>jump(r.chapter_index,{text:query.trim()})}><strong>{r.chapter}</strong><span>{hit(r.excerpt,query.trim())}</span></button>)}</div>}
  {toast&&<div className="reader-toast" role="status">{toast}</div>}
  <div className="reading-line"><i style={{transform:`scaleX(${percentage/100})`}}/></div>
 </div>
}

function AiSettings(){
 const[cfg,setCfg]=useState<Settings|null>(null),[models,setModels]=useState<{id:string;name:string}[]>([]),[key,setKey]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{api.settings().then(setCfg).catch(e=>setStatus(message(e,'Settings unavailable')));api.models().then(setModels).catch(()=>{})},[]);
 const save=async(patch:object)=>{setStatus('Saving…');try{setCfg(await api.saveSettings(patch));setKey('');setStatus('Saved')}catch(e){setStatus(message(e,'Save failed'))}};
 if(!cfg)return <p className="settings-note">{status||'Loading…'}</p>;
 // ponytail: key lives server-side; the browser only ever sees the last 4 characters
 return <><label htmlFor="or-key">OpenRouter API key</label>
  <form className="key-row" onSubmit={e=>{e.preventDefault();if(key.trim())save({api_key:key})}}><input id="or-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder={cfg.configured?`Saved · ${cfg.key_hint}${cfg.from_env?' (env)':''}`:'sk-or-v1-…'}/><button className="primary" disabled={!key.trim()}>Save</button></form>
  <label htmlFor="or-model">Model</label>
  <select id="or-model" value={cfg.model} onChange={e=>save({model:e.target.value})}>{[...(cfg.model&&!models.some(m=>m.id===cfg.model)?[{id:cfg.model,name:cfg.model}]:[]),...models].map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
  <p className="settings-note" role="status">{status||(cfg.configured?'Answers come from OpenRouter.':'No key yet — answers stay in offline mock mode.')}{cfg.configured&&!cfg.from_env&&<> · <button className="linkish" onClick={()=>save({api_key:''})}>Remove key</button></>}</p></>;
}

function AI({book,chapter,passage,clearPassage,seed,close,navigate}:{book:Book;chapter:number;passage:string;clearPassage:()=>void;seed:string;close:()=>void;navigate:(n:number)=>void}){
 const[q,setQ]=useState(''),[messages,setMessages]=useState<{role:string;text:string;error?:boolean;mock?:boolean;sources?:{chapter_index:number;chapter:string}[]}[]>([]),[busy,setBusy]=useState(false),[safe,setSafe]=useState(true),end=useRef<HTMLDivElement>(null);
 const ask=async(question=q)=>{if(!question.trim()||busy)return;setMessages(m=>[...m,{role:'user',text:question}]);setQ('');setBusy(true);try{const r=await api.ask(book.id,{question,selected_text:passage,chapter_index:chapter,spoiler_protection:safe});setMessages(m=>[...m,{role:'assistant',text:r.answer,error:r.error,mock:r.mock,sources:r.error?undefined:r.sources}])}catch(e){setMessages(m=>[...m,{role:'assistant',error:true,text:message(e,'Request failed')}])}finally{setBusy(false)}};
 // a question handed in from the dossier or a margin note asks itself on open
 const fire=useRef(ask);fire.current=ask;
 useEffect(()=>{if(seed)fire.current(seed)},[seed]);
 useEffect(()=>{end.current?.scrollIntoView?.({block:'end',behavior:'smooth'})},[messages,busy]);
 const chips=passage?['Explain','Simplify','Give me context','Why does this matter?']:['What just happened?','Who are the main people so far?','Summarise this chapter'];
 return <aside className="ai-panel" aria-label="Reader companion"><div className="ai-head"><div><span className="ai-dot"/>Reader companion</div><button className="icon" aria-label="Close AI" onClick={close}><X/></button></div>{passage&&<blockquote><span>Asking about<button className="icon" aria-label="Clear passage" onClick={clearPassage}><X/></button></span>“{passage}”</blockquote>}<div className="chips">{chips.map(x=><button key={x} disabled={busy} onClick={()=>ask(x)}>{x}</button>)}</div><div className="messages" aria-live="polite">{messages.length===0&&<div className="ai-welcome"><h3>Ask about what you’re reading.</h3><p>Answers come from the book’s own text{safe?`, through chapter ${chapter+1} — nothing further ahead`:''}.</p></div>}{messages.map((m,i)=><div key={i} className={`message ${m.role}${m.error?' failed':''}`}><p>{m.text}</p>{m.mock&&<small className="mock">Offline mode — add an OpenRouter key in Appearance for real answers.</small>}{m.sources&&m.sources.length>0&&<div className="sources">{m.sources.map((s,j)=><button key={j} onClick={()=>navigate(s.chapter_index)}>{s.chapter}</button>)}</div>}</div>)}{busy&&<div className="thinking" role="status"><i/><i/><i/> Reading the chapters behind you…</div>}<div ref={end}/></div><div className="spoiler"><label><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/> Spoiler protection</label><span>{safe?`Through chapter ${chapter+1}`:'Whole book'}</span></div><form onSubmit={e=>{e.preventDefault();ask()}}><textarea aria-label="Ask about the book" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="Ask about this book…"/><div><small>Enter to send · Shift+Enter for a new line</small><button disabled={busy||!q.trim()}>Ask</button></div></form></aside>
}
