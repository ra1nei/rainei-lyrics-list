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
const selected = $('#selected-kara');
const video = $('#kara-video');
const editor = $('#ass-editor');
const renderStatus = $('#render-status');
const notice = $('#lab-notice');
const base = $('#app').dataset.base;
let engine = null;
let activeTrack = '';
let updateTimer = 0;
let noticeTimer = 0;
let localVideoUrl = '';
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

function showSearchResults(items) {
  results.replaceChildren();
  for (const kara of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kara-result';
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = resultTitle(kara);
    const meta = document.createElement('small');
    meta.textContent = [kara.songname, kara.year, kara.repository].filter(Boolean).join(' · ');
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
    const params = new URLSearchParams({ filter: term, from: '0', size: '20' });
    const payload = await jsonRequest(`${API}/karas/search?${params}`);
    const items = payload.content || [];
    showSearchResults(items);
    searchStatus.textContent = items.length ? `Có ${items.length} kết quả. Chọn một bài để lấy video và subtitle timing.` : 'Không tìm thấy kết quả.';
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
  const track = editor.value;
  activeTrack = track;
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

function loadMedia(url, { local = false } = {}) {
  const version = ++sourceVersion;
  video.pause();
  void destroyEngine();
  if (localVideoUrl) {
    URL.revokeObjectURL(localVideoUrl);
    localVideoUrl = '';
  }
  if (!url) return;
  if (local) localVideoUrl = url;
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
    setNotice('Trình duyệt không phát được URL này. Hãy thử tải media gốc hoặc nạp video từ máy.', true);
  };
  video.src = url;
  video.load();
  setRenderMessage('Đang nạp video…');
}

async function selectKara(kid) {
  searchStatus.textContent = 'Đang lấy thông tin bài hát…';
  try {
    const kara = await jsonRequest(`${API}/karas/${encodeURIComponent(kid)}`);
    const title = document.createElement('h2');
    title.textContent = resultTitle(kara);
    const description = document.createElement('p');
    description.className = 'muted';
    description.textContent = [kara.songname, kara.year, kara.mediafile].filter(Boolean).join(' · ');
    const info = document.createElement('div');
    info.append(title, description);
    const links = document.createElement('div');
    links.className = 'selected-links';
    const media = document.createElement('a');
    media.href = mediaURL(kara.mediafile || '');
    media.target = '_blank';
    media.rel = 'noopener noreferrer';
    media.className = 'link small-link';
    media.textContent = 'Mở media gốc ↗';
    links.append(media);
    selected.replaceChildren(info, links);
    selected.hidden = false;
    const pageLink = $('#kara-page-link');
    pageLink.href = `https://kara.moe/kara/resolution/${encodeURIComponent(kara.kid)}`;
    pageLink.hidden = false;

    if (kara.mediafile && mediaKind(kara.mediafile) === 'video') {
      const url = mediaURL(kara.mediafile);
      $('#media-url').value = url;
      loadMedia(url);
    } else {
      $('#media-url').value = '';
      setRenderMessage('Bài này không có video', true);
      setNotice('Bài được chọn chỉ có âm thanh. Nạp video từ máy hoặc tìm bài có file video để xem ASS overlay.');
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
      editor.value = generated;
      $('#ass-note').textContent = 'Đang hiển thị bản xem trước được dựng từ lyric/timing của API. Nạp ASS gốc để kiểm tra chính xác style, effect, positioning và các dòng trong file của bạn.';
      activeTrack = generated;
    } else {
      editor.value = '';
      activeTrack = '';
      $('#ass-note').textContent = 'API không trả timing lyric cho bài này. Tải ASS gốc hoặc nạp file ASS cục bộ để render.';
    }
    searchStatus.textContent = `Đã chọn ${resultTitle(kara)} · KID ${kara.kid}`;
  } catch (error) {
    searchStatus.textContent = error.message || 'Không thể lấy thông tin bài hát.';
  }
}

$('#apply-media').addEventListener('click', () => {
  const value = $('#media-url').value.trim();
  if (!value) return setNotice('Nhập URL media hoặc chọn file từ máy.', true);
  try {
    const url = new URL(value, location.href);
    if (!['https:', 'http:', 'blob:'].includes(url.protocol)) throw new Error('Chỉ dùng URL HTTP(S) hoặc blob:');
    if (url.protocol === 'blob:') throw new Error('Hãy nạp file qua nút “Nạp video từ máy”.');
    loadMedia(url.href);
  } catch (error) { setNotice(error.message || 'URL media không hợp lệ.', true); }
});

$('#video-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadMedia(URL.createObjectURL(file), { local: true });
});

$('#ass-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  editor.value = await file.text();
  $('#ass-note').textContent = `Đang sửa file cục bộ: ${file.name}. Nội dung chỉ nằm trong trình duyệt.`;
  activeTrack = editor.value;
  await renderTrack({ recreate: true });
  event.target.value = '';
});

editor.addEventListener('input', () => {
  setRenderMessage('Có thay đổi · đang render…');
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => { void renderTrack(); }, 180);
});

$('#apply-ass').addEventListener('click', () => { void renderTrack({ recreate: true }); });
video.addEventListener('seeked', () => {
  if (engine && activeTrack) void engine.manualRender(currentFrame(), true);
});
window.addEventListener('pagehide', () => {
  void destroyEngine();
  if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
});

$('#kara-video').hidden = true;
const libraryLink = document.querySelector('.brand');
if (libraryLink) libraryLink.href = `${base}/`;
