/* zle-dane.js – testy po audycie z 16.11.2026: złe i złośliwe dane
   (zepsuty wpis, cudzy link „javascript:”, dziwne identyfikatory),
   rozstrzyganie konfliktów między urządzeniami i prywatność tytułów.
   Zasada: nic nie może zginąć, a nic z zewnątrz nie może stać się kodem. */

const DOBRY = (id, dod = {}) => ({ id, url: 'https://' + id + '.pl', tytul: id, tekst: id, status: 'skrzynka',
  dodano: '2026-11-01T10:00:00Z', zmieniono: '2026-11-01T10:00:00Z', historia: [], kolejnosc: 0, ...dod });
const zapiszSurowe = wpisy => localStorage.setItem(Magazyn.klucz, JSON.stringify({ wersja: 1, wpisy }));
function bezAlarmu() { localStorage.removeItem(Magazyn.klucz + '.uszkodzone'); localStorage.removeItem(Magazyn.klucz + '.odrzucone'); }

/* ---------------- B-01: zepsuty wpis nie kasuje danych ---------------- */

test('złe dane: wpis bez historii nie ukrywa pozostałych (B-01)', () => {
  czysto(); bezAlarmu();
  zapiszSurowe([DOBRY('a'), DOBRY('b'), { id: 'c', url: 'https://c.pl', tytul: 'c', status: 'skrzynka' }]);
  rowne(Magazyn.wczytaj().map(w => w.id), ['a', 'b', 'c']);
  Magazyn.dodaj([{ url: 'https://d.pl', tytul: 'd', tekst: 'd' }]);
  rowne(Magazyn.wczytaj().length, 4, 'dodanie skasowało wpisy:');
});
test('złe dane: kopia z wpisami bez historii, bez id, null i złym statusem', () => {
  czysto(); bezAlarmu();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }, { url: 'https://b.pl', tytul: 'b', tekst: 'b' }]);
  const kopia = JSON.stringify({ wersja: 1, wpisy: [
    { id: 'bez_hist', url: 'https://x.pl', tytul: 'x', status: 'obczaic', dodano: '2026-11-01T10:00:00Z' },
    { url: 'https://bez-id.pl', tytul: 'bez id', tekst: 'bez id' },
    null, 42, 'tekst',
    { id: 'zly_status', tytul: 'y', status: 'cos_nowego' },
  ] });
  rowne(Magazyn.przywrocKopie(kopia), { dodane: 3, odrzucone: 3 });
  const wpisy = Magazyn.wczytaj();
  rowne(wpisy.length, 5, 'dobre wpisy zniknęły albo złe nie doszły:');
  const zly = wpisy.find(w => w.id === 'zly_status');
  rowne([zly.status, zly.statusNieznany], ['skrzynka', 'cos_nowego']);
  prawda(wpisy.every(w => Array.isArray(w.historia) && w.dodano && typeof w.kolejnosc === 'number'), 'wpis bez wymaganych pól');
  // Odrzucone elementy są odłożone, nie skasowane.
  const odlozone = JSON.parse(localStorage.getItem(Magazyn.klucz + '.odrzucone'));
  rowne(odlozone[0].elementy, [null, 42, 'tekst']);
  bezAlarmu();
});
test('złe dane: zły plik kopii → czytelny błąd, dane bez zmian', () => {
  czysto(); bezAlarmu();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  for (const zly of ['to nie json', '{"wpisy": 5}', '[]']) {
    let blad = '';
    try { Magazyn.przywrocKopie(zly); } catch (e) { blad = e.message; }
    prawda(/kopii Potoku/.test(blad), 'brak czytelnego błędu dla: ' + zly);
  }
  rowne(Magazyn.wczytaj().length, 1);
});
test('złe dane: uszkodzony tekst w pamięci → tryb tylko do odczytu, nic nie nadpisane', () => {
  czysto(); bezAlarmu();
  localStorage.setItem(Magazyn.klucz, '{"wersja":1,"wpisy":[{"id":"a"');   // ucięty zapis
  rowne(Magazyn.wczytaj(), []);
  const kopia = Magazyn.uszkodzone();
  prawda(kopia, 'brak flagi uszkodzenia');
  rowne(localStorage.getItem(kopia), '{"wersja":1,"wpisy":[{"id":"a"', 'surowe dane nie zostały odłożone:');
  let blad = '';
  try { Magazyn.dodaj([{ url: 'https://b.pl', tytul: 'b', tekst: 'b' }]); } catch (e) { blad = e.message; }
  prawda(/uszkodzone/.test(blad), 'zapis powinien zostać wstrzymany');
  rowne(localStorage.getItem(Magazyn.klucz), '{"wersja":1,"wpisy":[{"id":"a"', 'uszkodzone dane nadpisane:');
  // Twoja decyzja: zacznij od nowa – kopia uszkodzonych zostaje.
  Magazyn.zacznijOdNowa();
  rowne(Magazyn.uszkodzone(), null);
  rowne(localStorage.getItem(kopia), '{"wersja":1,"wpisy":[{"id":"a"', 'kopia zniknęła:');
  Magazyn.dodaj([{ url: 'https://b.pl', tytul: 'b', tekst: 'b' }]);
  rowne(Magazyn.wczytaj().length, 1);
  localStorage.removeItem(kopia);
});
test('złe dane: bezpiecznik – zapis, który gubi wpisy, jest wstrzymany', () => {
  czysto(); bezAlarmu();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }, { url: 'https://b.pl', tytul: 'b', tekst: 'b' }]);
  let blad = '';
  try { Magazyn.zapisz(Magazyn.wczytaj().slice(1)); } catch (e) { blad = e.message; }
  prawda(/Bezpiecznik/.test(blad), 'brak bezpiecznika');
  rowne(Magazyn.wczytaj().length, 2);
});
test('złe dane: naprawa jest stała – ten sam zepsuty wpis zawsze dostaje to samo id', () => {
  const zly = { url: 'https://x.pl', tytul: 'x' };
  rowne(Magazyn.napraw(zly).id, Magazyn.napraw({ ...zly }).id);
  rowne(Magazyn.napraw({ id: 'x" onfocus="alert(1)', tytul: 'x' }).id, Magazyn.napraw({ id: 'x" onfocus="alert(1)', tytul: 'inny' }).id);
});

