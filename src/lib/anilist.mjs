const fields = `id siteUrl title { romaji english native } coverImage { extraLarge large medium color } bannerImage startDate { year } format episodes`;
export const SEARCH_QUERY = `query SearchAnime($search: String!, $page: Int!) { Page(page: $page, perPage: 10) { pageInfo { hasNextPage } media(search: $search, type: ANIME) { ${fields} } } }`;
export const ID_QUERY = `query AnimeById($id: Int!) { Media(id: $id, type: ANIME) { ${fields} } }`;
export const FORMAT_QUERY = `query AnimeFormats($ids: [Int!]!) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ANIME) { id format } } }`;
export const ANIME_FORMATS = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
export function animeFormatLabel(format='') {
  return ANIME_FORMATS[String(format).toUpperCase().replaceAll(' ','_')] || (format==='ANIME'?'':format);
}
export async function withAnimeFormats(entries, client, signal) {
  const missing = entries.filter(entry=>entry.kind==='series' && (!entry.data.format?.trim() || entry.data.format==='ANIME') && Number.isInteger(Number(entry.data.anilistId)) && Number(entry.data.anilistId)>0);
  if(!missing.length)return entries;
  try {
    const formats = await client.formats(missing.map(entry=>Number(entry.data.anilistId)),signal);
    const missingIds = new Set(missing.map(entry=>entry.id));
    return entries.map(entry=>missingIds.has(entry.id)&&formats.get(Number(entry.data.anilistId)) ? {...entry,data:{...entry.data,format:formats.get(Number(entry.data.anilistId))}} : entry);
  } catch { return entries; } // Metadata failure must not hide the lyrics library.
}
export function animeId(value) {
  const match = String(value).trim().match(/^(?:https?:\/\/(?:www\.)?anilist\.co\/anime\/)?(\d+)(?:\/[^\s]*)?$/);
  return match ? Number(match[1]) : null;
}
export function selectedAnime(media, language = 'romaji') {
  const title = media.title[language] || media.title.romaji || media.title.english || media.title.native;
  if (!media.id || !title) throw new Error('Kết quả AniList thiếu ID hoặc tên.');
  return { anilistId: media.id, title, titles: media.title, titleLanguage: language,
    cover: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '',
    banner: media.bannerImage || '', year: media.startDate?.year || '', format: media.format || '',
    sourceUrl: media.siteUrl || `https://anilist.co/anime/${media.id}`, vietnamese: '' };
}
export function createAniListClient(fetcher = fetch, now = Date.now) {
  const cache = new Map(), formatCache = new Map(); let blockedUntil = 0;
  async function request(query, variables, signal) {
    if (now() < blockedUntil) throw new Error(`AniList đang giới hạn truy vấn. Thử lại sau ${Math.ceil((blockedUntil-now())/1000)} giây.`);
    const response = await fetcher('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }), signal,
    });
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After')) || 60;
      blockedUntil = now() + Math.max(1, seconds) * 1000;
      throw new Error(`AniList đang giới hạn truy vấn. Thử lại sau ${seconds} giây.`);
    }
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.[0]?.message || `Không thể kết nối AniList (${response.status}).`);
    return payload.data;
  }
  async function search(input, page = 1, signal) {
    const term = input.trim();
    if (term.length < 2 && !animeId(term)) return { media: [], hasNextPage: false };
    const key = `${term.toLowerCase()}:${page}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < 300000) return cached.result;
    const id = animeId(term);
    const data = await request(id ? ID_QUERY : SEARCH_QUERY,id ? { id } : { search: term, page },signal);
    const result = id ? { media: data.Media ? [data.Media] : [], hasNextPage: false }
      : { media: data.Page.media, hasNextPage: data.Page.pageInfo.hasNextPage };
    cache.set(key, { at: now(), result });
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    for(const media of result.media)formatCache.set(media.id,{format:media.format||'',at:now()});
    return result;
  }
  search.formats = async (ids, signal) => {
    const unique = [...new Set(ids.map(Number).filter(id=>Number.isInteger(id)&&id>0))];
    const missing = unique.filter(id=>!formatCache.has(id)||now()-formatCache.get(id).at>=300000);
    for(let offset=0;offset<missing.length;offset+=50){
      const batch=missing.slice(offset,offset+50);
      const data=await request(FORMAT_QUERY,{ids:batch},signal);
      const formats=new Map(data.Page.media.map(media=>[media.id,media.format]));
      for(const id of batch)formatCache.set(id,{format:formats.get(id)||'',at:now()});
    }
    return new Map(unique.map(id=>[id,formatCache.get(id)?.format||'']));
  };
  return search;
}
