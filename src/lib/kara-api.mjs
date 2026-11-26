export const KARA_API = 'https://kara.moe/api';
export const KARA_DOWNLOADS = 'https://kara.moe/downloads';
const KID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mediaKind(filename = '') {
  const extension = filename.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'ogv', 'mov'].includes(extension) ? 'video'
    : ['mp3', 'm4a', 'ogg', 'flac', 'wav'].includes(extension) ? 'audio' : 'media';
}

export function mediaURL(filename = '') {
  return `${KARA_DOWNLOADS}/medias/${encodeURIComponent(filename)}`;
}

export function lyricsURL(filename = '') {
  return `${KARA_DOWNLOADS}/lyrics/${encodeURIComponent(filename)}`;
}

export function resultTitle(kara) {
  const names = kara.titles || {};
  return names[kara.titles_default_language] || names.eng || names.jpn || Object.values(names)[0] || kara.songname || kara.kid;
}

export function karaArtist(kara) {
  return [...new Set([...(kara.singers || []), ...(kara.singergroups || [])].map(item => item.name).filter(Boolean))].join(', ');
}

export function karaSongType(kara) {
  const tags = (kara.songtypes || []).flatMap(tag => [tag.name, tag.short, tag.karafile_tag]).filter(Boolean).map(value => String(value).toUpperCase());
  if (tags.some(tag => ['OP', 'OPENING'].includes(tag))) return 'OP';
  if (tags.some(tag => ['ED', 'ENDING'].includes(tag))) return 'ED';
  if (tags.some(tag => ['IN', 'INS', 'INSERT', 'INSERT SONG'].includes(tag))) return 'INS';
  return 'MISC';
}

function normalizeSearchText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const categoryAliases = new Map([
  ['op', 'OP'], ['opening', 'OP'], ['openings', 'OP'],
  ['ed', 'ED'], ['ending', 'ED'], ['endings', 'ED'],
  ['in', 'IN'], ['ins', 'IN'], ['insert', 'IN'], ['inserts', 'IN'], ['insertion', 'IN'],
]);

function searchableText(kara) {
  return normalizeSearchText([
    kara.songname,
    ...Object.values(kara.titles || {}),
    ...(kara.titles_aliases || []),
    ...(kara.series || []).flatMap(tag => [tag.name, tag.short]),
    ...(kara.franchises || []).flatMap(tag => [tag.name, tag.short]),
    ...(kara.songtypes || []).flatMap(tag => [tag.name, tag.short, tag.karafile_tag]),
  ].filter(Boolean).join(' '));
}

async function jsonRequest(url, fetcher) {
  const response = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`kara.moe trả về lỗi ${response.status}.`);
  return response.json();
}

export async function getKara(kid, fetcher = fetch) {
  return jsonRequest(`${KARA_API}/karas/${encodeURIComponent(kid)}`, fetcher);
}

export async function fetchKaraAss(kara, fetcher = fetch) {
  const filename = kara.lyrics_infos?.find(info => info.default)?.filename || kara.lyrics_infos?.[0]?.filename || kara.subfile;
  if (!filename) return { filename: '', content: '' };
  const response = await fetcher(lyricsURL(filename), { headers: { Accept: 'text/plain,*/*' } });
  if (!response.ok) throw new Error(`Không tải được ASS từ kara.moe (${response.status}).`);
  return { filename, content: await response.text() };
}

export async function searchKara(term, fetcher = fetch) {
  const query = String(term || '').trim();
  if (KID_PATTERN.test(query)) return [await getKara(query, fetcher)];
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const categories = new Set(words.map(word => categoryAliases.get(word)).filter(Boolean));
  const textWords = words.filter(word => !categoryAliases.has(word));
  if (!textWords.length) throw new Error('Nhập thêm tên anime hoặc tựa bài để tìm theo thể loại.');

  const filters = [...new Set([textWords.join(' '), ...textWords])].slice(0, 5);
  const payloads = await Promise.all(filters.map(async filter => {
    const params = new URLSearchParams({ filter, from: '0', size: '100' });
    return jsonRequest(`${KARA_API}/karas/search?${params}`, fetcher);
  }));
  const unique = new Map(payloads.flatMap(payload => payload.content || []).map(kara => [kara.kid, kara]));
  return [...unique.values()].filter(kara => {
    const text = searchableText(kara);
    if (!textWords.every(word => text.includes(word))) return false;
    if (!categories.size) return true;
    const types = new Set((kara.songtypes || []).flatMap(tag => [tag.name, tag.short, tag.karafile_tag]).filter(Boolean).map(value => normalizeSearchText(value).toUpperCase()));
    return [...categories].some(category => types.has(category));
  }).sort((left, right) => {
    const phrase = textWords.join(' ');
    const leftSeries = [...(left.series || []), ...(left.franchises || [])].some(tag => phrase.includes(normalizeSearchText(tag.name)));
    const rightSeries = [...(right.series || []), ...(right.franchises || [])].some(tag => phrase.includes(normalizeSearchText(tag.name)));
    return Number(rightSeries) - Number(leftSeries) || resultTitle(left).localeCompare(resultTitle(right));
  });
}