/* ---------------- B-02 / B-03: adresy i identyfikatory ---------------- */

test('adresy: tylko http, https i file są linkami (B-02)', () => {
  for (const a of ['https://a.pl', 'http://a.pl/x?y=1', 'file:///C:/plik.pdf', '  https://a.pl  '])
    prawda(Magazyn.bezpiecznyAdres(a), 'odrzucony dobry adres: ' + a);
  for (const a of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox', 'https://a.pl/\u0000', '//a.pl', 'a.pl', '', null, 5, 'https://' + 'a'.repeat(5000)])
    rowne(Magazyn.bezpiecznyAdres(a), null, 'przepuszczony: ' + String(a).slice(0, 40));
});
test('adresy: wpis z „javascript:” staje się notatką, tekst adresu zostaje', () => {
  czysto(); bezAlarmu();
  Magazyn.dodaj([{ url: 'javascript:alert(1)', tytul: 'Ciekawy artykuł', tekst: 'Ciekawy artykuł' }]);
  const w = Magazyn.wczytaj()[0];
  rowne(w.url, null);
  prawda(w.tekst.includes('javascript:alert(1)'), 'tekst adresu zniknął');
  // To samo dla danych już zapisanych (np. przez starszą wersję albo z Drive).
  zapiszSurowe([DOBRY('a', { url: 'javascript:alert(document.cookie)' })]);
  rowne(Magazyn.wczytaj()[0].url, null);
});
test('identyfikatory: znaki spoza [A-Za-z0-9_-] → nowe id, stare w idPierwotne (B-03)', () => {
  const w = Magazyn.napraw(DOBRY('x" onfocus="alert(1)" autofocus="'));
  prawda(/^[\w-]+$/.test(w.id), 'niebezpieczne id: ' + w.id);
  rowne(w.idPierwotne, 'x" onfocus="alert(1)" autofocus="');
});
test('pola: tytuł z internetu przycięty, autor z obiektu → tekst', () => {
  const w = Magazyn.napraw(DOBRY('a', { tytul: 'x'.repeat(2000), autor: { zly: 1 }, prywatne: 'tak', kolejnosc: 'pierwszy' }), 7);
  rowne([w.tytul.length, w.autor, w.prywatne, w.kolejnosc], [500, '', undefined, 7]);
  czysto(); bezAlarmu();
  Magazyn.dodaj([{ url: 'https://youtu.be/q', tytul: 'https://youtu.be/q', tekst: 'https://youtu.be/q' }]);
  Magazyn.ustawOpis(Magazyn.wczytaj()[0].id, { tytul: 'y'.repeat(1000), autor: 'a' });
  rowne(Magazyn.wczytaj()[0].tytul.length, 300);
});
test('pola: nieznane pola zostają (zgodność z przyszłymi wersjami)', () => {
  rowne(Magazyn.napraw(DOBRY('a', { nowePole: { x: 1 } })).nowePole, { x: 1 });
});

/* ---------------- Synchronizacja: plik z Drive ---------------- */

test('Drive: uszkodzony plik → błąd, a nie „pusty Potok”', () => {
  let blad = '';
  try { Synchronizacja.odczytajTresc('{zepsute'); } catch (e) { blad = e.message; }
  prawda(/uszkodzony/.test(blad), 'brak błędu');
  rowne(Synchronizacja.odczytajTresc(''), []);
});
test('Drive: plik zapisany przez nowszą wersję Potoku → nic nie wysyłamy', () => {
  let blad = '';
  try { Synchronizacja.odczytajTresc(JSON.stringify({ wersja: 2, wpisy: [] })); } catch (e) { blad = e.message; }
  prawda(/nowsza wersja/.test(blad), 'brak błędu');
});
test('Drive: zepsute wpisy z pliku są naprawiane', () => {
  const wpisy = Synchronizacja.odczytajTresc(JSON.stringify({ wersja: 1, wpisy: [DOBRY('a'), { id: 'b', tytul: 'b' }, null] }));
  rowne(wpisy.map(w => [w.id, Array.isArray(w.historia)]), [['a', true], ['b', true]]);
  bezAlarmu();
});
test('synchronizacja: zmiana w trakcie wysyłania nie gubi znacznika „do wysłania”', () => {
  czysto(); bezAlarmu();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const licznik = Magazyn.licznikZmian();
  Magazyn.zmienStatus(Magazyn.wczytaj()[0].id, 'obczaic');   // „w trakcie”
  prawda(Magazyn.licznikZmian() !== licznik, 'licznik się nie zmienił');
});

/* ---------------- A-02: konflikty między urządzeniami ---------------- */

test('scal: status na A + 🏠 na B → oba zachowane', () => {
  const baza = DOBRY('a');
  const naA = { ...baza, status: 'zglebic', zmieniono: '2026-11-09T10:00:00Z',
    historia: [{ data: '2026-11-09T10:00:00Z', z: 'skrzynka', na: 'zglebic' }] };
  const naB = { ...baza, prywatne: true, prywatneZmieniono: '2026-11-09T11:00:00Z', zmieniono: '2026-11-09T11:00:00Z' };
  for (const [l, z] of [[naA, naB], [naB, naA]]) {
    const w = scalWpisy([l], [z]).wpisy[0];
    rowne([w.status, w.prywatne], ['zglebic', true]);
  }
});
test('scal: urządzenie z cofniętym zegarem nie gubi decyzji z historii', () => {
  const baza = DOBRY('a');
  // B ma zegar cofnięty o dobę: jego decyzja wygląda na starszą, ale jest jedyną zmianą statusu.
  const naB = { ...baza, status: 'archiwum', zmieniono: '2026-10-31T12:00:00Z',
    historia: [{ data: '2026-10-31T12:00:00Z', z: 'skrzynka', na: 'archiwum' }] };
  const naA = { ...baza, tytul: 'nowy tytuł', zmieniono: '2026-11-02T10:00:00Z' };
  rowne(scalWpisy([naA], [naB]).wpisy[0].status, 'archiwum');
});
test('scal: remis czasu → oba urządzenia wybierają to samo', () => {
  const l = DOBRY('a', { status: 'obczaic' }), z = DOBRY('a', { status: 'zglebic' });
  rowne(scalWpisy([l], [z]).wpisy[0], scalWpisy([z], [l]).wpisy[0]);
});
test('scal: uszkodzone wpisy z pliku nie giną', () => {
  const { wpisy } = scalWpisy([DOBRY('a')], [{ tytul: 'bez id' }, DOBRY('b')]);
  rowne(wpisy.length, 3);
});

/* ---------------- B-08: prywatność tytułów ---------------- */

test('tytuły: domyślnie tylko YouTube; 🏠 i komputer służbowy nigdy', () => {
  localStorage.removeItem(Magazyn.klucz + '.urzadzenie');
  Opisy.ustawWszystkieStrony(false);
  const yt = { url: 'https://youtu.be/abc', tytul: 'https://youtu.be/abc', tekst: 'https://youtu.be/abc' };
  const strona = { url: 'https://example.com/a', tytul: 'https://example.com/a', tekst: 'x' };
  prawda(Opisy.potrzebuje(yt), 'YouTube');
  prawda(!Opisy.potrzebuje(strona), 'inne strony domyślnie wyłączone');
  Opisy.ustawWszystkieStrony(true);
  prawda(Opisy.potrzebuje(strona), 'inne strony po włączeniu');
  prawda(!Opisy.potrzebuje({ ...yt, prywatne: true }), '🏠');
  prawda(!Opisy.potrzebuje({ ...yt, tekst: '(Dom) https://youtu.be/abc' }), '🏠 z podpowiedzi');
  Magazyn.ustawUrzadzenie('sluzbowe');
  prawda(!Opisy.potrzebuje(yt), 'komputer służbowy');
  localStorage.removeItem(Magazyn.klucz + '.urzadzenie');
  for (const a of ['https://example.com/potwierdz?token=abc', 'https://example.com/x?sig=1', 'https://example.com/unsubscribe/1',
    'http://intranet/strona', 'http://192.168.1.1/', 'http://localhost:8080/', 'https://serwer.corp/a'])
    prawda(!Opisy.potrzebuje({ url: a, tytul: a, tekst: a }), 'wysłany: ' + a);
  Opisy.ustawWszystkieStrony(false);
});

/* ---------------- B-14: eksport .md ---------------- */

test('eksport .md: HTML z tytułu nie trafia do Obsidiana, nawiasy w adresie nie psują linku', () => {
  const md = Eksport.markdown([
    { status: 'obczaic', url: 'https://a.pl/x_(y)', tytul: 'Zły <img src=https://zly.pl/x.png>', tekst: 'linia1\nlinia2', autor: '<b>a</b>', dodano: '2026-11-08T10:00:00Z' },
    { status: 'obczaic', url: 'javascript:alert(1)', tytul: 'js', tekst: 'js', dodano: '2026-11-08T10:00:00Z' },
  ]);
  prawda(!/<img|<b>/.test(md), 'HTML w pliku .md');
  prawda(md.includes('(https://a.pl/x_%28y%29)'), 'nawiasy w adresie');
  prawda(md.includes('oryginalnie: linia1 linia2'), 'nowa linia w tekście');
  prawda(!md.includes('](javascript:'), 'link javascript: w .md');
});
