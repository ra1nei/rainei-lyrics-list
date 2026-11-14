import { createAniListClient, selectedAnime } from '../lib/anilist.mjs';
import { createStore, normalize } from '../lib/store.mjs';
import { micromark } from 'micromark';
import { mergeAlbumRows, compareAlbumSongs } from '../lib/album.mjs';
import { filterByPublication } from '../lib/publication.mjs';
import '../styles/admin.css';
import '../styles/colors.css';
import '../styles/font.css';
import '../styles/songs.css';
import '../styles/actions.css';
import '../styles/toolbar.css';
import '../styles/publication.css';
import '../styles/context-menu.css';
import '../styles/toc.css';
import '../styles/detail.css';

const app = document.querySelector('#app');
const main = document.querySelector('#main');
const base = app.dataset.base;
const $ = (selector) => main.querySelector(selector);
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const href = (params = {}) => `${base}/?${new URLSearchParams(params)}`;
const safeURL = value => { if(!value)return ''; try { const u = new URL(value, location.origin); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const image = (url, alt = '', cls = '') => `<img src="${esc(safeURL(url))}" alt="${esc(alt)}" class="${cls}" loading="lazy" onerror="this.hidden=true"/>`;
const button = (text, action, id = '', cls = '') => `<button type="button" class="btn ${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
const field = (label, name, value = '', extra = '') => `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${extra}/></label>`;
const countSongs = id => published.filter(e => e.kind === 'song' && e.parent_id === id).length;
const songCountHTML = count => `<span class="song-count"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></svg><span>${count} bài hát</span></span>`;
const songPublicationSummaryHTML = songs => {
  const publicIds = new Set(published.filter(e => e.kind === 'song').map(e => e.id));
  const live = songs.filter(song => publicIds.has(song.id)).length;
  const remaining = songs.length - live;
  return songs.length ? `<div class="song-publication-summary"><span class="song-progress">${live}/${songs.length} bài đã xuất bản</span>${remaining ? `<span class="song-drafts">Còn ${remaining} bài nháp</span>` : ''}</div>` : '<div class="song-publication-summary">Chưa có bài hát</div>';
};
let store, seed = [], published = [], drafts = [], current = null, dirty = false, actionPending = false;
let albumSeriesId = null, albumRows = [];
let publishSelectionMode = false, selectionSeriesId = null, selectedSongIds = new Set();
let animeSelectionMode = false, selectedAnimeIds = new Set();
let animePublicationFilter = 'all', songPublicationFilter = 'all';
let contextReturnFocus = null;
let filterKind = 'series', viewMode = 'grid', currentMedia = [], searchPage = 1, searchTerm = '', searchController, searchTimer, searchVersion = 0, routeVersion = 0;
let renderedRouteKey = '';
const searchAnime = createAniListClient();
function notice(message, error = false) { const el = document.querySelector('#notice'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => { el.hidden = true; }, error ? 9000 : 4500); }
async function task(fn) { if(actionPending)return;actionPending=true;const buttons = [...main.querySelectorAll('button')].map(button => [button, button.disabled]); buttons.forEach(([button]) => button.disabled = true); try { await fn(); } catch (error) { notice(error.message || 'Đã xảy ra lỗi.', true); } finally { actionPending=false;buttons.forEach(([button, disabled]) => button.disabled = disabled);if($('#album-form'))syncPublishSelection();if($('.anime-bulk-actions'))syncAnimeSelection(); } }
function status(entry) { const p = published.find(e => e.id === entry.id); return p ? (JSON.stringify(p.data) === JSON.stringify(entry.data) ? ['live', 'Đã xuất bản'] : ['draft', 'Có bản sửa nháp']) : ['draft', 'Bản nháp']; }
function syncAdminLogout(inAdmin) {
  const logout = document.querySelector('#admin-logout');
  if (logout) logout.hidden = !(inAdmin && store?.configured && store.signedIn);
}
function shell(content) {
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
    published=await store.listPublic();renderAdmin(true);
  }else{
    if(!live){
      if(!published.some(e=>e.id===entry.parent_id&&e.kind==='series'))throw new Error('Cần xuất bản phim trước khi công khai bài hát.');
      await saveSingleAlbumSong(id);
    }
    const pending=readAlbum(false),wasDirty=dirty,openIds=openSongIds(),anime=current;
    if(live)await store.unpublish(id);else await store.publish(id);
    published=await store.listPublic();renderAlbum(anime,pending,openIds);dirty=wasDirty;
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
  $('#library-grid').innerHTML = list.length ? list.map(e=>`<article class="card"><a href="${href({series:e.id})}"><div class="poster">${image(e.data.cover,e.data.title)}</div><div><h3 title="${esc(e.data.title)}">${esc(e.data.title)}</h3><p>${esc(e.data.vietnamese||e.data.titles?.native||'')}</p><div class="card-meta"><span>${esc(e.data.year||'—')}</span>${songCountHTML(countSongs(e.id))}${e.data.format&&e.data.format!=='ANIME'?'<span>·</span><span>'+esc(e.data.format)+'</span>':''}</div></div></a></article>`).join('') : '<div class="empty">Chưa có phim phù hợp. Thử đổi từ khoá.</div>';
}
function songAnchorBase(entry) {
  const tail=String(entry.id||'song').split('/').at(-1);
  const slug=tail.replace(/^\d+[_-]*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `song-${slug||'untitled'}`;
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
  return `<article class="song panel" id="${songAnchorId(entry,songs)}"><header class="song-heading"><div class="song-title-row"><span class="badge song-type">${esc(d.type||'MISC')}</span><h2>${esc(d.title)}</h2></div>${d.artist?`<p class="song-artist">— ${esc(d.artist)}</p>`:''}</header>${d.video&&safeURL(d.video)?`<video controls playsinline preload="none" poster="${esc(safeURL(d.poster))}" src="${esc(safeURL(d.video))}"></video>`:''}<div class="song-lyrics-row"><div class="lyrics">${micromark(d.body||'', {allowDangerousHtml:false,allowDangerousProtocol:false})}</div><button type="button" class="copy-lyrics" data-action="copy" data-id="${esc(entry.id)}" aria-label="Sao chép lời" title="Sao chép lời"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button></div></article>`;
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
  main.innerHTML=`${preview?'<div class="preview-label">Xem trước bản nháp · Chỉ quản trị viên đang đăng nhập được xem.</div>':''}<div class="detail-header">${image(d.cover,d.title)}<div><span class="eyebrow">${[d.format,d.year].filter(Boolean).map(esc).join(' · ')}</span><h1>${esc(d.title)}</h1>${d.vietnamese?`<p class="muted detail-vietnamese">${esc(d.vietnamese)}</p>`:''}${d.titles?.native?`<p class="muted detail-native">${esc(d.titles.native)}</p>`:''}${d.sourceUrl?`<a class="link" href="${esc(safeURL(d.sourceUrl))}" target="_blank" rel="noopener noreferrer">Xem trên AniList ↗</a>`:''}</div></div><div class="detail-layout"><section>${songs.map(song=>songHTML(song,songs)).join('')||'<div class="panel empty">Chưa có bài hát.</div>'}</section><aside class="detail-sidebar"><a class="back detail-back" href="${preview?href({view:'admin'}):href()}">← ${preview?'Về quản lý':'Thư viện phim'}</a><nav class="toc panel" aria-label="Danh sách bài hát"><h2 class="eyebrow toc-heading">DANH SÁCH BÀI</h2>${songTOCHTML(songs,d)}</nav></aside></div>`;
}
function renderLogin() {
  syncAdminLogout(false);
  main.innerHTML=`<section class="panel login"><span class="eyebrow">ĐĂNG NHẬP QUẢN LÝ</span><h1>Chào bạn trở lại.</h1><p class="muted">Đăng nhập để thêm phim và quản lý nội dung.</p><form id="login-form">${field('Email','email','','type="email" required autocomplete="username"')}${field('Mật khẩu','password','','type="password" required autocomplete="current-password"')}<button class="btn primary" type="submit">Đăng nhập</button></form></section>`;
  $('#login-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{const data=new FormData(e.target);await store.login(data.get('email'),data.get('password'));await loadAdmin();});});
}
async function loadAdmin() {
  if(store.configured&&!store.signedIn){renderLogin();return;}
  drafts=await store.listDrafts();
  renderAdmin();
}
function visibleAnimeEntries() { return filterByPublication(drafts.filter(e=>e.kind==='series'),published,animePublicationFilter); }
function visibleSongEntries() { return filterByPublication(albumRows,published,songPublicationFilter); }
function publicationFilterHTML(scope) {
  const value=scope==='anime'?animePublicationFilter:songPublicationFilter;
  return `<div class="publication-filter-row"><div class="publication-filter" role="group" aria-label="Lọc trạng thái xuất bản">${[['all','Tất cả'],['published','Đã xuất bản'],['draft','Chưa xuất bản']].map(([id,label])=>`<button type="button" class="publication-filter-btn ${value===id?'active':''}" data-action="filter-${scope}" data-id="${id}" aria-pressed="${value===id}">${label}</button>`).join('')}</div><span id="${scope}-filter-count" class="count-label"></span></div>`;
}
function applyPublicationFilter(scope) {
  const isAnime=scope==='anime',entries=isAnime?drafts.filter(e=>e.kind==='series'):albumRows;
  const visible=isAnime?visibleAnimeEntries():visibleSongEntries(),ids=new Set(visible.map(e=>e.id));
  const value=isAnime?animePublicationFilter:songPublicationFilter;
  main.querySelectorAll(isAnime?'[data-anime-id]':'[data-song-id]').forEach(block=>block.hidden=!ids.has(isAnime?block.dataset.animeId:block.dataset.songId));
  main.querySelectorAll(`[data-action="filter-${scope}"]`).forEach(button=>{button.classList.toggle('active',button.dataset.id===value);button.setAttribute('aria-pressed',String(button.dataset.id===value));});
  const counter=$(`#${scope}-filter-count`);if(counter)counter.textContent=`${visible.length}/${entries.length} ${isAnime?'phim':'bài hát'}`;
  const empty=$(`#${scope}-filter-empty`);if(empty)empty.hidden=visible.length>0||entries.length===0;
}
function renderAdmin(preserveSelection=false) {
  if(!preserveSelection){animeSelectionMode=false;selectedAnimeIds.clear();}
  publishSelectionMode=false;selectedSongIds.clear();selectionSeriesId=null;
  current=null;dirty=false;albumSeriesId=null;albumRows=[];
  const list=drafts.filter(e=>e.kind==='series').sort((a,b)=>a.data.title.localeCompare(b.data.title));
  shell(`<header class="admin-page-header"><h1>Quản lý phim</h1><details class="admin-options"><summary>Dữ liệu <span aria-hidden="true">⌄</span></summary><div class="admin-options-menu">${button('Nhập dữ liệu','import')}${button('Tải bản sao lưu','export')}</div></details></header>${animeSelectionToolbar()}${publicationFilterHTML('anime')}<div class="grid admin-anime-grid">${list.map(e=>{const s=status(e),songs=drafts.filter(song=>song.kind==='song'&&song.parent_id===e.id);return `<article class="card" data-anime-id="${esc(e.id)}"><span class="anime-select-control"><input type="checkbox" data-select-anime="${esc(e.id)}" aria-label="Chọn phim ${esc(e.data.title)}"/></span><button type="button" class="anime-entry-button" data-action="open-anime" data-id="${esc(e.id)}"><div class="poster">${image(e.data.cover,e.data.title)}</div><h3 title="${esc(e.data.title)}">${esc(e.data.title)}</h3><p>${esc(e.data.vietnamese||e.data.titles?.native||'')}</p><div class="card-meta"><span>${esc(e.data.year||'—')}</span></div>${songPublicationSummaryHTML(songs)}<div class="card-status"><span class="badge ${published.some(p=>p.id===e.id)?'live':'draft'}" title="${esc(s[1])}">${published.some(p=>p.id===e.id)?'Đã xuất bản':'Nháp'}</span></div></button></article>`;}).join('')||'<div class="panel empty">Chưa có anime. Gõ tên vào thanh tìm kiếm phía trên để thêm bộ đầu tiên.</div>'}<div id="anime-filter-empty" class="empty" hidden>Không có phim phù hợp với trạng thái này.</div></div>`);
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
  applyPublicationFilter('anime');
  const valid=new Set(visibleAnimeEntries().map(e=>e.id));
  for(const id of selectedAnimeIds)if(!valid.has(id))selectedAnimeIds.delete(id);
  $('.admin-anime-grid').classList.toggle('anime-selecting',animeSelectionMode);
  $('.anime-bulk-actions').classList.toggle('selecting',animeSelectionMode);
  main.querySelectorAll('[data-select-anime]').forEach(input=>input.checked=selectedAnimeIds.has(input.dataset.selectAnime));
  main.querySelectorAll('[data-anime-id]').forEach(card=>card.classList.toggle('anime-selected',selectedAnimeIds.has(card.dataset.animeId)));
  $('#anime-selection-count').textContent=`${selectedAnimeIds.size} phim đã chọn`;
  $('[data-action="anime-select-all"]').textContent=selectedAnimeIds.size===valid.size&&valid.size?'Bỏ chọn tất cả':'Chọn tất cả';
  const publish=$('[data-action="anime-publish-selected"]');publish.textContent='Xuất bản';publish.disabled=!selectedAnimeIds.size;
}
function animeTabs(entry, active) {
  const saved=drafts.some(e=>e.id===entry.id),count=drafts.filter(e=>e.kind==='song'&&e.parent_id===entry.id).length;
  return `<div class="anime-breadcrumb">${button('← Tất cả phim','tab-series','','small')}<span>${esc(entry.data.title||'Phim mới')}</span></div><div class="anime-tabs" aria-label="Chỉnh sửa anime">${button('Thông tin phim','anime-info',entry.id,active==='info'?'active':'')}${saved?button('Bài hát & lời ('+count+')','anime-songs',entry.id,active==='songs'?'active':''):'<span class="muted">Lưu anime trước để thêm bài hát</span>'}</div>`;
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
  $('#anime-results').innerHTML=currentMedia.map(m=>{const d=selectedAnime(m,language);const duplicate=drafts.some(e=>e.kind==='series'&&Number(e.data.anilistId)===m.id);return `<button class="result" type="button" data-action="select-anime" data-id="${m.id}">${image(d.cover,d.title)}<span><strong>${esc(d.title)}</strong><small>${esc([...new Set(Object.values(m.title).filter(title=>title&&title!==d.title))].join(' · '))}</small><small>${esc(d.year||'Chưa có năm')} · ${esc(d.format)} · #${m.id}</small><small>${duplicate?'Đã có trong thư viện → Mở chỉnh sửa':'Chọn phim này ↗'}</small></span></button>`;}).join('');
}
function animeEditorActions(entry) {
  const live=published.some(e=>e.id===entry.id),saved=drafts.some(e=>e.id===entry.id);
  return `<div class="anime-editor-actions"><div class="editor-action-main" role="group" aria-label="Xem và lưu nội dung">${button('Xem trước','preview-current',entry.id,'action-preview')}<button type="submit" class="btn">Lưu nháp</button>${button(store.configured?'Xuất bản':'Xuất bản thử trên máy này','publish-current',entry.id,'primary')}</div>${live||saved?`<div class="editor-action-secondary" role="group" aria-label="Quản lý xuất bản và xoá">${live?button('Gỡ xuất bản','unpublish',entry.id,'action-unpublish'):''}${saved?button('Xoá phim','delete',entry.id,'danger action-delete'):''}</div>`:''}</div>`;
}
function renderEditor(entry) {
  current=structuredClone(entry);dirty=false;albumSeriesId=null;const d=current.data;
  shell(animeTabs(entry,'info')+`<div class="panel"><div class="section-head"><h2>Thông tin phim</h2><span id="save-state" class="badge draft">${drafts.some(e=>e.id===entry.id)?status(entry)[1]:'Chưa lưu'}</span></div><form id="entry-form"><div class="editor-layout"><div>${image(d.cover,d.title,'editor-poster')}<p class="muted" style="font-size:11px">${d.anilistId?'Poster AniList · #'+d.anilistId:'Ảnh bìa anime'}</p></div><div class="form-grid">${field('Tên hiển thị','title',d.title,'required')}${field('Tên tiếng Việt (tuỳ chọn)','vietnamese',d.vietnamese)}${field('Năm phát hành','year',d.year,'type="number" min="1900" max="2200"')}${field('Định dạng','format',d.format)}<label class="field full">Kiểu tên<select name="titleLanguage"><option value="romaji" ${d.titleLanguage==='romaji'?'selected':''}>Phiên âm Latin</option><option value="english" ${d.titleLanguage==='english'?'selected':''}>Tiếng Anh</option><option value="native" ${d.titleLanguage==='native'?'selected':''}>Ngôn ngữ gốc</option></select></label><label class="field full">Đường dẫn ảnh bìa<input name="cover" type="url" value="${esc(d.cover)}"/><small>URL poster gốc do AniList trả về.</small></label></div></div>${animeEditorActions(current)}</form></div>`);
  $('#entry-form').addEventListener('input',()=>{dirty=true;$('#save-state').textContent='Có thay đổi chưa lưu';});
  $('#entry-form').addEventListener('submit',e=>{e.preventDefault();task(async()=>{await saveCurrent();renderEditor(current);notice('Đã lưu bản nháp anime.');});});
  $('[name="titleLanguage"]').addEventListener('change',e=>{$('[name="title"]').value=d.titles?.[e.target.value]||d.titles?.romaji||d.title;});
}
function openSongIds() {
  return new Set([...main.querySelectorAll('details[data-song-id][open]')].map(el=>el.dataset.songId));
}
function revealSong(id) {
  const block=[...main.querySelectorAll('[data-song-id]')].find(el=>el.dataset.songId===id);
  if(block){block.open=true;block.scrollIntoView({block:'center'});}
  return block;
}
function renderAlbum(entry, rows, openIds=new Set()) {
  if(selectionSeriesId!==entry.id){publishSelectionMode=false;selectedSongIds.clear();selectionSeriesId=entry.id;songPublicationFilter='all';}
  current=structuredClone(entry);albumSeriesId=entry.id;
  albumRows=structuredClone(rows||drafts.filter(e=>e.kind==='song'&&e.parent_id===entry.id).sort(compareAlbumSongs));
  dirty=Boolean(rows);
  const parentPublished=published.some(e=>e.id===entry.id&&e.kind==='series');
  shell(animeTabs(entry,'songs')+`<div class="section-head"><div><h2>Bài hát & lời</h2><p class="muted">Chọn một bài để mở chỉnh sửa.</p></div>${button('+ Thêm bài hát','album-add',entry.id,'primary')}</div><form id="album-form" novalidate><div class="album-savebar"><span id="album-save-state" role="status">${rows?'Có thay đổi chưa lưu':albumRows.length+' bài hát'}</span>${publishSelectionToolbar(parentPublished&&albumRows.length)}</div>${publicationFilterHTML('song')}${!parentPublished?'<p class="publication-hint muted">Anime chưa công khai. Các bài vẫn lưu nháp được; xuất bản anime trước để công khai bài hát.</p>':''}<div class="album-song-list">${albumRows.map((song,index)=>songEditorHTML(song,index,openIds.has(song.id))).join('')||'<div class="panel empty">Chưa có bài hát.</div>'}<div id="song-filter-empty" class="panel empty" hidden>Không có bài hát phù hợp với trạng thái này.</div></div></form>`);
  $('#album-form').addEventListener('input',e=>{
    if(e.target.matches('[data-select-song]'))return;
    dirty=true;$('#album-save-state').textContent='Có thay đổi chưa lưu';
    const block=e.target.closest('[data-song-id]');
    if(block&&e.target.name==='title')block.querySelector('.song-summary-title').textContent=e.target.value||'Bài hát mới';
    if(block){const state=block.querySelector('.song-edit-state');if(state)state.textContent='Chưa lưu thay đổi';}
  });
  $('#album-form').addEventListener('submit',e=>e.preventDefault());
  $('#album-form').addEventListener('change',e=>{
    if(!e.target.matches('[data-select-song]'))return;
    if(e.target.checked)selectedSongIds.add(e.target.dataset.selectSong);else selectedSongIds.delete(e.target.dataset.selectSong);
    syncPublishSelection();
  });
  syncPublishSelection();
}
function publishSelectionToolbar(enabled) {
  return `<div class="batch-publish-actions">${button('Chọn','batch-start','','small batch-start')}<div class="batch-selection-tools"><span id="batch-selection-count" class="selection-count">0 bài đã chọn</span><div class="selection-options">${button('Chọn tất cả','batch-select-all','','small')}${button('Huỷ','batch-cancel','','small')}</div>${enabled?button('Xuất bản','album-publish-selected','','primary'):'<button type="button" class="btn primary" disabled title="Công khai phim trước để xuất bản bài hát">Xuất bản</button>'}</div></div>`;
}
function syncPublishSelection() {
  applyPublicationFilter('song');
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
  return `<details class="panel song-editor ${isPublished?'song-published':'song-unpublished'}" data-song-id="${esc(song.id)}" ${open?'open':''}><summary class="song-summary"><span class="song-select-control"><input type="checkbox" data-select-song="${esc(song.id)}" aria-label="Chọn bài ${esc(d.title||index+1)}" ${selectedSongIds.has(song.id)?'checked':''}/></span><span class="song-summary-index">${index+1}</span><span class="song-summary-info"><strong class="song-summary-title">${esc(d.title||'Bài hát mới')}</strong><small>${esc(d.type||'MISC')}${d.artist?' · '+esc(d.artist):''}</small></span><span class="song-summary-status"><span class="badge ${isPublished?'live':'draft'}">${isPublished?'Đã publish':'Chưa publish'}</span><small class="song-edit-state">${saved?(isPublished&&s[0]==='draft'?'Có bản sửa nháp':''):'Chưa lưu'}</small></span><span class="song-chevron" aria-hidden="true">⌄</span></summary><div class="song-editor-body"><div class="form-grid">${field('Tên bài hát *','title',d.title,'required')}${field('Nghệ sĩ *','artist',d.artist,'required')}<label class="field">Loại bài *<select name="type" required>${['OP','ED','INS','MV','MISC'].map(t=>'<option '+((d.type||'MISC')===t?'selected':'')+'>'+t+'</option>').join('')}</select></label>${field('Mùa / nhóm *','group',d.group||'','required')}${field('Thứ tự (tuỳ chọn)','order',d.order??'','type="number" min="0" step="any" placeholder="Để trống: theo thứ tự thêm"')}${field('Đường dẫn video (tuỳ chọn)','video',d.video,'type="text" inputmode="url" placeholder="https://…"')}${field('Đường dẫn ảnh xem trước (tuỳ chọn)','poster',d.poster,'type="text" inputmode="url" placeholder="https://… hoặc /đường-dẫn-ảnh"')}<label class="field full">Lời bài hát<textarea name="body" spellcheck="false" rows="14" aria-label="Lời bài hát ${esc(d.title||index+1)}">${esc(d.body)}</textarea></label></div><div class="editor-footer">${button('Lưu nháp bài này','album-save',song.id,'small')}${parentPublished?button(isPublished?'Cập nhật bản công khai':'Xuất bản bài này','album-publish',song.id,'small'):'<button type="button" class="btn small" disabled title="Xuất bản anime trước khi công khai bài hát">Xuất bản · Anime chưa công khai</button>'}${saved&&isPublished?button('Gỡ xuất bản','album-unpublish',song.id,'small'):''}${button('Xoá bài hát','album-delete',song.id,'small danger')}</div></div></details>`;
}
function readAlbum(validate = true) {
  const rows=[...main.querySelectorAll('[data-song-id]')].map(block=>({id:block.dataset.songId,data:Object.fromEntries([...block.querySelectorAll('[name]')].map(input=>[input.name,input.value]))}));
  try { return mergeAlbumRows(albumSeriesId,albumRows,rows,{validate}); }
  catch(error){if(error.entryId)revealSong(error.entryId);throw error;}
}
function validateSongInputs(block) {
  for(const input of block.querySelectorAll('input, select, textarea')){
    if(!input.checkValidity()){block.open=true;input.reportValidity();throw new Error('Điền đủ 4 trường bắt buộc và kiểm tra thứ tự bài hát.');}
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
  await store.save(validated);drafts=await store.listDrafts();
  const saved=drafts.find(e=>e.id===id);pending=pending.map(song=>song.id===id?saved:song);
  const otherChanges=pending.some(song=>{const value=drafts.find(e=>e.id===song.id);return !value||JSON.stringify(value.data)!==JSON.stringify(song.data);});
  const anime=drafts.find(e=>e.id===albumSeriesId),openIds=openSongIds();
  renderAlbum(anime,pending,openIds);dirty=otherChanges;
  $('#album-save-state').textContent=otherChanges?'Đã lưu bài này; còn thay đổi ở bài khác':'Đã lưu bản nháp bài hát';
}
async function saveAlbum(ids = null) {
  const selected=ids?new Set(ids):null;
  for(const block of main.querySelectorAll('[data-song-id]'))if(!selected||selected.has(block.dataset.songId))validateSongInputs(block);
  let pending=readAlbum(false),entries;
  try{entries=mergeAlbumRows(albumSeriesId,albumRows,pending.filter(e=>!selected||selected.has(e.id)));}
  catch(error){if(error.entryId)revealSong(error.entryId);throw error;}
  const changed=entries.filter(entry=>{const original=drafts.find(e=>e.id===entry.id);return !original||JSON.stringify(original.data)!==JSON.stringify(entry.data);});
  await store.saveMany(changed);drafts=await store.listDrafts();
  const savedIds=new Set(entries.map(e=>e.id));
  pending=pending.map(e=>savedIds.has(e.id)?drafts.find(d=>d.id===e.id):e);
  const remainingChanges=pending.some(e=>{const saved=drafts.find(d=>d.id===e.id);return !saved||JSON.stringify(saved.data)!==JSON.stringify(e.data);});
  const entry=drafts.find(e=>e.id===albumSeriesId),openIds=openSongIds();
  renderAlbum(entry,remainingChanges?pending:undefined,openIds);dirty=remainingChanges;$('#album-save-state').textContent=remainingChanges?'Đã lưu các bài chọn; còn bài khác chưa lưu':'Đã lưu các thay đổi';
}

async function saveCurrent() {
  const form=$('#entry-form');if(!form.reportValidity())throw new Error('Kiểm tra lại các ô bắt buộc.');
  const values=Object.fromEntries(new FormData(form));
  const parent_id=values.parent_id;delete values.parent_id;
  for(const name of ['year','order']) if(name in values) values[name]=values[name]===''?'':Number(values[name]);
  const value={...current,parent_id:current.kind==='series'?null:parent_id,data:{...current.data,...values}};
  if(value.kind==='series'&&value.data.anilistId&&drafts.some(e=>e.id!==value.id&&e.kind==='series'&&Number(e.data.anilistId)===Number(value.data.anilistId)))throw new Error('Anime này đã có trong thư viện.');
  await store.save(value);drafts=await store.listDrafts();current=drafts.find(e=>e.id===value.id);dirty=false;$('#save-state').textContent='Đã lưu nháp';
}
function downloadJSON(value,name) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function handleAction(action,id) {
  if(action==='filter-anime'){animePublicationFilter=id;selectedAnimeIds.clear();syncAnimeSelection();return;}
  if(action==='filter-song'){songPublicationFilter=id;selectedSongIds.clear();syncPublishSelection();return;}
  if(action==='anime-select-start'){animeSelectionMode=true;syncAnimeSelection();return;}
  if(action==='anime-select-all'){const all=visibleAnimeEntries();if(selectedAnimeIds.size===all.length)selectedAnimeIds.clear();else all.forEach(e=>selectedAnimeIds.add(e.id));syncAnimeSelection();return;}
  if(action==='anime-select-clear'){selectedAnimeIds.clear();syncAnimeSelection();return;}
  if(action==='anime-select-cancel'){animeSelectionMode=false;selectedAnimeIds.clear();syncAnimeSelection();return;}
  if(action==='anime-publish-selected'){
    const ids=drafts.filter(e=>e.kind==='series'&&selectedAnimeIds.has(e.id)).map(e=>e.id);
    if(!ids.length)throw new Error('Chọn ít nhất một anime để publish.');
    let done=0,failure=null;
    for(const animeId of ids){
      $('#anime-selection-count').textContent=`Đang xuất bản ${done+1}/${ids.length}…`;
      try{await store.publish(animeId);done++;selectedAnimeIds.delete(animeId);}catch(error){failure=error;break;}
    }
    published=await store.listPublic();renderAdmin(Boolean(failure));
    notice(failure?`Đã xuất bản ${done}/${ids.length} anime. ${failure.message}`:`Đã xuất bản ${done} phim đã chọn.`,Boolean(failure));return;
  }
  if(action==='batch-start'){publishSelectionMode=true;syncPublishSelection();return;}
  if(action==='batch-select-all'){const all=visibleSongEntries();if(selectedSongIds.size===all.length)selectedSongIds.clear();else all.forEach(e=>selectedSongIds.add(e.id));syncPublishSelection();return;}
  if(action==='batch-clear'){selectedSongIds.clear();syncPublishSelection();return;}
  if(action==='batch-cancel'){publishSelectionMode=false;selectedSongIds.clear();syncPublishSelection();return;}
  if(action==='album-publish-all'||action==='album-publish-selected'){
    if(!published.some(e=>e.id===albumSeriesId&&e.kind==='series'))throw new Error('Xuất bản anime trước khi xuất bản các bài hát.');
    const ids=albumRows.filter(e=>action==='album-publish-all'||selectedSongIds.has(e.id)).map(e=>e.id);
    if(!ids.length)throw new Error('Chọn ít nhất một bài hát để publish.');
    await saveAlbum(ids);
    const openIds=openSongIds(),entry=current,pending=readAlbum(false),wasDirty=dirty;
    if(!ids.length)return;
    let done=0,failure=null;
    const controls=[...main.querySelectorAll('#album-form input, #album-form select, #album-form textarea, #album-form button')].map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true);
    try{
      for(const songId of ids){
        $('#album-save-state').textContent=`Đang xuất bản ${done+1}/${ids.length}…`;
        try{await store.publish(songId);done++;selectedSongIds.delete(songId);}catch(error){failure=error;break;}
      }
      published=await store.listPublic();if(!failure){publishSelectionMode=false;selectedSongIds.clear();}renderAlbum(entry,wasDirty?pending:undefined,openIds);dirty=wasDirty;
    }finally{controls.forEach(([el,disabled])=>el.disabled=disabled);}
    notice(failure?`Đã xuất bản ${done}/${ids.length} bài. ${failure.message}`:`Đã xuất bản ${done} bài hát đã chọn.`,Boolean(failure));
    return;
  }
  if(action==='close-search'){closeAdminSearch();return;}
  if(action==='open-anime'&&animeSelectionMode){if(selectedAnimeIds.has(id))selectedAnimeIds.delete(id);else selectedAnimeIds.add(id);syncAnimeSelection();return;}
  if(action==='open-anime'||action==='anime-info'){renderEditor(drafts.find(e=>e.id===id)||current);return;}
  if(action==='anime-songs'){renderAlbum(drafts.find(e=>e.id===id));return;}
  if(action==='album-add'){
    const existing=readAlbum(false);const entry=drafts.find(e=>e.id===albumSeriesId);
    existing.push({id:crypto.randomUUID(),kind:'song',parent_id:entry.id,data:{title:'',artist:'',type:'OP',group:'Mùa 01',order:null,addedAt:new Date().toISOString(),body:''}});
    renderAlbum(entry,existing);const last=main.querySelector('.song-editor:last-child');if(last)last.open=true;last?.scrollIntoView({block:'start'});last?.querySelector('[name="title"]')?.focus();return;
  }
  if(action==='album-save'){await saveSingleAlbumSong(id);notice('Đã lưu bản nháp bài hát. Chưa xuất bản.');return;}
  if(action==='album-publish'){
    await saveSingleAlbumSong(id);
    if(!published.some(e=>e.id===albumSeriesId&&e.kind==='series')){notice('Đã lưu bản nháp bài hát. Anime chưa công khai nên bài hát vẫn được giữ riêng tư.');return;}
    await store.publish(id);published=await store.listPublic();const pending=readAlbum(false),wasDirty=dirty;renderAlbum(current,wasDirty?pending:undefined,openSongIds());dirty=wasDirty;notice(store.configured?'Đã xuất bản bài hát.':'Đã xuất bản thử bài hát trên trình duyệt này.');return;
  }
  if(action==='album-unpublish'){
    await store.unpublish(id);published=await store.listPublic();const pending=readAlbum(false),wasDirty=dirty;renderAlbum(current,wasDirty?pending:undefined);notice('Đã gỡ xuất bản bài hát.');return;
  }
  if(action==='album-delete'){
    if(!confirm('Xoá bài hát này? Các thay đổi ở bài khác sẽ được giữ trên màn hình.'))return;
    const pending=readAlbum(false).filter(e=>e.id!==id),entry=current;
    if(drafts.some(e=>e.id===id)){await store.remove(id);drafts=await store.listDrafts();published=await store.listPublic();}
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
    await saveCurrent();await store.publish(current.id);published=await store.listPublic();renderEditor(current);notice(store.configured?'Đã xuất bản. Khách sẽ thấy khi tải lại trang.':'Đã xuất bản thử. Chỉ trình duyệt này nhìn thấy.');return;
  }
  if(action==='unpublish'){
    if(!confirm('Gỡ xuất bản? Nếu là phim, tất cả bài hát trong phim cũng sẽ được gỡ công khai. Bản nháp vẫn được giữ.'))return;
    await store.unpublish(id);published=await store.listPublic();renderEditor(current);notice('Đã gỡ xuất bản.');return;
  }
  if(action==='delete'){
    if(!confirm('Xoá vĩnh viễn nội dung này? Xoá phim cũng xoá toàn bộ bài hát thuộc phim.'))return;
    await store.remove(id);drafts=await store.listDrafts();published=await store.listPublic();renderAdmin();notice('Đã xoá nội dung.');return;
  }
  if(action==='preview-current'){
    await saveCurrent();id=current.id;
  }
  if(action==='preview'||action==='preview-current'){
    const entry=drafts.find(e=>e.id===id);if(!entry)return;
    history.pushState(null,'',href({view:'admin',preview:entry.kind==='series'?entry.id:entry.parent_id}));renderDetail(entry.kind==='series'?entry.id:entry.parent_id,true);if(entry.kind==='song')document.getElementById(`song-${encodeURIComponent(entry.id)}`)?.scrollIntoView();return;
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
      drafts=await store.listDrafts();renderAdmin();notice(`Đã nhập ${added} entry thành bản nháp. Chưa publish.`);
    }));input.click();
  }
}
async function route() {
  renderedRouteKey = location.pathname + location.search;
  closeEntryContextMenu();
  const version=++routeVersion;searchController?.abort();searchVersion++;clearTimeout(searchTimer);current=null;dirty=false;
  const params=new URLSearchParams(location.search);syncAdminLogout(params.get('view')==='admin');document.title='Rainei · Anime & Lyrics';
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(params.get('view')==='admin'?'admin':'library')));
  main.innerHTML='<p class="loading">Đang tải nội dung…</p>';
  try{
    published=await store.listPublic();if(version!==routeVersion)return;
    if(params.get('view')==='admin'){
      if(store.configured&&!store.signedIn){renderLogin();return;}
      drafts=await store.listDrafts();if(version!==routeVersion)return;
      if(params.has('preview'))renderDetail(params.get('preview'),true);else renderAdmin();
    }else if(params.has('series'))renderDetail(params.get('series'));else renderLibrary();
    if(location.hash){
      let hash=location.hash.slice(1);try{hash=decodeURIComponent(hash);}catch{}
      const seriesId=params.get('series'),songs=published.filter(e=>e.kind==='song'&&e.parent_id===seriesId);
      const target=songs.find(song=>hash===songAnchorId(song,songs)||hash===`song-${encodeURIComponent(song.id)}`||hash===song.id.split('/').at(-1));
      const targetId=target?songAnchorId(target,songs):hash;
      document.getElementById(targetId)?.scrollIntoView();
      if(target&&hash!==targetId)history.replaceState(history.state,'',`${location.pathname}${location.search}#${targetId}`);
    }
  }catch(error){main.innerHTML=`<section class="panel"><h2>Chưa tải được nội dung</h2><p class="error-box">${esc(error.message)}</p><a class="btn" href="${href({view:'admin'})}">Mở quản lý / đăng nhập</a></section>`;}
}
document.addEventListener('click',e=>{
  const toggle=e.target.closest('[data-context-toggle]');
  if(toggle){const id=toggle.dataset.contextToggle;closeEntryContextMenu();task(()=>toggleEntryPublication(id));return;}
  if(!e.target.closest('.entry-context-menu'))closeEntryContextMenu();
  if($('#anilist-dropdown')&&!e.target.closest('.admin-search-sticky'))closeAdminSearch();
  main.querySelectorAll('details.admin-options[open]').forEach(menu=>{if(!e.target.closest('.admin-options')||e.target.closest('[data-action]'))menu.removeAttribute('open');});
  const action=e.target.closest('[data-action]');if(action){if(dirty&&['tab-series','open-anime','anime-info','anime-songs','select-anime','edit','logout','import'].includes(action.dataset.action)&&!confirm('Bỏ các thay đổi chưa lưu?'))return;task(()=>handleAction(action.dataset.action,action.dataset.id));return;}
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
    if(!app.dataset.url&&!app.dataset.key){const response=await fetch(`${base}/catalog.json`);if(!response.ok)throw new Error('Không đọc được dữ liệu mẫu.');seed=await response.json();}
    if(Boolean(app.dataset.url)!==Boolean(app.dataset.key))throw new Error('Cần cấu hình đủ URL và publishable/anon key của Supabase.');
    store=createStore({url:app.dataset.url,key:app.dataset.key,seed});
    if(!store.configured){const banner=document.querySelector('#mode-banner');banner.hidden=false;banner.textContent='BẢN THỬ · Dữ liệu lưu trên trình duyệt này. Xuất bản thử chưa công khai lên Internet. Cần kết nối Supabase để dùng thật.';}
    await route();
  }catch(error){main.innerHTML=`<p class="error-box">${esc(error.message)}</p>`;}
}
boot();
