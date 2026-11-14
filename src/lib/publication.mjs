export function filterByPublication(entries, published, filter = 'all') {
  const publicIds = new Set(published.map(entry => entry.id));
  return entries.filter(entry => filter === 'published' ? publicIds.has(entry.id) : filter === 'draft' ? !publicIds.has(entry.id) : true);
}
