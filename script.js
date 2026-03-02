'use strict';

// ── Constantes ──────────────────────────────────────────────
const DB_NAME    = 'watchlistDB';
const DB_VERSION = 2;
const STORE_NAME = 'items';

const CATEGORIES = [
  { value: 'horreur',            label: 'Horreur' },
  { value: 'comedie',            label: 'Comédie' },
  { value: 'action',             label: 'Action / Aventure' },
  { value: 'drame',              label: 'Drame' },
  { value: 'animation',          label: 'Animation' },
  { value: 'SF',                 label: 'SF' },
];

// ── État ─────────────────────────────────────────────────────
let db;
let currentType       = null;
let pendingCategories = [];


const viewMode     = { film: 'unseen', serie: 'unseen' };
const activeFilter = { film: 'tous',   serie: 'tous'   };
const selectionMode= { film: false,    serie: false     };
const selectedIds  = { film: new Set(), serie: new Set() };


const tabBtns     = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const GRIDS      = { film: document.getElementById('grid-film'),   serie: document.getElementById('grid-serie')   };
const EMPTIES    = { film: document.getElementById('empty-film'),  serie: document.getElementById('empty-serie')  };
const FILTERBARS = { film: document.getElementById('filter-film'), serie: document.getElementById('filter-serie') };
const ACTIONS    = { film: document.getElementById('actions-film'),serie: document.getElementById('actions-serie') };
const SELBARS    = { film: document.getElementById('selbar-film'), serie: document.getElementById('selbar-serie') };
const SELCOUNTS  = { film: document.getElementById('selcount-film'),serie: document.getElementById('selcount-serie') };
const BTSELDELS  = { film: document.getElementById('btn-seldel-film'),serie: document.getElementById('btn-seldel-serie') };
const TOGGLEBTNS = { film: document.getElementById('btn-toggle-film'), serie: document.getElementById('btn-toggle-serie') };
const ADDBTNS    = { film: document.getElementById('btn-add-film'), serie: document.getElementById('btn-add-serie') };
const TAB_H2     = { film: document.querySelector('#tab-film h2'), serie: document.querySelector('#tab-serie h2') };

const modalOverlay  = document.getElementById('modal-overlay');
const modalTitle    = document.getElementById('modal-title');
const modalInput    = document.getElementById('modal-input');
const modalCatChips = document.getElementById('modal-cat-chips');
const modalYear     = document.getElementById('modal-year');
const btnConfirm    = document.getElementById('btn-confirm');
const btnCancel     = document.getElementById('btn-cancel');



function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database   = event.target.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id', autoIncrement: true,
        });
        store.createIndex('type',     'type',     { unique: false });
        store.createIndex('category', 'category', { unique: false });
      } else if (oldVersion < 2) {
        const store = event.target.transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains('category')) {
          store.createIndex('category', 'category', { unique: false });
        }
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror   = (e) => reject(e.target.error);
  });
}


function addItem(name, type, categories, year) {
  return new Promise((resolve, reject) => {
    const tx     = db.transaction(STORE_NAME, 'readwrite');
    const store  = tx.objectStore(STORE_NAME);
    const record = { name, type, categories };
    if (year) record.year = year;
    const req = store.add(record);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function updateItem(id, changes) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const get   = store.get(id);
    get.onsuccess = (e) => {
      const record = e.target.result;
      Object.assign(record, changes);
      const put = store.put(record);
      put.onsuccess = () => resolve();
      put.onerror   = (e2) => reject(e2.target.error);
    };
    get.onerror = (e) => reject(e.target.error);
  });
}

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

function getItemsByType(type) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.index('type').getAll(type);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}


function getCategoryLabel(value) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? '';
}

function itemCats(item) {
  return item.categories ?? (item.category ? [item.category] : []);
}


