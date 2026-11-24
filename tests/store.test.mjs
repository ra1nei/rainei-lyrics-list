import { createTestDatabase } from './helpers/supabase.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { publishSnapshot, publicEntries, createStore } from '../src/lib/store.mjs';
import { micromark } from 'micromark';
const series={id:'anime',kind:'series',parent_id:null,data:{title:'Original'}};
const song={id:'song',kind:'song',parent_id:'anime',data:{title:'Song',body:'Published lyrics'}};
test('Published snapshots are isolated from later draft mutations',()=>{
  const drafts=structuredClone([series,song]);let publicData=publishSnapshot(drafts,[],'anime');publicData=publishSnapshot(drafts,publicData,'song');
  drafts[0].data.title='Private revised title';drafts[1].data.body='Private revised lyrics';
  assert.equal(publicData[0].data.title,'Original');assert.equal(publicData[1].data.body,'Published lyrics');
  publicData=publishSnapshot(drafts,publicData,'song');assert.equal(publicData.find(e=>e.id==='song').data.body,'Private revised lyrics');
});
test('Cannot publish a song before its parent and orphan songs are not public',()=>{
  assert.throws(()=>publishSnapshot([song],[],'song'),/xuất bản phim trước/);assert.deepEqual(publicEntries([song]),[]);
  assert.throws(()=>publishSnapshot([{...series,data:{title:' '}}],[],'anime'),/Cần nhập tên/);
});
test('Supabase persistence, unpublish cascade and draft retention work across clients',async()=>{
  const database=createTestDatabase([series,song]);let store=database.client();
  await store.save({...series,data:{title:'Private edit'}});
  assert.equal((await store.listPublic())[0].data.title,'Original');await store.publish('anime');
  store=database.client();assert.equal((await store.listPublic()).find(e=>e.id==='anime').data.title,'Private edit');
  await store.unpublish('anime');assert.deepEqual(await store.listPublic(),[]);assert.equal((await store.listDrafts()).length,2);
  await store.remove('anime');assert.deepEqual(await store.listDrafts(),[]);
  assert.ok(database.calls.some(c=>c.route==='/rest/v1/rpc/publish_entry'));
});
test('Missing Supabase configuration fails instead of silently saving browser drafts',()=>{
  for(const settings of [{},{url:'https://database.test'},{key:'public-test'}]){
    assert.throws(()=>createStore({...settings,storage:{}}),/Supabase/);
  }
});

test('Markdown preserves lyrics formatting without executing HTML or javascript links',()=>{
  const html=micromark('**Bold**\n\n<script>alert(1)</script>\n\n[x](javascript:alert%281%29)');
  assert.match(html,/<strong>Bold<\/strong>/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/href="javascript:/);
});
