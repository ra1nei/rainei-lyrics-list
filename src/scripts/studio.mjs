import { createAniListClient, selectedAnime, animeFormatLabel, ANIME_FORMATS, withAnimeFormats } from '../lib/anilist.mjs';
import { createStore, normalize } from '../lib/store.mjs';
import { micromark } from 'micromark';
import { mergeAlbumRows, compareAlbumSongs } from '../lib/album.mjs';
import { filterByPublication } from '../lib/publication.mjs';
import { getKara, searchKara, mediaURL, lyricsURL, mediaKind, fetchKaraAss, karaArtist, karaSongType, resultTitle } from '../lib/kara-api.mjs';
import JASSUB from 'jassub';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import wasmWorkerUrl from 'jassub/dist/wasm/jassub-worker.js?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import modernWasmWorkerUrl from 'jassub/dist/wasm/jassub-worker-modern.js?url';
import defaultFontUrl from 'jassub/dist/default.woff2?url';
import '../styles/admin.css';
import '../styles/admin-width.css';
import '../styles/colors.css';
import '../styles/font.css';
import '../styles/songs.css';
import '../styles/actions.css';
import '../styles/toolbar.css';
import '../styles/publication.css';
import '../styles/context-menu.css';
import '../styles/toc.css';
import '../styles/detail.css';
import '../styles/card-titles.css';
import '../styles/song-karaoke.css';
import './card-titles.mjs';

