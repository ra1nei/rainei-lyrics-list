import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

/**
 * Helper dùng chung cho trang chủ và trang series.
 * Id của một bài có dạng: <series>/<nhóm>/<tên bài>
 * VD: sousou-no-frieren/01_season-1/01_yuusha
 */

export const MISC_GROUP = '99_misc';

/** Thứ tự tag hiển thị: OP trước, rồi ED, INS, MV, còn lại gom vào MISC. */
export const TAG_ORDER = ['OP', 'ED', 'INS', 'MV'] as const;

/** Tên thư mục con -> tên mùa hiển thị. Không khai ở đây thì tự suy từ tên thư mục. */
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

/**
 * Nạp toàn bộ thông tin phim từ collection `series`.
 * Trước đây dữ liệu này hardcode trong src/utils/seriesMap.ts.
 */
export async function loadSeriesLookup(): Promise<Map<string, SeriesInfo>> {
  const entries = await getCollection('series');
  return new Map(entries.map((entry) => [entry.id, entry.data]));
}

/** Phim chưa khai file yaml thì hiện tạm id thay cho tên, để trang không vỡ. */
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

/** Thư mục con chứa bài. Bài nằm ngay trong thư mục series thì coi là misc. */
export function groupKeyOf(id: string): string {
  const parts = id.split('/');
  return parts.length > 2 ? parts[1] : MISC_GROUP;
}

// ---------------------------------------------------------------- thứ tự

/**
 * Số thứ tự lấy từ đầu tên file: 01_Yuusha.mdx -> 1.
 * File không đánh số thì đẩy xuống cuối nhóm.
 */
export function fileOrderOf(id: string): number {
  const match = /^(\d+)_/.exec(songIdOf(id));
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

/**
 * Thứ tự hiển thị bài trong một nhóm.
 *
 * Sắp theo số đầu tên file, KHÔNG theo date. Trước đây sort bằng date, mà
 * nhiều bài trùng ngày nên phần hoà phụ thuộc thứ tự nạp file của Astro:
 * dev server và bản build cho ra hai thứ tự khác nhau.
 *
 * Phá hoà bằng date rồi tới id để phép so sánh là toàn phần, bảo đảm
 * dev và build luôn ra cùng kết quả.
 */
export function compareSongs(
  a: { id: string; data: { date?: Date } },
  b: { id: string; data: { date?: Date } }
): number {
  const byFile = fileOrderOf(a.id) - fileOrderOf(b.id);
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

/**
 * Gán tag cho từng bài trong một nhóm: OP1/OP2 nếu nhóm có nhiều OP,
 * chỉ OP nếu có đúng một. Bài không thuộc 4 loại chuẩn thì gắn MISC.
 */
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

/**
 * Tên hiển thị của một nhóm. Trả về chữ IN HOA.
 * Ưu tiên: season tự đặt trong frontmatter > tên series (khi chỉ có 1 nhóm) > SEASON_MAP.
 */
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

    // Series chỉ có đúng một mùa / một phim thì khỏi lặp lại tên mùa
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

// normalizeVi nằm ở utils/text.ts vì script phía trình duyệt cũng cần dùng.
