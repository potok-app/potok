/* =====================================================================
   synchronizacja.js – zapis Potoku na Twoim Google Drive.

   Jak to działa:
   - na Drive jest folder „Potok”, a w nim jeden plik „Potok.json”
     z wszystkimi wpisami (ten sam format co kopia zapasowa),
   - plik czyta i zapisuje Twój własny skrypt Google (skrypt-google/Kod.gs),
     który działa na Twoim koncie; aplikacja zna jego adres i tajny klucz
     („kod połączenia”). Bez Google Cloud i bez logowania co godzinę,
   - każde urządzenie pracuje na swojej kopii (działa bez internetu),
     a synchronizacja łączy ją z plikiem na Drive (funkcja scalWpisy
     z scal.js – nic nie ginie):
       • skrypt w wersji 10+: jedno zapytanie „synchronizuj” – skrypt sam
         łączy dane pod blokadą, więc dwa urządzenia naraz nie zgubią
         sobie zmian,
       • starszy skrypt: pobierz → połącz → wyślij (jak dawniej),
   - synchronizacja rusza sama: przy otwarciu aplikacji, chwilę po każdej
     zmianie i gdy wraca internet. Bez internetu zmiany czekają w kolejce
     („do wysłania”) – nic nie trzeba pamiętać.

   Dawny drugi sposób (Google Cloud / OAuth) usunięty 16.11.2026 po audycie:
   nie był używany, a ładował obcy skrypt przy każdym otwarciu. Jest w historii gita.
   ===================================================================== */

// Najnowsza wersja skryptu Google, jaką zna ta aplikacja (skrypt-google/Kod.gs).
const NAJNOWSZY_SKRYPT = 10;
// Wersja formatu danych (pole „wersja” w Potok.json). Nowsza = zapisana przez
// nowszą aplikację – wtedy ta (stara) wersja nic nie wysyła.
const WERSJA_DANYCH = 1;