const app = document.querySelector('#app');
const main = document.querySelector('#main');
const base = app.dataset.base;
const $ = (selector) => main.querySelector(selector);
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const href = (params = {}) => { const query=new URLSearchParams(params).toString();return `${base}/${query?`?${query}`:''}`; };
const seriesHref = id => `${base}/series/${encodeURIComponent(id)}/`;
function seriesIdFromPath(pathname) {
  const prefix=`${base}/series/`;
  if(!pathname.startsWith(prefix))return null;
  const segment=pathname.slice(prefix.length).split('/')[0];
  if(!segment)return null;
  try{return decodeURIComponent(segment);}catch{return segment;}
}
const safeURL = value => { if(!value)return ''; try { const u = new URL(value, location.origin); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const image = (url, alt = '', cls = '') => `<img src="${esc(safeURL(url))}" alt="${esc(alt)}" class="${cls}" loading="lazy" onerror="this.hidden=true"/>`;
const button = (text, action, id = '', cls = '') => `<button type="button" class="btn ${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
const field = (label, name, value = '', extra = '') => `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${extra}/></label>`;
const countSongs = id => published.filter(e => e.kind === 'song' && e.parent_id === id).length;
const songCountHTML = count => `<span class="song-count"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></svg><span>${count} bài hát</span></span>`;
const cardTitlesHTML = data => `<h3 class="card-title-line" title="${esc(data.title)}"><span class="card-title-text">${esc(data.title)}</span></h3><p class="card-title-line" title="${esc(data.vietnamese||data.titles?.native||'')}"><span class="card-title-text">${esc(data.vietnamese||data.titles?.native||'')}</span></p>`;
const songPublicationSummaryHTML = songs => {
  const publicIds = new Set(published.filter(e => e.kind === 'song').map(e => e.id));
  const live = songs.filter(song => publicIds.has(song.id)).length;
  const remaining = songs.length - live;
  return songs.length ? `<div class="song-publication-summary"><span class="song-progress">${live}/${songs.length} bài đã xuất bản</span>${remaining ? `<span class="song-drafts">Còn ${remaining} bài nháp</span>` : ''}</div>` : '<div class="song-publication-summary">Chưa có bài hát</div>';
};
let store, published = [], drafts = [], current = null, dirty = false, actionPending = false;
let albumSeriesId = null, albumRows = [], animeDirty = false, songsDirty = false;
const songRenderers = new Map();
async function destroySongRenderers() {
  const engines=[...songRenderers.values()];songRenderers.clear();
  await Promise.all(engines.map(async engine=>{try{await engine.destroy();}catch{/* Renderer may already be disposed. */}}));
}
function songFrame(video) { return { expectedDisplayTime: performance.now(), width: video.videoWidth||1920, height: video.videoHeight||1080, mediaTime: video.currentTime||0 }; }
async function renderSongAss(block, track, recreate=false) {
  const video=block.querySelector('.song-preview-video'), id=block.dataset.songId;
  if(!track||!video.videoWidth)return;
  try {
    let engine=songRenderers.get(id);
    if(!engine||recreate){if(engine){songRenderers.delete(id);await engine.destroy();}engine=new JASSUB({video,subContent:track,workerUrl,wasmUrl,wasmWorkerUrl,modernWasmUrl,modernWasmWorkerUrl,availableFonts:{'liberation sans':defaultFontUrl},libassMemoryLimit:128,libassGlyphLimit:5000});songRenderers.set(id,engine);await engine.ready;}
    else await engine.renderer.setTrack(track);
    await engine.manualRender(songFrame(video),true);
    block.querySelector('.song-render-status').textContent='ASS đang render trực tiếp';
  } catch(error) { block.querySelector('.song-render-status').textContent=`Render lỗi: ${error.message||'không khởi động được libass'}`; }
}
function syncEditorDirty() { dirty = animeDirty || songsDirty; }
function songsHaveChanges(rows) {
  const editable=data=>['title','artist','type','group','order','video','karaKid','body'].map(key=>key==='order'?(data[key]==null||data[key]===''?'':String(Number(data[key]))):String(data[key]??(key==='type'?'MISC':'')).replace(/\r\n?/g,'\n'));
  return rows.some(row=>{const saved=drafts.find(entry=>entry.id===row.id);return !saved||JSON.stringify(editable(saved.data))!==JSON.stringify(editable(row.data));});
}
let publishSelectionMode = false, selectionSeriesId = null, selectedSongIds = new Set();
let animeSelectionMode = false, selectedAnimeIds = new Set();
const openPublicationGroups = { anime: new Set(['published','draft']), song: new Set(['published','draft']) };
let contextReturnFocus = null;
let filterKind = 'series', viewMode = 'grid', currentMedia = [], searchPage = 1, searchTerm = '', searchController, searchTimer, searchVersion = 0, routeVersion = 0;
let renderedRouteKey = '';
const searchAnime = createAniListClient();
async function loadPublicEntries() { return withAnimeFormats(await store.listPublic(),searchAnime,AbortSignal.timeout(4000)); }
async function loadDraftEntries() { return withAnimeFormats(await store.listDrafts(),searchAnime,AbortSignal.timeout(4000)); }
function notice(message, error = false) { const el = document.querySelector('#notice'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => { el.hidden = true; }, error ? 9000 : 4500); }
async function task(fn) { if(actionPending)return;actionPending=true;const buttons = [...main.querySelectorAll('button')].map(button => [button, button.disabled]); buttons.forEach(([button]) => button.disabled = true); try { await fn(); } catch (error) { notice(error.message || 'Đã xảy ra lỗi.', true); } finally { actionPending=false;buttons.forEach(([button, disabled]) => button.disabled = disabled);if($('#album-form'))syncPublishSelection();if($('.anime-bulk-actions'))syncAnimeSelection(); } }
function status(entry) { const p = published.find(e => e.id === entry.id); return p ? (JSON.stringify(p.data) === JSON.stringify(entry.data) ? ['live', 'Đã xuất bản'] : ['draft', 'Có bản sửa nháp']) : ['draft', 'Bản nháp']; }
function syncAdminLogout(inAdmin) {
  const logout = document.querySelector('#admin-logout');
  if (logout) logout.hidden = !(inAdmin && store?.signedIn);
}
function shell(content) {
  void destroySongRenderers();
  syncAdminLogout(true);
  clearTimeout(searchTimer); searchController?.abort(); searchVersion++; currentMedia=[];
  main.innerHTML = '<section class="admin-workspace">' + adminSearchHTML() + '<div class="admin-content">' + content + '</div></section>';
  bindAdminSearch();
}
function adminSearchHTML() {
  return `<section class="admin-search-sticky" aria-label="Tìm anime"><div class="admin-search-bar"><div class="search"><span class="search-icon">⌕</span><input id="anilist-search" type="search" placeholder="Tìm anime để mở hoặc thêm từ AniList…" aria-label="Tìm anime để mở hoặc thêm từ AniList" aria-controls="anilist-dropdown" aria-expanded="false" autocomplete="off"/></div></div><div id="anilist-dropdown" class="anilist-dropdown panel" hidden><div class="section-head"><span class="eyebrow">KẾT QUẢ TÌM KIẾM</span>${button('Đóng','close-search','','small')}</div><div id="local-anime-matches"></div><p id="search-status" class="muted" role="status" aria-live="polite"></p><div id="anime-results" class="results"></div>${button('Xem thêm kết quả','more-results','','small')}</div></section>`;
}
function closeAdminSearch() {
  clearTimeout(searchTimer); searchController?.abort(); searchVersion++;
  if($('#anilist-dropdown')) $('#anilist-dropdown').hidden=true;
  $('#anilist-search')?.setAttribute('aria-expanded','false');
}
function bindAdminSearch() {
  $('[data-action="more-results"]').hidden=true;
  const input=$('#anilist-search');
  input.addEventListener('input',()=>{
    clearTimeout(searchTimer); searchController?.abort(); searchVersion++;
    const q=normalize(input.value.trim());
    $('#anilist-dropdown').hidden=!q;input.setAttribute('aria-expanded',String(Boolean(q)));
    $('#anime-results').innerHTML='';currentMedia=[];
    $('[data-action="more-results"]').hidden=true;
    const matches=drafts.filter(e=>e.kind==='series'&&normalize([e.data.title,e.data.vietnamese,...Object.values(e.data.titles||{})].join(' ')).includes(q));
    $('#local-anime-matches').innerHTML=q&&matches.length?'<p class="suggestion-label">Trong thư viện của bạn</p>'+matches.slice(0,6).map(e=>`<button type="button" class="local-match" data-action="open-anime" data-id="${esc(e.id)}">${image(e.data.cover,e.data.title)}<span>${esc(e.data.title)}</span><small>Mở anime →</small></button>`).join(''):'';
    $('#search-status').textContent=q?'Đang tìm trên AniList…':'';
    if(q) searchTimer=setTimeout(()=>runSearch(false),650);
  });
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);runSearch(false);}
    if(e.key==='Escape'){closeAdminSearch();}
    if(e.key==='ArrowDown'){const first=$('#anilist-dropdown button.local-match, #anime-results button');if(first){e.preventDefault();first.focus();}}
  });
  $('#anilist-dropdown').addEventListener('keydown',e=>{if(e.key==='Escape'){closeAdminSearch();input.focus();}});
}
function closeEntryContextMenu(restoreFocus=false) {
  document.querySelector('#entry-context-menu')?.remove?.();
  if(restoreFocus)contextReturnFocus?.focus?.();
  contextReturnFocus=null;
}
function openEntryContextMenu(entry,x,y,focusTarget) {
  closeEntryContextMenu();contextReturnFocus=focusTarget;
  const live=published.some(e=>e.id===entry.id);
  const parentMissing=entry.kind==='song'&&!live&&!published.some(e=>e.id===entry.parent_id&&e.kind==='series');
  const menu=document.createElement('div');menu.id='entry-context-menu';menu.className='entry-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Xuất bản nhanh');
  menu.innerHTML=`<div class="entry-context-title">${esc(entry.data.title||'Bài hát mới')}</div><button type="button" class="entry-context-toggle" role="menuitemcheckbox" aria-checked="${live}" data-context-toggle="${esc(entry.id)}" ${parentMissing?'disabled':''}><span class="entry-context-label">Công khai<small>${live?'Đang bật':'Đang tắt'}</small></span><span class="publication-switch" aria-hidden="true"></span></button>${parentMissing?'<p class="entry-context-hint">Cần xuất bản phim trước để công khai bài hát.</p>':''}`;
  document.body.append(menu);
  const rect=menu.getBoundingClientRect();
  menu.style.left=`${Math.max(10,Math.min(x,window.innerWidth-rect.width-10))}px`;
  menu.style.top=`${Math.max(10,Math.min(y,window.innerHeight-rect.height-10))}px`;
  menu.querySelector('button:not(:disabled)')?.focus();
}
async function toggleEntryPublication(id) {
  const entry=[...albumRows,...drafts].find(e=>e.id===id);
  if(!entry)throw new Error('Không tìm thấy nội dung.');
  const live=published.some(e=>e.id===id);
  if(entry.kind==='series'){
    const children=published.filter(e=>e.parent_id===id).length;
    if(live&&children&&!confirm(`Gỡ xuất bản phim này sẽ ẩn cả ${children} bài hát bên trong. Tiếp tục?`))return;
    if(live)await store.unpublish(id);else await store.publish(id);
    published=await loadPublicEntries();renderAdmin(true);
  }else{
    if(!live){
      if(!published.some(e=>e.id===entry.parent_id&&e.kind==='series'))throw new Error('Cần xuất bản phim trước khi công khai bài hát.');
      await saveSingleAlbumSong(id);
    }
    const pending=readAlbum(false),wasDirty=songsDirty,openIds=openSongIds(),anime=current;
    if(live)await store.unpublish(id);else await store.publish(id);
    published=await loadPublicEntries();renderAlbum(anime,pending,openIds);songsDirty=wasDirty;syncEditorDirty();
    $('#album-save-state').textContent=wasDirty?'Còn thay đổi chưa lưu ở bài khác':`${albumRows.length} bài hát`;
  }
  notice(live?'Đã tắt công khai. Bản nháp vẫn được giữ.':'Đã bật công khai.');
}
function renderLibrary() {
  main.innerHTML = `<section class="hero"><p class="muted">Tổng hợp lời Việt hoá các bài hát do mình thực hiện.</p></section><div class="toolbar"><div class="search"><span class="search-icon">⌕</span><input id="library-search" type="search" aria-label="Tìm phim, bài hát hoặc nghệ sĩ" placeholder="Tìm phim, bài hát hoặc nghệ sĩ…"/></div>${button(viewMode==='grid'?'☷ Danh sách':'▦ Lưới', 'toggle-view')}</div><div class="section-head"><h2>Thư viện phim</h2></div><div id="library-grid" class="grid ${viewMode==='list'?'list-view':''}"></div>`;
  $('#library-search').addEventListener('input', filterLibrary);
  filterLibrary();
}
function filterLibrary() {
  const q = normalize($('#library-search').value);
  let list = published.filter(e => e.kind === 'series');
  list = list.filter(e => normalize([e.data.title, e.data.vietnamese, ...Object.values(e.data.titles||{}), ...published.filter(s=>s.parent_id===e.id).flatMap(s=>[s.data.title,s.data.artist])].join(' ')).includes(q));
  list.sort((a,b) => a.data.title.localeCompare(b.data.title));
  $('#library-grid').innerHTML = list.length ? list.map(e=>`<article class="card"><a href="${seriesHref(e.id)}"><div class="poster">${image(e.data.cover,e.data.title)}</div><div>${cardTitlesHTML(e.data)}<div class="card-meta"><span>${esc(e.data.year||'—')}</span>${songCountHTML(countSongs(e.id))}${e.data.format&&e.data.format!=='ANIME'?'<span>·</span><span>'+esc(animeFormatLabel(e.data.format))+'</span>':''}</div></div></a></article>`).join('') : '<div class="empty">Chưa có phim phù hợp. Thử đổi từ khoá.</div>';
}
function songAnchorBase(entry) {
  const tail=String(entry.id||'song').split('/').at(-1);
  const slug=tail.replace(/^\d+[_-]*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug||'untitled';
}
function songAnchorId(entry, songs=[]) {
  const used=new Set();
  for(const song of songs.length?songs:[entry]){
    const base=songAnchorBase(song);let candidate=base,suffix=2;
    while(used.has(candidate))candidate=`${base}-${suffix++}`;
    used.add(candidate);
    if(song.id===entry.id)return candidate;
  }
  return songAnchorBase(entry);
}
function songHTML(entry, songs=[]) {
  const d=entry.data;
  return `<article class="song panel" id="${songAnchorId(entry,songs)}"><header class="song-heading"><div class="song-title-row"><span class="badge song-type">${esc(d.type||'MISC')}</span><h2>${esc(d.title)}</h2></div>${d.artist?`<p class="song-artist">— ${esc(d.artist)}</p>`:''}</header>${d.video&&safeURL(d.video)?`<video controls playsinline preload="none" src="${esc(safeURL(d.video))}"></video>`:''}<div class="song-lyrics-row"><div class="lyrics">${micromark(d.body||'', {allowDangerousHtml:false,allowDangerousProtocol:false})}</div><button type="button" class="copy-lyrics" data-action="copy" data-id="${esc(entry.id)}" aria-label="Sao chép lời" title="Sao chép lời"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button></div></article>`;
}
function songTOCHTML(songs, series) {
  const groups = new Map();
  for (const song of songs) {
    const key = String(song.data.group || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(song);
  }
  const seriesTitle = series.vietnamese || series.title;
  return [...groups].map(([key, rows], index) => {
    const clean = key.replace(/^\d+_/, '');
    const season = clean.match(/^season[-_ ]*(\d+)$/i);
    const label = season ? seriesTitle + ' – Mùa ' + season[1].padStart(2, '0')
      : /^movie$/i.test(clean) ? seriesTitle + ' – Phim điện ảnh'
      : !clean || /^misc$/i.test(clean) ? (rows.every(song => song.data.type === 'MV') ? 'Music Video' : 'Bài hát khác') : clean;
    const totals = {}, counts = {};
    for (const song of rows) { const type = song.data.type || 'MISC'; totals[type] = (totals[type] || 0) + 1; }
    return `<section class="toc-group" aria-labelledby="toc-group-${index}"><h3 id="toc-group-${index}">${esc(label)}</h3><div class="toc-tracks">${rows.map(song => {
      const type = song.data.type || 'MISC'; counts[type] = (counts[type] || 0) + 1;
      const code = type + (totals[type] > 1 && ['OP','ED','MV'].includes(type) ? counts[type] : '');
      return `<a class="toc-song" href="#${songAnchorId(song,songs)}"><span class="toc-type">${esc(code)}</span><span class="toc-song-info"><span class="toc-song-title">${esc(song.data.title)}</span>${song.data.artist ? `<span class="toc-artist">${esc(song.data.artist)}</span>` : ''}</span></a>`;
    }).join('')}</div></section>`;
  }).join('');
}
function renderDetail(id, preview = false) {
  renderedRouteKey = location.pathname + location.search;
  const source=preview?drafts:published;
  const entry=source.find(e=>e.id===id&&e.kind==='series');
  if(!entry){main.innerHTML=`<div class="empty"><h2>Phim chưa được xuất bản</h2><p>Nội dung này chưa có hoặc đã được gỡ xuất bản.</p><a class="btn" href="${href()}">Về thư viện</a></div>`;return;}
  const songs=source.filter(e=>e.kind==='song'&&e.parent_id===id).sort(compareAlbumSongs);
  const d=entry.data;
  document.title=`${d.title} · Rainei`;
  main.innerHTML=`${preview?'<div class="preview-label">Xem trước bản nháp · Chỉ quản trị viên đang đăng nhập được xem.</div>':''}<div class="detail-header">${image(d.cover,d.title)}<div><span class="eyebrow">${[animeFormatLabel(d.format),d.year].filter(Boolean).map(esc).join(' · ')}</span><h1>${esc(d.title)}</h1>${d.vietnamese?`<p class="muted detail-vietnamese">${esc(d.vietnamese)}</p>`:''}${d.titles?.native?`<p class="muted detail-native">${esc(d.titles.native)}</p>`:''}${d.sourceUrl?`<a class="link" href="${esc(safeURL(d.sourceUrl))}" target="_blank" rel="noopener noreferrer">Xem trên AniList ↗</a>`:''}</div></div><div class="detail-layout"><section>${songs.map(song=>songHTML(song,songs)).join('')||'<div class="panel empty">Chưa có bài hát.</div>'}</section><aside class="detail-sidebar"><a class="back detail-back" href="${preview?href({view:'admin'}):href()}">← ${preview?'Về quản lý':'Thư viện phim'}</a><nav class="toc panel" aria-label="Danh sách bài hát"><h2 class="eyebrow toc-heading">DANH SÁCH BÀI</h2>${songTOCHTML(songs,d)}</nav></aside></div>`;
}
function renderLogin() {
  syncAdminLogout(false);
  main.innerHTML=`<section class="panel login"><span class="eyebrow">ĐĂNG NHẬP QUẢN LÝ</span><h1>Chào bạn trở lại.</h1><p class="muted">Đăng nhập để thêm phim và quản lý nội dung.</p><form id="login-form">${field('Email','email','','type="email" required autocomplete="username"')}${field('Mật khẩu','password','','type="password" required autocomplete="current-password"')}<button class="btn primary" type="submit">Đăng nhập</button></form></section>`;
  $('#login-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{const data=new FormData(e.target);await store.login(data.get('email'),data.get('password'));await loadAdmin();});});
}
async function loadAdmin() {
  if(!store.signedIn){renderLogin();return;}
  drafts=await loadDraftEntries();
  renderAdmin();
}
function visiblePublicationEntries(entries, scope) {
  const ids = new Set(published.map(entry => entry.id));
  return entries.filter(entry => openPublicationGroups[scope].has(ids.has(entry.id) ? 'published' : 'draft'));
}
function visibleAnimeEntries() { return visiblePublicationEntries(drafts.filter(e=>e.kind==='series'),'anime'); }
function visibleSongEntries() { return visiblePublicationEntries(albumRows,'song'); }
function publicationGroupsHTML(scope, entries, renderEntry, listClass) {
  return ['published','draft'].map(state => {
    const rows = filterByPublication(entries,published,state);
    const label = state==='published' ? 'Đã xuất bản' : 'Chưa xuất bản';
    return `<details class="publication-group publication-${state}" data-publication-scope="${scope}" data-publication-state="${state}" ${openPublicationGroups[scope].has(state)?'open':''}><summary class="publication-group-heading"><span>${label}</span><span class="publication-group-count">${rows.length} ${scope==='anime'?'phim':'bài hát'}</span><span class="publication-group-chevron" aria-hidden="true">⌄</span></summary><div class="${listClass}">${rows.map(renderEntry).join('')||'<p class="empty">Chưa có '+(scope==='anime'?'phim':'bài hát')+' trong nhóm này.</p>'}</div></details>`;
  }).join('');
}
function bindPublicationGroups(scope) {
  main.querySelectorAll(`[data-publication-scope="${scope}"]`).forEach(group => group.addEventListener('toggle',()=>{
    const state=group.dataset.publicationState;
    if(group.open)openPublicationGroups[scope].add(state);else openPublicationGroups[scope].delete(state);
    if(scope==='anime')syncAnimeSelection();else syncPublishSelection();
  }));
}
function animeCardHTML(e) {
  const s=status(e),songs=drafts.filter(song=>song.kind==='song'&&song.parent_id===e.id);
  return `<article class="card" data-anime-id="${esc(e.id)}"><span class="anime-select-control"><input type="checkbox" data-select-anime="${esc(e.id)}" aria-label="Chọn phim ${esc(e.data.title)}"/></span><button type="button" class="anime-entry-button" data-action="open-anime" data-id="${esc(e.id)}"><div class="poster">${image(e.data.cover,e.data.title)}</div>${cardTitlesHTML(e.data)}<div class="card-meta"><span>${esc(e.data.year||'—')}</span>${e.data.format&&animeFormatLabel(e.data.format)?`<span class="anime-format">${esc(animeFormatLabel(e.data.format))}</span>`:''}</div>${songPublicationSummaryHTML(songs)}<div class="card-status"><span class="badge ${published.some(p=>p.id===e.id)?'live':'draft'}" title="${esc(s[1])}">${published.some(p=>p.id===e.id)?'Đã xuất bản':'Nháp'}</span></div></button></article>`;
}
function renderAdmin(preserveSelection=false) {
  if(!preserveSelection){animeSelectionMode=false;selectedAnimeIds.clear();}
  publishSelectionMode=false;selectedSongIds.clear();selectionSeriesId=null;
  current=null;dirty=false;animeDirty=false;songsDirty=false;albumSeriesId=null;albumRows=[];
  const list=drafts.filter(e=>e.kind==='series').sort((a,b)=>a.data.title.localeCompare(b.data.title));
  shell(`<header class="admin-page-header"><h1>Quản lý phim</h1><details class="admin-options"><summary>Dữ liệu <span aria-hidden="true">⌄</span></summary><div class="admin-options-menu">${button('Nhập dữ liệu','import')}${button('Tải bản sao lưu','export')}</div></details></header>${animeSelectionToolbar()}${publicationGroupsHTML('anime',list,animeCardHTML,'grid admin-anime-grid')}`);
  bindPublicationGroups('anime');
  main.querySelectorAll('[data-select-anime]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked)selectedAnimeIds.add(input.dataset.selectAnime);else selectedAnimeIds.delete(input.dataset.selectAnime);
    syncAnimeSelection();
  }));
  syncAnimeSelection();
}
function animeSelectionToolbar() {
  const count=drafts.filter(e=>e.kind==='series').length;
  return `<div class="anime-bulk-actions"><div class="anime-selection-idle"><h2>Danh sách phim <span class="count-label">(${count})</span></h2>${button('Chọn','anime-select-start','','small')}</div><div class="anime-selection-tools"><span id="anime-selection-count" class="selection-count">0 phim đã chọn</span><div class="selection-options">${button('Chọn tất cả','anime-select-all','','small')}${button('Huỷ','anime-select-cancel','','small')}</div>${button('Xuất bản','anime-publish-selected','','primary')}</div></div>`;
}
function syncAnimeSelection() {
  const valid=new Set(visibleAnimeEntries().map(e=>e.id));
  for(const id of selectedAnimeIds)if(!valid.has(id))selectedAnimeIds.delete(id);
  main.querySelectorAll('.admin-anime-grid').forEach(grid=>grid.classList.toggle('anime-selecting',animeSelectionMode));
  $('.anime-bulk-actions').classList.toggle('selecting',animeSelectionMode);
  main.querySelectorAll('[data-select-anime]').forEach(input=>input.checked=selectedAnimeIds.has(input.dataset.selectAnime));
  main.querySelectorAll('[data-anime-id]').forEach(card=>card.classList.toggle('anime-selected',selectedAnimeIds.has(card.dataset.animeId)));
  $('#anime-selection-count').textContent=`${selectedAnimeIds.size} phim đã chọn`;
  $('[data-action="anime-select-all"]').textContent=selectedAnimeIds.size===valid.size&&valid.size?'Bỏ chọn tất cả':'Chọn tất cả';
  const publish=$('[data-action="anime-publish-selected"]');publish.textContent='Xuất bản';publish.disabled=!selectedAnimeIds.size;
}
function animeBreadcrumb(entry) {
  return `<div class="anime-breadcrumb">${button('← Tất cả phim','tab-series','','small')}<span>${esc(entry.data.title||'Phim mới')}</span></div>`;
}
async function runSearch(more) {
  if(!$('#anilist-search'))return;
  const term=$('#anilist-search').value.trim();
  $('#anilist-dropdown').hidden=false;$('#anilist-search').setAttribute('aria-expanded','true');
  if(term.length<2&&!/^\d$/.test(term)){ $('#search-status').textContent='Nhập ít nhất 2 ký tự.';$('#anime-results').innerHTML='';$('[data-action="more-results"]').hidden=true;return; }
  const version=++searchVersion;searchController?.abort();searchController=new AbortController();
  const page=more&&term===searchTerm?searchPage+1:1;
  $('#search-status').textContent='Đang tìm trên AniList…';
  try{
    const result=await searchAnime(term,page,searchController.signal);
    if(version!==searchVersion||!$('#anime-results'))return;
    currentMedia=page===1?result.media:[...currentMedia,...result.media];searchTerm=term;searchPage=page;
    renderResults();$('#search-status').textContent=currentMedia.length?`${currentMedia.length} kết quả · Kiểm tra năm và định dạng để chọn đúng phần phim.`:'Không có kết quả phù hợp.';
    $('[data-action="more-results"]').hidden=!result.hasNextPage;
  }catch(error){if(error.name!=='AbortError'&&version===searchVersion&&$('#search-status')){$('#search-status').textContent=error.message;}}
}
function renderResults() {
  const language='romaji';
  $('#anime-results').innerHTML=currentMedia.map(m=>{const d=selectedAnime(m,language);const duplicate=drafts.some(e=>e.kind==='series'&&Number(e.data.anilistId)===m.id);return `<button class="result" type="button" data-action="select-anime" data-id="${m.id}">${image(d.cover,d.title)}<span><strong>${esc(d.title)}</strong><small>${esc([...new Set(Object.values(m.title).filter(title=>title&&title!==d.title))].join(' · '))}</small><small>${esc(d.year||'Chưa có năm')} · ${esc(animeFormatLabel(d.format))} · #${m.id}</small><small>${duplicate?'Đã có trong thư viện → Mở chỉnh sửa':'Chọn phim này ↗'}</small></span></button>`;}).join('');
}
function animeFormatField(value='') {
  const code=String(value).toUpperCase().replaceAll(' ','_');
  const known=Object.hasOwn(ANIME_FORMATS,code);
  return `<label class="field">Định dạng<select name="format"><option value="" ${!value||value==='ANIME'?'selected':''}>Chưa có định dạng</option>${!known&&value&&value!=='ANIME'?`<option selected value="${esc(value)}">${esc(value)}</option>`:''}${Object.entries(ANIME_FORMATS).map(([key,label])=>`<option value="${key}" ${code===key?'selected':''}>${label}</option>`).join('')}</select><small>Mặc định từ AniList; có thể chọn lại.</small></label>`;
}
function animeEditorActions(entry) {
  const live=published.some(e=>e.id===entry.id),saved=drafts.some(e=>e.id===entry.id);
  return `<div class="anime-editor-actions"><div class="editor-action-main" role="group" aria-label="Xem và lưu nội dung">${button('Xem trước','preview-current',entry.id,'action-preview')}${live?'': '<button type="submit" class="btn">Lưu nháp</button>'}${button(live?'Cập nhật bản công khai':'Xuất bản','publish-current',entry.id,'primary')}</div>${live||saved?`<div class="editor-action-secondary" role="group" aria-label="Quản lý xuất bản và xoá">${live?button('Gỡ xuất bản','unpublish',entry.id,'action-unpublish'):''}${saved?button('Xoá phim','delete',entry.id,'danger action-delete'):''}</div>`:''}</div>`;
}
function animeInfoHTML(entry) {
  const d=entry.data;
  const state=drafts.some(e=>e.id===entry.id)?status(entry):['draft','Chưa lưu'];
  return `<section class="panel anime-info-panel" aria-labelledby="anime-info-heading"><div class="section-head"><h2 id="anime-info-heading">Thông tin phim</h2><span id="save-state" class="badge ${state[0]}">${state[1]}</span></div><form id="entry-form"><div class="editor-layout"><div>${image(d.cover,d.title,'editor-poster')}<p class="muted" style="font-size:11px">${d.anilistId?'Poster AniList · #'+d.anilistId:'Ảnh bìa anime'}</p></div><div class="form-grid">${field('Tên hiển thị','title',d.title,'required')}${field('Tên tiếng Việt (tuỳ chọn)','vietnamese',d.vietnamese)}</div></div>${animeEditorActions(entry)}</form></section>`;
}
function bindAnimeInfo() {
  $('#entry-form').addEventListener('input',()=>{animeDirty=true;syncEditorDirty();$('#save-state').textContent='Có thay đổi chưa lưu';});
  $('#entry-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{
    const pending=readAlbum(false),openIds=openSongIds();
    await saveCurrent();renderAlbum(current,pending,openIds);notice('Đã lưu bản nháp anime.');
  });});
  $('[name="titleLanguage"]').addEventListener('change',e=>{$('[name="title"]').value=current.data.titles?.[e.target.value]||current.data.titles?.romaji||current.data.title;animeDirty=true;syncEditorDirty();});
}
function renderEditor(entry) {
  animeDirty=false;songsDirty=false;
  renderAlbum(entry);
}
function rerenderCurrentAnime() {
  renderAlbum(current,readAlbum(false),openSongIds());
}
function openSongIds() {
  return new Set([...main.querySelectorAll('details[data-song-id][open]')].map(el=>el.dataset.songId));
}
function revealSong(id) {
  const block=[...main.querySelectorAll('[data-song-id]')].find(el=>el.dataset.songId===id);
  if(block){const group=block.closest?.('[data-publication-scope="song"]');if(group){group.open=true;openPublicationGroups.song.add(group.dataset.publicationState);}block.open=true;block.scrollIntoView({block:'center'});}
  return block;
}
function renderAlbum(entry, rows, openIds=new Set()) {
  if(selectionSeriesId!==entry.id){publishSelectionMode=false;selectedSongIds.clear();selectionSeriesId=entry.id;openPublicationGroups.song=new Set(['published','draft']);}
  const preserveAnime=animeDirty&&current?.id===entry.id;
  const pendingInfo=preserveAnime?Object.fromEntries(new FormData($('#entry-form'))):null;
  current=structuredClone(entry);if(pendingInfo)current.data={...current.data,...pendingInfo};
  animeDirty=preserveAnime;albumSeriesId=entry.id;
  albumRows=structuredClone(rows||drafts.filter(e=>e.kind==='song'&&e.parent_id===entry.id)).sort(compareAlbumSongs);
  songsDirty=Boolean(rows)&&songsHaveChanges(albumRows);syncEditorDirty();
  const saved=drafts.some(e=>e.id===entry.id);
  const parentPublished=published.some(e=>e.id===entry.id&&e.kind==='series');
  shell(animeBreadcrumb(current)+animeInfoHTML(current)+`<div class="section-head"><div><h2>Bài hát & lời <span class="count-label">(${albumRows.length})</span></h2><p class="muted">Chọn một bài để mở chỉnh sửa.</p></div><button type="button" class="btn primary" data-action="album-add" ${saved?'':'disabled'}>+ Thêm bài hát</button></div>${!saved?'<p class="muted">Lưu thông tin phim trước để thêm bài hát.</p>':''}<div id="album-form"><div class="album-savebar"><span id="album-save-state" role="status">${songsDirty?'Có thay đổi chưa lưu':albumRows.length+' bài hát'}</span>${publishSelectionToolbar(parentPublished&&albumRows.length)}</div>${!parentPublished?'<p class="publication-hint muted">Anime chưa công khai. Các bài vẫn lưu nháp được; xuất bản anime trước để công khai bài hát.</p>':''}${publicationGroupsHTML('song',albumRows,song=>songEditorHTML(song,albumRows.indexOf(song),openIds.has(song.id)),'album-song-list')}</div>`);
  bindAnimeInfo();
  if(animeDirty)$('#save-state').textContent='Có thay đổi chưa lưu';
  bindPublicationGroups('song');
  $('#album-form').addEventListener('input',e=>{
    if(e.target.matches('[data-select-song], .song-kara-search input, .song-ass-file'))return;
    songsDirty=true;syncEditorDirty();$('#album-save-state').textContent='Có thay đổi chưa lưu';
    const block=e.target.closest('[data-song-id]');
    if(block&&e.target.name==='title')block.querySelector('.song-summary-title').textContent=e.target.value||'Bài hát mới';
    if(block&&(e.target.name==='artist'||e.target.name==='type'))block.querySelector('.song-summary-info small').textContent=`${block.querySelector('[name="type"]').value}${block.querySelector('[name="artist"]').value?' · '+block.querySelector('[name="artist"]').value:''}`;
    if(block){const state=block.querySelector('.song-edit-state');if(state)state.textContent='Chưa lưu thay đổi';}
  });
  $('#album-form').addEventListener('submit',e=>{if(e.target.matches('.song-kara-search'))return;e.preventDefault();});
  bindSongKaraEditors();
  $('#album-form').addEventListener('change',e=>{
    if(e.target.matches('[data-select-song]')){
    if(e.target.checked)selectedSongIds.add(e.target.dataset.selectSong);else selectedSongIds.delete(e.target.dataset.selectSong);
    syncPublishSelection();
    return;
    }
    if(e.target.matches('.song-kara-search input, .song-ass-file'))return;
    if(e.target.closest('[data-song-id]')){songsDirty=true;syncEditorDirty();$('#album-save-state').textContent='Có thay đổi chưa lưu';}
  });
  syncPublishSelection();
}
function bindSongKaraEditors() {
  for(const block of main.querySelectorAll('details[data-song-id]')) {
    const searchForm=block.querySelector('.song-kara-search'), searchInput=searchForm.querySelector('input'), results=block.querySelector('.song-kara-results');
    let searchTimer=0,searchVersion=0;
    const runSearch=async()=>{
      const term=searchInput.value.trim(),version=++searchVersion;if(term.length<2)return;
      const statusEl=block.querySelector('.song-kara-status');statusEl.textContent='Đang tìm trên kara.moe…';results.hidden=true;
      try { const items=await searchKara(term);if(version!==searchVersion)return;results.innerHTML=items.slice(0,30).map(kara=>`<button type="button" class="song-kara-result" data-kid="${esc(kara.kid)}"><strong>${esc(resultTitle(kara))}</strong><small>${esc((kara.series||[]).map(x=>x.name).join(' · '))} · ${esc(karaSongType(kara))} · ${esc(karaArtist(kara)||'Chưa rõ nghệ sĩ')} · ${esc(mediaKind(kara.mediafile||''))}</small></button>`).join('')||'<p class="muted">Không tìm thấy kết quả phù hợp.</p>';results.hidden=false;statusEl.textContent=`${items.length} kết quả · chọn bài để liên kết video, nghệ sĩ và thể loại.`; }
      catch(error){results.hidden=false;results.innerHTML='<p class="muted">Tìm kiếm kara.moe thất bại. Kiểm tra kết nối rồi thử lại.</p>';statusEl.textContent=error.message||'Không kết nối được kara.moe.';}
    };
    searchForm.addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);void runSearch();});
    searchInput.addEventListener('input',()=>{clearTimeout(searchTimer);searchVersion++;if(searchInput.value.trim().length<2){results.hidden=true;block.querySelector('.song-kara-status').textContent='Nhập ít nhất 2 ký tự để tìm trên kara.moe.';return;}block.querySelector('.song-kara-status').textContent='';searchTimer=setTimeout(()=>void runSearch(),400);});
    searchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(searchTimer);void runSearch();}});
    results.addEventListener('click',event=>{const result=event.target.closest('[data-kid]');if(result)void selectKaraForSong(block,result.dataset.kid);});
    block.querySelector('.song-ass-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{await renderSongAss(block,await file.text(),true);}catch(error){block.querySelector('.song-render-status').textContent=error.message;}event.target.value='';});
    block.querySelector('.song-preview-video').addEventListener('seeked',()=>{const engine=songRenderers.get(block.dataset.songId);if(engine)void engine.manualRender(songFrame(block.querySelector('video')),true);});
    block.addEventListener('toggle',()=>{if(block.open&&block.querySelector('[name="karaKid"]').value&&!block.dataset.karaLoaded)void restoreSongKara(block);});
    if(block.open&&block.querySelector('[name="karaKid"]').value)void restoreSongKara(block);
  }
}
async function selectKaraForSong(block,kid) {
  const statusEl=block.querySelector('.song-kara-status');statusEl.textContent='Đang nạp video và thông tin bài…';
  try {
    const kara=await getKara(kid);if(!kara.mediafile||mediaKind(kara.mediafile)!=='video')throw new Error('Kết quả này không có video để preview.');
    block.querySelector('[name="video"]').value=mediaURL(kara.mediafile);block.querySelector('[name="karaKid"]').value=kara.kid;
    block.querySelector('[name="artist"]').value=karaArtist(kara);const type=karaSongType(kara),typeSelect=block.querySelector('[name="type"]');typeSelect.value=type;
    for(const input of [block.querySelector('[name="video"]'),block.querySelector('[name="karaKid"]'),block.querySelector('[name="artist"]'),typeSelect])input.dispatchEvent(new Event('input',{bubbles:true}));
    block.querySelector('.song-summary-info small').textContent=`${typeSelect.value}${karaArtist(kara)?' · '+karaArtist(kara):''}`;
    block.querySelector('.song-preview-empty').hidden=true;const video=block.querySelector('.song-preview-video');video.src=mediaURL(kara.mediafile);video.load();block.dataset.karaLoaded=kid;
    const ass=await fetchKaraAss(kara);const source=block.querySelector('.song-ass-source');if(ass.filename){source.href=lyricsURL(ass.filename);source.hidden=false;}
    statusEl.textContent=`${resultTitle(kara)} · ${kara.mediafile}`;
    await new Promise((resolve,reject)=>{if(video.readyState>=1)return resolve();video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('Trình duyệt không phát được video kara.moe.')),{once:true});});
    if(ass.content)await renderSongAss(block,ass.content,true);else block.querySelector('.song-render-status').textContent='Video sẵn sàng · bài này chưa có ASS mặc định; nạp file .ass của bạn.';
  } catch(error){statusEl.textContent=error.message||'Không thể nạp bài từ kara.moe.';}
}
async function restoreSongKara(block) {
  block.dataset.karaLoaded='loading';
  try{await selectKaraForSong(block,block.querySelector('[name="karaKid"]').value);}catch{/* Error is shown in the row status. */}
}
function publishSelectionToolbar(enabled) {
  return `<div class="batch-publish-actions">${button('Chọn','batch-start','','small batch-start')}<div class="batch-selection-tools"><span id="batch-selection-count" class="selection-count">0 bài đã chọn</span><div class="selection-options">${button('Chọn tất cả','batch-select-all','','small')}${button('Huỷ','batch-cancel','','small')}</div>${enabled?button('Xuất bản','album-publish-selected','','primary'):'<button type="button" class="btn primary" disabled title="Công khai phim trước để xuất bản bài hát">Xuất bản</button>'}</div></div>`;
}
function syncPublishSelection() {
  const ids=new Set(visibleSongEntries().map(e=>e.id));
  for(const id of selectedSongIds)if(!ids.has(id))selectedSongIds.delete(id);
  $('#album-form').classList.toggle('batch-selecting',publishSelectionMode);
  main.querySelectorAll('[data-select-song]').forEach(input=>input.checked=selectedSongIds.has(input.dataset.selectSong));
  main.querySelectorAll('[data-song-id]').forEach(block=>block.classList.toggle('batch-selected',selectedSongIds.has(block.dataset.songId)));
  const count=$('#batch-selection-count');if(count)count.textContent=`${selectedSongIds.size} bài đã chọn`;
  $('[data-action="batch-select-all"]').textContent=selectedSongIds.size===ids.size&&ids.size?'Bỏ chọn tất cả':'Chọn tất cả';
  const publish=$('[data-action="album-publish-selected"]');if(publish){publish.textContent='Xuất bản';publish.disabled=!selectedSongIds.size;}
}
function songEditorHTML(song,index,open=false) {
  const d=song.data,s=status(song),saved=drafts.some(e=>e.id===song.id);
  const isPublished=published.some(e=>e.id===song.id);
  const parentPublished=published.some(e=>e.id===song.parent_id&&e.kind==='series');
  const search=`<div class="field full song-kara-field"><span>Tìm video kara.moe</span><form class="song-kara-search"><div class="song-kara-searchbar"><input type="search" placeholder="Tên anime, OP/ED/insert hoặc tựa bài…" aria-label="Tìm video trên kara.moe"/><button type="submit" class="btn small song-kara-submit">Tìm</button></div></form><div class="song-kara-status muted" role="status">${d.karaKid?'Đã liên kết KID '+esc(d.karaKid):'Chọn kết quả để lấy video, nghệ sĩ và loại bài.'}</div><div class="song-kara-results" hidden></div></div>`;
  return `<details class="panel song-editor ${isPublished?'song-published':'song-unpublished'}" data-song-id="${esc(song.id)}" ${open?'open':''}><summary class="song-summary"><span class="song-select-control"><input type="checkbox" data-select-song="${esc(song.id)}" aria-label="Chọn bài ${esc(d.title||index+1)}" ${selectedSongIds.has(song.id)?'checked':''}/></span><span class="song-summary-index">${index+1}</span><span class="song-summary-info"><strong class="song-summary-title">${esc(d.title||'Bài hát mới')}</strong><small>${esc(d.type||'MISC')}${d.artist?' · '+esc(d.artist):''}</small></span><span class="song-summary-status"><span class="badge ${isPublished?'live':'draft'}">${isPublished?'Đã xuất bản':'Chưa xuất bản'}</span><small class="song-edit-state">${saved?(isPublished&&s[0]==='draft'?'Có bản sửa nháp':''):'Chưa lưu'}</small></span><span class="song-chevron" aria-hidden="true">⌄</span></summary><div class="song-editor-body"><div class="form-grid">${search}${field('Tên bài hát *','title',d.title,'required')}${field('Nghệ sĩ *','artist',d.artist,'required')}<label class="field">Loại bài *<select name="type" required>${['OP','ED','INS','MV','MISC'].map(t=>'<option '+((d.type||'MISC')===t?'selected':'')+'>'+t+'</option>').join('')}</select></label>${field('Mùa / nhóm *','group',d.group||'','required')}${field('Thứ tự (tuỳ chọn)','order',d.order??'','type="number" min="0" step="any" placeholder="Để trống: theo thứ tự thêm"')}<input type="hidden" name="video" value="${esc(d.video||'')}"/><input type="hidden" name="karaKid" value="${esc(d.karaKid||'')}"/><section class="song-preview-section field full"><div class="song-preview-head"><strong>Xem trước video + ASS</strong><label class="btn small song-ass-label">Nạp .ass<input type="file" accept=".ass,text/plain" class="song-ass-file" hidden/></label><a class="song-ass-source" hidden target="_blank" rel="noreferrer">Tải ASS gốc ↗</a></div><div class="song-preview-frame"><video class="song-preview-video" controls playsinline preload="metadata"></video><div class="song-preview-empty">Tìm và chọn video kara.moe để xem trước</div></div><small class="song-render-status muted">${d.karaKid?'Đang khôi phục video và ASS…':'Chờ video và phụ đề ASS'}</small></section><label class="field full">Lời bài hát<textarea name="body" spellcheck="false" rows="14" aria-label="Lời bài hát ${esc(d.title||index+1)}">\n${esc(d.body)}</textarea></label></div><div class="editor-footer">${isPublished?'':button('Lưu nháp bài này','album-save',song.id,'small')}${parentPublished?button(isPublished?'Cập nhật bản công khai':'Xuất bản bài này','album-publish',song.id,'small'):'<button type="button" class="btn small" disabled title="Xuất bản anime trước khi công khai bài hát">Xuất bản · Anime chưa công khai</button>'}${saved&&isPublished?button('Gỡ xuất bản','album-unpublish',song.id,'small'):''}${button('Xoá bài hát','album-delete',song.id,'small danger')}</div></div></details>`;
}function readAlbum(validate = true) {
  const rows=[...main.querySelectorAll('[data-song-id]')].map(block=>({id:block.dataset.songId,data:Object.fromEntries([...block.querySelectorAll('[name]')].map(input=>[input.name,input.value]))}));
  try { return mergeAlbumRows(albumSeriesId,albumRows,rows,{validate}); }
  catch(error){if(error.entryId)revealSong(error.entryId);throw error;}
}
function validateSongInputs(block) {
  for(const input of block.querySelectorAll('input, select, textarea')){
    if(!input.checkValidity()){revealSong(block.dataset.songId);input.reportValidity();throw new Error('Điền đủ 4 trường bắt buộc và kiểm tra thứ tự bài hát.');}
  }
}
async function saveSingleAlbumSong(id) {
  const block=[...main.querySelectorAll('[data-song-id]')].find(el=>el.dataset.songId===id);
  if(!block)throw new Error('Không tìm thấy bài hát đang sửa.');
  validateSongInputs(block);
  let pending=readAlbum(false);const entry=pending.find(song=>song.id===id);
  let validated;
  try { [validated]=mergeAlbumRows(albumSeriesId,albumRows,[entry]); }
  catch(error){revealSong(id);throw error;}
  await store.save(validated);drafts=await loadDraftEntries();
  const saved=drafts.find(e=>e.id===id);pending=pending.map(song=>song.id===id?saved:song);
  const otherChanges=songsHaveChanges(pending);
  const anime=drafts.find(e=>e.id===albumSeriesId),openIds=openSongIds();
  renderAlbum(anime,pending,openIds);songsDirty=otherChanges;syncEditorDirty();
  $('#album-save-state').textContent=otherChanges?'Đã lưu bài này; còn thay đổi ở bài khác':'Đã lưu bản nháp bài hát';
}
async function saveAlbum(ids = null) {
  const selected=ids?new Set(ids):null;
  for(const block of main.querySelectorAll('[data-song-id]'))if(!selected||selected.has(block.dataset.songId))validateSongInputs(block);
  let pending=readAlbum(false),entries;
  try{entries=mergeAlbumRows(albumSeriesId,albumRows,pending.filter(e=>!selected||selected.has(e.id)));}
  catch(error){if(error.entryId)revealSong(error.entryId);throw error;}
  const changed=entries.filter(entry=>songsHaveChanges([entry]));
  await store.saveMany(changed);drafts=await loadDraftEntries();
  const savedIds=new Set(entries.map(e=>e.id));
  pending=pending.map(e=>savedIds.has(e.id)?drafts.find(d=>d.id===e.id):e);
  const remainingChanges=songsHaveChanges(pending);
  const entry=drafts.find(e=>e.id===albumSeriesId),openIds=openSongIds();
  renderAlbum(entry,remainingChanges?pending:undefined,openIds);songsDirty=remainingChanges;syncEditorDirty();$('#album-save-state').textContent=remainingChanges?'Đã lưu các bài chọn; còn bài khác chưa lưu':'Đã lưu các thay đổi';
}

