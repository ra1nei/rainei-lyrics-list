import JASSUB from 'jassub';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import wasmWorkerUrl from 'jassub/dist/wasm/jassub-worker.js?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import modernWasmWorkerUrl from 'jassub/dist/wasm/jassub-worker-modern.js?url';
import defaultFontUrl from 'jassub/dist/default.woff2?url';

const API = 'https://kara.moe/api';
const DOWNLOADS = 'https://kara.moe/downloads';
const KID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const $ = selector => document.querySelector(selector);
const form = $('#kara-search');
const query = $('#kara-query');
const results = $('#kara-results');
const searchStatus = $('#search-status');
const video = $('#kara-video');
const playerShell = $('#player-shell');
const renderStatus = $('#render-status');
const notice = $('#lab-notice');
const base = $('#app').dataset.base;
let engine = null;
let activeTrack = '';
let noticeTimer = 0;
let sourceVersion = 0;

function setNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, isError ? 10000 : 4500);
}

function resultTitle(kara) {
  const names = kara.titles || {};
  return names[kara.titles_default_language] || names.eng || names.jpn || Object.values(names)[0] || kara.songname || kara.kid;
}

function mediaKind(filename = '') {
  const extension = filename.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'ogv', 'mov'].includes(extension) ? 'video' : ['mp3', 'm4a', 'ogg', 'flac', 'wav'].includes(extension) ? 'audio' : 'media';
}

function normalizeSearchText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const categoryAliases = new Map([
  ['op', 'OP'], ['opening', 'OP'], ['openings', 'OP'],
  ['ed', 'ED'], ['ending', 'ED'], ['endings', 'ED'],
  ['in', 'IN'], ['ins', 'IN'], ['insert', 'IN'], ['inserts', 'IN'], ['insertion', 'IN'],
]);

function parseSearch(term) {
  const words = normalizeSearchText(term).split(/\s+/).filter(Boolean);
  const categories = new Set(words.map(word => categoryAliases.get(word)).filter(Boolean));
  const textWords = words.filter(word => !categoryAliases.has(word));
  return { categories, textWords };
}

function searchableKaraText(kara) {
  return normalizeSearchText([
    kara.songname,
    ...Object.values(kara.titles || {}),
    ...(kara.titles_aliases || []),
    ...(kara.series || []).flatMap(tag => [tag.name, tag.short]),
    ...(kara.franchises || []).flatMap(tag => [tag.name, tag.short]),
    ...(kara.songtypes || []).flatMap(tag => [tag.name, tag.short, tag.karafile_tag]),
  ].filter(Boolean).join(' '));
}

function filterKaraResults(items, parsed) {
  return items.filter(kara => {
    const searchText = searchableKaraText(kara);
    if (!parsed.textWords.every(word => searchText.includes(word))) return false;
    if (!parsed.categories.size) return true;
    const types = new Set((kara.songtypes || []).flatMap(tag => [tag.name, tag.short, tag.karafile_tag]).filter(Boolean).map(value => normalizeSearchText(value).toUpperCase()));
    return [...parsed.categories].some(category => types.has(category));
  });
}

function mediaURL(filename) {
  return `${DOWNLOADS}/medias/${encodeURIComponent(filename)}`;
}

function lyricsURL(filename) {
  return `${DOWNLOADS}/lyrics/${encodeURIComponent(filename)}`;
}

async function jsonRequest(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`kara.moe trả về lỗi ${response.status}.`);
  return response.json();
}

async function fetchAnimeCovers(items) {
  const ids = [...new Set(items.flatMap(kara => [
    ...(kara.anilist_ids || []),
    ...(kara.series || []).map(tag => tag.external_database_ids?.anilist),
    ...(kara.franchises || []).map(tag => tag.external_database_ids?.anilist),
  ]).map(Number).filter(Number.isInteger))].slice(0, 50);
  if (!ids.length) return new Map();
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query KaraokeCovers($ids: [Int!]) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ANIME) { id coverImage { large medium } } } }', variables: { ids } }),
    });
    if (!response.ok) return new Map();
    const payload = await response.json();
    return new Map((payload.data?.Page?.media || []).map(media => [media.id, media.coverImage?.large || media.coverImage?.medium || '']).filter(([, cover]) => cover));
  } catch {
    return new Map();
  }
}

