const stage = document.querySelector('#totem-stage');
const canvas = document.querySelector('#totem-canvas');
const frame = document.querySelector('#totem-frame');
const title = document.querySelector('#totem-title');
const status = document.querySelector('#totem-status');
const zoom = document.querySelector('#totem-zoom');
const original = document.querySelector('#totem-original');
let projectURL;
let screen;
let dimensions;
let enlarged = false;

function fitScreen() {
  if (!dimensions) return;
  const style = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const fit = Math.min(width / dimensions.width, height / dimensions.height, 1);
  const scale = enlarged ? Math.min(fit * 2, 1) : fit;
  frame.style.width = `${dimensions.width}px`;
  frame.style.height = `${dimensions.height}px`;
  frame.style.transform = `scale(${scale})`;
  canvas.style.width = `${dimensions.width * scale}px`;
  canvas.style.height = `${dimensions.height * scale}px`;
}

function requestedPage() {
  const path = location.hash ? decodeURIComponent(location.hash.slice(1)) : 'index.html';
  const url = new URL(path, projectURL);
  if (url.origin !== projectURL.origin || !url.pathname.startsWith(projectURL.pathname)) {
    throw new Error('Invalid totem page');
  }
  return url;
}

function syncPage() {
  // The frame keeps its own viewport, including Bootstrap breakpoints, vh/vw,
  // fixed navigation and modal positioning, while the outer page scales it.
  const url = new URL(frame.contentWindow.location.href);
  if (url.origin !== projectURL.origin || !url.pathname.startsWith(projectURL.pathname)) return;
  const relativePath = url.pathname.slice(projectURL.pathname.length);
  const path = relativePath + url.search + url.hash;
  dimensions = screen.pages?.[relativePath] || screen;
  const nativeURL = new URL(url);
  nativeURL.searchParams.set('original', '1');
  original.href = nativeURL.href;
  history.replaceState(null, '', `#${encodeURIComponent(path)}`);
  fitScreen();
}

zoom.addEventListener('click', () => {
  enlarged = !enlarged;
  zoom.textContent = enlarged ? 'Adatta allo schermo' : 'Ingrandisci';
  zoom.setAttribute('aria-pressed', String(enlarged));
  fitScreen();
  stage.scrollTo(0, 0);
});
new ResizeObserver(fitScreen).observe(stage);
window.addEventListener('hashchange', () => {
  if (!projectURL) return;
  try {
    const url = requestedPage().href;
    if (frame.contentWindow.location.href !== url) frame.src = url;
  } catch { /* Keep the current valid page. */ }
});

async function loadTotem() {
  try {
    const response = await fetch('gallery-data.json');
    if (!response.ok) throw new Error('Archive unavailable');
    const data = await response.json();
    const selected = new URLSearchParams(location.search).get('project');
    const project = data.photos.find(photo => photo.screen && photo.url.replace(/^\/+/, '') === selected);
    if (!project) throw new Error('Unknown totem');
    projectURL = new URL(project.url.replace(/^\/+/, ''), new URL('.', location.href));
    screen = project.screen;
    dimensions = screen;
    title.textContent = project.name;
    document.title = `${project.name} · Progetti CVeDI`;
    frame.title = `Progetto interattivo ${project.name}`;
    frame.addEventListener('load', () => {
      try { syncPage(); } catch { /* External links can leave the project frame. */ }
      status.hidden = true;
    });
    canvas.hidden = false;
    original.hidden = false;
    zoom.disabled = false;
    fitScreen();
    frame.src = requestedPage().href;
  } catch {
    canvas.hidden = true;
    original.hidden = true;
    zoom.disabled = true;
    status.textContent = 'Impossibile aprire il totem. Torna ai progetti e riprova.';
  }
}
loadTotem();
