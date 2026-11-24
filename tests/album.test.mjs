import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAlbumRows,normalizeMediaURL,compareAlbumSongs} from '../src/lib/album.mjs';
import {createTestStore as createStore} from './helpers/supabase.mjs';
const songs=[{id:'a1',kind:'song',parent_id:'a',data:{title:'One',artist:'Artist',group:'Season 1',body:'Original 1',type:'OP',video:'https://example.com/video.mp4'}},{id:'a2',kind:'song',parent_id:'a',data:{title:'Two',artist:'Artist',group:'Season 1',type:'ED',body:'Original 2'}},{id:'b1',kind:'song',parent_id:'b',data:{title:'Other anime',body:'Untouched'}}];
test('Expanded album merges all edited lyrics, preserving metadata and other anime',()=>{
  const result=mergeAlbumRows('a',songs,[{id:'a1',data:{title:'One',body:'New lyrics 1',order:'2'}},{id:'a2',data:{title:'Two',body:'New lyrics 2',order:'1'}}]);
  assert.equal(result.length,2);assert.equal(result[0].data.body,'New lyrics 1');assert.equal(result[1].data.body,'New lyrics 2');assert.equal(result[0].data.video,'https://example.com/video.mp4');assert.equal(result[0].data.order,2);assert.equal(songs[2].data.body,'Untouched');assert.equal(songs[0].data.body,'Original 1');
});
test('Album refuses duplicate IDs, another anime’s songs and invalid required data',()=>{
  assert.throws(()=>mergeAlbumRows('a',songs,[{id:'b1',data:{title:'Wrong anime'}}]),/không thuộc/);
  assert.throws(()=>mergeAlbumRows('a',songs,[{id:'a1',data:{}},{id:'a1',data:{}}]),/bị trùng/);
  assert.throws(()=>mergeAlbumRows('a',songs,[{id:'new',data:{title:' '}}]),/Tên bài hát là trường bắt buộc/);
  assert.throws(()=>mergeAlbumRows('a',songs,[{id:'a1',data:{order:'bad'}}]),/số không âm/);
});
test('Each of the first four fields is required; order and media are optional',()=>{
  for(const key of ['title','artist','type','group']){
    assert.throws(()=>mergeAlbumRows('a',songs,[{id:'a1',data:{[key]:''}}]),/bắt buộc/);
  }
  const [entry]=mergeAlbumRows('a',songs,[{id:'a1',data:{order:'',video:'',poster:''}}]);
  assert.equal(entry.data.order,null);assert.equal(entry.data.video,'');assert.equal(entry.data.poster,'');
});
test('Media inputs accept imported relative posters, encoded URLs and empty optional values',()=>{
  assert.equal(normalizeMediaURL('/rainei-lyrics-list/imported-posters/poster.webp'),'/rainei-lyrics-list/imported-posters/poster.webp');
  assert.equal(normalizeMediaURL(' https://example.com/My Video.mp4 '),'https://example.com/My%20Video.mp4');
  assert.equal(normalizeMediaURL('https://example.com/%5BMV%5D%20video.mp4'),'https://example.com/%5BMV%5D%20video.mp4');
  assert.equal(normalizeMediaURL(''),'');assert.throws(()=>normalizeMediaURL('javascript:alert(1)'),/http/);
});
test('Unnumbered songs follow added time and keep that time after later edits',()=>{
  const early={...songs[0],updated_at:'2026-11-14T12:00:00Z',data:{...songs[0].data,order:null,addedAt:'2026-11-14T01:00:00Z'}};
  const late={...songs[1],updated_at:'2026-11-14T02:00:00Z',data:{...songs[1].data,order:null,addedAt:'2026-11-14T02:00:00Z'}};
  assert.deepEqual([late,early].sort(compareAlbumSongs).map(e=>e.id),['a1','a2']);
  const [edited]=mergeAlbumRows('a',[early],[{id:'a1',data:{body:'Edited',order:''}}]);
  assert.equal(edited.data.addedAt,early.data.addedAt);assert.equal(edited.data.order,null);
  const numbered={...late,id:'explicit',data:{...late.data,order:1}};
  assert.deepEqual([late,early,numbered].sort(compareAlbumSongs).map(e=>e.id),['explicit','a1','a2']);
});
test('Adding a blank song keeps existing unsaved lyrics in the editor',()=>{
  const result=mergeAlbumRows('a',songs,[{id:'a1',data:{body:'Still unsaved'}},{id:'new',data:{title:'',body:'',order:3}}],{validate:false});
  assert.equal(result[0].data.body,'Still unsaved');assert.equal(result[1].data.title,'');assert.equal(result[1].parent_id,'a');
});
test('Saving multiple drafts keeps published lyrics and unrelated anime unchanged',async()=>{
  const series=[{id:'a',kind:'series',parent_id:null,data:{title:'A'}},{id:'b',kind:'series',parent_id:null,data:{title:'B'}}];
  const store=createStore({seed:[...series,...songs]});
  await store.saveMany(mergeAlbumRows('a',songs,[{id:'a1',data:{body:'Changed 1'}},{id:'a2',data:{body:'Changed 2'}}]));
  const drafts=await store.listDrafts(),published=await store.listPublic();
  assert.equal(drafts.find(e=>e.id==='a1').data.body,'Changed 1');assert.equal(drafts.find(e=>e.id==='a2').data.body,'Changed 2');assert.equal(drafts.find(e=>e.id==='b1').data.body,'Untouched');assert.equal(published.find(e=>e.id==='a1').data.body,'Original 1');
});
test('Song drafts save with an unpublished or published anime without publishing the song',async()=>{
  for(const publishParent of [false,true]){
    const store=createStore();
    await store.save({id:'a',kind:'series',parent_id:null,data:{title:'Anime'}});
    if(publishParent)await store.publish('a');
    await store.save({id:'s',kind:'song',parent_id:'a',data:{title:'Private song',body:'Draft lyrics'}});
    assert.equal((await store.listDrafts()).find(e=>e.id==='s').data.body,'Draft lyrics');
    const publicData=await store.listPublic();assert.equal(publicData.some(e=>e.id==='a'),publishParent);assert.equal(publicData.some(e=>e.id==='s'),false);
  }
});
