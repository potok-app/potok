/* opisy.js – tytuł i autor dla „gołych” linków (np. udostępnionych z YouTube).

   Pobiera je Twój skrypt Google (akcja „opis”, od wersji 2 skryptu), bo
   przeglądarka sama nie może czytać cudzych stron. Działa w tle po każdej
   synchronizacji, po kolei, jeden link naraz. Bez internetu – czeka.
   Oryginalny tekst wpisu zostaje bez zmian, zmienia się tylko tytuł.

   Prywatność (audyt 16.11.2026): skrypt Google otwiera link ze swoich
   serwerów, a samo otwarcie niektórych linków coś robi („potwierdź”,
   „wypisz się”). Dlatego domyślnie tylko YouTube (oficjalne oEmbed, bez
   otwierania strony). Inne strony – po włączeniu w Pliki. Nigdy: wpisy 🏠,
   wszystko na komputerze służbowym, linki z jednorazowymi znacznikami,
   adresy z sieci lokalnej. */

const Opisy = {
  /** Czy wpis ma tytuł „z automatu” (sam adres albo „YouTube · id”) – wtedy warto pobrać prawdziwy. */
  potrzebuje(w) {
    // 'brak' i 'brak-2' to nieudane próby starszego skryptu (np. bez zgody Google
    // na łączenie ze stronami) – ze skryptem w wersji 3 próbujemy jeszcze raz.
    // 'brak-3' = skrypt w wersji 3 też nie dał rady – nie pytamy w kółko.
    if (!w.url || !/^https?:\/\//i.test(w.url) || (w.opisPobrany && !['brak', 'brak-2'].includes(w.opisPobrany))) return false;
    if (!this.wolnoPytac(w)) return false;
    // „Streścić” jako tytuł – wpisy dodane przed wersją 16 też się poprawią.
    return !w.tytul || w.tytul === w.url || w.tytul === Import.tytulZAdresu(w.url) || Import.tylkoOznaczenia(w.tytul);
  },

  /** Czy ten link wolno wysłać do skryptu Google po tytuł (patrz „Prywatność” u góry). */
  wolnoPytac(w) {
    if (Import.czyPrywatne(w) || Magazyn.urzadzenie() === 'sluzbowe') return false;
    let u;
    try { u = new URL(w.url); } catch { return false; }
    if (this.czyYouTube(u)) return true;
    if (!this.wszystkieStrony()) return false;
    const host = u.hostname;
    // Sieć lokalna / firmowa: host bez kropki, localhost, adresy prywatne.
    if (!host.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /\.(local|lan|internal|corp)$/.test(host)) return false;
    // Jednorazowe znaczniki i linki-akcje.
    if (/[?&#](token|key|sig|signature|auth|code|otp|session|unsubscribe|confirm)[^=&]*=/i.test(u.search + u.hash)) return false;
    if (/unsubscribe|wypisz|confirm|potwierd|verify|reset/i.test(u.pathname)) return false;
    return true;
  },

  czyYouTube(u) {
    return /(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname);
  },

  /** Ustawienie tego urządzenia: pobierać tytuły także stron innych niż YouTube. */
  wszystkieStrony() {
    return localStorage.getItem(Magazyn.klucz + '.tytulyWszystkie') === '1';
  },
  ustawWszystkieStrony(tak) {
    if (tak) localStorage.setItem(Magazyn.klucz + '.tytulyWszystkie', '1');
    else localStorage.removeItem(Magazyn.klucz + '.tytulyWszystkie');
  },

  /**
   * Adres wysyłany po tytuł. YouTube: sam film (bez „&list=…”, „&index=…”),
   * bo YouTube nie podaje tytułu dla linków z miksów i list.
   */
  adresDoOpisu(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^(www|m|music)\./, '');
      let id = '';
      if (host === 'youtube.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/) || [])[1] || '';
      if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
      return id ? 'https://www.youtube.com/watch?v=' + id : url;
    } catch { return url; }
  },

  /** Ile razy link nie odpowiedział (pamiętane na tym urządzeniu). */
  proby() {
    try { return JSON.parse(localStorage.getItem(Magazyn.klucz + '.opisyProby') || '{}'); } catch { return {}; }
  },

  /** Krótkie podsumowanie do „Pliki”: ile tytułów jest, ile się nie udało, ile czeka. */
  podsumowanie(wpisy) {
    const linki = wpisy.filter(w => w.url && /^https?:/i.test(w.url));
    const ile = f => linki.filter(f).length;
    const tekst = `Tytuły linków: pobrane ${ile(w => w.opisPobrany && !/^brak/.test(w.opisPobrany))} · bez tytułu ${ile(w => w.opisPobrany === 'brak-3')} · czekają ${ile(w => this.potrzebuje(w))}.`;
    const b = this.ostatniBlad;
    return tekst + (b ? ` Ostatni problem (${b.kiedy.toLocaleTimeString('pl-PL')}): ${b.url} – ${b.tresc}` : '');
  },

  /** Czy skrypt Google jest za stary, żeby pobierać tytuły (przed wersją 3). */
  skryptStary() {
    const v = Synchronizacja.zapamietanaWersja();
    return v > 0 && v < 3;
  },

  /** Uzupełnia po kolei wszystkie wpisy, które tego potrzebują. */
  async uzupelnij() {
    if (this.trwa || !navigator.onLine || !Synchronizacja.skrypt()) return;
    this.trwa = true;
    try {
      // Wersję skryptu sprawdza synchronizacja; stary skrypt nie umie tytułów.
      if ((await Synchronizacja.wersjaSkryptu()) < 3) { this.trwa = false; return; }
    } catch { this.trwa = false; return; }   // brak sieci – spróbujemy później
    const pominiete = new Set();   // linki, które w tym przebiegu nie odpowiedziały
    let bezOdpowiedziPodRzad = 0;
    try {
      for (;;) {
        const w = Magazyn.wczytaj().find(x => this.potrzebuje(x) && !pominiete.has(x.id));
        if (!w) return;
        let opis;
        try {
          opis = await Synchronizacja.doSkryptu({ akcja: 'opis', url: this.adresDoOpisu(w.url) });
        } catch (e) {
          if (/nieznana akcja/.test(e.message)) {
            localStorage.setItem(Magazyn.klucz + '.wersjaSkryptu', '2');
            window.dispatchEvent(new Event('potok-stan-synchronizacji'));
            return;
          }
          this.ostatniBlad = { url: w.url, tresc: e.message, kiedy: new Date() };
          if (!navigator.onLine) return;   // bez internetu – spróbujemy po następnej synchronizacji
          if (e instanceof TypeError) {
            // Brak odpowiedzi (np. skrypt Google przekroczył czas na wolnej stronie).
            // Ten link pomijamy, a po 2 takich próbach uznajemy „bez tytułu”.
            // 3 razy pod rząd bez odpowiedzi = raczej problem z siecią – przerwa.
            if (++bezOdpowiedziPodRzad >= 3) return;
            const proby = this.proby();
            proby[w.id] = (proby[w.id] || 0) + 1;
            localStorage.setItem(Magazyn.klucz + '.opisyProby', JSON.stringify(proby));
            window.dispatchEvent(new Event('potok-stan-synchronizacji'));
            if (proby[w.id] < 2) { pominiete.add(w.id); continue; }
          }
          opis = null;   // błąd tylko dla tego linku – nie blokuje pozostałych
        }
        bezOdpowiedziPodRzad = opis === null ? bezOdpowiedziPodRzad : 0;
        if (opis && opis.problem) this.ostatniBlad = { url: w.url, tresc: opis.problem, kiedy: new Date() };
        Magazyn.ustawOpis(w.id, opis);
        window.dispatchEvent(new Event('potok-odswiez'));
        window.dispatchEvent(new Event('potok-stan-synchronizacji'));
      }
    } finally {
      this.trwa = false;
    }
  },
};
