/* =====================================================================
   magazyn.js – przechowywanie wpisów Potoku na tym urządzeniu.

   Wszystko trzymamy w localStorage przeglądarki pod jednym kluczem
   (Magazyn.klucz) jako JSON. To prosty i czytelny wybór: kilka tysięcy linków
   to kilkaset KB, a limit localStorage to ok. 5 MB.

   ZASADA: nic nigdy nie jest usuwane. W tym pliku celowo NIE MA
   funkcji kasowania wpisu. „Archiwum” to zwykły status.

   Kształt jednego wpisu:
   {
     id:        "w_..."            unikalny identyfikator
     url:       "https://..."     albo null (notatka bez linku)
     tytul:     "..."             co pokazujemy jako nagłówek
     tekst:     "..."             oryginalny wpis (np. linia z Google Docs)
     status:    Potok:   "skrzynka" | "do_streszczenia" | "szczegolowo" | "obczaic"
                         | "zglebic" | "obsidian" | "muzyka" | "smieszne" | "archiwum"
                Zadania: "zrobic_claude" | "zrobic_sam" | "zrobione"
     dodano:    "2026-11-08T16:40:00.000Z"   data dodania (automatycznie)
     uwagaDaty: "..."             opcjonalnie, np. że to data importu
     zrodlo:    "import: plik.docx" | "ręcznie" | "udostępnij"
     sugestia:  status zaproponowany z oznaczenia w tekście albo null
     kolejnosc: liczba – kolejność z dokumentu (do przeglądu)
     historia:  [{ data, z, na }]  każda zmiana statusu
     zmieniono: "2026-11-09T…"    ostatnia zmiana wpisu – do łączenia danych z kilku urządzeń
     prywatne:  true/false        🏠 „otwierać tylko na prywatnym komputerze”;
                                  brak pola = podpowiedź z tekstu (Import.czyPrywatne)
   }
   ===================================================================== */


// Statusy w kolejności wyświetlania + polskie nazwy.
// Znaczenie (decyzja z 8.11.2026):
//   Streścić – niech streści AI (od 14.11.2026 automat w skrypcie Google, wcześniej NotebookLM);
//              po streszczeniu można popchnąć dalej, np. do „Streścić szczegółowo”,
//   Obczaić  – przejrzeć, poeksplorować samemu,
//   Zgłębić  – poświęcić czas: przeczytać / obejrzeć w całości (artykuł albo film),
//   Zapisać do Obsidian – wiedza do notatek; lista eksportuje się osobno jako .md,
//   Muzyczki do zachowania – utwory do zapamiętania / słuchania,
//   Śmieszne – rozrywka (rolki, memy), żeby nie mieszała się z resztą,
//   Archiwum – nic nie robię, ale wpis zostaje na zawsze.
const STATUSY = {
  skrzynka:        'Skrzynka (nieprzejrzane)',
  do_streszczenia: 'Streścić',
  // Od 14.11.2026: po przeczytaniu krótkiego streszczenia AI można poprosić
  // o szczegółowe (struktura, tezy, argumenty) – robi je skrypt Google.
  szczegolowo:     'Streścić szczegółowo',
  obczaic:         'Obczaić',
  zglebic:         'Zgłębić',
  obsidian:        'Zapisać do Obsidian',
  muzyka:          'Muzyczki do zachowania',
  smieszne:        'Śmieszne',
  archiwum:        'Archiwum',
  // „Do zrobienia” (decyzja z 8.11.2026): wpisy bez linku to plany i pomysły,
  // nie treści do przyswojenia, więc mają osobne miejsce i nie zaśmiecają Potoku.
  zrobic_claude:   "Dla Claude'a",
  zrobic_sam:      'Zrobię sam',
  zrobione:        'Zrobione',
};

// Podział statusów na dwie części aplikacji.
const GRUPA_POTOK   = ['skrzynka', 'do_streszczenia', 'szczegolowo', 'obczaic', 'zglebic', 'obsidian', 'muzyka', 'smieszne', 'archiwum'];
const GRUPA_ZADANIA = ['zrobic_claude', 'zrobic_sam', 'zrobione'];

