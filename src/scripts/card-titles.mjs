const root = document.querySelector('#main');
const lines = new Set();
let frame;

function measureTitles() {
  frame = null;
  for (const line of lines) {
    const text = line.querySelector('.card-title-text');
    const distance = text ? Math.ceil(text.getBoundingClientRect().width - line.clientWidth) : 0;
    const overflowing = line.clientWidth > 0 && distance > 1;
    line.toggleAttribute('data-overflow', overflowing);
    if (overflowing) {
      line.style.setProperty('--title-travel', `${-distance}px`);
      line.style.setProperty('--title-duration', `${Math.max(8, distance / 24 + 4)}s`);
    }
  }
}

function queueMeasurement() {
  if (!frame) frame = requestAnimationFrame(measureTitles);
}

const sizes = new ResizeObserver(queueMeasurement);
function refreshTitles() {
  for (const line of lines) {
    if (!root.contains(line)) {
      sizes.unobserve(line);
      lines.delete(line);
    }
  }
  root.querySelectorAll('.card-title-line').forEach(line => {
    if (!lines.has(line)) {
      lines.add(line);
      sizes.observe(line);
    }
  });
  queueMeasurement();
}

if (root) {
  new MutationObserver(refreshTitles).observe(root, { childList: true, subtree: true, characterData: true });
  document.fonts?.ready.then(queueMeasurement);
  refreshTitles();
}
