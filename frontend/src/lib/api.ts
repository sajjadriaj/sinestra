export type Chapter={id:number;title:string;position:number;content:string};
export type Highlight={id:number;chapter_index:number;text:string;anchor:string;color:string;note:string};
export type Book={id:number;title:string;author:string;format:string;created_at:string;last_opened_at?:string;cover_url?:string|null;progress:{chapter_index:number;locator?:string;percentage:number};chapters:Chapter[];highlights:Highlight[];bookmarks:{id:number;chapter_index:number;locator:string;label:string}[]};
export type Settings={configured:boolean;key_hint:string;from_env:boolean;model:string};
export type Entry={name:string;count:number;chapter_index:number;chapter:string;first:string};
const json=async<T>(url:string,init?:RequestInit):Promise<T>=>{const r=await fetch(url,init);if(!r.ok)throw new Error((await r.json().catch(()=>null))?.detail||'Something went wrong');return r.status===204?undefined as T:r.json()};
export const api={
 books:()=>json<Book[]>('/api/books'),
 upload:(file:File)=>{const body=new FormData();body.append('file',file);return json<Book>('/api/books',{method:'POST',body})},
 remove:(id:number)=>json<void>(`/api/books/${id}`,{method:'DELETE'}),
 progress:(id:number,data:object)=>json(`/api/books/${id}/progress`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
 highlight:(id:number,data:object)=>json<Highlight>(`/api/books/${id}/highlights`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
 note:(id:number,data:object)=>json<Highlight>(`/api/highlights/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
 unhighlight:(id:number)=>json<void>(`/api/highlights/${id}`,{method:'DELETE'}),
 dossier:(id:number,chapter:number)=>json<Entry[]>(`/api/books/${id}/dossier?chapter_index=${chapter}`),
 recap:(id:number,chapter:number)=>json<{recap:string;chapters:number;mock?:boolean;error?:boolean}>(`/api/books/${id}/recap?chapter_index=${chapter}`),
 bookmark:(id:number,data:object)=>json(`/api/books/${id}/bookmarks`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
 search:(id:number,q:string)=>json<{chapter_index:number;chapter:string;excerpt:string}[]>(`/api/books/${id}/search?q=${encodeURIComponent(q)}`),
 ask:(id:number,data:object)=>json<{answer:string;sources:{chapter_index:number;chapter:string;excerpt:string}[];mock?:boolean;error?:boolean}>(`/api/books/${id}/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
 settings:()=>json<Settings>('/api/settings'),
 saveSettings:(data:object)=>json<Settings>('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
 models:()=>json<{id:string;name:string}[]>('/api/models')
};
