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
export function createStore({ url, key, seed, storage = sessionStorage }) {
  const configured = Boolean(url && key);
  const dbUrl = (url || '').replace(/\/$/, '');
  const readLocal = () => { try { return JSON.parse(localStorage.getItem('rainei-preview-v1')) || null; } catch { return null; } };
  let local = readLocal() || { drafts: structuredClone(seed), published: structuredClone(seed) };
  let session; try { session = JSON.parse(storage.getItem('rainei-session')); } catch { session = null; }
  function saveSession(value) { session = value; if (value) storage.setItem('rainei-session', JSON.stringify(value)); else storage.removeItem('rainei-session'); }
  async function request(path, options = {}, authenticated = false) {
    if (authenticated && !session) throw new Error('Bạn cần đăng nhập.');
    if (authenticated && session.expires_at * 1000 < Date.now() + 60000) {
      const refreshed = await fetch(`${dbUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!refreshed.ok) { saveSession(null); throw new Error('Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'); }
      saveSession(await refreshed.json());
    }
    const authorization = authenticated ? { Authorization: `Bearer ${session.access_token}` } : key.startsWith('sb_publishable_') ? {} : { Authorization: `Bearer ${key}` };
    const response = await fetch(`${dbUrl}${path}`, { ...options, headers: { apikey: key, ...authorization, 'Content-Type': 'application/json', ...options.headers } });
    const raw = await response.text(); let body; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok) {
      const message = body?.message || body?.msg || body?.error_description || `Yêu cầu thất bại (${response.status}).`;
      if (message.includes('Publish the parent anime first')) throw new Error('Bản nháp bài hát đã được giữ lại. Cần xuất bản anime trước khi công khai bài hát.');
      throw new Error(message);
    }
    return body;
  }
  const persist = () => localStorage.setItem('rainei-preview-v1', JSON.stringify(local));
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
    configured, get signedIn() { return Boolean(session); },
    async login(email, password) { saveSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })); },
    async logout() { try { if (session) await request('/auth/v1/logout', { method: 'POST' }, true); } finally { saveSession(null); } },
    async listPublic() { return configured ? publicEntries(await listAll('published_entries')) : publicEntries(local.published); },
    async listDrafts() {
      if (!configured) return structuredClone(local.drafts);
      const admins = await request('/rest/v1/admin_users?select=user_id', {}, true);
      if (!admins.length) throw new Error('Tài khoản này chưa được cấp quyền quản trị.');
      return listAll('entries', true, 'updated_at.desc,id.asc');
    },
    async save(entry) {
      const value = { ...entry, updated_at: new Date().toISOString() };
      if (value.kind === 'song') value.data = { ...value.data, addedAt: value.data.addedAt || entry.created_at || entry.updated_at || value.updated_at };
      if (!configured) { local.drafts = [...local.drafts.filter(e => e.id !== value.id), value]; persist(); return; }
      await request('/rest/v1/entries?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(value) }, true);
    },
    async saveMany(entries) {
      if (!entries.length) return;
      const values = entries.map(entry => {
        const value = { ...entry, updated_at: new Date().toISOString() };
        if (value.kind === 'song') value.data = { ...value.data, addedAt: value.data.addedAt || entry.created_at || entry.updated_at || value.updated_at };
        return value;
      });
      if (!configured) {
        const ids = new Set(values.map(entry => entry.id));
        local.drafts = [...local.drafts.filter(entry => !ids.has(entry.id)), ...values];
        persist();
        return;
      }
      // One PostgREST statement: saving the expanded editor is transactional.
      await request('/rest/v1/entries?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(values) }, true);
    },
    async publish(id) {
      if (!configured) { local.published = publishSnapshot(local.drafts, local.published, id); persist(); return; }
      await request('/rest/v1/rpc/publish_entry', { method: 'POST', body: JSON.stringify({ entry_id: id }) }, true);
    },
    async unpublish(id) {
      if (!configured) { local.published = local.published.filter(e => e.id !== id && e.parent_id !== id); persist(); return; }
      await request('/rest/v1/rpc/unpublish_entry', { method: 'POST', body: JSON.stringify({ entry_id: id }) }, true);
    },
    async remove(id) {
      if (!configured) { local.drafts = local.drafts.filter(e => e.id !== id && e.parent_id !== id); local.published = local.published.filter(e => e.id !== id && e.parent_id !== id); persist(); return; }
      await request(`/rest/v1/entries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
    },
    async importSeed() {
      const existing = await this.listDrafts();
      for (const entry of seed) if (!existing.some(e => e.id === entry.id)) await this.save(entry);
    },
  };
}