const Synchronizacja = {
  // Aktualny stan, pokazywany w znaczku ☁ u góry ekranu.
  stan: 'niepolaczone',   // niepolaczone | offline | czeka | trwa | zapisane | blad
  ostatnio: null,         // czas ostatniej udanej synchronizacji
  blad: '',
  sprawdzWersje: true,    // raz na uruchomienie (i po „Synchronizuj teraz”) pytamy skrypt o wersję

  /* ---------------- Łączenie danych (bez sieci, testowane) -------- */

  /** Kiedy wpis zmienił się ostatnio (do wyboru nowszej wersji). */
  czasZmiany(w) { return czasZmianyWpisu(w); },

  /** Łączy wpisy z tego urządzenia z wpisami z Drive – patrz scal.js. */
  scal(lokalne, zdalne) { return scalWpisy(lokalne, zdalne); },

  /** Treść pliku Potok.json z listy wpisów. */
  tresc(wpisy) {
    return JSON.stringify({ wersja: WERSJA_DANYCH, zapisano: new Date().toISOString(), wpisy }, null, 1);
  },

  /**
   * Treść pliku z Drive → poprawione wpisy. Pusty plik = brak wpisów.
   * Zły plik → błąd (nigdy „udajemy, że pusty”). Nowszy format → błąd.
   */
  odczytajTresc(tresc) {
    if (typeof tresc !== 'string' || !tresc.trim()) return [];
    let dane;
    try { dane = JSON.parse(tresc); } catch { throw new Error('Plik Potok.json na Drive jest uszkodzony (zły JSON) – nic nie wysyłam.'); }
    if (!dane || typeof dane !== 'object') throw new Error('Plik Potok.json na Drive ma zły format – nic nie wysyłam.');
    if (Number(dane.wersja) > WERSJA_DANYCH)
      throw new Error('Plik na Drive zapisała nowsza wersja Potoku. Zamknij i otwórz aplikację, żeby się zaktualizowała.');
    const { wpisy, odrzucone } = Magazyn.naprawWszystkie(dane.wpisy || []);
    Magazyn.odlozOdrzucone(odrzucone, 'Google Drive');
    return wpisy;
  },

  /* ---------------- Połączenie ze skryptem Google ----------------- */

  /** Czy to urządzenie jest połączone z Drive. */
  dostepne() {
    return !!this.skrypt();
  },

  /** Zapisany skrypt: { url, klucz } albo null. */
  skrypt() {
    try {
      const s = JSON.parse(localStorage.getItem(Magazyn.klucz + '.skrypt') || 'null');
      return s && typeof s.url === 'string' && typeof s.klucz === 'string' ? s : null;
    } catch { return null; }
  },

  /** Losowy tajny klucz (32 znaki) – tylko Ty i Twój skrypt go znacie. */
  nowyKlucz() {
    const znaki = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => znaki[b % znaki.length]).join('');
  },

  /**
   * Zapisuje połączenie. Przyjmuje „kod połączenia” (adres#klucz)
   * albo sam adres skryptu + klucz osobno. Zwraca true, gdy wygląda poprawnie.
   */
  ustawSkrypt(kodLubAdres, klucz) {
    let [url, k] = String(kodLubAdres || '').trim().split('#');
    k = k || klucz;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || !k || !/^[\w-]{8,200}$/.test(k)) return false;
    localStorage.setItem(Magazyn.klucz + '.skrypt', JSON.stringify({ url, klucz: k }));
    localStorage.removeItem(Magazyn.klucz + '.wersjaSkryptu');
    this.sprawdzWersje = true;
    return true;
  },

  /** Odłącza to urządzenie. Wpisy zostają tutaj i na Drive. */
  rozlacz() {
    // .drive, .token, .plikId – pozostałości po dawnym sposobie przez Google Cloud.
    for (const k of ['.skrypt', '.wersjaSkryptu', '.drive', '.token', '.plikId', '.skryptStary']) localStorage.removeItem(Magazyn.klucz + k);
    this.ustawStan('niepolaczone');
  },

  /** Kod połączenia do wklejenia na innym urządzeniu (zawiera tajny klucz!). */
  kodPolaczenia() {
    const s = this.skrypt();
    return s ? s.url + '#' + s.klucz : '';
  },

  /** Zapytanie do skryptu. Bez nagłówków – przeglądarka nie robi wtedy dodatkowego sprawdzenia (CORS). */
  async doSkryptu(dane) {
    const s = this.skrypt();
    const odp = await fetch(s.url, { method: 'POST', body: JSON.stringify({ ...dane, klucz: s.klucz }) });
    if (!odp.ok) throw new Error('Skrypt Google odpowiedział błędem ' + odp.status);
    const wynik = await odp.json();
    if (wynik.blad) throw new Error('Skrypt Google: ' + wynik.blad);
    return wynik;
  },

  /**
   * Wersja skryptu Google. Pytamy raz na uruchomienie (i po „Synchronizuj
   * teraz”), wynik pamiętamy. Skrypt starszy niż 3 nie zna pytania o wersję.
   */
  async wersjaSkryptu() {
    if (!this.sprawdzWersje && this.zapamietanaWersja()) return this.zapamietanaWersja();
    let wersja;
    try { wersja = Number((await this.doSkryptu({ akcja: 'wersja' })).wersja) || 3; }
    catch (e) { if (/nieznana akcja/.test(e.message)) wersja = 2; else throw e; }
    this.sprawdzWersje = false;
    localStorage.setItem(Magazyn.klucz + '.wersjaSkryptu', String(wersja));
    window.dispatchEvent(new Event('potok-stan-synchronizacji'));
    return wersja;
  },
  /** Ostatnio sprawdzona wersja skryptu (0 = jeszcze nie wiadomo). */
  zapamietanaWersja() {
    return Number(localStorage.getItem(Magazyn.klucz + '.wersjaSkryptu')) || 0;
  },
  /** Czy warto zaktualizować skrypt (Pliki pokazują wtedy ramkę z instrukcją). */
  skryptDoAktualizacji() {
    const v = this.zapamietanaWersja();
    return !!this.skrypt() && v > 0 && v < NAJNOWSZY_SKRYPT;
  },

  /* ---------------- Synchronizacja -------------------------------- */

  /** Łączy dane tego urządzenia z plikiem na Drive. */
  async synchronizuj() {
    if (!this.dostepne()) return this.ustawStan('niepolaczone');
    if (!navigator.onLine) return this.ustawStan('offline');
    if (this.trwa) { this.ponow = true; return; }   // jedna synchronizacja naraz
    if (Magazyn.uszkodzone()) return this.ustawStan('blad', 'Dane w tej przeglądarce są uszkodzone – decyzja w komunikacie u góry.');

    this.trwa = true;
    this.ustawStan('trwa');
    try {
      const wersja = await this.wersjaSkryptu();
      // Licznik zmian przed wysłaniem: jeśli coś zmienisz w trakcie,
      // znacznik „do wysłania” zostaje i synchronizacja ruszy jeszcze raz.
      const licznik = Magazyn.licznikZmian();
      if (wersja >= 10) {
        // Skrypt łączy dane sam, pod blokadą – atomowo.
        const { tresc } = await this.doSkryptu({ akcja: 'synchronizuj', tresc: this.tresc(Magazyn.wczytaj()) });
        const zDrive = this.odczytajTresc(tresc);
        Magazyn.zapisz(this.scal(Magazyn.wczytaj(), zDrive).wpisy, false);
      } else {
        const zdalne = this.odczytajTresc((await this.doSkryptu({ akcja: 'pobierz' })).tresc);
        const { wpisy, inneNizZdalne } = this.scal(Magazyn.wczytaj(), zdalne);
        Magazyn.zapisz(wpisy, false);               // u siebie, bez oznaczania „do wysłania”
        if (inneNizZdalne) await this.doSkryptu({ akcja: 'zapisz', tresc: this.tresc(wpisy) });
      }
      if (Magazyn.licznikZmian() === licznik) Magazyn.wyslano();
      else this.ponow = true;
      this.ostatnio = new Date();
      this.ustawStan('zapisane');
      window.dispatchEvent(new Event('potok-odswiez'));   // ekran pokaże nowe dane
      if (typeof Opisy !== 'undefined') Opisy.uzupelnij();              // tytuły gołych linków, w tle
      if (typeof Streszczenia !== 'undefined') Streszczenia.pobierz();  // streszczenia AI z Drive, w tle
    } catch (e) {
      console.error('Synchronizacja', e);
      if (!navigator.onLine) this.ustawStan('offline');
      else this.ustawStan('blad', e.message);
    } finally {
      this.trwa = false;
      if (this.ponow) { this.ponow = false; this.synchronizuj(); }
    }
  },

  /** Ustawia stan i odświeża znaczek ☁. */
  ustawStan(stan, blad = '') {
    this.stan = stan;
    this.blad = blad;
    if (stan === 'zapisane' && Magazyn.czekaNaWyslanie()) this.stan = 'czeka';
    window.dispatchEvent(new Event('potok-stan-synchronizacji'));
  },

  /** Tekst znaczka ☁ u góry ekranu. */
  opisStanu() {
    const czas = this.ostatnio ? this.ostatnio.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
    switch (this.stan) {
      case 'trwa':      return '☁ synchronizuję…';
      case 'zapisane':  return `☁ zapisane ${czas}`;
      case 'czeka':     return '☁ czeka na wysłanie';
      case 'offline':   return Magazyn.czekaNaWyslanie() ? '☁ bez internetu – wyślę później' : '☁ bez internetu';
      case 'blad':      return '☁ błąd – kliknij, aby ponowić';
      default:          return '';
    }
  },

  /* ---------------- Start ----------------------------------------- */

  /** Podpina automatyczną synchronizację. Wywoływane raz przy starcie. */
  start() {
    // Chwilę po każdej zmianie (zbieramy kilka kliknięć w jedno wysłanie).
    window.addEventListener('potok-zmiana', () => {
      if (!this.dostepne()) return;
      clearTimeout(this.odczekaj);
      this.ustawStan(navigator.onLine ? 'czeka' : 'offline');
      this.odczekaj = setTimeout(() => this.synchronizuj(), 1500);
    });
    // Gdy wraca internet – wysyłamy to, co czekało.
    window.addEventListener('online', () => this.synchronizuj());
    window.addEventListener('offline', () => { if (this.dostepne()) this.ustawStan('offline'); });
    // Gdy wracasz do karty z aplikacją – pobieramy zmiany z innych urządzeń.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.synchronizuj();
    });
    this.synchronizuj();
  },
};
