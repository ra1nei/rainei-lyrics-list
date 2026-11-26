const requiredFields = { title: 'Tên bài hát', artist: 'Nghệ sĩ', type: 'Loại bài', group: 'Mùa / nhóm' };
export function normalizeMediaURL(value, label = 'URL') {
  const text = String(value ?? '').trim().replace(/[\r\n\t]/g, '');
  if (!text) return '';
  if (!/^(https?:\/\/|\/|\.\.?\/)/i.test(text)) throw new Error(`${label}: dùng URL http(s) hoặc đường dẫn nội bộ bắt đầu bằng /. `);
  let parsed;
  try { parsed = new URL(text, 'https://rainei.invalid/'); } catch { throw new Error(`${label} không hợp lệ.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} không hợp lệ.`);
  return /^https?:\/\//i.test(text) ? parsed.href : text;
}
export function compareAlbumSongs(a, b) {
  const group = String(a.data.group || '').localeCompare(String(b.data.group || ''));
  if (group) return group;
  const explicit = value => value !== '' && value != null && Number.isFinite(Number(value));
  const hasA = explicit(a.data.order), hasB = explicit(b.data.order);
  if (hasA && hasB && Number(a.data.order) !== Number(b.data.order)) return Number(a.data.order) - Number(b.data.order);
  if (hasA !== hasB) return hasA ? -1 : 1;
  const added = entry => Date.parse(entry.data.addedAt || entry.created_at || entry.updated_at || '') || 0;
  return added(a) - added(b);
}
// Merge editor values without changing another anime or a public snapshot.
export function mergeAlbumRows(seriesId, originals, rows, { validate = true } = {}) {
  const byId = new Map(originals.filter(e => e.kind === 'song' && e.parent_id === seriesId).map(e => [e.id, e]));
  const seen = new Set();
  return rows.map(row => {
    if (!row.id || seen.has(row.id)) throw new Error('ID bài hát bị trùng.');
    seen.add(row.id);
    const original = byId.get(row.id);
    if (originals.some(e => e.id === row.id) && !original) throw new Error('Bài hát không thuộc anime đang sửa.');
    const data = { ...(original?.data || {}), ...row.data };
    delete data.poster;
    const order = data.order === '' || data.order == null ? null : Number(data.order);
    data.addedAt ||= original?.created_at || original?.updated_at || new Date().toISOString();
    if (validate) {
      try {
        for (const [key,label] of Object.entries(requiredFields)) {
          if (!String(data[key] ?? '').trim()) throw new Error(`${label} là trường bắt buộc.`);
          data[key] = String(data[key]).trim();
        }
        if (!['OP','ED','INS','MV','MISC'].includes(data.type)) throw new Error('Loại bài không hợp lệ.');
        if (order !== null && (!Number.isFinite(order) || order < 0)) throw new Error('Thứ tự bài hát phải là số không âm.');
        data.video = normalizeMediaURL(data.video, 'Video MP4 URL');
      } catch (error) { error.entryId = row.id; throw error; }
    }
    return { ...original, id: row.id, kind: 'song', parent_id: seriesId, data: { ...data, order } };
  });
}
