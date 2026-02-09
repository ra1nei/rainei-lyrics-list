interface SeriesInfo {
  romaji: string;
  vietnamese: string;
  year: number | string;
  cover?: string;
}

export const SERIES_MAP: Record<string, SeriesInfo> = {
  "sousou-no-frieren": {
    romaji: "Sousou no Frieren",
    vietnamese: "Pháp Sư Tiễn Táng Frieren",
    year: 2023,
    cover: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg"
  },
  "takopi-no-genzai": {
    romaji: "Takopi no Genzai",
    vietnamese: "Nguyên Tội Của Takopi",
    year: 2025,
    cover: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx185407-7uzY4fA3hokP.jpg"
  },
  "kyoukai-no-kanata": {
    romaji: "Kyoukai no Kanata",
    vietnamese: "Vượt Xa Chân Trời",
    year: 2013,
    cover: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx18153-oDqA9zQzQPOq.png"
  },
  "chou-kaguya-hime": {
    romaji: "Chou Kaguya-hime!",
    vietnamese: "Công Chúa Vũ Trụ Kaguya!",
    year: 2026,
    cover: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx201903-v43gxQKw8Tc8.jpg"
  }
};

export const SEASON_MAP: Record<string, string> = {
  "season-1": "Mùa 01",
  "season-2": "Mùa 02",
  "season-3": "Mùa 03",
  "season-4": "Mùa 04",
  "movie": "Phim điện ảnh",
  "ova": "Tập đặc biệt",
  "misc": "LINH TINH"
};