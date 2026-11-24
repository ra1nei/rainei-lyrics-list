export const normalize = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
export function publicEntries(entries) {
  const seriesIds = new Set(entries.filter(e => e.kind === 'series').map(e => e.id));
  return entries.filter(e => e.kind === 'series' || seriesIds.has(e.parent_id));
}
export function publishSnapshot(drafts, published, id) {
  const draft = drafts.find(e => e.id === id);
  if (!draft) throw new Error('Không tìm thấy bản nháp.');
  if (!draft.data.title?.trim()) throw new Error('Cần nhập tên trước khi xuất bản.');
  if (draft.kind === 'song' && !published.some(e => e.id === draft.parent_id && e.kind === 'series')) throw new Error('Hãy xuất bản phim trước khi xuất bản bài hát.');
  return [...published.filter(e => e.id !== id), structuredClone(draft)];
}
export function createStore({ url, key, storage = sessionStorage, fetcher = fetch }) {
  if (!url || !key) throw new Error('Thiếu cấu hình Supabase.');
  const dbUrl = url.replace(/\/$/, '');
  let session; try { session = JSON.parse(storage.getItem('rainei-session')); } catch { session = null; }
  function saveSession(value) { session = value; if (value) storage.setItem('rainei-session', JSON.stringify(value)); else storage.removeItem('rainei-session'); }
  async function request(path, options = {}, authenticated = false) {
    if (authenticated && !session) throw new Error('Bạn cần đăng nhập.');
    if (authenticated && session.expires_at * 1000 < Date.now() + 60000) {
      const refreshed = await fetcher(`${dbUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!refreshed.ok) { saveSession(null); throw new Error('Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'); }
      saveSession(await refreshed.json());
    }
    const authorization = authenticated ? { Authorization: `Bearer ${session.access_token}` } : key.startsWith('sb_publishable_') ? {} : { Authorization: `Bearer ${key}` };
    const response = await fetcher(`${dbUrl}${path}`, { ...options, headers: { apikey: key, ...authorization, 'Content-Type': 'application/json', ...options.headers } });
    const raw = await response.text(); let body; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok) {
      const message = body?.message || body?.msg || body?.error_description || `Yêu cầu thất bại (${response.status}).`;
      if (message.includes('Publish the parent anime first')) throw new Error('Bản nháp bài hát đã được giữ lại. Cần xuất bản anime trước khi công khai bài hát.');
      throw new Error(message);
    }
    return body;
  }
  async function listAll(table, authenticated = false, order = 'id.asc') {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const page = await request(`/rest/v1/${table}?select=*&order=${order}&limit=500&offset=${offset}`, {}, authenticated);
      if (!Array.isArray(page)) throw new Error('Dữ liệu phản hồi từ database không hợp lệ.');
      result.push(...page);
      if (page.length < 500) return result;
    }
  }
  return {
    get signedIn() { return Boolean(session); },
    async login(email, password) { saveSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })); },
    async logout() { try { if (session) await request('/auth/v1/logout', { method: 'POST' }, true); } finally { saveSession(null); } },
    async listPublic() { return publicEntries(await listAll('published_entries')); },
    async listDrafts() {
      const admins = await request('/rest/v1/admin_users?select=user_id', {}, true);
      if (!admins.length) throw new Error('Tài khoản này chưa được cấp quyền quản trị.');
      return listAll('entries', true, 'updated_at.desc,id.asc');
    },
    async save(entry) {
      const value = { ...entry, updated_at: new Date().toISOString() };
      if (value.kind === 'song') value.data = { ...value.data, addedAt: value.data.addedAt || entry.created_at || entry.updated_at || value.updated_at };
      await request('/rest/v1/entries?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(value) }, true);
    },
    async saveMany(entries) {
      if (!entries.length) return;
      const values = entries.map(entry => {
        const value = { ...entry, updated_at: new Date().toISOString() };
        if (value.kind === 'song') value.data = { ...value.data, addedAt: value.data.addedAt || entry.created_at || entry.updated_at || value.updated_at };
        return value;
      });
      // One PostgREST statement: saving the expanded editor is transactional.
      await request('/rest/v1/entries?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(values) }, true);
    },
    async publish(id) {
      await request('/rest/v1/rpc/publish_entry', { method: 'POST', body: JSON.stringify({ entry_id: id }) }, true);
    },
    async unpublish(id) {
      await request('/rest/v1/rpc/unpublish_entry', { method: 'POST', body: JSON.stringify({ entry_id: id }) }, true);
    },
    async remove(id) {
      await request(`/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
    },
  };
}