function showSearchResults(items, covers = new Map()) {
  results.replaceChildren();
  for (const kara of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kara-result';
    const coverUrl = (kara.anilist_ids || []).map(Number).map(id => covers.get(id)).find(Boolean);
    if (coverUrl) {
      const cover = document.createElement('img');
      cover.className = 'kara-result-cover';
      cover.src = coverUrl;
      cover.alt = '';
      cover.loading = 'lazy';
      cover.decoding = 'async';
      cover.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'kara-result-cover kara-result-cover-empty';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = '♫';
        cover.replaceWith(fallback);
      }, { once: true });
      button.append(cover);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'kara-result-cover kara-result-cover-empty';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '♫';
      button.append(placeholder);
    }
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = resultTitle(kara);
    const meta = document.createElement('small');
    const seriesNames = [...new Set([...(kara.series || []), ...(kara.franchises || [])].map(tag => tag.name).filter(Boolean))];
    const songTypes = [...new Set((kara.songtypes || []).map(tag => tag.name || tag.short).filter(Boolean))];
    meta.textContent = [...seriesNames, ...songTypes, kara.songname, kara.year, kara.repository].filter(Boolean).join(' · ');
    text.append(title, meta);
    const kind = document.createElement('span');
    kind.className = 'kara-media-kind';
    kind.textContent = `Có ${mediaKind(kara.mediafile)}`;
    button.append(text, kind);
    button.addEventListener('click', () => selectKara(kara.kid));
    results.append(button);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const term = query.value.trim();
  if (term.length < 2) return;
  searchStatus.textContent = 'Đang tìm trên kara.moe…';
  results.replaceChildren();
  try {
    if (KID_PATTERN.test(term)) {
      const kara = await jsonRequest(`${API}/karas/${encodeURIComponent(term)}`);
      showSearchResults([kara]);
      searchStatus.textContent = 'Tìm thấy bài theo KID.';
      return;
    }
    const parsed = parseSearch(term);
    if (!parsed.textWords.length) throw new Error('Nhập thêm tên anime hoặc tựa bài để tìm theo thể loại.');

    // Search the whole phrase and its individual words so anime and song titles
    // can appear in either order (and in different language fields).
    const searchTerms = [...new Set([parsed.textWords.join(' '), ...parsed.textWords])].slice(0, 5);
    const payloads = await Promise.all(searchTerms.map(async filter => {
      const params = new URLSearchParams({ filter, from: '0', size: '100' });
      return jsonRequest(`${API}/karas/search?${params}`);
    }));
    const itemsByKid = new Map(payloads.flatMap(payload => payload.content || []).map(kara => [kara.kid, kara]));
    const items = filterKaraResults([...itemsByKid.values()], parsed)
      .sort((left, right) => {
        const leftSeries = [...(left.series || []), ...(left.franchises || [])].some(tag => parsed.textWords.join(' ').includes(normalizeSearchText(tag.name)));
        const rightSeries = [...(right.series || []), ...(right.franchises || [])].some(tag => parsed.textWords.join(' ').includes(normalizeSearchText(tag.name)));
        return Number(rightSeries) - Number(leftSeries) || resultTitle(left).localeCompare(resultTitle(right));
      });
    const covers = await fetchAnimeCovers(items);
    showSearchResults(items, covers);
    searchStatus.textContent = items.length ? `Có ${items.length} kết quả${parsed.categories.size ? ` · ${[...parsed.categories].join('/')}` : ''}. Chọn một bài để lấy video và subtitle timing.` : 'Không tìm thấy kết quả phù hợp. Thử tựa bài, tên anime hoặc OP/ED/insert.';
  } catch (error) {
    searchStatus.textContent = error.message || 'Không thể kết nối kara.moe.';
  }
});

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.floor(Number(seconds || 0) * 100));
  const cs = centiseconds % 100;
  const totalSeconds = Math.floor(centiseconds / 100);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text = '') {
  return String(text).replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\r?\n/g, '\\N');
}