function renderCard(item, prepend = false) {
  const cats = itemCats(item);
  const grid = GRIDS[item.type];

  const card = document.createElement('div');
  card.className      = 'card';
  card.dataset.id     = item.id;
  card.dataset.type   = item.type;
  card.dataset.cats   = cats.join(',');
  card.dataset.name   = item.name;
  card.dataset.seen   = item.seen   ? '1' : '0';
  card.dataset.rating = item.rating ?? 0;
  if (item.year) card.dataset.year = item.year;


  const cardTop  = document.createElement('div');
  cardTop.className = 'card-top';
  const nameSpan = document.createElement('span');
  nameSpan.className   = 'card-name';
  nameSpan.textContent = item.name;
  cardTop.appendChild(nameSpan);
  card.appendChild(cardTop);


  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const badgesEl = document.createElement('div');
  badgesEl.className = 'card-badges';
  cats.forEach((cat) => {
    const b = document.createElement('span');
    b.className   = 'category-badge';
    b.dataset.cat = cat;
    b.textContent = getCategoryLabel(cat);
    badgesEl.appendChild(b);
  });
  footer.appendChild(badgesEl);

  const statusEl = document.createElement('div');
  statusEl.className = 'card-status';
  footer.appendChild(statusEl);

  if (item.year) {
    const yearSpan = document.createElement('span');
    yearSpan.className   = 'card-year';
    yearSpan.textContent = item.year;
    footer.appendChild(yearSpan);
  }

  card.appendChild(footer);
  refreshCardStatus(card, !!item.seen, item.rating ?? 0);

  if (prepend && grid.firstChild) {
    grid.insertBefore(card, grid.firstChild);
  } else {
    grid.appendChild(card);
  }

  return card;
}

function refreshCardStatus(card, seen, rating) {
  card.dataset.seen   = seen ? '1' : '0';
  card.dataset.rating = rating;

  const statusEl = card.querySelector('.card-status');
  if (!statusEl) return;
  statusEl.innerHTML = '';

  if (rating > 0) {
    const r = document.createElement('span');
    r.className   = 'card-rating';
    r.textContent = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    statusEl.appendChild(r);
  }
}


function applyFilters(type) {
  const cat      = activeFilter[type];
  const showSeen = viewMode[type] === 'seen';

  [...GRIDS[type].children].forEach((card) => {
    const cardCats = card.dataset.cats ? card.dataset.cats.split(',') : [];
    const catMatch = cat === 'tous' || cardCats.includes(cat);
    const vuMatch  = showSeen ? card.dataset.seen === '1' : card.dataset.seen !== '1';
    card.style.display = (catMatch && vuMatch) ? '' : 'none';
  });

  updateEmptyMessage(type);
}

function applyFilter(type, cat) {
  activeFilter[type] = cat;

  FILTERBARS[type].querySelectorAll('.filter-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.cat === cat);
  });

  applyFilters(type);
}

function updateEmptyMessage(type) {
  const grid  = GRIDS[type];
  const empty = EMPTIES[type];
  const count = [...grid.children].filter((c) => c.style.display !== 'none').length;

  if (count === 0) {
    empty.textContent = viewMode[type] === 'seen'
      ? (type === 'film' ? 'Aucun film vu pour l\'instant.' : 'Aucune série vue pour l\'instant.')
      : (type === 'film' ? 'Aucun film pour l\'instant. Ajoutez-en un !' : 'Aucune série pour l\'instant. Ajoutez-en une !');
    empty.classList.add('visible');
  } else {
    empty.classList.remove('visible');
  }
}

async function loadItems(type) {
  const items = await getItemsByType(type);
  items.forEach((item) => renderCard(item));
  applyFilters(type);
}



function toggleViewMode(type) {
  const newMode  = viewMode[type] === 'unseen' ? 'seen' : 'unseen';
  viewMode[type] = newMode;

  const showSeen = newMode === 'seen';

  TOGGLEBTNS[type].classList.toggle('active', showSeen);
  TOGGLEBTNS[type].textContent  = showSeen ? '← À voir' : '✓ Vus';
  ADDBTNS[type].style.display   = showSeen ? 'none'     : '';
  TAB_H2[type].textContent      = showSeen
    ? (type === 'film' ? 'Films vus' : 'Séries vues')
    : (type === 'film' ? 'Mes Films' : 'Mes Séries');


  applyFilter(type, 'tous');
}


function enterSelectionMode(type) {
  selectionMode[type] = true;
  selectedIds[type].clear();
  document.getElementById(`tab-${type}`).classList.add('selection-mode');
  ACTIONS[type].style.display = 'none';
  SELBARS[type].classList.add('visible');
  updateSelectionCount(type);
}

function exitSelectionMode(type) {
  selectionMode[type] = false;
  selectedIds[type].clear();
  document.getElementById(`tab-${type}`).classList.remove('selection-mode');
  GRIDS[type].querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
  ACTIONS[type].style.display = '';
  SELBARS[type].classList.remove('visible');
}

function toggleCardSelection(card, id, type) {
  const ids = selectedIds[type];
  if (ids.has(id)) {
    ids.delete(id);
    card.classList.remove('selected');
  } else {
    ids.add(id);
    card.classList.add('selected');
  }
  updateSelectionCount(type);
}

