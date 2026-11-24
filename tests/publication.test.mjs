import test from 'node:test';
import assert from 'node:assert/strict';
import {filterByPublication} from '../src/lib/publication.mjs';
test('Publication filters use public snapshots even when a published item has new draft changes',()=>{
  const entries=[{id:'published',data:{title:'Private revision'}},{id:'draft',data:{title:'Never published'}}];
  const snapshots=[{id:'published',data:{title:'Previous public version'}}];
  assert.deepEqual(filterByPublication(entries,snapshots,'published').map(e=>e.id),['published']);
  assert.deepEqual(filterByPublication(entries,snapshots,'draft').map(e=>e.id),['draft']);
  assert.equal(filterByPublication(entries,snapshots,'all').length,2);
  assert.equal(entries[0].data.title,'Private revision');
});
