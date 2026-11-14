import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { selectedAnime } from '../src/lib/anilist.mjs';
import { compareAlbumSongs, mergeAlbumRows } from '../src/lib/album.mjs';
import { normalize } from '../src/lib/store.mjs';
import { filterByPublication } from '../src/lib/publication.mjs';
const series={id:'anime',kind:'series',parent_id:null,data:{title:'Test Anime',cover:'https://example.com/cover.jpg'}};
const songs=[{id:'s1',kind:'song',parent_id:'anime',data:{title:'First song',body:'First lyrics\nSecond line'}},{id:'s2',kind:'song',parent_id:'anime',data:{title:'Second song',body:'<script>unsafe</script>'}},{id:'s3',kind:'song',parent_id:'elsewhere',data:{title:'Unrelated song',body:'Private other anime'}}];
function harness(){
  const nodes=new Map();
  function node(key){if(!nodes.has(key))nodes.set(key,{dataset:{base:'/rainei-lyrics-list'},value:'romaji',hidden:false,addEventListener(type,handler){this.listeners??={};this.listeners[type]=handler;},setAttribute(){},classList:{toggle(){}},querySelector:key=>node(key),querySelectorAll:()=>[]});return nodes.get(key);}
  const main=node('#main');main.innerHTML='';
  const context={document:{querySelector:key=>node(key),addEventListener(){}},window:{addEventListener(){}},location:{origin:'http://localhost'},URL,URLSearchParams,structuredClone,clearTimeout,setTimeout,AbortController,createAniListClient:()=>async()=>({media:[{id:154587,title:{romaji:'Sousou no Frieren'},coverImage:{extraLarge:'https://example.com/original.jpg'},startDate:{year:2023}}],hasNextPage:false}),selectedAnime,compareAlbumSongs,micromark:()=>'',console};
  const code=fs.readFileSync(new URL('../src/scripts/studio.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\nboot\(\);\s*$/,'');
  context.normalize=normalize;
  context.mergeAlbumRows=mergeAlbumRows;
  context.filterByPublication=filterByPublication;
  vm.createContext(context);vm.runInContext(code,context);
  context.entries=[series,...songs];vm.runInContext('drafts=entries;published=[];store={configured:false};',context);
  return {context,main,node};
}
test('Admin overview contains persistent inline search and only anime entries',()=>{
  const {context,main}=harness();vm.runInContext('renderAdmin()',context);
  assert.match(main.innerHTML,/id="anilist-search"/);assert.match(main.innerHTML,/id="anilist-dropdown"/);assert.match(main.innerHTML,/data-action="open-anime"/);
  assert.doesNotMatch(main.innerHTML,/data-action="search-anime"/);assert.doesNotMatch(main.innerHTML,/<textarea/);assert.doesNotMatch(main.innerHTML,/First song|Unrelated song/);
});
test('Song tab contains every song and lyrics in collapsed panels by default',()=>{
  const {context,main}=harness();vm.runInContext('renderAlbum(entries[0])',context);
  assert.equal((main.innerHTML.match(/<textarea /g)||[]).length,2);
  assert.match(main.innerHTML,/First lyrics\nSecond line/);assert.match(main.innerHTML,/&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(main.innerHTML,/Private other anime|Unrelated song/);assert.match(main.innerHTML,/data-action="batch-start"/);assert.match(main.innerHTML,/id="anilist-search"/);
  assert.equal((main.innerHTML.match(/<details /g)||[]).length,2);
  assert.doesNotMatch(main.innerHTML,/<details[^>]*\sopen(?:\s|>)/);
  assert.doesNotMatch(main.innerHTML,/Lưu tất cả bản nháp/);
});
test('Inline AniList suggestions appear under the search without replacing the anime overview',async()=>{
  const {context,main,node}=harness();vm.runInContext('renderAdmin()',context);const overview=main.innerHTML;
  node('#anilist-search').value='Frieren';await vm.runInContext('runSearch(false)',context);
  assert.equal(main.innerHTML,overview);assert.equal(node('#anilist-dropdown').hidden,false);
  assert.match(node('#anime-results').innerHTML,/Sousou no Frieren/);assert.match(node('#anime-results').innerHTML,/data-action="select-anime"/);
  vm.runInContext('closeAdminSearch()',context);assert.equal(node('#anilist-dropdown').hidden,true);
});
test('Unpublished anime keeps song draft save available and publication unavailable',()=>{
  const {context,main}=harness();vm.runInContext('renderAlbum(entries[0])',context);
  assert.match(main.innerHTML,/data-action="album-save"/);
  assert.doesNotMatch(main.innerHTML,/data-action="album-publish"/);
  assert.match(main.innerHTML,/disabled title="Xuất bản anime trước/);
  assert.match(main.innerHTML,/Anime chưa công khai/);
});
test('Published anime allows independent draft saves and individual song publication',()=>{
  const {context,main}=harness();vm.runInContext('published=[entries[0]];renderAlbum(entries[0])',context);
  assert.equal((main.innerHTML.match(/data-action="album-save"/g)||[]).length,2);
  assert.equal((main.innerHTML.match(/data-action="album-publish"/g)||[]).length,2);
  assert.match(main.innerHTML,/data-action="album-publish-selected"/);
});
test('Song form requires the first four fields and allows blank order and relative media paths',()=>{
  const {context,main}=harness();vm.runInContext('renderAlbum(entries[0])',context);
  for(const field of ['title','artist','type','group'])assert.match(main.innerHTML,new RegExp('name="'+field+'"[^>]*required'));
  for(const field of ['order','video','poster'])assert.doesNotMatch(main.innerHTML,new RegExp('name="'+field+'"[^>]*required'));
  assert.match(main.innerHTML,/name="poster"[^>]*type="text"/);assert.match(main.innerHTML,/name="order" value=""/);
});
test('Published and unpublished songs have distinct green and orange status classes',()=>{
  const {context,main}=harness();vm.runInContext('published=[entries[0],entries[1]];renderAlbum(entries[0])',context);
  assert.match(main.innerHTML,/song-published" data-song-id="s1"/);assert.match(main.innerHTML,/song-unpublished" data-song-id="s2"/);
});
test('Public anime cards omit redundant ANIME metadata when no format is supplied',()=>{
  const {context,main,node}=harness();node('#library-search').value='';node('#year-filter').value='';node('#sort-filter').value='title';
  vm.runInContext('published=[entries[0]];renderLibrary()',context);
  assert.doesNotMatch(node('#library-grid').innerHTML,/>ANIME</);
});
test('Publish all stays within the current anime and reports partial failure accurately',async()=>{
  const {context,node}=harness();const calls=[];let publishedSongs=[];
  context.mockStore={configured:true,publish:async id=>{calls.push(id);if(id==='s2')throw Error('Connection interrupted');publishedSongs.push(songs[0]);},listPublic:async()=>[series,...publishedSongs]};
  context.setTimeout=()=>0;
  vm.runInContext('store=mockStore;published=[entries[0]];current=entries[0];albumSeriesId="anime";albumRows=entries.filter(e=>e.parent_id==="anime");saveAlbum=async()=>{};',context);
  await vm.runInContext('handleAction("album-publish-all", "anime")',context);
  assert.deepEqual(calls,['s1','s2']);assert.match(node('#notice').textContent,/1\/2/);assert.match(node('#notice').textContent,/Connection interrupted/);
});
test('Song selection can select all or clear, then publish only the checked song',async()=>{
  const {context,node}=harness();const calls=[],saved=[];
  context.mockStore={configured:true,publish:async id=>calls.push(id),listPublic:async()=>[series,songs[1]]};context.setTimeout=()=>0;
  context.recordSaved=ids=>saved.push([...ids]);
  vm.runInContext('store=mockStore;published=[entries[0]];renderAlbum(entries[0]);saveAlbum=async ids=>recordSaved(ids);',context);
  await vm.runInContext('handleAction("batch-start")',context);
  await vm.runInContext('handleAction("batch-select-all")',context);
  assert.equal(node('#batch-selection-count').textContent,'2 bài đã chọn');
  await vm.runInContext('handleAction("batch-clear")',context);
  assert.equal(node('[data-action="album-publish-selected"]').disabled,true);
  vm.runInContext('selectedSongIds.add("s2");syncPublishSelection()',context);
  await vm.runInContext('handleAction("album-publish-selected")',context);
  assert.deepEqual(calls,['s2']);assert.deepEqual(saved,[['s2']]);
});
test('Anime selection uses Choose mode and select-all excludes song entries',async()=>{
  const {context,main,node}=harness();vm.runInContext('renderAdmin()',context);
  assert.match(main.innerHTML,/data-action="anime-select-start"[^>]*>Chọn/);
  assert.match(main.innerHTML,/data-select-anime="anime"/);
  await vm.runInContext('handleAction("anime-select-start")',context);
  await vm.runInContext('handleAction("anime-select-all")',context);
  assert.equal(node('#anime-selection-count').textContent,'1 phim đã chọn');
  await vm.runInContext('handleAction("anime-select-cancel")',context);
  assert.equal(node('#anime-selection-count').textContent,'0 phim đã chọn');
});
test('Anime status is below the year and song count in its own row',()=>{
  const {context,main}=harness();vm.runInContext('renderAdmin()',context);
  assert.match(main.innerHTML,/class="card-meta">[\s\S]*?class="song-publication-summary"[\s\S]*?<\/div><div class="card-status">/);
  assert.match(main.innerHTML,/data-action="filter-anime"/);
});
test('Filtering songs keeps editor markup intact and select-all only selects matching songs',async()=>{
  const {context,main,node}=harness();vm.runInContext('published=[entries[0],entries[1]];renderAlbum(entries[0]);',context);
  const original=main.innerHTML;
  await vm.runInContext('handleAction("filter-song","draft")',context);
  assert.equal(main.innerHTML,original);
  assert.equal(node('#song-filter-count').textContent,'1/2 bài hát');
  await vm.runInContext('handleAction("batch-start");handleAction("batch-select-all")',context);
  assert.deepEqual([...vm.runInContext('selectedSongIds',context)],['s2']);
  await vm.runInContext('handleAction("filter-song","published")',context);
  assert.equal(vm.runInContext('selectedSongIds.size',context),0);
  await vm.runInContext('handleAction("batch-select-all")',context);
  assert.deepEqual([...vm.runInContext('selectedSongIds',context)],['s1']);
});
test('Quick toggle asks before hiding a film with public songs and uses the unpublish action',async()=>{
  const {context}=harness();const calls=[];
  context.mockStore={configured:true,unpublish:async id=>calls.push(id),listPublic:async()=>[]};context.setTimeout=()=>0;context.confirm=()=>false;
  vm.runInContext('store=mockStore;published=[entries[0],entries[1]];',context);
  await vm.runInContext('toggleEntryPublication("anime")',context);assert.deepEqual(calls,[]);
  context.confirm=()=>true;await vm.runInContext('toggleEntryPublication("anime")',context);assert.deepEqual(calls,['anime']);
});
test('Context switch stays off and disabled if the parent film is private, and fits the viewport',()=>{
  const {context}=harness();let menu;
  context.document.createElement=()=>menu={style:{},setAttribute(){},getBoundingClientRect:()=>({width:265,height:145}),querySelector:()=>null};
  context.document.body={append(){}};context.window.innerWidth=800;context.window.innerHeight=600;
  vm.runInContext('openEntryContextMenu(entries[1],790,590,null)',context);
  assert.match(menu.innerHTML,/role="menuitemcheckbox" aria-checked="false"[^>]*disabled/);
  assert.equal(menu.style.left,'525px');assert.equal(menu.style.top,'445px');
});

test('Admin cards show child publication counts without additional controls',()=>{
  const {context,main}=harness();
  vm.runInContext('published=[entries[0],entries[1],entries[3]];renderAdmin()',context);
  assert.match(main.innerHTML,/1\/2 bài đã xuất bản/);
  assert.match(main.innerHTML,/Còn 1 bài nháp/);
  assert.doesNotMatch(main.innerHTML,/<button[^>]*class="song-(?:progress|drafts)"/);
  vm.runInContext('published=[entries[0],entries[1],entries[2]];renderAdmin()',context);
  assert.match(main.innerHTML,/2\/2 bài đã xuất bản/);
  assert.doesNotMatch(main.innerHTML,/Còn \d+ bài nháp/);
});

test('Logout is separate in the header and only visible in signed-in management',()=>{
  const {context,main,node}=harness();
  vm.runInContext('store={configured:true,signedIn:true};renderAdmin()',context);
  assert.equal(node('#admin-logout').hidden,false);
  assert.doesNotMatch(main.innerHTML,/data-action="logout"/);
  assert.match(main.innerHTML,/Dữ liệu <span/);
  assert.match(main.innerHTML,/data-action="import"/);
  assert.match(main.innerHTML,/data-action="export"/);
  vm.runInContext('syncAdminLogout(false)',context);
  assert.equal(node('#admin-logout').hidden,true);
  vm.runInContext('store.signedIn=false;syncAdminLogout(true)',context);
  assert.equal(node('#admin-logout').hidden,true);
});
test('Management search matches all three title variants without a language selector',()=>{
  const {context,main,node}=harness();
  context.entries[0].data.titles={romaji:'Sousou no Frieren',english:'Frieren: Beyond Journey End',native:'葬送のフリーレン'};
  context.setTimeout=()=>0;
  vm.runInContext('renderAdmin()',context);
  assert.doesNotMatch(main.innerHTML,/id="title-language"/);
  for(const term of ['Sousou','Beyond Journey','葬送']){
    node('#anilist-search').value=term;
    node('#anilist-search').listeners.input();
    assert.match(node('#local-anime-matches').innerHTML,/data-id="anime"/);
  }
  context.media={id:12,title:context.entries[0].data.titles,coverImage:{}};
  vm.runInContext('currentMedia=[media];renderResults()',context);
  for(const title of Object.values(context.media.title))assert.ok(node('#anime-results').innerHTML.includes(title));
});

test('Song navigation groups metadata by season with independent type numbering and artists',()=>{
  const {context,main}=harness();
  const anime={...series,id:'sousou-no-frieren',data:{...series.data,vietnamese:'Pháp Sư Tiễn Táng Frieren'}};
  const rows=[
    ['OP','01_season-1','Opening 1','YOASOBI'],['OP','01_season-1','Opening 2','YOASOBI'],
    ['ED','01_season-1','Ending 1','milet'],['ED','01_season-1','Ending 2','milet'],
    ['INS','02_season-2','Insert song 1','Evan Call'],['INS','02_season-2','Insert song 2','Evan Call'],['INS','02_season-2','Insert song 3','Evan Call'],['INS','02_season-2','Insert song 4','Evan Call'],
    ['MV','99_misc','Music video 1','YOASOBI'],['MV','99_misc','Music video 2','YOASOBI'],['MV','99_misc','Music video 3','YOASOBI'],
  ].map(([type,group,title,artist],index)=>({id:`song-${index}`,kind:'song',parent_id:anime.id,data:{type,group,title,artist,body:''}}));
  context.entries=[anime,...rows];
  vm.runInContext('published=entries;renderDetail("sousou-no-frieren")',context);
  const toc=main.innerHTML.split('<aside')[1];
  assert.equal((toc.match(/class="toc-group"/g)||[]).length,3);
  assert.match(toc,/Pháp Sư Tiễn Táng Frieren – Mùa 01/);
  assert.match(toc,/Pháp Sư Tiễn Táng Frieren – Mùa 02/);
  assert.match(toc,/Music Video/);
  for(const code of ['OP1','OP2','ED1','ED2','MV1','MV2','MV3'])assert.ok(toc.includes('>'+code+'</span>'));
  assert.match(toc,/class="toc-artist">YOASOBI/);
  assert.equal((toc.match(/class="toc-song"/g)||[]).length,11);
  assert.doesNotMatch(toc.replace(/href="[^"]*"/g,''),/01_season-1|99_misc/);
});
test('Navigation preserves custom group titles and escapes song metadata',()=>{
  const {context}=harness();
  context.custom=[{id:'song a',data:{group:'Buổi diễn đặc biệt',type:'INS',title:'<b>Song</b>',artist:'A & B'}}];
  const html=vm.runInContext('songTOCHTML(custom,{title:"Anime"})',context);
  assert.match(html,/Buổi diễn đặc biệt/);
  assert.match(html,/&lt;b&gt;Song&lt;\/b&gt;/);
  assert.match(html,/A &amp; B/);
  assert.match(html,/#song-song%2520a/);
});

test('Every TOC URL resolves to its song DOM id after browser fragment decoding',()=>{
  const {context}=harness();
  for(const id of ['plain-id','frieren/01_season-1/01_yuusha','bài hát / 100% #test']){
    context.song={id,data:{title:'Test',type:'OP',group:'Season',body:''}};
    const article=vm.runInContext('songHTML(song)',context);
    const toc=vm.runInContext('songTOCHTML([song],{title:"Anime"})',context);
    const domId=article.match(/id="([^"]+)"/)[1];
    const fragment=toc.match(/href="#([^"]+)"/)[1];
    assert.equal(decodeURIComponent(fragment),domId);
  }
});

test('Moving between song fragments leaves the rendered page intact without fetching',()=>{
  const {context,main}=harness();
  context.location.pathname='/rainei-lyrics-list/';context.location.search='?series=anime';
  vm.runInContext('published=entries;renderDetail("anime")',context);
  const html=main.innerHTML;let calls=0;context.recordRoute=()=>calls++;
  vm.runInContext('route=recordRoute',context);
  context.location.hash='#song-s2';vm.runInContext('handleHistoryNavigation()',context);
  assert.equal(calls,0);assert.equal(main.innerHTML,html);
  context.location.hash='#song-s1';vm.runInContext('handleHistoryNavigation()',context);
  assert.equal(calls,0);
  context.location.search='';vm.runInContext('handleHistoryNavigation()',context);
  assert.equal(calls,1);
});