function lyricsToAss(lyrics) {
  const lines = Array.isArray(lyrics) ? lyrics : Object.values(lyrics || {});
  const events = lines.filter(line => Number.isFinite(Number(line.start)) && Number.isFinite(Number(line.end)) && (line.text || line.fullText?.length)).map(line => {
    const text = Array.isArray(line.fullText) && line.fullText.length
      ? line.fullText.map(part => {
        const karaokeTag = part.tags?.find(tag => Number.isFinite(Number(tag.k)));
        const timed = karaokeTag ? `{\\k${Math.max(0, Math.round(Number(karaokeTag.k)))}}` : '';
        return timed + escapeAssText(part.text || '');
      }).join('')
      : escapeAssText(line.text || '');
    return `Dialogue: 0,${assTime(line.start)},${assTime(line.end)},Default,,0,0,0,,${text}`;
  });
  if (!events.length) return '';
  return [
    '[Script Info]', 'ScriptType: v4.00+', 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', 'PlayResX: 1920', 'PlayResY: 1080', '',
    '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,44,&H00FFFFFF,&H0000FFFF,&H00111111,&H80000000,0,0,0,0,100,100,0,0,1,2.5,1,2,70,70,54,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...events,
  ].join('\n');
}

function setRenderMessage(text, error = false) {
  renderStatus.textContent = text;
  renderStatus.classList.toggle('draft', error);
  renderStatus.classList.toggle('live', !error && Boolean(engine));
}

async function destroyEngine() {
  if (!engine) return;
  const oldEngine = engine;
  engine = null;
  try { await oldEngine.destroy(); } catch { /* Renderer may already be disposed. */ }
}

function currentFrame() {
  return {
    expectedDisplayTime: performance.now(),
    width: video.videoWidth || 1920,
    height: video.videoHeight || 1080,
    mediaTime: video.currentTime || 0,
  };
}

async function renderTrack({ recreate = false } = {}) {
  const track = activeTrack;
  if (!track.trim()) {
    await destroyEngine();
    setRenderMessage('Chưa có nội dung ASS', true);
    return;
  }
  if (!video.currentSrc || !video.videoWidth) {
    setRenderMessage('Nạp video để bật libass', true);
    return;
  }
  try {
    if (!engine || recreate) {
      await destroyEngine();
      setRenderMessage('Đang khởi tạo libass…');
      engine = new JASSUB({
        video,
        subContent: track,
        workerUrl,
        wasmUrl,
        wasmWorkerUrl,
        modernWasmUrl,
        modernWasmWorkerUrl,
        availableFonts: { 'liberation sans': defaultFontUrl },
        libassMemoryLimit: 128,
        libassGlyphLimit: 5000,
      });
      await engine.ready;
    } else {
      await engine.renderer.setTrack(track);
    }
    await engine.manualRender(currentFrame(), true);
    setRenderMessage('ASS đang render trực tiếp');
  } catch (error) {
    await destroyEngine();
    setRenderMessage('Render lỗi', true);
    setNotice(error.message || 'JASSUB không khởi động được. Thử mở lại trang hoặc dùng video khác.', true);
  }
}

function loadMedia(url) {
  const version = ++sourceVersion;
  video.pause();
  void destroyEngine();
  if (!url) {
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    $('#player-empty').hidden = false;
    return;
  }
  $('#player-empty').hidden = true;
  video.hidden = false;
  video.onloadedmetadata = () => {
    if (version !== sourceVersion) return;
    if (!video.videoWidth) {
      setRenderMessage('Media chỉ có âm thanh', true);
      setNotice('Bài này không có hình để chồng phụ đề. Hãy nạp video MP4/WebM hoặc chọn bài có video.', true);
      return;
    }
    if (activeTrack) void renderTrack({ recreate: true });
    else setRenderMessage('Video đã sẵn sàng');
  };
  video.onerror = () => {
    if (version !== sourceVersion) return;
    setRenderMessage('Không mở được media', true);
    setNotice('Trình duyệt không phát được media này. Hãy thử chọn một bài khác có video.', true);
  };
  video.src = url;
  video.load();
  setRenderMessage('Đang nạp video…');
}

