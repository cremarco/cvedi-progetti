// Direct project links use the same fitted screen as links from the gallery.
// Embedded pages and the explicit original view keep the native prototype.
if (window.top === window.self && !new URLSearchParams(location.search).has('original')) {
  const archive = new URL('.', document.currentScript.src);
  const project = new URL('.', location.href);
  const viewer = new URL('totem.html', archive);
  viewer.searchParams.set('project', project.pathname.slice(archive.pathname.length));
  viewer.hash = encodeURIComponent(`index.html${location.search}${location.hash}`);
  location.replace(viewer.href);
}
