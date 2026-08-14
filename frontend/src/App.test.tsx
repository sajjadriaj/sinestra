import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {vi,test,expect,beforeEach} from 'vitest';
import App from './App';

beforeEach(()=>{globalThis.fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>[]}) as unknown as typeof fetch});
test('shows the focused empty library state',async()=>{
  render(<App/>);
  expect(await screen.findByText('Add a book and start reading.')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/upload book/i})).toBeInTheDocument();
});
test('opens reader and changes theme',async()=>{
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ok:true,json:async()=>[{id:1,title:'Emma',author:'Jane Austen',format:'TXT',created_at:'2026-01-01',progress:{chapter_index:0,percentage:20},chapters:[{id:1,title:'Chapter 1',position:0,content:'Emma Woodhouse, handsome, clever, and rich.'}],highlights:[],bookmarks:[]}]});
  render(<App/>);
  await userEvent.click(await screen.findByRole('button',{name:/open emma/i}));
  expect(screen.getByRole('article')).toHaveTextContent('Emma Woodhouse');
  await userEvent.click(screen.getByRole('button',{name:/reader appearance/i}));
  await userEvent.click(screen.getByRole('button',{name:'Night'}));
  expect(document.documentElement).toHaveAttribute('data-theme','night');
});
test('a saved highlight comes back painted into the text, with its note',async()=>{
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ok:true,json:async()=>[{id:1,title:'Emma',author:'Jane Austen',format:'TXT',created_at:'2026-01-01',progress:{chapter_index:0,percentage:20},chapters:[{id:1,title:'Chapter 1',position:0,content:'Emma Woodhouse, handsome, clever, and rich.'}],highlights:[{id:9,chapter_index:0,text:'handsome, clever',anchor:'quote:handsome',color:'yellow',note:'The famous opening line.'}],bookmarks:[]}]});
  render(<App/>);
  await userEvent.click(await screen.findByRole('button',{name:/open emma/i}));
  const painted=screen.getByText('handsome, clever');
  expect(painted.tagName).toBe('MARK');
  expect(painted.parentElement?.tagName).toBe('P');  // painted in place, not appended to the end
  expect(painted.parentElement?.textContent).toBe('Emma Woodhouse, handsome, clever✳, and rich.');
  await userEvent.click(painted);
  expect(screen.getByText('The famous opening line.')).toBeInTheDocument();
});
test('on mobile the toolbar carries every control and contents starts closed',async()=>{
  Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn().mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})});
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ok:true,json:async()=>[{id:1,title:'Emma',author:'Jane Austen',format:'TXT',created_at:'2026-01-01',progress:{chapter_index:0,percentage:20},chapters:[{id:1,title:'Chapter 1',position:0,content:'Emma Woodhouse.'}],highlights:[],bookmarks:[]}]});
  render(<App/>);
  await userEvent.click(await screen.findByRole('button',{name:/open emma/i}));
  expect(screen.queryByRole('navigation',{name:'Mobile reader controls'})).not.toBeInTheDocument();
  for(const label of ['Toggle contents','Search book','Read aloud','Bookmark page','Ask AI','Reader appearance'])
    expect(screen.getByRole('button',{name:label})).toBeInTheDocument();
  expect(screen.queryByText('Contents',{selector:'.tabs button'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Toggle contents'}));
  expect(screen.getByText('Contents',{selector:'.tabs button'})).toBeInTheDocument();
});