function updateSelectionCount(type) {
  const count = selectedIds[type].size;
  SELCOUNTS[type].textContent = count === 0
    ? '0 sélectionné'
    : `${count} sélectionné${count > 1 ? 's' : ''}`;
  BTSELDELS[type].disabled = count === 0;
}

async function deleteSelection(type) {
  const ids  = [...selectedIds[type]];
  const grid = GRIDS[type];

  await Promise.all(ids.map((id) => deleteItem(id)));

  ids.forEach((id) => {
    const card = grid.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.93)';
    setTimeout(() => card.remove(), 210);
  });

  setTimeout(() => {
    exitSelectionMode(type);
    updateEmptyMessage(type);
  }, 220);
}



function openModal(type) {
  currentType            = type;
  modalTitle.textContent = type === 'film' ? 'Ajouter un film' : 'Ajouter une série';
  modalInput.value       = '';
  modalYear.value        = '';
  pendingCategories      = [];
  modalCatChips.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('selected'));
  modalOverlay.classList.add('open');
  setTimeout(() => modalInput.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  modalInput.value  = '';
  modalYear.value   = '';
  pendingCategories = [];
  modalCatChips.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('selected'));
  currentType = null;
}

async function handleConfirm() {
  const name       = modalInput.value.trim();
  const categories = [...pendingCategories];
  const yearRaw    = modalYear.value.trim();
  const year       = yearRaw ? parseInt(yearRaw, 10) : null;

  if (!name) {
    modalInput.style.borderColor = 'var(--accent-danger)';
    setTimeout(() => { modalInput.style.borderColor = ''; }, 1200);
    modalInput.focus();
    return;
  }

  const id   = await addItem(name, currentType, categories, year);
  const item = { id, name, type: currentType, categories, year, seen: false };
  renderCard(item, true);
  applyFilters(currentType);

  closeModal();
}



let currentDetailCard = null;

const detailOverlay = document.getElementById('detail-overlay');
const detailTitle   = document.getElementById('detail-title');
const detailYear    = document.getElementById('detail-year');
const detailStars   = document.getElementById('detail-stars');
const btnVu         = document.getElementById('btn-vu');
const btnFind       = document.getElementById('btn-find');

function renderStars(rating) {
  detailStars.querySelectorAll('.star').forEach((s) => {
    s.classList.toggle('active', Number(s.dataset.value) <= rating);
  });
}

