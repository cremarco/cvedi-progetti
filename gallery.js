const projectBriefs = {
  '2020-2021': 'Analisi e riprogettazione di siti di organizzazioni no-profit e ONLUS con finalità sociali o culturali. Il brief richiede un sito responsive progettato a partire dai bisogni delle persone, con attenzione a contenuti, navigazione e identità visiva.',
  '2021-2022': 'Siti responsive per realtà urbane immaginarie, di cui inventare il luogo, il contesto e le caratteristiche. Il percorso presenta la città, approfondisce almeno due servizi e spiega come accedere alla realtà proposta.',
  '2022-2023': 'Siti responsive dedicati a iniziative legate a uno dei 17 obiettivi dell’Agenda 2030 per lo sviluppo sostenibile, oppure a un e-commerce di prodotti. Missione, servizi o prodotti, eventi e contenuti editoriali danno forma all’identità del progetto.',
  '2023-2024': 'Siti responsive per aziende immaginarie con prodotti e servizi fantastici: viaggi nel tempo, cucina interstellare e oggetti magici. Identità del brand, cataloghi e interazioni traducono il brief del cliente in un’esperienza coerente e accessibile.',
  '2024-2025': 'Interfacce per totem self-service dedicati a biglietti metro, informazioni turistiche, ordini al fast-food, check-in aeroportuale o prenotazioni mediche. Percorsi brevi, comandi leggibili e accessibilità guidano l’interazione.',
  '2025-2026': 'Siti responsive per ristoranti immaginari, con libertà creativa su ambienti, piatti e concept gastronomici. Il percorso permette di scoprire il locale, consultare menù, ingredienti e allergeni e prenotare un tavolo.',
};

const container = document.querySelector('#gallery-container');
const filters = document.querySelector('#year-filters');
const search = document.querySelector('#project-search');
const clearSearch = document.querySelector('#clear-search');
const status = document.querySelector('#results-status');
const summary = document.querySelector('#archive-summary');
const cardTemplate = document.querySelector('#project-card');
let projects = [];
let years = [];
let currentYear = 'all';

const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const projectCount = count => `${count} ${count === 1 ? 'progetto' : 'progetti'}`;

function yearColor(year) {
  return `var(--year-${year}, var(--color-accent))`;
}

function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function renderFilters() {
  const fragment = document.createDocumentFragment();
  for (const year of ['all', ...years]) {
    const count = year === 'all' ? projects.length : projects.filter(project => project.year === year).length;
    const button = makeElement('button', 'tab year-filter');
    button.id = `filter-${year}`;
    button.type = 'button';
    button.dataset.year = year;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'gallery-container');
    button.style.setProperty('--year-color', yearColor(year));
    button.append(
      makeElement('span', '', year === 'all' ? 'Tutti gli anni' : year.replace('-', '/')),
      makeElement('span', 'filter-count', count),
    );
    button.setAttribute('aria-label', `${year === 'all' ? 'Tutti gli anni' : `Anno accademico ${year.replace('-', '/')}`}, ${projectCount(count)}`);
    fragment.append(button);
  }
  filters.replaceChildren(fragment);
  syncFilters();
}