// Stare nazwy statusów → nowe. Stosowane przy każdym odczycie, więc dane
// zapisane przez starszą wersję aplikacji same się przenoszą (nic nie ginie).
const STARE_STATUSY = {
  do_przeczytania: 'zglebic',   // do 8.11.2026 „Do przeczytania”
};

// Limity długości pól (dane z internetu i z cudzych plików bywają dowolne).
const LIMITY = { url: 4000, tytul: 500, autor: 300, tekst: 50000 };
// Mniej więcej tyle znaków mieści localStorage w Chromium (ok. 5 MB).
const POJEMNOSC_PAMIECI = 5000000;

/** Krótki, stały skrót tekstu (do nadania identyfikatora uszkodzonemu wpisowi). */
function skrot(tekst) {
  let h = 5381;
  for (let i = 0; i < tekst.length; i++) h = ((h * 33) ^ tekst.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const Magazyn = {
  // Klucz w localStorage. Testy podmieniają go na własny, żeby nie ruszać Twoich danych.
  klucz: 'potok.v1',

  /* ---------------- Sprawdzanie i naprawa danych ------------------ */

  /**
   * Bezpieczny adres linku: tylko http:, https: i file:. Każdy inny
   * (np. „javascript:…”, „data:…”) → null, czyli wpis będzie notatką,
   * a sam tekst adresu zostaje w treści wpisu. Druga linia obrony przy
   * rysowaniu linku – także dla danych zapisanych przez starsze wersje.
   */
  bezpiecznyAdres(url) {
    if (typeof url !== 'string') return null;
    const a = url.trim();
    if (!a || a.length > LIMITY.url || /[\u0000-\u001f\u007f]/.test(a)) return null;
    if (!/^(https?:\/\/|file:\/\/)/i.test(a)) return null;
    try { new URL(a); } catch { return null; }
    return a;
  },

  /** Identyfikator wpisu: litery, cyfry, „_” i „-”. Inny → stały zastępczy. */
  idWpisu(w) {
    if (typeof w.id === 'string' && /^[\w-]{1,64}$/.test(w.id)) return w.id;
    return 'w_n' + skrot(w.id === undefined || w.id === null ? JSON.stringify(w) : String(w.id));
  },

  /**
   * Zwraca poprawny wpis albo null (gdy to w ogóle nie jest wpis).
   * Naprawia brakujące i złe pola, nieznane pola zostawia (zgodność
   * z przyszłymi wersjami). Oryginał zostaje nietknięty.
   * Wszystkie dane wchodzą tędy: pamięć przeglądarki, kopia, Drive, formularz.
   */
  napraw(surowy, numer = 0) {
    if (!surowy || typeof surowy !== 'object' || Array.isArray(surowy)) return null;
    const w = { ...surowy };
    const tekstPola = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
    const data = v => typeof v === 'string' && !isNaN(Date.parse(v));

    w.id = this.idWpisu(surowy);
    if (w.id !== surowy.id) w.idPierwotne = String(surowy.id ?? '').slice(0, 500);

    w.tekst = tekstPola(w.tekst).slice(0, LIMITY.tekst);
    if (surowy.url === undefined || surowy.url === null || surowy.url === '') w.url = null;
    else {
      w.url = this.bezpiecznyAdres(surowy.url);
      // Adres odrzucony – nic nie ginie: zostaje jako tekst wpisu.
      const oryginal = tekstPola(surowy.url);
      if (!w.url && oryginal && !w.tekst.includes(oryginal)) w.tekst = (w.tekst + ' ' + oryginal.slice(0, LIMITY.url)).trim();
    }
    w.tytul = tekstPola(w.tytul).slice(0, LIMITY.tytul) || w.tekst.slice(0, LIMITY.tytul) || w.url || '(bez tytułu)';
    if (w.autor !== undefined) w.autor = tekstPola(w.autor).slice(0, LIMITY.autor);

    const status = STARE_STATUSY[w.status] || w.status;
    if (STATUSY[status]) w.status = status;
    else { if (w.status !== undefined) w.statusNieznany = String(w.status).slice(0, 100); w.status = 'skrzynka'; }
    if (w.sugestia !== undefined && w.sugestia !== null) {
      const s = STARE_STATUSY[w.sugestia] || w.sugestia;
      w.sugestia = STATUSY[s] ? s : null;
    }

    w.historia = (Array.isArray(w.historia) ? w.historia : [])
      .filter(h => h && typeof h === 'object' && data(h.data))
      .map(h => ({ ...h, z: STARE_STATUSY[h.z] || tekstPola(h.z), na: STARE_STATUSY[h.na] || tekstPola(h.na) }));

    if (!data(w.dodano)) {
      const ostatnia = w.historia[0];
      w.dodano = ostatnia ? ostatnia.data : data(w.zmieniono) ? w.zmieniono : new Date().toISOString();
      w.uwagaDaty = 'oryginalna data dodania nieznana (wpis był uszkodzony)';
    }
    if (w.zmieniono !== undefined && !data(w.zmieniono)) delete w.zmieniono;
    if (typeof w.kolejnosc !== 'number' || !isFinite(w.kolejnosc)) w.kolejnosc = numer;
    if (w.prywatne !== undefined && typeof w.prywatne !== 'boolean') delete w.prywatne;
    if (w.opisPobrany !== undefined && typeof w.opisPobrany !== 'string') delete w.opisPobrany;
    return w;
  },

  /**
   * Naprawia całą listę. Zwraca { wpisy, odrzucone } – odrzucone to
   * elementy, które w ogóle nie są wpisami. Dwa wpisy z tym samym id
   * (np. po naprawie) → zostaje ten zmieniony później.
   */
  naprawWszystkie(lista) {
    const wpisy = [], odrzucone = [], pozycja = new Map();
    (Array.isArray(lista) ? lista : []).forEach((s, i) => {
      const w = this.napraw(s, i);
      if (!w) { odrzucone.push(s); return; }
      if (pozycja.has(w.id)) {
        const j = pozycja.get(w.id);
        if (czasZmianyWpisu(w) > czasZmianyWpisu(wpisy[j])) wpisy[j] = w;
        return;
      }
      pozycja.set(w.id, wpisy.length);
      wpisy.push(w);
    });
    return { wpisy, odrzucone };
  },

  /** Elementy, które nie były wpisami – odkładane, nigdy nie kasowane. */
  odlozOdrzucone(odrzucone, skad) {
    if (!odrzucone.length) return;
    const k = this.klucz + '.odrzucone';
    let lista = [];
    try { lista = JSON.parse(localStorage.getItem(k) || '[]'); } catch { lista = []; }
    lista.push({ kiedy: new Date().toISOString(), skad, elementy: odrzucone });
    try { localStorage.setItem(k, JSON.stringify(lista)); } catch (e) { console.error('Nie udało się odłożyć odrzuconych', e); }
  },

  /* ---------------- Uszkodzone dane: tryb tylko do odczytu -------- */

  /** Nazwa klucza z kopią uszkodzonych danych albo null, gdy wszystko w porządku. */
  uszkodzone() {
    return localStorage.getItem(this.klucz + '.uszkodzone');
  },

  /**
   * Danych w pamięci nie da się odczytać. Nie udajemy, że Potok jest pusty
   * (to kończyło się nadpisaniem danych): odkładamy surowy tekst pod osobnym
   * kluczem i blokujemy zapis, dopóki nie zdecydujesz.
   */
  oznaczUszkodzone(surowe) {
    if (this.uszkodzone()) return;
    const kopia = this.klucz + '.uszkodzone.' + new Date().toISOString();
    try { localStorage.setItem(kopia, surowe); } catch (e) { console.error('Brak miejsca na kopię uszkodzonych danych', e); }
    localStorage.setItem(this.klucz + '.uszkodzone', kopia);
  },

  /**
   * Twoja decyzja po uszkodzeniu: zacznij od pustej listy (Drive i kopie
   * uzupełnią resztę). Surowe uszkodzone dane zostają pod osobnym kluczem.
   */
  zacznijOdNowa() {
    const kopia = this.uszkodzone();
    if (!kopia) return;
    const surowe = localStorage.getItem(this.klucz);
    if (surowe !== null && localStorage.getItem(kopia) === null) localStorage.setItem(kopia, surowe);  // rzuci, jeśli brak miejsca – wtedy nic nie ruszamy
    localStorage.setItem(this.klucz, JSON.stringify({ wersja: 1, wpisy: [] }));
    localStorage.removeItem(this.klucz + '.uszkodzone');
  },

  /* ---------------- Odczyt i zapis --------------------------------- */

  /**
   * Odczyt surowego stanu: { wpisy, odrzucone } albo null, gdy danych nie ma.
   * Rzuca wyjątek, gdy danych nie da się odczytać.
   */
  odczytajSurowe() {
    const surowe = localStorage.getItem(this.klucz);
    if (surowe === null || surowe === '') return null;
    const dane = JSON.parse(surowe);
    if (!dane || typeof dane !== 'object' || (dane.wpisy !== undefined && !Array.isArray(dane.wpisy)))
      throw new Error('zły format danych');
    return this.naprawWszystkie(dane.wpisy || []);
  },

  /** Wczytuje wszystkie wpisy (tablica). */
  wczytaj() {
    let stan;
    try {
      stan = this.odczytajSurowe();
    } catch (e) {
      console.error('Nie udało się odczytać danych', e);
      this.oznaczUszkodzone(localStorage.getItem(this.klucz));
      return [];
    }
    if (this.uszkodzone()) localStorage.removeItem(this.klucz + '.uszkodzone');   // dane znów czytelne
    if (!stan) return [];
    const wpisy = stan.wpisy;
    let zmiany = stan.odrzucone.length;
    // ZASADA (8.11.2026): zapis bez decyzji, decyzja dopiero w przeglądzie.
    // Wersja z wieczoru 8.11 sama przenosiła wpisy bez linku do „Do zrobienia”.
    // Takie wpisy (ostatni ruch automatyczny ze skrzynki) wracają do skrzynki,
    // żebyś zdecydował o nich sam. Wpisy przesunięte przez Ciebie zostają.
    for (const w of wpisy) {
      const h = w.historia[w.historia.length - 1];
      if (h && h.automatycznie && h.z === 'skrzynka' && h.na === w.status) {
        w.historia.push({ data: new Date().toISOString(), z: w.status, na: 'skrzynka', automatycznie: true });
        w.status = 'skrzynka';
        w.zmieniono = new Date().toISOString();
        zmiany++;
      }
    }
    if (zmiany) {
      this.odlozOdrzucone(stan.odrzucone, 'pamięć przeglądarki');
      this.zapisz(wpisy);
    }
    return wpisy;
  },

  /**
   * Podpowiedź dla zadania: oznaczenie „(Claude…)” albo „[Claude…]”
   * → Dla Claude'a. Bez oznaczenia – brak podpowiedzi (null).
   * To tylko podświetlenie przycisku; decyzja zawsze należy do Ciebie.
   */
  statusZadania(tekst) {
    return /[(\[]\s*claude/i.test(tekst || '') ? 'zrobic_claude' : null;
  },

  /**
   * Zapisuje całą tablicę wpisów.
   * Domyślnie oznacza też, że jest coś „do wysłania” na Google Drive
   * i daje znać synchronizacji (zdarzenie „potok-zmiana”).
   * Synchronizacja sama zapisuje dane pobrane z Drive z oznacz = false.
   *
   * Bezpieczniki (zasada „nic nie ginie”):
   *  - przy uszkodzonych danych nic nie zapisujemy,
   *  - każdy wpis, który już jest w pamięci, musi być w nowej tablicy,
   *  - brak miejsca w przeglądarce → czytelny błąd zamiast cichej utraty.
   */
  zapisz(wpisy, oznacz = true) {
    if (this.uszkodzone()) throw new Error('Dane w tej przeglądarce są uszkodzone – Potok nic nie zapisze, dopóki nie zdecydujesz (komunikat u góry).');
    let przed;
    try { przed = this.odczytajSurowe(); }
    catch (e) { this.oznaczUszkodzone(localStorage.getItem(this.klucz)); throw new Error('Dane w tej przeglądarce są uszkodzone – zapis wstrzymany.'); }
    if (przed) {
      const nowe = new Set(wpisy.map(w => w.id));
      const brakuje = przed.wpisy.filter(w => !nowe.has(w.id)).length;
      if (brakuje) throw new Error(`Bezpiecznik: zapis zgubiłby ${brakuje} wpisów – wstrzymany. Nic nie zostało zmienione.`);
    }
    try {
      localStorage.setItem(this.klucz, JSON.stringify({ wersja: 1, wpisy }));
    } catch (e) {
      throw new Error('Brak miejsca w pamięci przeglądarki – ostatnia zmiana NIE została zapisana. Zrób kopię zapasową (Pliki).');
    }
    if (oznacz) {
      localStorage.setItem(this.klucz + '.doWyslania', '1');
      localStorage.setItem(this.klucz + '.licznikZmian', String(this.licznikZmian() + 1));
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('potok-zmiana'));
    }
  },

  /** Czy są zmiany, których jeszcze nie ma na Google Drive. */
  czekaNaWyslanie() {
    return localStorage.getItem(this.klucz + '.doWyslania') === '1';
  },
  wyslano() {
    localStorage.removeItem(this.klucz + '.doWyslania');
  },
  /** Licznik Twoich zmian – synchronizacja sprawdza, czy coś doszło w trakcie wysyłania. */
  licznikZmian() {
    return Number(localStorage.getItem(this.klucz + '.licznikZmian')) || 0;
  },

  /** Ile miejsca w przeglądarce zajmuje Potok (0–1, w przybliżeniu). */
  zajetosc() {
    let znaki = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(this.klucz)) znaki += k.length + (localStorage.getItem(k) || '').length;
    }
    return znaki / POJEMNOSC_PAMIECI;
  },

  /** Tworzy nowy identyfikator. */
  noweId() {
    return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  /**
   * Dodaje nowe wpisy, pomijając duplikaty (ten sam url + ten sam tekst).
   * Zwraca { dodane, pominiete, ids } – ids to identyfikatory dodanych.
   */
  dodaj(nowe) {
    const wpisy = this.wczytaj();
    const znane = new Set(wpisy.map(w => (w.url || '') + '|' + w.tekst));
    let dodane = 0, pominiete = 0;
    const ids = [];
    for (const n of nowe) {
      const teraz = new Date().toISOString();
      const w = this.napraw({
        status: 'skrzynka',
        dodano: teraz,   // data dodania – zawsze automatycznie
        zmieniono: teraz,
        historia: [],
        kolejnosc: wpisy.length,
        ...n,
        id: this.noweId(),
      });
      if (!w) continue;
      const klucz = (w.url || '') + '|' + w.tekst;
      if (znane.has(klucz)) { pominiete++; continue; }
      znane.add(klucz);
      wpisy.push(w);
      ids.push(w.id);
      dodane++;
    }
    this.zapisz(wpisy);
    return { dodane, pominiete, ids };
  },

  /**
   * Tytuł i autor pobrane z internetu (Opisy). Bez zmiany „zmieniono”:
   * to nie jest Twoja decyzja, więc nie może wygrać z decyzją z innego
   * urządzenia przy scalaniu (scal przenosi opis osobno).
   */
  ustawOpis(id, opis) {
    const wpisy = this.wczytaj();
    const w = wpisy.find(x => x.id === id);
    if (!w) return;
    const tytul = opis && typeof opis.tytul === 'string' ? opis.tytul.trim().slice(0, 300) : '';
    if (tytul) { w.tytul = tytul; w.autor = typeof opis.autor === 'string' ? opis.autor.trim().slice(0, LIMITY.autor) : ''; }
    w.opisPobrany = tytul ? new Date().toISOString() : 'brak-3';
    this.zapisz(wpisy);
  },

  /** Ustawia znaczek 🏠 „tylko prywatnie” (true/false). Ma własny czas zmiany (scalanie). */
  ustawPrywatne(id, wartosc) {
    const wpisy = this.wczytaj();
    const w = wpisy.find(x => x.id === id);
    if (!w) return;
    const teraz = new Date().toISOString();
    w.prywatne = !!wartosc;
    w.prywatneZmieniono = teraz;
    w.zmieniono = teraz;
    this.zapisz(wpisy);
  },

  /**
   * Rodzaj TEGO urządzenia: 'prywatne' albo 'sluzbowe'.
   * Zapisywane osobno od wpisów – każde urządzenie ma własne ustawienie
   * (także po przyszłej synchronizacji z Google Drive).
   */
  urzadzenie() {
    return localStorage.getItem(this.klucz + '.urzadzenie') || 'prywatne';
  },
  ustawUrzadzenie(rodzaj) {
    localStorage.setItem(this.klucz + '.urzadzenie', rodzaj);
  },

  /** Zmienia status wpisu i dopisuje zmianę do historii. */
  zmienStatus(id, nowyStatus) {
    this.zmienStatusWielu([id], nowyStatus);
  },

  /** To samo dla wielu wpisów naraz (jeden zapis). Zwraca, ile się zmieniło. */
  zmienStatusWielu(ids, nowyStatus) {
    if (!STATUSY[nowyStatus]) return 0;
    const wpisy = this.wczytaj();
    const teraz = new Date().toISOString();
    let ile = 0;
    for (const w of wpisy) {
      if (!ids.includes(w.id) || w.status === nowyStatus) continue;
      w.historia.push({ data: teraz, z: w.status, na: nowyStatus });
      w.zmieniono = teraz;
      w.status = nowyStatus;
      ile++;
    }
    if (ile) this.zapisz(wpisy);
    return ile;
  },

  /**
   * Kopia zapasowa: zwraca cały stan jako tekst JSON.
   * Do czasu synchronizacji z Google Drive to jest główne zabezpieczenie.
   */
  kopiaJSON() {
    return JSON.stringify({ wersja: 1, eksport: new Date().toISOString(), wpisy: this.wczytaj() }, null, 2);
  },

  /**
   * Przywraca kopię: DOKŁADA wpisy z kopii, których jeszcze nie ma
   * (po id). Niczego istniejącego nie nadpisuje ani nie usuwa.
   * Każdy wpis z kopii przechodzi przez napraw – zepsuty plik nie zepsuje Potoku.
   * Zwraca { dodane, odrzucone }.
   */
  przywrocKopie(tekstJSON) {
    let dane;
    try { dane = JSON.parse(tekstJSON); } catch { throw new Error('to nie jest plik kopii Potoku (zły JSON).'); }
    if (!dane || !Array.isArray(dane.wpisy)) throw new Error('to nie jest plik kopii Potoku (brak listy wpisów).');
    const { wpisy: zKopii, odrzucone } = this.naprawWszystkie(dane.wpisy);
    const wpisy = this.wczytaj();
    const ids = new Set(wpisy.map(w => w.id));
    let dodane = 0;
    for (const w of zKopii) {
      if (!ids.has(w.id)) { wpisy.push(w); ids.add(w.id); dodane++; }
    }
    this.odlozOdrzucone(odrzucone, 'kopia zapasowa');
    if (dodane) this.zapisz(wpisy);
    return { dodane, odrzucone: odrzucone.length };
  },
};