async function saveCurrent() {
  const form=$('#entry-form');if(!form.reportValidity())throw new Error('Kiểm tra lại các ô bắt buộc.');
  const values=Object.fromEntries(new FormData(form));
  const parent_id=values.parent_id;delete values.parent_id;
  for(const name of ['year','order']) if(name in values) values[name]=values[name]===''?'':Number(values[name]);
  const value={...current,parent_id:current.kind==='series'?null:parent_id,data:{...current.data,...values}};
  if(value.kind==='series'&&value.data.anilistId&&drafts.some(e=>e.id!==value.id&&e.kind==='series'&&Number(e.data.anilistId)===Number(value.data.anilistId)))throw new Error('Anime này đã có trong thư viện.');
  await store.save(value);drafts=await loadDraftEntries();current=drafts.find(e=>e.id===value.id);animeDirty=false;syncEditorDirty();$('#save-state').textContent='Đã lưu nháp';
}
function downloadJSON(value,name) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function handleAction(action,id) {
  if(action==='anime-select-start'){animeSelectionMode=true;syncAnimeSelection();return;}
  if(action==='anime-select-all'){const all=visibleAnimeEntries();if(selectedAnimeIds.size===all.length)selectedAnimeIds.clear();else all.forEach(e=>selectedAnimeIds.add(e.id));syncAnimeSelection();return;}
  if(action==='anime-select-clear'){selectedAnimeIds.clear();syncAnimeSelection();return;}
  if(action==='anime-select-cancel'){animeSelectionMode=false;selectedAnimeIds.clear();syncAnimeSelection();return;}
  if(action==='anime-publish-selected'){
    const ids=drafts.filter(e=>e.kind==='series'&&selectedAnimeIds.has(e.id)).map(e=>e.id);
    if(!ids.length)throw new Error('Chọn ít nhất một anime để xuất bản.');
    let done=0,failure=null;
    for(const animeId of ids){
      $('#anime-selection-count').textContent=`Đang xuất bản ${done+1}/${ids.length}…`;
      try{await store.publish(animeId);done++;selectedAnimeIds.delete(animeId);}catch(error){failure=error;break;}
    }
    published=await loadPublicEntries();renderAdmin(Boolean(failure));
    notice(failure?`Đã xuất bản ${done}/${ids.length} anime. ${failure.message}`:`Đã xuất bản ${done} phim đã chọn.`,Boolean(failure));return;
  }
  if(action==='batch-start'){publishSelectionMode=true;syncPublishSelection();return;}
  if(action==='batch-select-all'){const all=visibleSongEntries();if(selectedSongIds.size===all.length)selectedSongIds.clear();else all.forEach(e=>selectedSongIds.add(e.id));syncPublishSelection();return;}
  if(action==='batch-clear'){selectedSongIds.clear();syncPublishSelection();return;}
  if(action==='batch-cancel'){publishSelectionMode=false;selectedSongIds.clear();syncPublishSelection();return;}
  if(action==='album-publish-all'||action==='album-publish-selected'){
    if(!published.some(e=>e.id===albumSeriesId&&e.kind==='series'))throw new Error('Xuất bản anime trước khi xuất bản các bài hát.');
    const ids=albumRows.filter(e=>action==='album-publish-all'||selectedSongIds.has(e.id)).map(e=>e.id);
    if(!ids.length)throw new Error('Chọn ít nhất một bài hát để xuất bản.');
    await saveAlbum(ids);
    const openIds=openSongIds(),entry=current,pending=readAlbum(false),wasDirty=songsDirty;
    if(!ids.length)return;
    let done=0,failure=null;
    const controls=[...main.querySelectorAll('#album-form input, #album-form select, #album-form textarea, #album-form button')].map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true);
    try{
      for(const songId of ids){
        $('#album-save-state').textContent=`Đang xuất bản ${done+1}/${ids.length}…`;
        try{await store.publish(songId);done++;selectedSongIds.delete(songId);}catch(error){failure=error;break;}
      }
      published=await loadPublicEntries();if(!failure){publishSelectionMode=false;selectedSongIds.clear();}renderAlbum(entry,wasDirty?pending:undefined,openIds);songsDirty=wasDirty;syncEditorDirty();
    }finally{controls.forEach(([el,disabled])=>el.disabled=disabled);}
    notice(failure?`Đã xuất bản ${done}/${ids.length} bài. ${failure.message}`:`Đã xuất bản ${done} bài hát đã chọn.`,Boolean(failure));
    return;
  }
  if(action==='close-search'){closeAdminSearch();return;}
  if(action==='open-anime'&&animeSelectionMode){if(selectedAnimeIds.has(id))selectedAnimeIds.delete(id);else selectedAnimeIds.add(id);syncAnimeSelection();return;}
  if(action==='open-anime'){renderEditor(drafts.find(e=>e.id===id)||current);return;}
  if(action==='album-add'){
    const existing=readAlbum(false);const entry=drafts.find(e=>e.id===albumSeriesId);
    if(!entry)throw new Error('Lưu thông tin phim trước để thêm bài hát.');
    const added={id:crypto.randomUUID(),kind:'song',parent_id:entry.id,data:{title:'',artist:'',type:'OP',group:'Mùa 01',order:null,addedAt:new Date().toISOString(),body:''}};
    existing.push(added);
    renderAlbum(entry,existing,openSongIds());revealSong(added.id)?.querySelector('[name="title"]')?.focus();return;
  }
  if(action==='album-save'){await saveSingleAlbumSong(id);notice('Đã lưu bản nháp bài hát. Chưa xuất bản.');return;}
  if(action==='album-publish'){
    await saveSingleAlbumSong(id);
    if(!published.some(e=>e.id===albumSeriesId&&e.kind==='series')){notice('Đã lưu bản nháp bài hát. Anime chưa công khai nên bài hát vẫn được giữ riêng tư.');return;}
    await store.publish(id);published=await loadPublicEntries();const pending=readAlbum(false),wasDirty=songsDirty;renderAlbum(current,wasDirty?pending:undefined,openSongIds());songsDirty=wasDirty;syncEditorDirty();notice('Đã xuất bản bài hát.');return;
  }
  if(action==='album-unpublish'){
    await store.unpublish(id);published=await loadPublicEntries();const pending=readAlbum(false),wasDirty=songsDirty;renderAlbum(current,wasDirty?pending:undefined);notice('Đã gỡ xuất bản bài hát.');return;
  }
  if(action==='album-delete'){
    if(!confirm('Xoá bài hát này? Các thay đổi ở bài khác sẽ được giữ trên màn hình.'))return;
    const pending=readAlbum(false).filter(e=>e.id!==id),entry=current;
    if(drafts.some(e=>e.id===id)){await store.remove(id);drafts=await loadDraftEntries();published=await loadPublicEntries();}
    renderAlbum(entry,pending);notice('Đã xoá bài hát. Các thay đổi khác chưa được lưu.');return;
  }
  if(action.startsWith('tab-')){filterKind=action.slice(4);renderAdmin();return;}
  if(action==='toggle-view'){viewMode=viewMode==='grid'?'list':'grid';$('#library-grid').classList.toggle('list-view',viewMode==='list');$('[data-action="toggle-view"]').textContent=viewMode==='grid'?'☷ Danh sách':'▦ Lưới';return;}
  if(action==='search-anime'){$('#anilist-search').focus();return;}
  if(action==='run-search'||action==='more-results'){clearTimeout(searchTimer);await runSearch(action==='more-results');return;}
  if(action==='select-anime'){
    const media=currentMedia.find(m=>m.id===Number(id));if(!media)return;
    const existing=drafts.find(e=>e.kind==='series'&&Number(e.data.anilistId)===media.id);
    renderEditor(existing||{id:`anilist-${media.id}`,kind:'series',parent_id:null,data:selectedAnime(media)});return;
  }
  if(action==='edit'){renderEditor(drafts.find(e=>e.id===id));return;}
  if(action==='publish-current'){
    await saveCurrent();await store.publish(current.id);published=await loadPublicEntries();rerenderCurrentAnime();notice('Đã xuất bản. Khách sẽ thấy khi tải lại trang.');return;
  }
  if(action==='unpublish'){
    if(!confirm('Gỡ xuất bản? Nếu là phim, tất cả bài hát trong phim cũng sẽ được gỡ công khai. Bản nháp vẫn được giữ.'))return;
    await store.unpublish(id);published=await loadPublicEntries();rerenderCurrentAnime();notice('Đã gỡ xuất bản.');return;
  }
  if(action==='delete'){
    if(!confirm('Xoá vĩnh viễn nội dung này? Xoá phim cũng xoá toàn bộ bài hát thuộc phim.'))return;
    await store.remove(id);drafts=await loadDraftEntries();published=await loadPublicEntries();renderAdmin();notice('Đã xoá nội dung.');return;
  }
  if(action==='preview-current'){
    await saveCurrent();if(songsDirty)await saveAlbum();id=current.id;
  }
  if(action==='preview'||action==='preview-current'){
    const entry=drafts.find(e=>e.id===id);if(!entry)return;
    history.pushState(null,'',href({view:'admin',preview:entry.kind==='series'?entry.id:entry.parent_id}));renderDetail(entry.kind==='series'?entry.id:entry.parent_id,true);if(entry.kind==='song'){const songs=drafts.filter(song=>song.kind==='song'&&song.parent_id===entry.parent_id);document.getElementById(songAnchorId(entry,songs))?.scrollIntoView();}return;
  }
  if(action==='copy'){const entry=[...drafts,...published].find(e=>e.id===id);await navigator.clipboard.writeText(entry.data.body||'');notice('Đã sao chép lời.');return;}
  if(action==='logout'){await store.logout();await route();return;}
  if(action==='export'){downloadJSON({version:1,drafts,published},'rainei-backup.json');return;}
  if(action==='import'){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',()=>task(async()=>{
      const parsed=JSON.parse(await input.files[0].text());const entries=Array.isArray(parsed)?parsed:parsed.drafts;
      if(!Array.isArray(entries)||entries.length>5000)throw new Error('File dữ liệu không hợp lệ.');
      if(!entries.every(e=>typeof e.id==='string'&&['series','song'].includes(e.kind)&&e.data&&typeof e.data.title==='string'))throw new Error('Cấu trúc entry không hợp lệ.');
      let added=0;for(const entry of [...entries].sort((a,b)=>(a.kind==='series'?0:1)-(b.kind==='series'?0:1))){if(!drafts.some(e=>e.id===entry.id)){await store.save({id:entry.id,kind:entry.kind,parent_id:entry.parent_id||null,data:entry.data});added++;}}
      drafts=await loadDraftEntries();renderAdmin();notice(`Đã nhập ${added} bài hát thành bản nháp. Chưa xuất bản.`);
    }));input.click();
  }
}
async function route() {
  renderedRouteKey = location.pathname + location.search;
  closeEntryContextMenu();
  const version=++routeVersion;searchController?.abort();searchVersion++;clearTimeout(searchTimer);current=null;dirty=false;animeDirty=false;songsDirty=false;
  const params=new URLSearchParams(location.search);syncAdminLogout(params.get('view')==='admin');document.title='Rainei · Anime & Lyrics';
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(params.get('view')==='admin'?'admin':'library')));
  main.innerHTML='<p class="loading">Đang tải nội dung…</p>';
  try{
    published=await loadPublicEntries();if(version!==routeVersion)return;
    if(params.get('view')==='admin'){
      if(!store.signedIn){renderLogin();return;}
      drafts=await loadDraftEntries();if(version!==routeVersion)return;
      if(params.has('preview'))renderDetail(params.get('preview'),true);else renderAdmin();
    }else {
      const seriesId=params.get('series')||seriesIdFromPath(location.pathname);
      if(seriesId)renderDetail(seriesId);else renderLibrary();
    }
    if(location.hash){
      let hash=location.hash.slice(1);try{hash=decodeURIComponent(hash);}catch{}
      const seriesId=params.get('series')||seriesIdFromPath(location.pathname),songs=published.filter(e=>e.kind==='song'&&e.parent_id===seriesId);
      const target=songs.find(song=>{
        const anchor=songAnchorId(song,songs);
        return hash===anchor||hash===`song-${anchor}`||hash===`song-${encodeURIComponent(song.id)}`||hash===song.id.split('/').at(-1);
      });
      const targetId=target?songAnchorId(target,songs):hash;
      document.getElementById(targetId)?.scrollIntoView();
      if(target&&hash!==targetId)history.replaceState(history.state,'',`${location.pathname}${location.search}#${targetId}`);
    }
    const legacySeriesId=params.get('series');
    if(legacySeriesId){const suffix=location.hash||'';history.replaceState(history.state,'',`${seriesHref(legacySeriesId)}${suffix}`);}
  }catch(error){main.innerHTML=`<section class="panel"><h2>Chưa tải được nội dung</h2><p class="error-box">${esc(error.message)}</p><a class="btn" href="${href({view:'admin'})}">Mở quản lý / đăng nhập</a></section>`;}
}
document.addEventListener('click',e=>{
  const toggle=e.target.closest('[data-context-toggle]');
  if(toggle){const id=toggle.dataset.contextToggle;closeEntryContextMenu();task(()=>toggleEntryPublication(id));return;}
  if(!e.target.closest('.entry-context-menu'))closeEntryContextMenu();
  if($('#anilist-dropdown')&&!e.target.closest('.admin-search-sticky'))closeAdminSearch();
  main.querySelectorAll('details.admin-options[open]').forEach(menu=>{if(!e.target.closest('.admin-options')||e.target.closest('[data-action]'))menu.removeAttribute('open');});
  const action=e.target.closest('[data-action]');if(action){if(dirty&&['tab-series','open-anime','select-anime','edit','logout','import'].includes(action.dataset.action)&&!confirm('Bỏ các thay đổi chưa lưu?'))return;task(()=>handleAction(action.dataset.action,action.dataset.id));return;}
  const link=e.target.closest('a');if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||link.target||link.hasAttribute('download'))return;
  const url=new URL(link.href);if(url.origin!==location.origin||url.pathname!==`${base}/`||url.hash)return;
  if(dirty&&!confirm('Bỏ các thay đổi chưa lưu?')){e.preventDefault();return;}
  e.preventDefault();history.pushState(null,'',url);route();
});
function handleHistoryNavigation() {
  // Native fragment navigation already scrolls to the song; keep the DOM intact.
  if (location.pathname + location.search === renderedRouteKey) return;
  return route();
}
window.addEventListener('popstate',handleHistoryNavigation);
document.addEventListener('contextmenu',e=>{
  if(!e.target.closest('.admin-workspace')||e.target.closest('input, textarea, select')||actionPending)return;
  const block=e.target.closest('[data-anime-id], [data-song-id]');if(!block)return;
  const id=block.dataset.animeId||block.dataset.songId;
  const entry=[...albumRows,...drafts].find(e=>e.id===id);if(!entry)return;
  e.preventDefault();const rect=block.getBoundingClientRect();
  openEntryContextMenu(entry,e.clientX||rect.left+20,e.clientY||rect.top+20,block.querySelector('summary,button'));
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('#entry-context-menu')){e.preventDefault();closeEntryContextMenu(true);}});
window.addEventListener('resize',()=>closeEntryContextMenu());
window.addEventListener('scroll',()=>closeEntryContextMenu(),true);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function boot(){
  try{
    if(!app.dataset.url || !app.dataset.key) throw new Error('Chưa cấu hình Supabase. Hãy thiết lập PUBLIC_SUPABASE_URL và PUBLIC_SUPABASE_ANON_KEY rồi build lại website.');
    store=createStore({url:app.dataset.url,key:app.dataset.key});
    await route();
  }catch(error){main.innerHTML=`<p class="error-box">${esc(error.message)}</p>`;}
}
boot();
