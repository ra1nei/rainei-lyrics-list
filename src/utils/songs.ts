import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

// Helper dùng chung cho trang chủ và trang series.
// Id một bài có dạng <phim>/<nhóm>/<tên bài>, vd sousou-no-frieren/01_season-1/01_yuusha

export const MISC_GROUP = '99_misc';

// Còn lại gom hết vào MISC
export const TAG_ORDER = ['OP', 'ED', 'INS', 'MV'] as const;

// Thư mục nào không khai ở đây thì tên mùa tự suy từ tên thư mục
export const SEASON_MAP: Record<string, string> = {
  'season-1': 'Mùa 01',
  'season-2': 'Mùa 02',
  'season-3': 'Mùa 03',
  'season-4': 'Mùa 04',
  movie: 'Phim điện ảnh',
  ova: 'Tập đặc biệt',
  misc: 'MUSIC VIDEO',
};

export type SeriesInfo = CollectionEntry<'series'>['data'];
export type Song = CollectionEntry<'songs'>;

// ---------------------------------------------------------------- series

// key là id trong URL
export async function loadSeriesLookup(): Promise<Map<string, SeriesInfo>> {
  const entries = await getCollection('series');
  return new Map(entries.map((entry) => [entry.id, entry.data]));
}

// Chưa có file yaml thì hiện tạm id, đỡ vỡ trang
export function seriesInfoOf(
  lookup: Map<string, SeriesInfo>,
  id: string
): SeriesInfo {
  return lookup.get(id) ?? { romaji: id, vietnamese: id, year: '' };
}

// ---------------------------------------------------------------- id

export function seriesIdOf(id: string): string {
  return id.split('/')[0];
}

export function songIdOf(id: string): string {
  return id.split('/').pop()!;
}

// Bài nằm thẳng trong thư mục phim thì tính là misc
export function groupKeyOf(id: string): string {
  const parts = id.split('/');
  return parts.length > 2 ? parts[1] : MISC_GROUP;
}

// ---------------------------------------------------------------- thứ tự

// 01_Yuusha.mdx -> 1. Không có số thì xuống cuối.
export function fileOrderOf(id: string): number {
  const match = /^(\d+)_/.exec(songIdOf(id));
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

// Hai nguồn vì hai cách thêm bài: tự tạo file thì đánh số vào tên file,
// còn CMS đặt tên theo tựa đề nên không có số, phải điền ô "Thứ tự trong mùa".
export function orderOf(song: { id: string; data: { order?: number | null } }): number {
  return song.data.order ?? fileOrderOf(song.id);
}

// Đừng sắp theo date. Nhiều bài trùng ngày, hoà thì thứ tự rơi vào tay Astro,
// mà dev server với bản build nạp file khác nhau nên local một kiểu web một kiểu.
// Phá hoà tới tận id cho chắc.
export function compareSongs(
  a: { id: string; data: { date?: Date | null; order?: number | null } },
  b: { id: string; data: { date?: Date | null; order?: number | null } }
): number {
  const byFile = orderOf(a) - orderOf(b);
  if (byFile !== 0) return byFile;

  const byDate = (a.data.date?.valueOf() ?? 0) - (b.data.date?.valueOf() ?? 0);
  if (byDate !== 0) return byDate;

  return a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------- tag & tiêu đề

interface SongLike {
  id: string;
  data: { type?: string; season?: string };
}

// Nhóm có nhiều OP thì đánh OP1/OP2, có mỗi một thì để trơn OP
export function buildSongLabels<T extends SongLike>(
  groups: Record<string, T[]>
): Record<string, string> {
  const labels: Record<string, string> = {};

  for (const list of Object.values(groups)) {
    const assign = (subset: T[], prefix: string) => {
      subset.forEach((song, i) => {
        labels[song.id] = subset.length > 1 ? `${prefix}${i + 1}` : prefix;
      });
    };

    for (const tag of TAG_ORDER) {
      assign(
        list.filter((s) => s.data.type === tag),
        tag
      );
    }

    const rest = list.filter((s) => !TAG_ORDER.includes(s.data.type as any));
    if (rest.length > 0) assign(rest, 'MISC');
  }

  return labels;
}

// Tên nhóm hiển thị, in hoa hết.
// Ưu tiên: season tự đặt trong frontmatter > tên phim (nếu chỉ có 1 nhóm) > SEASON_MAP
export function makeHeadingFormatter<T extends SongLike>(
  groups: Record<string, T[]>,
  seriesInfo: SeriesInfo
) {
  const keys = Object.keys(groups);
  const tvSeasonsCount = keys.filter((k) => k.includes('season-')).length;
  const contentGroupsCount = keys.filter((k) => !k.includes('misc')).length;

  return (groupKey: string): string => {
    const clean = groupKey.replace(/^\d+_/, '');
    const mapped = SEASON_MAP[clean];

    if (clean.includes('misc')) {
      return SEASON_MAP.misc;
    }

    const customSeason = groups[groupKey]?.[0]?.data.season;
    if (customSeason) {
      return `${seriesInfo.vietnamese} - ${customSeason}`.toUpperCase();
    }

    // Chỉ có đúng 1 mùa hoặc 1 phim thì khỏi lặp tên mùa cho rườm
    const isOnlySeason = clean.startsWith('season-') && tvSeasonsCount === 1;
    const isOnlyMovie = clean === 'movie' && contentGroupsCount === 1;
    if (isOnlySeason || isOnlyMovie) {
      return seriesInfo.vietnamese.toUpperCase();
    }

    const seasonName =
      mapped || clean.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    return `${seriesInfo.vietnamese} - ${seasonName}`.toUpperCase();
  };
}

// normalizeVi nằm bên utils/text.ts, script phía trình duyệt cũng xài.
