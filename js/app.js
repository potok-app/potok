/* =====================================================================
   app.js – interfejs Potoku.

   Widoki (zakładki u góry):
   - Przegląd: jeden wpis ze skrzynki naraz + 4 decyzje,
   - Listy: wszystkie wpisy wg statusu, z możliwością zmiany statusu,
   - Dodaj: ręczne dodanie linku (np. na komputerze w pracy),
   - Import / eksport: wczytanie dokumentu z Google Docs, pliki wyjściowe.
   ===================================================================== */

// Skrót do szukania elementów na stronie.
const $ = (sel) => document.querySelector(sel);

// Polski format daty, np. „8 lis 2026, 16:40”.
function ladnaData(iso) {
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Zabezpieczenie tekstu przed wstawieniem jako HTML.
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Numer wersji aplikacji – podbijaj razem z WERSJA w sw.js.
const WERSJA_APLIKACJI = 30;

// Krótki komunikat na dole ekranu. Opcjonalnie z przyciskiem (np. „Cofnij”).
function komunikat(tekst, przycisk = null, czas = 3500) {
  const el = $('#komunikat');
  el.textContent = tekst;
  if (przycisk) {
    const b = document.createElement('button');
    b.textContent = przycisk.etykieta;
    b.onclick = () => { el.hidden = true; przycisk.akcja(); };
    el.append(' ', b);
  }
  el.hidden = false;
  clearTimeout(komunikat.t);
  komunikat.t = setTimeout(() => (el.hidden = true), przycisk ? Math.max(czas, 12000) : czas);
}

// Link wpisu jako HTML – tylko dla bezpiecznego adresu (http, https, file).
// To druga linia obrony: adres jest sprawdzany już przy zapisie (Magazyn.napraw).
function linkWpisu(w, tresc, klasa = '') {
  const adres = Magazyn.bezpiecznyAdres(w.url);
  if (!adres) return tresc;
  return `<a ${klasa ? `class="${esc(klasa)}" ` : ''}href="${esc(adres)}" target="_blank" rel="noopener noreferrer">${tresc}</a>`;
}

// Decyzje dostępne w przeglądzie (status → etykieta przycisku).
// Decyzje: Streścić / Obczaić / Zgłębić / Archiwum (znaczenia w magazyn.js).
const DECYZJE = ['do_streszczenia', 'obczaic', 'zglebic', 'obsidian', 'muzyka', 'smieszne', 'archiwum'].map(s => [s, STATUSY[s]]);
// Na listach dodatkowo „Streścić szczegółowo” – decyzja po przeczytaniu krótkiego streszczenia.
const DECYZJE_LISTY = [DECYZJE[0], ['szczegolowo', STATUSY.szczegolowo], ...DECYZJE.slice(1)];
// Decyzje dla zadania / pomysłu (wpis bez linku albo „To zadanie →”).
const DECYZJE_ZADANIA = ['zrobic_claude', 'zrobic_sam', 'archiwum'].map(s => [s, STATUSY[s]]);
// Pełny wybór dla wpisu bez linku („Więcej wyborów →”): wszystko naraz.
const DECYZJE_WSZYSTKIE = ['do_streszczenia', 'obczaic', 'zglebic', 'obsidian', 'muzyka', 'smieszne',
  'zrobic_claude', 'zrobic_sam', 'archiwum'].map(s => [s, STATUSY[s]]);

/* ---------------------- 🏠 Tylko prywatnie ------------------------ */

// Na komputerze służbowym wpis z domkiem nie ma klikalnego linku.
function zablokowany(w) {
  return Magazyn.urzadzenie() === 'sluzbowe' && Import.czyPrywatne(w);
}

/* ------------------------- Przegląd ------------------------------- */

// Wpisy pominięte w tej sesji („Pomiń” nic nie zapisuje, tylko przesuwa dalej).
const pominiete = new Set();
// Ostatnia decyzja – do przycisku „Cofnij”.
let ostatnia = null;
// Który zestaw przycisków pokazuje bieżąca karta. Domyślnie: link → decyzje
// treściowe, bez linku → zadaniowe. Przycisk pod decyzjami przełącza zestaw.
let trybKarty = { id: null, przelaczony: false };

function pokazPrzeglad() {
  const skrzynka = Magazyn.wczytaj()
    .filter(w => w.status === 'skrzynka')
    .sort((a, b) => a.kolejnosc - b.kolejnosc);
  const doPokazania = skrzynka.filter(w => !pominiete.has(w.id));
  const w = doPokazania[0] || skrzynka[0]; // po przejściu wszystkich – od nowa
  const el = $('#widok-przeglad');

  $('#cofnij').hidden = !ostatnia;

  if (!w) {
    el.querySelector('.karta').innerHTML = `
      <p class="pusto">Skrzynka jest pusta. 🎉</p>
      <p class="pomoc">Nowe rzeczy dodasz w zakładce „Dodaj” albo zaimportujesz w „Pliki”.</p>`;
    $('#licznik').textContent = '';
    return;
  }
  if (!doPokazania.length) pominiete.clear();

  $('#licznik').textContent = `W skrzynce: ${skrzynka.length}`;
  // Podpowiedź liczona na bieżąco – wpisy zaimportowane starszą wersją
  // też dostają nowe podpowiedzi (np. „Śmieszne”).
  // Wpis bez linku to zadanie/pomysł – pokazujemy przyciski zadania.
  if (trybKarty.id !== w.id) trybKarty = { id: w.id, przelaczony: false };
  const p = trybKarty.przelaczony;
  //            link                        bez linku
  // domyślnie: 7 decyzji treściowych       3 zadaniowe
  // po kliku:  3 zadaniowe („To zadanie”)  wszystkie 9 („Więcej wyborów”)
  const przyciski = w.url ? (p ? DECYZJE_ZADANIA : DECYZJE) : (p ? DECYZJE_WSZYSTKIE : DECYZJE_ZADANIA);
  const etykietaPrzelacznika = w.url
    ? (p ? '← To jednak treść' : 'To zadanie →')
    : (p ? '← Mniej wyborów' : 'Więcej wyborów →');
  w.sugestia = Magazyn.statusZadania(w.tekst) || Import.sugerujStatus(w.tekst) || w.sugestia;
  const adres = Magazyn.bezpiecznyAdres(w.url);
  const domena = adres ? (() => { try { return new URL(adres).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';

  el.querySelector('.karta').innerHTML = `
    <div class="data">Dodano: <strong>${esc(ladnaData(w.dodano))}</strong>
      ${w.uwagaDaty ? `<span class="uwaga">(${esc(w.uwagaDaty)})</span>` : ''}</div>
    <h2>${esc(w.tytul)}</h2>
    ${w.autor ? `<p class="autor">${esc(w.autor)}</p>` : ''}
    ${!adres ? `<p class="notatka">Zadanie / pomysł (bez linku)</p>`
      : zablokowany(w) ? `<p class="link zablokowany">🏠 Otwórz w domu <span>${esc(domena)}</span></p>`
      : linkWpisu(w, `Otwórz ↗ <span>${esc(domena || adres)}</span>`, 'link')}
    ${w.tekst && w.tekst !== w.tytul ? `<p class="oryginal"><span>Oryginalny wpis:</span> ${esc(w.tekst)}</p>` : ''}
    ${Streszczenia.html(w)}
    ${w.sugestia && przyciski.some(([s]) => s === w.sugestia) ? `<p class="sugestia">Podpowiedź z oznaczenia w tekście: <strong>${esc(STATUSY[w.sugestia])}</strong></p>` : ''}
    <button class="prywatne ${Import.czyPrywatne(w) ? 'wlaczone' : ''}" data-prywatne="1" aria-pressed="${Import.czyPrywatne(w)}">
      🏠 Tylko prywatnie: <strong>${Import.czyPrywatne(w) ? 'TAK' : 'nie'}</strong>
    </button>
    <div class="decyzje">
      ${przyciski.map(([s, etykieta]) =>
        `<button data-status="${esc(s)}" class="${s === w.sugestia ? 'sugerowany' : ''}">${esc(etykieta)}</button>`).join('')}
    </div>
    <div class="drugorzedne">
      <button data-przelacz="1">${esc(etykietaPrzelacznika)}</button>
      <button data-pomin="1">Pomiń na razie →</button>
    </div>`;

  // Obsługa przycisków na karcie.
  el.querySelectorAll('[data-status]').forEach(b => b.onclick = () => {
    ostatnia = { id: w.id, poprzedni: w.status };
    Magazyn.zmienStatus(w.id, b.dataset.status);
    komunikat(`Przeniesiono do: ${STATUSY[b.dataset.status]}`);
    pokazPrzeglad();
  });
  el.querySelector('[data-pomin]').onclick = () => { pominiete.add(w.id); pokazPrzeglad(); };
  // Przełącznik 🏠 – zostajemy na tym samym wpisie.
  el.querySelector('[data-prywatne]').onclick = () => {
    Magazyn.ustawPrywatne(w.id, !Import.czyPrywatne(w));
    pokazPrzeglad();
  };
  // Przełącznik zestawu przycisków – nic nie zapisuje, decyzja dalej należy do Ciebie.
  el.querySelector('[data-przelacz]').onclick = () => {
    trybKarty = { id: w.id, przelaczony: !trybKarty.przelaczony };
    pokazPrzeglad();
  };
}

/* --------------------------- Listy -------------------------------- */

// Która lista jest otwarta w każdej z dwóch części aplikacji.
const aktywna = { potok: 'do_streszczenia', zadania: 'zrobic_claude' };

/**
 * Rysuje zakładki statusów i listę wpisów jednej części aplikacji.
 * Używane przez „Listy” (Potok) i „Do zrobienia” (zadania).
 *   czesc     – 'potok' albo 'zadania'
 *   grupa     – statusy tej części (GRUPA_POTOK / GRUPA_ZADANIA)
 *   cele      – statusy, do których można przesunąć wpis przyciskiem
 *   el        – { statusy, lista, szukaj } – elementy na stronie
 *   dodatki   – funkcja zwracająca dodatkowe przyciski dla wpisu (HTML)
 */
function rysujListy({ czesc, grupa, cele, el, dodatki = () => '' }) {
  const wpisy = Magazyn.wczytaj();
  const szukaj = el.szukaj ? (el.szukaj.value || '').toLowerCase() : '';

  // Podsumowanie: ile czego jest w całym Potoku.
  if (el.podsumowanie) {
    const ile = grupa => wpisy.filter(w => grupa.includes(w.status)).length;
    el.podsumowanie.textContent =
      `W skrzynce: ${ile(['skrzynka'])} · Potok: ${ile(GRUPA_POTOK) - ile(['skrzynka'])} · Zadania: ${ile(GRUPA_ZADANIA)} · Razem: ${wpisy.length}`;
  }

  // Zakładki statusów z licznikami.
  el.statusy.innerHTML = grupa.map(s => {
    const ile = wpisy.filter(w => w.status === s).length;
    return `<button data-lista="${esc(s)}" class="${s === aktywna[czesc] ? 'aktywny' : ''}">${esc(STATUSY[s])} <b>${ile}</b></button>`;
  }).join('');
  el.statusy.querySelectorAll('[data-lista]').forEach(b =>
    b.onclick = () => { aktywna[czesc] = b.dataset.lista; pokazWidok(czesc === 'potok' ? 'listy' : 'zadania'); });

  const lista = wpisy
    .filter(w => w.status === aktywna[czesc])
    .filter(w => !szukaj || (w.tytul + ' ' + w.tekst + ' ' + (w.autor || '') + ' ' + (w.url || '')).toLowerCase().includes(szukaj))
    .sort((a, b) => a.kolejnosc - b.kolejnosc);

  el.lista.innerHTML = lista.length ? lista.map(w => `
    <li>
      <div class="data">Dodano: ${esc(ladnaData(w.dodano))}</div>
      <div class="tytul">${Import.czyPrywatne(w) ? '🏠 ' : ''}${w.url && !zablokowany(w)
        ? linkWpisu(w, esc(w.tytul))
        : esc(w.tytul) + (w.url ? ' <span class="uwaga">(otwórz w domu)</span>' : '')}${w.autor ? ` <span class="autor">· ${esc(w.autor)}</span>` : ''}</div>
      ${ostatniaZmiana(w)}
      ${Streszczenia.html(w)}
      <div class="dalej">
        ${cele.filter(([s]) => s !== w.status).map(([s, n]) =>
          `<button data-id="${esc(w.id)}" data-na="${esc(s)}">→ ${esc(n)}</button>`).join('')}
        ${dodatki(w)}
        <button data-dom="${esc(w.id)}" class="${Import.czyPrywatne(w) ? 'wlaczone' : ''}" title="Tylko prywatnie">🏠</button>
      </div>
    </li>`).join('') : '<li class="pusto">Nic tu nie ma.</li>';

  el.lista.querySelectorAll('[data-dom]').forEach(b => b.onclick = () => {
    const w = wpisy.find(x => x.id === b.dataset.dom);
    Magazyn.ustawPrywatne(w.id, !Import.czyPrywatne(w));
    pokazWidok(czesc === 'potok' ? 'listy' : 'zadania');
  });

  // Przesunięcie wpisu, np. Streścić → Zgłębić po przeczytaniu streszczenia.
  el.lista.querySelectorAll('[data-na]').forEach(b => b.onclick = () => {
    Magazyn.zmienStatus(b.dataset.id, b.dataset.na);
    komunikat(`Przeniesiono do: ${STATUSY[b.dataset.na]}`);
    pokazWidok(czesc === 'potok' ? 'listy' : 'zadania');
  });
}

function pokazListy() {
  rysujListy({
    czesc: 'potok',
    grupa: GRUPA_POTOK,
    cele: DECYZJE_LISTY,
    el: { statusy: $('#statusy'), lista: $('#lista'), szukaj: $('#szukaj'), podsumowanie: $('#podsumowanie-listy') },
  });
}

/* ------------------------ Do zrobienia ---------------------------- */

function pokazZadania() {
  rysujListy({
    czesc: 'zadania',
    grupa: GRUPA_ZADANIA,
    cele: [...GRUPA_ZADANIA.map(s => [s, STATUSY[s]]), ['skrzynka', 'Potok']],
    el: { statusy: $('#zadania-statusy'), lista: $('#zadania-lista'), podsumowanie: $('#podsumowanie-zadan') },
    // Pomysły dla Claude'a da się skopiować i wkleić prosto do rozmowy.
    dodatki: w => w.status === 'zrobic_claude' ? `<button data-kopiuj="${esc(w.id)}">Kopiuj</button>` : '',
  });
  $('#zadania-lista').querySelectorAll('[data-kopiuj]').forEach(b => b.onclick = async () => {
    const w = Magazyn.wczytaj().find(x => x.id === b.dataset.kopiuj);
    try { await navigator.clipboard.writeText(w.tekst); komunikat('Skopiowano – wklej w rozmowę z Claude.'); }
    catch { komunikat('Przeglądarka nie pozwoliła skopiować.'); }
  });
}

// Krótka informacja, skąd wpis przyszedł do tej listy, np. „Streścić → Zgłębić, 8 lis 2026”.
function ostatniaZmiana(w) {
  const historia = w.historia || [];
  const h = historia[historia.length - 1];
  if (!h || h.z === 'skrzynka') return '';
  return `<div class="data">${esc(STATUSY[h.z] || h.z)} → ${esc(STATUSY[h.na] || h.na)}, ${esc(ladnaData(h.data))}</div>`;
}

/* --------------------------- Dodaj -------------------------------- */

function dodajRecznie(url, opis, zrodlo) {
  url = (url || '').trim();
  opis = (opis || '').trim();
  if (!url && !opis) { komunikat('Wpisz link albo opis.'); return []; }
  const tekst = [opis, url].filter(Boolean).join(' ');
  const { dodane, ids } = Magazyn.dodaj([{
    url: url || null,
    // „Streścić” itp. to oznaczenie, nie tytuł – wtedy tytułem jest adres,
    // a prawdziwy tytuł i autor pobiorą się w tle (opisy.js).
    tytul: url && Import.tylkoOznaczenia(opis) ? url : (opis || url),
    tekst,
    zrodlo,
    sugestia: Import.sugerujStatus(opis),
  }]);
  if (zrodlo !== 'udostępnij') komunikat(dodane ? 'Dodano do skrzynki.' : 'Ten wpis już jest w Potoku.');
  return ids;
}

/* ------------------------ Nawigacja ------------------------------- */

let aktualnyWidok = 'przeglad';

function pokazWidok(nazwa) {
  aktualnyWidok = nazwa;
  document.querySelectorAll('.widok').forEach(w => (w.hidden = w.id !== 'widok-' + nazwa));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('aktywny', b.dataset.widok === nazwa));
  if (nazwa === 'przeglad') pokazPrzeglad();
  if (nazwa === 'listy') pokazListy();
  if (nazwa === 'zadania') pokazZadania();
  if (nazwa === 'eksport') { pokazStanEksportu(); pokazStanSync(); pokazUrzadzenia(); }
  pokazAlarm();   // po odczycie danych – wtedy wiadomo, czy są uszkodzone
}

/* --------------------- Google Drive (☁) ---------------------------- */

function pokazStanSync() {
  const el = $('#stan-sync');
  const tekst = Synchronizacja.opisStanu();
  el.hidden = !tekst;
  el.textContent = tekst;
  el.className = 'stan-sync ' + Synchronizacja.stan;
  el.title = Synchronizacja.blad || '';
  const polaczone = !!Synchronizacja.skrypt();
  $('#opis-sync').textContent = polaczone
    ? 'Połączono. ' + tekst.replace('☁ ', 'Stan: ') + (Synchronizacja.blad ? ' – ' + Synchronizacja.blad : '')
    : 'Nie połączono. Zrób raz poniższe kroki (ok. 5 minut).';
  $('#sync-konfiguracja').hidden = polaczone;
  $('#sync-polaczone').hidden = !polaczone;
  $('#kopiuj-kod').hidden = !Synchronizacja.kodPolaczenia();
  const s = Synchronizacja.skrypt();
  // Lista urządzeń: skrypt 11+, własny klucz, nie na komputerze służbowym.
  $('#urzadzenia').hidden = !(s && s.wlasny && Synchronizacja.zapamietanaWersja() >= 11 && Magazyn.urzadzenie() !== 'sluzbowe');
  $('#skrypt-aktualizacja').hidden = !Synchronizacja.skryptDoAktualizacji();
  $('#stan-opisow').textContent = Synchronizacja.skrypt() ? Opisy.podsumowanie(Magazyn.wczytaj()) : '';
  $('#stan-streszczen-ai').textContent = Synchronizacja.skrypt() ? Streszczenia.podsumowanie(Magazyn.wczytaj()) : '';
  $('#tytuly-wszystkie').checked = Opisy.wszystkieStrony();
}

// Lista urządzeń w Pliki (skrypt 11+). Pytamy skrypt przy każdym wejściu w Pliki.
async function pokazUrzadzenia() {
  if ($('#urzadzenia').hidden) return;
  const ul = $('#lista-urzadzen');
  ul.textContent = 'Wczytuję listę urządzeń…';
  const data = t => (t ? new Date(t).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
  try {
    const { urzadzenia, ja } = await Synchronizacja.urzadzenia();
    ul.innerHTML = urzadzenia.map(u => `<li${u.odlaczono ? ' class="odlaczone"' : ''}>
      <b>${esc(u.nazwa || 'bez nazwy')}</b>${u.sluzbowe ? ' 💼' : ''}${u.id === ja ? ' <i>(to urządzenie)</i>' : ''}
      <br><span class="pomoc">dodane ${esc(data(u.dodano))} · ostatnio ${esc(data(u.ostatnio))}</span>
      ${u.odlaczono ? `<br><span class="pomoc">odłączone ${esc(data(u.odlaczono))}</span>`
        : u.id === ja ? '' : `<br><button data-odlacz="${esc(u.id)}" data-nazwa="${esc(u.nazwa || 'bez nazwy')}">Odłącz i wyczyść</button>`}
    </li>`).join('') || '<li>Brak urządzeń.</li>';
  } catch (e) {
    ul.textContent = 'Nie udało się wczytać listy urządzeń: ' + e.message;
  }
}

// Klucz dla nowego skryptu – tworzony raz i pamiętany, aż do połączenia.
function kluczDlaSkryptu() {
  let k = localStorage.getItem(Magazyn.klucz + '.nowyKlucz');
  if (!k) { k = Synchronizacja.nowyKlucz(); localStorage.setItem(Magazyn.klucz + '.nowyKlucz', k); }
  return k;
}

async function kopiuj(tekst, info) {
  try { await navigator.clipboard.writeText(tekst); komunikat(info); }
  catch { komunikat('Przeglądarka nie pozwoliła skopiować – zaznacz i skopiuj ręcznie (Ctrl+C).'); }
}

// Kliknięcie w ☁: synchronizuj od razu.
function kliknijSync() {
  Synchronizacja.synchronizuj();
}

function pokazUrzadzenie() {
  const r = Magazyn.urzadzenie();
  document.querySelectorAll('[data-urzadzenie]').forEach(b =>
    b.classList.toggle('aktywny', b.dataset.urzadzenie === r));
  $('#znak-urzadzenia').textContent = r === 'sluzbowe' ? '💼 służbowy' : '';
}

// Wpisy wysłane do NotebookLM (pobrany plik / skopiowane adresy) – pamiętane na tym urządzeniu.
const KLUCZ_WYSLANE = () => Magazyn.klucz + '.doStreszczenia';
function wyslaneDoStreszczenia() {
  try { return JSON.parse(localStorage.getItem(KLUCZ_WYSLANE()) || '[]'); } catch { return []; }
}
function zapamietajWyslane() {
  const k = Eksport.kolejkaStreszczen(Magazyn.wczytaj());
  localStorage.setItem(KLUCZ_WYSLANE(), JSON.stringify([...k.www, ...k.reszta].map(w => w.id)));
  pokazStanEksportu();
}

function pokazStanEksportu() {
  const wpisy = Magazyn.wczytaj();
  const { www, reszta } = Eksport.kolejkaStreszczen(wpisy);
  $('#stan-streszczen').textContent =
    `W kolejce: ${www.length} adresów www` + (reszta.length ? ` + ${reszta.length} do dodania ręcznie (lokalne pliki / notatki).` : '.');
  // Które wpisy trzeba dodać do NotebookLM ręcznie – z nazwą pliku lub treścią notatki.
  const el = $('#reszta-streszczen');
  el.hidden = !reszta.length;
  el.querySelector('summary').textContent = `Pokaż ${reszta.length} do dodania ręcznie`;
  el.querySelector('ul').innerHTML = reszta.map(w => `<li>${esc(w.tytul)}${w.url
    ? `<br><span class="uwaga">${esc((() => { const a = w.url.replace(/^file:\/\/\/?/, ''); try { return decodeURIComponent(a); } catch { return a; } })())}</span>`
    : ' <span class="uwaga">(notatka bez linku)</span>'}</li>`).join('');
  // Przycisk „Streszczone”: tylko te wpisy, które były w pliku/kopii i dalej czekają w „Streścić”.
  const czekajace = wyslaneDoStreszczenia().filter(id => wpisy.some(w => w.id === id && w.status === 'do_streszczenia'));
  $('#po-streszczeniu').hidden = !czekajace.length;
  $('#streszczone').textContent = `Streszczone – przenieś ${czekajace.length} wysłanych do Archiwum`;
  const zajete = Magazyn.zajetosc();
  $('#stan-calosci').textContent = `Wszystkich wpisów: ${wpisy.length}. Zajęte ${Math.max(1, Math.round(zajete * 100))}% miejsca w tej przeglądarce.`
    + (zajete >= 0.7 ? ' UWAGA: miejsca zaczyna brakować – zrób kopię zapasową i daj znać Claude\'owi.' : '');
  pokazDiagnostyke();
}

// Pliki → Diagnostyka: ostatnie błędy aplikacji (bez treści wpisów i bez klucza).
function pokazDiagnostyke() {
  const lista = Bledy.lista();
  $('#diagnostyka').hidden = !lista.length;
  $('#diagnostyka-lista').textContent = Bledy.tekst();
}

// Uszkodzone dane w tej przeglądarce: czerwony pasek u góry z decyzją.
function pokazAlarm() {
  const kopia = Magazyn.uszkodzone();
  $('#alarm').hidden = !kopia;
  if (kopia) $('#alarm-kopia').textContent = kopia;
}

// Potok nie działa wewnątrz cudzej strony (ochrona przed „podstawionymi” kliknięciami).
// Wyjątki: ta sama strona (podglad.html) i plik z dysku.
function obcaRamka() {
  if (window.top === window.self || location.protocol === 'file:') return false;
  try { return window.top.location.origin !== location.origin; } catch { return true; }
}

/* -------------------- „Streść teraz” ------------------------------ */

// Jeden przycisk przy wpisie – na listach i w przeglądzie. Skrypt Google
// robi streszczenie od razu (zwykle 10–60 s), potem odświeżamy widok.
async function streszczTeraz(przycisk, tekst) {
  const w = Magazyn.wczytaj().find(x => x.id === przycisk.dataset.streszcz);
  if (!w) return;
  if (!navigator.onLine) return komunikat('Bez internetu – spróbuj, gdy wróci sieć.');
  przycisk.disabled = true;
  przycisk.textContent = '⏳ Streszczam… (film może potrwać kilka minut)';
  try {
    const s = await Streszczenia.teraz(w, przycisk.dataset.rodzaj, tekst);
    const r = przycisk.dataset.rodzaj;
    komunikat(s[r] ? 'Streszczenie gotowe.'
      : s.doRecznego && s.doRecznego[r] ? 'Nie da się streścić automatycznie: ' + s.doRecznego[r]
      : 'Nie udało się: ' + (s.problem || 'nieznany problem'));
  } catch (e) {
    komunikat('Nie udało się: ' + e.message);
  }
  pokazWidok(aktualnyWidok);
}

// Gotowe streszczenie (np. z NotebookLM) zapisywane przy wpisie bez AI.
async function zapiszGotowe(przycisk, tekst) {
  const w = Magazyn.wczytaj().find(x => x.id === przycisk.dataset.gotowe);
  if (!w) return;
  if (!navigator.onLine) return komunikat('Bez internetu – spróbuj, gdy wróci sieć.');
  przycisk.disabled = true;
  przycisk.textContent = '⏳ Zapisuję…';
  try {
    await Streszczenia.zapiszGotowe(w, przycisk.dataset.rodzaj, tekst);
    komunikat('Streszczenie zapisane przy wpisie (na Twoim Drive).');
  } catch (e) {
    komunikat('Nie udało się zapisać: ' + e.message);
  }
  pokazWidok(aktualnyWidok);
}

/* ------------------------- Start ---------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  if (obcaRamka()) {
    document.body.textContent = 'Potok nie otwiera się wewnątrz innej strony. Otwórz go bezpośrednio.';
    return;
  }
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => pokazWidok(b.dataset.widok));
  // Logo „Potok” = szybkie dodawanie (najczęstsza czynność).
  $('header h1').onclick = () => pokazWidok('dodaj');
  // „Streść teraz” – przyciski powstają przy każdym rysowaniu listy, więc jeden nasłuch na całą stronę.
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-streszcz]');
    if (b && !b.disabled) {
      // Przycisk pod polem „Wklej tekst” wysyła wklejony tekst; zwykły – sam link.
      const pole = b.dataset.zTekstu ? b.parentElement.querySelector('textarea') : null;
      if (pole && pole.value.trim().length < 200) return komunikat('Wklej całą transkrypcję albo tekst artykułu (co najmniej kilka zdań).');
      streszczTeraz(b, pole ? pole.value : undefined);
      return;
    }
    // „Zapisz jako streszczenie” – wklejone gotowe streszczenie (np. z NotebookLM), bez AI.
    const g = e.target.closest('[data-gotowe]');
    if (g && !g.disabled) {
      const tekst = g.parentElement.querySelector('textarea').value.trim();
      if (tekst.length < 50) return komunikat('Wklej całe gotowe streszczenie (np. z NotebookLM).');
      zapiszGotowe(g, tekst);
      return;
    }
    // „Wklej tekst” – pole na transkrypcję / artykuł / gotowe streszczenie pod przyciskami.
    const wk = e.target.closest('[data-wklej]');
    if (wk && !wk.parentElement.nextElementSibling?.classList.contains('wklej-tekst')) {
      wk.parentElement.insertAdjacentHTML('afterend', `<div class="wklej-tekst">
        <textarea rows="6" placeholder="Wklej transkrypcję filmu (np. z Pobieracza YT) albo tekst artykułu – albo gotowe streszczenie, np. z NotebookLM"></textarea>
        <button data-streszcz="${esc(wk.dataset.wklej)}" data-rodzaj="${esc(wk.dataset.rodzaj)}" data-z-tekstu="1">✨ Streść ten tekst</button>
        <button data-gotowe="${esc(wk.dataset.wklej)}" data-rodzaj="${esc(wk.dataset.rodzaj)}">💾 Zapisz jako streszczenie</button></div>`);
      wk.parentElement.nextElementSibling.querySelector('textarea').focus();
    }
  });
  // Checkbox „Streścić” pod opisem: dopisuje / zdejmuje „Streścić ” na początku opisu.
  $('#dodaj-strescic').onchange = e => {
    const pole = $('#nowy-opis');
    const bez = pole.value.replace(/^Streścić ?/, '');
    pole.value = e.target.checked ? 'Streścić ' + bez : bez;
  };

  $('#cofnij').onclick = () => {
    if (!ostatnia) return;
    Magazyn.zmienStatus(ostatnia.id, ostatnia.poprzedni);
    ostatnia = null;
    komunikat('Cofnięto ostatnią decyzję.');
    pokazPrzeglad();
  };

  $('#szukaj').oninput = pokazListy;

  // Synchronizacja z Google Drive.
  $('#stan-sync').onclick = kliknijSync;
  $('#pokaz-skrypt').onclick = () => {
    $('#skrypt-tekst').value = SKRYPT_GOOGLE.replace('WSTAW_KLUCZ', kluczDlaSkryptu());
    $('#skrypt-pole').hidden = false;
  };
  $('#pokaz-nowy-skrypt').onclick = () => {
    // Urządzenie z własnym kluczem nie zna klucza głównego – skrypt 11+ trzyma go
    // we Właściwościach skryptu, więc w nowym kodzie zostaje znacznik.
    const s = Synchronizacja.skrypt();
    $('#nowy-skrypt-tekst').value = SKRYPT_GOOGLE.replace('WSTAW_KLUCZ', s.wlasny ? 'WSTAW_KLUCZ' : s.klucz);
    $('#nowy-skrypt-pole').hidden = false;
  };
  $('#kopiuj-nowy-skrypt').onclick = () => kopiuj($('#nowy-skrypt-tekst').value, 'Skopiowano nowy skrypt – wklej go w swoim projekcie na script.google.com.');
  $('#kopiuj-skrypt').onclick = () => kopiuj($('#skrypt-tekst').value, 'Skopiowano skrypt – wklej go na script.google.com.');
  $('#polacz-skrypt').onclick = () => {
    const wpisane = $('#skrypt-adres').value.trim();
    // Kod połączenia (adres#klucz) z innego urządzenia albo sam adres z kroku 5.
    const ok = wpisane.includes('#')
      ? Synchronizacja.ustawSkrypt(wpisane)
      : Synchronizacja.ustawSkrypt(wpisane, localStorage.getItem(Magazyn.klucz + '.nowyKlucz'));
    if (!ok) return komunikat(wpisane.includes('#') || localStorage.getItem(Magazyn.klucz + '.nowyKlucz')
      ? 'To nie wygląda na adres skryptu – powinien kończyć się na /exec.'
      : 'Najpierw kliknij „Pokaż skrypt do wklejenia” (krok 1).');
    localStorage.removeItem(Magazyn.klucz + '.nowyKlucz');
    komunikat('Połączono – pierwsza synchronizacja…');
    Synchronizacja.synchronizuj();
    pokazStanSync();
  };
  $('#kopiuj-kod').onclick = () => kopiuj(Synchronizacja.kodPolaczenia(), 'Skopiowano kod połączenia – wklej go na drugim urządzeniu w „Pliki → Google Drive”.');
  $('#rozlacz').onclick = () => {
    if (!confirm('Odłączyć to urządzenie od Google Drive? Wpisy zostaną tutaj i na Drive.')) return;
    Synchronizacja.rozlacz();
  };
  // Urządzenia: odłączanie, nowy kod, zmiana klucza głównego.
  $('#lista-urzadzen').onclick = async (e) => {
    const b = e.target.closest('[data-odlacz]');
    if (!b) return;
    if (!confirm(`Odłączyć „${b.dataset.nazwa}”? Straci dostęp do Google Drive od razu, a przy najbliższym otwarciu Potoku wyczyści z przeglądarki wszystkie wpisy i kod połączenia. Na Dysku i na innych urządzeniach nic nie zginie. Tego nie da się cofnąć – urządzenie wróci tylko z nowym kodem.`)) return;
    b.disabled = true;
    try { await Synchronizacja.odlacz(b.dataset.odlacz); komunikat(`Odłączono: ${b.dataset.nazwa}.`); }
    catch (err) { komunikat('Nie udało się odłączyć: ' + err.message); }
    pokazUrzadzenia();
  };
  $('#utworz-kod').onclick = async () => {
    try {
      $('#nowy-kod').value = await Synchronizacja.noweUrzadzenie($('#nazwa-nowego').value.trim() || 'Nowe urządzenie', $('#nowe-sluzbowe').checked);
      $('#nowy-kod-pole').hidden = false;
      $('#nazwa-nowego').value = '';
      $('#nowe-sluzbowe').checked = false;
      pokazUrzadzenia();
    } catch (err) { komunikat('Nie udało się utworzyć kodu: ' + err.message); }
  };
  $('#kopiuj-nowy-kod').onclick = () => kopiuj($('#nowy-kod').value, 'Skopiowano kod połączenia – wklej go na nowym urządzeniu w „Pliki → Google Drive”.');
  $('#zmien-klucz-glowny').onclick = async () => {
    if (!confirm('Zmienić klucz główny? Stary przestanie działać od razu. Urządzenia z listy działają dalej.')) return;
    try { await Synchronizacja.zmienKluczGlowny(); komunikat('Klucz główny zmieniony.'); }
    catch (err) { komunikat('Nie udało się: ' + err.message); }
  };
  // „Synchronizuj teraz” sprawdza też na nowo wersję skryptu (np. po jego aktualizacji).
  $('#sync-teraz').onclick = () => { Synchronizacja.sprawdzWersje = true; kliknijSync(); };
  $('#tytuly-wszystkie').onchange = (e) => {
    Opisy.ustawWszystkieStrony(e.target.checked);
    pokazStanSync();
    if (e.target.checked) Opisy.uzupelnij();
  };
  $('#kopiuj-diagnostyke').onclick = () => kopiuj(Bledy.tekst(), 'Skopiowano – wklej w rozmowę z Claude.');
  $('#alarm-od-nowa').onclick = () => {
    if (!confirm('Zacząć od pustej listy w tej przeglądarce? Uszkodzone dane zostają odłożone (nic nie jest kasowane), a wpisy wrócą z Google Drive przy synchronizacji albo z kopii zapasowej.')) return;
    Magazyn.zacznijOdNowa();
    pokazAlarm();
    pokazWidok(aktualnyWidok);
    Synchronizacja.synchronizuj();
  };
  window.addEventListener('potok-stan-synchronizacji', pokazStanSync);
  // Po pobraniu zmian z innego urządzenia – odśwież to, co widać (poza formularzem).
  window.addEventListener('potok-odswiez', () => { if (aktualnyWidok !== 'dodaj') pokazWidok(aktualnyWidok); });

  document.querySelectorAll('[data-urzadzenie]').forEach(b => b.onclick = () => {
    Magazyn.ustawUrzadzenie(b.dataset.urzadzenie);
    pokazUrzadzenie();
    komunikat(b.dataset.urzadzenie === 'sluzbowe'
      ? 'Ustawiono: komputer służbowy – wpisy z 🏠 nie otworzą się tutaj.'
      : 'Ustawiono: prywatne urządzenie.');
  });
  pokazUrzadzenie();

  $('#form-dodaj').onsubmit = (e) => {
    e.preventDefault();
    dodajRecznie($('#nowy-url').value, $('#nowy-opis').value, 'ręcznie');
    e.target.reset();
  };

  // Import pliku .docx / .txt
  $('#plik-import').onchange = async (e) => {
    const plik = e.target.files[0];
    if (!plik) return;
    try {
      const nowe = /\.docx$/i.test(plik.name)
        ? await Import.zDocx(plik)
        : Import.zTekstu(await plik.text(), 'import: ' + plik.name);
      const { dodane, pominiete } = Magazyn.dodaj(nowe);
      $('#wynik-importu').textContent =
        `Zaimportowano ${dodane} wpisów` + (pominiete ? `, pominięto ${pominiete} już istniejących` : '') + '.';
    } catch (err) {
      $('#wynik-importu').textContent = 'Błąd importu: ' + err.message;
    }
    e.target.value = '';
    pokazStanEksportu();
  };

  // Eksport kolejki streszczeń
  $('#eksport-streszczen').onclick = () => {
    const { tekst, www } = Eksport.kolejkaStreszczen(Magazyn.wczytaj());
    if (!www.length) return komunikat('Kolejka „Streścić” jest pusta.');
    Eksport.pobierz(`do-streszczenia-${Eksport.dzien()}.txt`, tekst);
    zapamietajWyslane();
  };
  $('#kopiuj-streszczenia').onclick = async () => {
    const { tekst, www } = Eksport.kolejkaStreszczen(Magazyn.wczytaj());
    if (!www.length) return komunikat('Kolejka „Streścić” jest pusta.');
    try { await navigator.clipboard.writeText(tekst); komunikat(`Skopiowano ${www.length} adresów.`); zapamietajWyslane(); }
    catch { komunikat('Przeglądarka nie pozwoliła skopiować – użyj pobierania pliku.'); }
  };
  $('#streszczone').onclick = () => {
    const wpisy = Magazyn.wczytaj();
    const ids = wyslaneDoStreszczenia().filter(id => wpisy.some(w => w.id === id && w.status === 'do_streszczenia'));
    if (!confirm(`Przenieść ${ids.length} wpisów ze „Streścić” do Archiwum?\nCiekawe przesuń najpierw do „Zgłębić”.`)) return;
    Magazyn.zmienStatusWielu(ids, 'archiwum');
    localStorage.removeItem(KLUCZ_WYSLANE());
    const cofnij = $('#cofnij-streszczone');
    cofnij.textContent = `Cofnij – przywróć ${ids.length} do „Streścić”`;
    cofnij.hidden = false;
    cofnij.onclick = () => {
      Magazyn.zmienStatusWielu(ids, 'do_streszczenia');
      localStorage.setItem(KLUCZ_WYSLANE(), JSON.stringify(ids));
      cofnij.hidden = true;
      komunikat('Przywrócono do „Streścić”.');
      pokazStanEksportu();
    };
    komunikat(`Przeniesiono ${ids.length} do Archiwum.`);
    pokazStanEksportu();
  };
  $('#eksport-md').onclick = () =>
    Eksport.pobierz(`Potok-${Eksport.dzien()}.md`, Eksport.markdown(Magazyn.wczytaj()), 'text/markdown');
  // Tylko lista „Zapisać do Obsidian” – do wrzucenia prosto do skarbca.
  $('#eksport-obsidian').onclick = () => {
    const lista = Magazyn.wczytaj().filter(w => w.status === 'obsidian');
    if (!lista.length) return komunikat('Lista „Zapisać do Obsidian” jest pusta.');
    Eksport.pobierz(`Do-Obsidiana-${Eksport.dzien()}.md`, Eksport.markdown(lista), 'text/markdown');
  };
  $('#eksport-json').onclick = () =>
    Eksport.pobierz(`Potok-kopia-${Eksport.dzien()}.json`, Magazyn.kopiaJSON(), 'application/json');
  $('#plik-kopia').onchange = async (e) => {
    const plik = e.target.files[0];
    if (!plik) return;
    try {
      const { dodane, odrzucone } = Magazyn.przywrocKopie(await plik.text());
      komunikat(`Przywrócono ${dodane} brakujących wpisów.` + (odrzucone ? ` Pominięto ${odrzucone} elementów, które nie są wpisami (odłożone, nie skasowane).` : ''));
    }
    catch (err) { komunikat('Błąd kopii: ' + err.message); }
    e.target.value = '';
    pokazStanEksportu();
  };

  // „Udostępnij → Potok” na Androidzie: system otwiera aplikację z adresem
  // w parametrach (?url=…&title=…&text=…), patrz share_target w manifeście.
  // Uwaga: Chrome ZASTĘPUJE parametry z adresu „action” (nasze udostepnij=1
  // znika), więc rozpoznajemy udostępnienie po samych title/text/url.
  // Błąd tutaj (np. zepsuty adres) nie może zatrzymać startu aplikacji.
  try { obsluzUdostepnienie(); }
  catch (e) { console.error('Udostępnienie', e); komunikat('Nie udało się dodać udostępnionego linku: ' + e.message); }
  finally { if (location.search) history.replaceState(null, '', location.pathname); }

  // Service worker = działanie offline. Działa tylko z adresu http(s),
  // przy otwarciu pliku z dysku (file://) po prostu go pomijamy.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js');
  }

  const slad = localStorage.getItem(Magazyn.klucz + '.udostepnienie');
  $('#wersja').textContent = 'Wersja aplikacji: ' + WERSJA_APLIKACJI +
    (slad ? ' · Ostatnie udostępnienie: ' + slad : ' · Jeszcze nic nie udostępniono do Potoku na tym urządzeniu.');

  window.addEventListener('potok-blad', pokazDiagnostyke);
  // Po zdalnym odłączeniu (Synchronizacja.wyczyscUrzadzenie) – wyjaśnienie, co się stało.
  if (location.hash === '#odlaczone') {
    history.replaceState(null, '', location.pathname);
    komunikat('To urządzenie zostało odłączone od Potoku. Wpisy i kod połączenia usunięto z tej przeglądarki (na Google Drive są dalej).', null, 30000);
  }
  // Na start zawsze „Dodaj” (decyzja z 15.11.2026: najczęściej otwieram Potok, żeby coś zapisać).
  // Wyjątek: uszkodzone dane – wtedy przegląd z czerwonym paskiem.
  Magazyn.wczytaj();   // odczyt danych wykrywa uszkodzenie (i odkłada surową kopię)
  pokazWidok(Magazyn.uszkodzone() ? 'przeglad' : 'dodaj');
  Synchronizacja.start();
  pokazStanSync();
});

/**
 * „Udostępnij → Potok” na Androidzie: system otwiera aplikację z adresem
 * w parametrach (?url=…&title=…&text=…), patrz share_target w manifeście.
 * Uwaga: Chrome ZASTĘPUJE parametry z adresu „action”, więc rozpoznajemy
 * udostępnienie po samych title/text/url.
 * Taki adres może otworzyć każda strona, dlatego: limity długości, adres
 * sprawdzany przy zapisie i widoczny komunikat z „Cofnij”.
 */
function obsluzUdostepnienie() {
  const par = new URLSearchParams(location.search);   // wartości już zdekodowane
  if (!['udostepnij', 'title', 'text', 'url'].some(p => par.has(p))) return;
  const LIMIT = 2000;
  const tekst = (par.get('text') || '').slice(0, LIMIT);
  const url = (par.get('url') || (tekst.match(/https?:\/\/\S+/) || [''])[0]).slice(0, LIMIT);
  const tytul = (par.get('title') || tekst.replace(url, '').trim()).slice(0, LIMIT);
  // Ślad ostatniego udostępnienia (tylko na tym urządzeniu) – do sprawdzania błędów.
  localStorage.setItem(Magazyn.klucz + '.udostepnienie',
    new Date().toLocaleString('pl-PL') + ' · ' + [tytul, url].filter(Boolean).join(' · ').slice(0, 300));
  const ids = dodajRecznie(url, tytul, 'udostępnij');
  if (!ids.length) return komunikat('Ten link już jest w Potoku.');
  const w = Magazyn.wczytaj().find(x => x.id === ids[0]);
  komunikat('Dodano z udostępnienia: ' + (w ? w.tytul : '').slice(0, 80), {
    etykieta: 'Cofnij (do Archiwum)',
    akcja: () => { Magazyn.zmienStatus(ids[0], 'archiwum'); komunikat('Przeniesiono do Archiwum.'); pokazWidok(aktualnyWidok); },
  });
}