function syncFilters() {
  for (const button of filters.querySelectorAll('[data-year]')) {
    const active = button.dataset.year === currentYear;
    button.classList.toggle('tab-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  container.setAttribute('aria-labelledby', `filter-${currentYear}`);
}

function createCard(project, index) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const link = card.querySelector('a');
  const image = document.createElement('img');
  if (project.screen) {
    const viewer = new URL('totem.html', location.href);
    viewer.searchParams.set('project', project.archivePath);
    link.href = viewer.href;
  } else {
    link.href = project.url;
  }
  link.setAttribute('aria-label', `Apri ${project.name} (nuova scheda)`);
  card.querySelector('.project-caption').prepend(makeElement('h3', 'card-title', project.name));
  image.alt = `Anteprima del progetto ${project.name}`;
  image.width = 1280;
  image.height = 800;
  image.decoding = 'async';
  image.loading = index < 3 ? 'eager' : 'lazy';
  image.addEventListener('error', () => {
    image.hidden = true;
    card.querySelector('.image-fallback').hidden = false;
  }, { once: true });
  image.src = new URL('screenshot.webp', project.url).href;
  card.querySelector('.project-preview').prepend(image);
  return card;
}

function renderGallery() {
  if (!projects.length) {
    container.replaceChildren(createState('Nessun progetto disponibile', 'I progetti saranno visibili qui quando verranno aggiunti all’archivio.'));
    status.textContent = '0 progetti';
    return;
  }
  const terms = normalize(search.value).split(' ').filter(Boolean);
  const matching = projects.filter(project =>
    (currentYear === 'all' || project.year === currentYear) && terms.every(term => project.searchName.includes(term)),
  );
  clearSearch.hidden = search.value.length === 0;
  const selectedLabel = currentYear === 'all' ? 'tutti gli anni' : `A.A. ${currentYear.replace('-', '/')}`;
  status.textContent = `${projectCount(matching.length)}${terms.length ? ` su ${projects.filter(project => currentYear === 'all' || project.year === currentYear).length}` : ''} · ${selectedLabel}`;

  if (!matching.length) {
    container.replaceChildren(createState('Nessun progetto trovato', 'Prova un altro nome o cambia anno accademico.', 'Azzera i filtri', resetFilters));
    return;
  }

  const fragment = document.createDocumentFragment();
  let cardIndex = 0;
  for (const year of years) {
    const group = matching.filter(project => project.year === year);
    if (!group.length) continue;
    const section = makeElement('section', 'year-section');
    section.dataset.year = year;
    section.setAttribute('aria-labelledby', `year-${year}`);
    section.style.setProperty('--year-color', yearColor(year));
    const heading = makeElement('div', 'year-heading');
    const headingCopy = makeElement('div', '');
    const title = makeElement('h2', 'year-title', `A.A. ${year.replace('-', '/')}`);
    title.id = `year-${year}`;
    headingCopy.append(title);
    if (projectBriefs[year]) headingCopy.append(makeElement('p', 'year-brief', projectBriefs[year]));
    heading.append(headingCopy, makeElement('p', 'year-count', projectCount(group.length)));
    const grid = makeElement('div', 'project-grid');
    for (const project of group) grid.append(createCard(project, cardIndex++));
    section.append(heading, grid);
    fragment.append(section);
  }
  container.replaceChildren(fragment);
}

function createState(title, description, action, onAction) {
  const state = makeElement('div', 'gallery-state');
  state.append(makeElement('h2', '', title), makeElement('p', '', description));
  if (action) {
    const button = makeElement('button', 'btn', action);
    button.type = 'button';
    button.addEventListener('click', onAction);
    state.append(button);
  }
  return state;
}

function resetFilters() {
  currentYear = 'all';
  search.value = '';
  syncFilters();
  renderGallery();
  search.focus();
}

async function loadGalleryData() {
  container.setAttribute('aria-busy', 'true');
  search.disabled = true;
  for (const button of filters.querySelectorAll('button')) button.disabled = true;
  const loading = makeElement('div', 'gallery-state');
  loading.append(makeElement('span', 'loading loading-spinner loading-md'), makeElement('p', '', 'Caricamento dei progetti…'));
  loading.firstElementChild.setAttribute('aria-hidden', 'true');
  container.replaceChildren(loading);
  status.textContent = 'Caricamento dei progetti…';

  try {
    const response = await fetch('gallery-data.json');
    if (!response.ok) throw new Error('Gallery request failed');
    const data = await response.json();
    if (!Array.isArray(data.photos)) throw new Error('Invalid gallery data');
    const archiveURL = new URL('.', location.href);
    projects = data.photos.map(photo => {
      if (typeof photo.name !== 'string' || !photo.name.trim() || !/^\d{4}-\d{4}$/.test(photo['A.A.']) || typeof photo.url !== 'string') {
        throw new Error('Invalid project');
      }
      const url = new URL(photo.url.replace(/^\/+/, ''), archiveURL);
      if (url.origin !== archiveURL.origin || !url.pathname.startsWith(archiveURL.pathname) || !url.pathname.endsWith('/') || url.search || url.hash) {
        throw new Error('Invalid project URL');
      }
      return {
        name: photo.name, year: photo['A.A.'], url: url.href,
        archivePath: photo.url.replace(/^\/+/, ''), screen: photo.screen,
        searchName: normalize(photo.name),
      };
    });
    years = [...new Set(projects.map(project => project.year))].sort().reverse();
    summary.textContent = `${projectCount(projects.length)} · ${years.length} ${years.length === 1 ? 'anno accademico' : 'anni accademici'}`;
    renderFilters();
    search.disabled = projects.length === 0;
    renderGallery();
  } catch {
    status.textContent = 'Archivio non disponibile';
    summary.textContent = '';
    container.replaceChildren(createState('Impossibile caricare i progetti', 'Controlla la connessione e riprova.', 'Riprova', loadGalleryData));
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-year]');
  if (!button || button.disabled) return;
  currentYear = button.dataset.year;
  syncFilters();
  renderGallery();
});

filters.addEventListener('keydown', event => {
  const button = event.target.closest('[data-year]');
  if (!button || button.disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...filters.querySelectorAll('[data-year]')];
  const index = buttons.indexOf(button);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus({ preventScroll: true });
  buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

search.addEventListener('input', renderGallery);
search.addEventListener('keydown', event => {
  if (event.key === 'Escape' && search.value) {
    event.preventDefault();
    search.value = '';
    renderGallery();
  }
});
document.querySelector('.project-search').addEventListener('submit', event => event.preventDefault());
clearSearch.addEventListener('click', () => {
  search.value = '';
  renderGallery();
  search.focus();
});

loadGalleryData();