async function selectKara(kid) {
  searchStatus.textContent = 'Đang lấy thông tin bài hát…';
  try {
    const kara = await jsonRequest(`${API}/karas/${encodeURIComponent(kid)}`);
    activeTrack = '';
    if (kara.mediafile && mediaKind(kara.mediafile) === 'video') {
      const url = mediaURL(kara.mediafile);
      loadMedia(url);
    } else {
      loadMedia('');
      setRenderMessage('Bài này không có video', true);
      setNotice('Bài được chọn chỉ có âm thanh. Hãy tìm một bài có video để xem phụ đề.');
    }

    const lyricFilename = kara.lyrics_infos?.find(lyrics => lyrics.default)?.filename || kara.lyrics_infos?.[0]?.filename || kara.subfile;
    const download = $('#ass-download');
    if (lyricFilename) {
      download.href = lyricsURL(lyricFilename);
      download.hidden = false;
      download.textContent = `Tải ASS gốc (${lyricFilename}) ↗`;
    } else download.hidden = true;

    const generated = lyricsToAss(kara.lyrics);
    if (generated) {
      activeTrack = generated;
    } else {
      activeTrack = '';
      if (video.videoWidth) setRenderMessage('Nạp file ASS để bật phụ đề', true);
    }
    searchStatus.textContent = `Đã chọn ${resultTitle(kara)} · KID ${kara.kid}`;
  } catch (error) {
    searchStatus.textContent = error.message || 'Không thể lấy thông tin bài hát.';
  }
}

$('#ass-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  activeTrack = await file.text();
  await renderTrack({ recreate: true });
  event.target.value = '';
});

video.addEventListener('seeked', () => {
  if (engine && activeTrack) void engine.manualRender(currentFrame(), true);
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

$('#play-toggle').addEventListener('click', () => {
  if (video.paused) void video.play().catch(() => setNotice('Không thể phát video này.', true));
  else video.pause();
});
video.addEventListener('play', () => {
  $('#play-toggle').textContent = '❚❚';
  $('#play-toggle').setAttribute('aria-label', 'Tạm dừng video');
});
video.addEventListener('pause', () => {
  $('#play-toggle').textContent = '▶';
  $('#play-toggle').setAttribute('aria-label', 'Phát video');
});
video.addEventListener('timeupdate', () => {
  $('#time-current').textContent = formatTime(video.currentTime);
  $('#seek-bar').value = String(video.currentTime || 0);
});
video.addEventListener('loadedmetadata', () => {
  $('#time-duration').textContent = formatTime(video.duration);
  $('#seek-bar').max = String(Number.isFinite(video.duration) ? video.duration : 0);
});
$('#seek-bar').addEventListener('input', event => {
  video.currentTime = Number(event.currentTarget.value);
});
$('#mute-toggle').addEventListener('click', () => {
  video.muted = !video.muted;
  $('#mute-toggle').textContent = video.muted ? '🔇' : '🔊';
  $('#mute-toggle').setAttribute('aria-label', video.muted ? 'Bật tiếng' : 'Tắt tiếng');
});
$('#volume-bar').addEventListener('input', event => {
  video.volume = Number(event.currentTarget.value);
  video.muted = video.volume === 0;
  $('#mute-toggle').textContent = video.muted ? '🔇' : '🔊';
});
$('#fullscreen-toggle').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await playerShell.requestFullscreen();
  } catch (error) {
    setNotice(error.message || 'Trình duyệt không hỗ trợ toàn màn hình.', true);
  }
});
document.addEventListener('fullscreenchange', () => {
  const fullscreen = Boolean(document.fullscreenElement);
  $('#fullscreen-toggle').textContent = fullscreen ? '⤢' : '⛶';
  $('#fullscreen-toggle').setAttribute('aria-label', fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình');
  $('#fullscreen-toggle').title = fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình';
});
window.addEventListener('pagehide', () => {
  void destroyEngine();
});

$('#kara-video').hidden = true;
const libraryLink = document.querySelector('.brand');
if (libraryLink) libraryLink.href = `${base}/`;