function openDetailModal(card) {
  currentDetailCard = card;

  const name   = card.dataset.name;
  const cats   = card.dataset.cats ? card.dataset.cats.split(',').filter(Boolean) : [];
  const year   = card.dataset.year || '';
  const seen   = card.dataset.seen === '1';
  const rating = Number(card.dataset.rating) || 0;

  detailTitle.textContent = name;

 
  const metaEl = detailYear.parentElement;
  metaEl.querySelectorAll('.category-badge').forEach((b) => b.remove());
  cats.forEach((cat) => {
    const b = document.createElement('span');
    b.className   = 'category-badge detail-badge';
    b.dataset.cat = cat;
    b.textContent = getCategoryLabel(cat);
    metaEl.insertBefore(b, detailYear);
  });

  detailYear.textContent = year;
  renderStars(rating);

  btnVu.classList.toggle('seen', seen);
  btnVu.querySelector('.vu-label').textContent = seen ? 'Vu ✓' : 'Marquer comme vu';

  btnFind.onclick = () => {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(name)}`, '_blank');
  };

  detailOverlay.classList.add('open');
}

function closeDetailModal() {
  detailOverlay.classList.remove('open');
  currentDetailCard = null;
}


detailStars.addEventListener('mouseover', (e) => {
  const star = e.target.closest('.star');
  if (!star) return;
  const val = Number(star.dataset.value);
  detailStars.querySelectorAll('.star').forEach((s) => {
    s.classList.toggle('active', Number(s.dataset.value) <= val);
  });
});

detailStars.addEventListener('mouseleave', () => {
  renderStars(Number(currentDetailCard?.dataset.rating) || 0);
});

detailStars.addEventListener('click', async (e) => {
  const star = e.target.closest('.star');
  if (!star || !currentDetailCard) return;
  const rating = Number(star.dataset.value);
  await updateItem(Number(currentDetailCard.dataset.id), { rating });
  currentDetailCard.dataset.rating = rating;
  renderStars(rating);
  refreshCardStatus(currentDetailCard, currentDetailCard.dataset.seen === '1', rating);
});

btnVu.addEventListener('click', async () => {
  if (!currentDetailCard) return;
  const card    = currentDetailCard;
  const newSeen = !(card.dataset.seen === '1');
  await updateItem(Number(card.dataset.id), { seen: newSeen });

  refreshCardStatus(card, newSeen, Number(card.dataset.rating) || 0);
  btnVu.classList.toggle('seen', newSeen);
  btnVu.querySelector('.vu-label').textContent = newSeen ? 'Vu ✓' : 'Marquer comme vu';

  closeDetailModal();
 
  applyFilters(card.dataset.type);
});

detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) closeDetailModal();
});



function switchTab(tabKey) {
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabKey));
  tabContents.forEach((s) => s.classList.toggle('active', s.id === `tab-${tabKey}`));
}



tabBtns.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

['film', 'serie'].forEach((type) => {

  TOGGLEBTNS[type].addEventListener('click', () => toggleViewMode(type));


  ADDBTNS[type].addEventListener('click', () => openModal(type));

  // Sélection
  document.getElementById(`btn-select-${type}`)
    .addEventListener('click', () => enterSelectionMode(type));
  document.getElementById(`btn-selcancel-${type}`)
    .addEventListener('click', () => exitSelectionMode(type));
  BTSELDELS[type].addEventListener('click', () => deleteSelection(type));


  GRIDS[type].addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (selectionMode[type]) {
      toggleCardSelection(card, Number(card.dataset.id), type);
    } else {
      openDetailModal(card);
    }
  });

  FILTERBARS[type].addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (chip) applyFilter(type, chip.dataset.cat);
  });
});


modalCatChips.addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  const val = chip.dataset.value;
  if (pendingCategories.includes(val)) {
    pendingCategories = pendingCategories.filter((c) => c !== val);
    chip.classList.remove('selected');
  } else if (pendingCategories.length < 3) {
    pendingCategories.push(val);
    chip.classList.add('selected');
  }
});

btnConfirm.addEventListener('click', handleConfirm);
btnCancel.addEventListener('click',  closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter')  handleConfirm();
  if (e.key === 'Escape') closeModal();
});


const btnSettings     = document.getElementById('btn-settings');
const settingsMenu    = document.getElementById('settings-menu');
const settingsWrapper = document.getElementById('settings-wrapper');
const btnExport       = document.getElementById('btn-export');
const btnImport       = document.getElementById('btn-import');
const importFileInput = document.getElementById('import-file-input');


function toggleSettingsMenu() {
  const isOpen = settingsMenu.classList.toggle('open');
  btnSettings.classList.toggle('open', isOpen);
}


document.addEventListener('click', (e) => {
  if (!settingsWrapper.contains(e.target)) {
    settingsMenu.classList.remove('open');
    btnSettings.classList.remove('open');
  }
});

btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSettingsMenu();
});


function getAllItems() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}


btnExport.addEventListener('click', async () => {
  settingsMenu.classList.remove('open');
  btnSettings.classList.remove('open');

  const items = await getAllItems();
  const json  = JSON.stringify(items, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = `watchlist_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});


btnImport.addEventListener('click', () => {
  settingsMenu.classList.remove('open');
  btnSettings.classList.remove('open');
  importFileInput.value = '';
  importFileInput.click();
});


function importItem(record) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const { id, ...data } = record; 
    const req = store.add(data);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}


async function reloadAll() {
  GRIDS.film.innerHTML  = '';
  GRIDS.serie.innerHTML = '';
  await Promise.all([loadItems('film'), loadItems('serie')]);
}


importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const text = await file.text();

  let items;
  try {
    items = JSON.parse(text);
    if (!Array.isArray(items)) throw new Error();
  } catch {
    alert('Fichier JSON invalide. Assurez-vous d\'exporter depuis cette application.');
    return;
  }


  const valid = items.filter((i) => i.name && (i.type === 'film' || i.type === 'serie'));
  if (valid.length === 0) {
    alert('Aucun item valide trouvé dans ce fichier.');
    return;
  }

  const doReplace = confirm(
    `${valid.length} item(s) trouvé(s).\n\n` +
    `• OK → Remplacer toute la liste\n` +
    `• Annuler → Fusionner avec la liste actuelle`
  );

  if (doReplace) {
  
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  for (const item of valid) {
    await importItem(item);
  }

  await reloadAll();
  alert(`✓ ${valid.length} item(s) importé(s) avec succès.`);
});



(async () => {
  try {
    db = await openDB();
    await Promise.all([loadItems('film'), loadItems('serie')]);
  } catch (err) {
    console.error('Erreur IndexedDB :', err);
  }
})();
