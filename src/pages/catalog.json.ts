import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import { seriesIdOf, groupKeyOf, orderOf } from '../utils/songs';
export async function GET() {
  // Never bundle draft/legacy text into the public site when live storage is enabled.
  if (import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  }
  const series = await getCollection('series');
  const songs = await getCollection('songs');
  const entries: any[] = series.map(s => ({ id: s.id, kind: 'series', parent_id: null, updated_at: new Date(0).toISOString(), data: {
    title: s.data.romaji, vietnamese: s.data.vietnamese, year: s.data.year, cover: s.data.cover,
    titles: { romaji: s.data.romaji }, legacyId: s.id,
    anilistId: Number(s.data.cover?.match(/\/b[xs](\d+)-/)?.[1]) || undefined,
  } }));
  for (const song of songs) {
    const poster = song.data.poster ? (await getImage({ src: song.data.poster, width: 1280, format: 'webp' })).src : '';
    entries.push({ id: song.id, kind: 'song', parent_id: seriesIdOf(song.id), updated_at: new Date(0).toISOString(), data: {
      title: song.data.title, artist: song.data.artist, type: song.data.type, group: groupKeyOf(song.id),
      order: orderOf(song), video: song.data.video, poster, body: song.body || '', date: song.data.date,
    } });
  }
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
