/* bledy.js – błędy nie mogą ginąć po cichu.

   Łapie każdy nieobsłużony błąd aplikacji, pokazuje krótki komunikat
   i zapamiętuje ostatnie 20 (tylko na tym urządzeniu). Widać je w
   Pliki → Diagnostyka, z przyciskiem „Kopiuj” do wklejenia Claude'owi.
   Zapisujemy tylko treść błędu i miejsce w kodzie – bez treści wpisów
   i bez tajnego klucza. Ładowany jako pierwszy skrypt. */

const Bledy = {
  klucz: () => (typeof Magazyn !== 'undefined' ? Magazyn.klucz : 'potok.v1') + '.bledy',

  /** Ostatnie błędy: [{ kiedy, wersja, tresc }]. */
  lista() {
    try { return JSON.parse(localStorage.getItem(this.klucz()) || '[]'); } catch { return []; }
  },

  /** Zapamiętuje błąd i daje znać na ekranie. */
  zapisz(tresc, miejsce) {
    // Kod połączenia (adres#klucz) nigdy nie trafia do dziennika.
    const czysta = String(tresc || 'nieznany błąd').replace(/#[\w-]{8,}/g, '#…').slice(0, 500);
    const wpis = { kiedy: new Date().toISOString(), wersja: typeof WERSJA_APLIKACJI !== 'undefined' ? WERSJA_APLIKACJI : '?', tresc: czysta };
    if (miejsce) wpis.miejsce = String(miejsce).replace(/^.*\//, '').slice(0, 100);
    const lista = this.lista().concat(wpis).slice(-20);
    try { localStorage.setItem(this.klucz(), JSON.stringify(lista)); } catch { /* brak miejsca – trudno */ }
    if (typeof komunikat === 'function' && document.getElementById('komunikat'))
      komunikat('Coś poszło nie tak: ' + czysta.slice(0, 160) + ' (szczegóły: Pliki → Diagnostyka)', null, 8000);
    window.dispatchEvent(new Event('potok-blad'));
  },

  /** Tekst do skopiowania. */
  tekst() {
    return this.lista().map(b => `${b.kiedy} · wersja ${b.wersja} · ${b.tresc}${b.miejsce ? ' · ' + b.miejsce : ''}`).join('\n');
  },
};

window.addEventListener('error', e => Bledy.zapisz(e.message, e.filename ? e.filename + ':' + e.lineno : ''));
window.addEventListener('unhandledrejection', e => Bledy.zapisz(e.reason && e.reason.message || e.reason));
