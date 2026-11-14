const fields = `id siteUrl title { romaji english native } coverImage { extraLarge large medium color } bannerImage startDate { year } format episodes`;
export const SEARCH_QUERY = `query SearchAnime($search: String!, $page: Int!) { Page(page: $page, perPage: 10) { pageInfo { hasNextPage } media(search: $search, type: ANIME) { ${fields} } } }`;
export const ID_QUERY = `query AnimeById($id: Int!) { Media(id: $id, type: ANIME) { ${fields} } }`;
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
  const cache = new Map(); let blockedUntil = 0;
  return async function search(input, page = 1, signal) {
    const term = input.trim();
    if (term.length < 2 && !animeId(term)) return { media: [], hasNextPage: false };
    const key = `${term.toLowerCase()}:${page}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < 300000) return cached.result;
    if (now() < blockedUntil) throw new Error(`AniList đang giới hạn truy vấn. Thử lại sau ${Math.ceil((blockedUntil-now())/1000)} giây.`);
    const id = animeId(term);
    const response = await fetcher('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: id ? ID_QUERY : SEARCH_QUERY, variables: id ? { id } : { search: term, page } }), signal,
    });
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After')) || 60;
      blockedUntil = now() + Math.max(1, seconds) * 1000;
      throw new Error(`AniList đang giới hạn truy vấn. Thử lại sau ${seconds} giây.`);
    }
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.[0]?.message || `Không thể kết nối AniList (${response.status}).`);
    const result = id ? { media: payload.data.Media ? [payload.data.Media] : [], hasNextPage: false }
      : { media: payload.data.Page.media, hasNextPage: payload.data.Page.pageInfo.hasNextPage };
    cache.set(key, { at: now(), result });
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    return result;
  };
}
