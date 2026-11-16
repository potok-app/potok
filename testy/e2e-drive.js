/* e2e-drive.js – test synchronizacji z Google Drive „jak człowiek”,
   na udawanym Google Drive (prawdziwe konto nie jest potrzebne).

   Scenariusz: dwa urządzenia (komputer i telefon) z tym samym Drive.
   1. Komputer importuje dokument i wysyła go na Drive.
   2. Telefon (pusty) pobiera wszystko z Drive.
   3. Telefon bez internetu podejmuje decyzję – zmiana czeka w kolejce.
   4. Wraca internet – zmiana sama trafia na Drive.
   5. Komputer pobiera zmianę z telefonu. Nic nie zginęło.

   Scenariusz przechodzi dwa razy:
   - „stary skrypt” (wersje 1–9: pobierz → połącz → zapisz) – udawany tutaj,
     tak jak działa skrypt na Drive, dopóki nie zostanie zaktualizowany,
   - „skrypt v11” – PRAWDZIWY skrypt-google/Kod.gs uruchomiony w Node
     (testy/udawany-google.js); łączenie danych po stronie skryptu.
   (Dawny sposób przez Google Cloud usunięty 16.11.2026.)

   Użycie: node testy/e2e-drive.js */
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = require('assert');
const { nowyGoogle } = require('./udawany-google');

const KATALOG = path.resolve(__dirname, '..');
const STRONA = 'file://' + path.join(KATALOG, 'index.html');
const DOCX = path.join(__dirname, 'przyklad.docx');

/* ---------- Udawany Google Drive: pliki trzymane w pamięci ---------- */
let drive;
const ADRES_SKRYPTU = 'https://script.google.com/macros/s/TESTOWY_SKRYPT/exec';

/** Udawany skrypt Google: { klucz, akcja, tresc } → jak skrypt-google/Kod.gs. */
async function obsluzSkrypt(route) {
  const z = route.request();
  const odp = obj => route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (z.method() !== 'POST') return odp({ potok: 'skrypt działa' });
  // Skrypt v11: odpowiada prawdziwy Kod.gs.
  if (drive.google) return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: drive.google.doPost({ postData: { contents: z.postData() } }).tekst });
  const dane = JSON.parse(z.postData());
  if (dane.klucz !== 'TAJNY-KLUCZ') return odp({ blad: 'zły klucz' });
  if (dane.akcja === 'pobierz') return odp({ tresc: drive.skrypt || '{"wersja":1,"wpisy":[]}' });
  if (dane.akcja === 'zapisz') { drive.skrypt = dane.tresc; drive.zapisy++; return odp({ ok: true }); }
  // Akcja „opis” jest od wersji 2 skryptu; stary skrypt jej nie zna.
  if (dane.akcja === 'wersja' && drive.wersjaSkryptu >= 3) return odp({ wersja: drive.wersjaSkryptu });
  if (dane.akcja === 'opis' && drive.wersjaSkryptu >= 2) {
    // Jak prawdziwy YouTube: link z miksu („&list=RD…”) – bez tytułu.
    if (/youtube\.com.*[?&]list=/.test(dane.url)) return odp({ tytul: '' });
    if (/zepsuty/.test(dane.url)) return route.fulfill({ status: 200, body: '<html>błąd Google</html>' });
    if (/wolny/.test(dane.url)) return route.abort();   // skrypt nie odpowiedział (np. przekroczony czas)
    return odp({ tytul: 'Tytuł: ' + dane.url, autor: 'Autor testowy' });
  }
  // Streszczenia AI – od wersji 4 skryptu (robi je harmonogram po stronie Google).
  if (dane.akcja === 'streszczenia' && drive.wersjaSkryptu >= 4) {
    drive.odczytyStreszczen.push(dane.od || '');
    return odp({ streszczenia: drive.streszczenia.filter(x => !dane.od || x.zmieniono > dane.od), teraz: new Date().toISOString() });
  }
  // „Streść teraz” – od wersji 5 skryptu.
  if (dane.akcja === 'streszczTeraz' && drive.wersjaSkryptu >= 5) {
    const st = { id: dane.id, url: dane.url, zmieniono: new Date().toISOString() };
    st[dane.rodzaj] = { tekst: 'Na żądanie: ' + dane.tytul, model: 'gemini-test', data: new Date().toISOString() };
    drive.streszczenia.push(st);
    return odp({ streszczenie: st });
  }
  // „Zapisz jako streszczenie” (gotowe, np. z NotebookLM) – od wersji 8.
  if (dane.akcja === 'zapiszGotowe' && drive.wersjaSkryptu >= 8) {
    const st = { id: dane.id, zmieniono: new Date().toISOString() };
    st[dane.rodzaj] = { tekst: dane.tekst, model: 'wklejone', data: new Date().toISOString() };
    drive.streszczenia.push(st);
    return odp({ streszczenie: st });
  }
  return odp({ blad: 'nieznana akcja' });
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

/** Nowe „urządzenie”: osobna przeglądarka z udawanym skryptem Google. */
async function urzadzenie(przegladarka, opcje) {
  const k = await przegladarka.newContext({ ...opcje, acceptDownloads: true });
  await k.route(ADRES_SKRYPTU, obsluzSkrypt);
  // Aplikacja nie może łączyć się z nikim poza skryptem Google.
  const obce = [];
  await k.route(u => !u.href.startsWith('file:') && !u.href.startsWith(ADRES_SKRYPTU), r => { obce.push(r.request().url()); r.abort(); });
  const s = await k.newPage();
  const bledy = [];
  s.on('pageerror', e => bledy.push(e.message));
  await s.goto(STRONA);
  return { k, s, bledy, obce };
}

const stanSync = s => s.textContent('#stan-sync');
/** Czeka, aż urządzenie wyśle wszystko na Drive (kolejka pusta, stan „zapisane”). */
const czekajWysylke = s => s.waitForFunction(() => !Magazyn.czekaNaWyslanie() && Synchronizacja.stan === 'zapisane', null, { timeout: 10000 });
const czekajNa = (s, wzor) => s.waitForFunction(w => new RegExp(w).test(document.querySelector('#stan-sync').textContent), wzor.source, { timeout: 10000 });

/** Treść Potok.json na udawanym Drive (w obu trybach). */
const plikNaDrive = () => JSON.parse(drive.google ? drive.google.plikJson().tresc : drive.skrypt);

async function scenariusz(przegladarka, tryb) {
  drive = { zapisy: 0, skrypt: '', wersjaSkryptu: 1, streszczenia: [], odczytyStreszczen: [], google: tryb === 'v11' ? nowyGoogle('TAJNY-KLUCZ') : null };
  if (drive.google) { const doPost = drive.google.doPost; drive.google.doPost = e => { drive.zapisy++; return doPost(e); }; }
  console.log(`--- Tryb: ${tryb === 'v11' ? 'skrypt Google v11 (prawdziwy Kod.gs)' : 'stary skrypt Google (v1–9)'} ---`);

  // 0. Komputer: połączenie – jak człowiek, przez ekran „Pliki”.
  const komp = await urzadzenie(przegladarka, {});
  let kodPolaczenia = '';
  {
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.click('#pokaz-skrypt');
    const skrypt = await komp.s.inputValue('#skrypt-tekst');
    const klucz = (skrypt.match(/const KLUCZ = '([^']+)'/) || [])[1];
    assert(klucz && klucz.length === 32 && klucz !== 'WSTAW_KLUCZ', 'skrypt bez klucza');
    // Udawany skrypt zna tylko 'TAJNY-KLUCZ' – podmieniamy wygenerowany klucz w pamięci.
    await komp.s.evaluate(() => localStorage.setItem('potok.v1.nowyKlucz', 'TAJNY-KLUCZ'));
    await komp.s.fill('#skrypt-adres', 'https://example.com/zly-adres');
    await komp.s.click('#polacz-skrypt');
    assert(/exec/.test(await komp.s.textContent('#komunikat')), 'brak ostrzeżenia o złym adresie');
    await komp.s.fill('#skrypt-adres', ADRES_SKRYPTU);
    await komp.s.click('#polacz-skrypt');
    await czekajNa(komp.s, /zapisane/);
    assert(!(await komp.s.isVisible('#sync-konfiguracja')), 'instrukcja widoczna po połączeniu');
    if (tryb === 'v11') {
      // Skrypt 11: komputer dostał własny klucz i zapomniał klucz główny.
      await komp.s.waitForFunction(() => Synchronizacja.skrypt().wlasny === true, null, { timeout: 10000 });
      const s = await komp.s.evaluate(() => Synchronizacja.skrypt());
      assert(/^[0-9a-f]{64}$/.test(s.klucz) && !JSON.stringify(await komp.s.evaluate(() => ({ ...localStorage }))).includes('TAJNY-KLUCZ'), 'klucz główny został w przeglądarce');
      assert.strictEqual(await komp.s.evaluate(() => Synchronizacja.kodPolaczenia()), '', 'urządzenie oddaje swój klucz');
      assert(!(await komp.s.isVisible('#kopiuj-kod')));
      // Kod dla telefonu – z listy Urządzenia.
      await komp.s.waitForSelector('#urzadzenia', { state: 'visible' });
      // Wpisywanie jak człowiek (klik + klawiatura), nie fill – pole musi przyjmować tekst.
      await komp.s.click('#nazwa-nowego'); await komp.s.keyboard.type('Telefon');
      if (await komp.s.inputValue('#nazwa-nowego') !== 'Telefon') throw new Error('pole nazwy urządzenia nie przyjmuje tekstu');
      // Trzy szybkie kliknięcia (skrypt odpowiada kilka sekund) = jeden kod, nie trzy.
      await komp.s.evaluate(() => { const b = document.querySelector('#utworz-kod'); b.click(); b.click(); b.click(); });
      await komp.s.waitForSelector('#nowy-kod-pole', { state: 'visible' });
      await komp.s.waitForFunction(() => !document.querySelector('#utworz-kod').disabled);
      const telefony = (await komp.s.evaluate(() => Synchronizacja.urzadzenia())).urzadzenia.filter(u => u.nazwa === 'Telefon');
      assert.strictEqual(telefony.length, 1, 'wielokrotne kliknięcie utworzyło kilka kodów');
      kodPolaczenia = await komp.s.inputValue('#nowy-kod');
      assert(kodPolaczenia.startsWith(ADRES_SKRYPTU + '#') && kodPolaczenia !== ADRES_SKRYPTU + '#' + s.klucz, 'zły kod dla nowego urządzenia');
    } else {
      kodPolaczenia = await komp.s.evaluate(() => Synchronizacja.kodPolaczenia());
      assert.strictEqual(kodPolaczenia, ADRES_SKRYPTU + '#TAJNY-KLUCZ');
    }
    console.log('0. Połączono przez ekran „Pliki” (skrypt + adres /exec).');
  }

  // 1. Komputer: import i wysłanie na Drive.
  await komp.s.setInputFiles('#plik-import', DOCX);
  await komp.s.waitForFunction(() => /Zaimportowano/.test(document.querySelector('#wynik-importu').textContent));
  await czekajWysylke(komp.s);
  const ileWpisow = await komp.s.evaluate(() => Magazyn.wczytaj().length);
  const naDrive = plikNaDrive().wpisy.length;
  assert.strictEqual(naDrive, ileWpisow, 'na Drive nie ma wszystkich wpisów');
  console.log(`1. Komputer wysłał ${naDrive} wpisów na Drive.`);

  // 2. Telefon: pusty, pobiera wszystko (w trybie skryptu – po wklejeniu kodu połączenia).
  const tel = await urzadzenie(przegladarka, devices['Pixel 7']);
  {
    await tel.s.click('nav [data-widok=eksport]');
    await tel.s.fill('#skrypt-adres', kodPolaczenia);
    await tel.s.click('#polacz-skrypt');
  }
  await czekajNa(tel.s, /zapisane/);
  assert.strictEqual(await tel.s.evaluate(() => Magazyn.wczytaj().length), ileWpisow, 'telefon nie pobrał wpisów');
  console.log('2. Telefon pobrał wszystko z Drive.');

  // 3. Telefon bez internetu: decyzja czeka w kolejce.
  await tel.k.setOffline(true);
  await tel.s.click('nav [data-widok=przeglad]');
  const tytul = await tel.s.textContent('.karta h2');
  await tel.s.click('.decyzje [data-status=zglebic]');
  await czekajNa(tel.s, /bez internetu/);
  assert.strictEqual(await tel.s.evaluate(() => Magazyn.czekaNaWyslanie()), true, 'zmiana nie czeka w kolejce');
  const zapisyPrzed = drive.zapisy;
  await tel.s.screenshot({ path: path.join(process.argv[2] || '/tmp', 'sync-offline.png') }).catch(() => {});
  console.log(`3. Bez internetu: „${tytul}” → Zgłębić czeka w kolejce.`);

  // 4. Wraca internet: zmiana wysyła się sama.
  await tel.k.setOffline(false);
  await czekajNa(tel.s, /zapisane/);
  assert(drive.zapisy > zapisyPrzed, 'po powrocie internetu nic nie wysłano');
  assert.strictEqual(await tel.s.evaluate(() => Magazyn.czekaNaWyslanie()), false);
  console.log('4. Po powrocie internetu zmiana poszła na Drive.');

  // 5. Komputer pobiera zmianę z telefonu (np. po powrocie do karty).
  await komp.s.click('#stan-sync');
  await czekajNa(komp.s, /zapisane/);
  const status = await komp.s.evaluate(t => Magazyn.wczytaj().find(w => w.tytul === t).status, tytul);
  assert.strictEqual(status, 'zglebic', 'komputer nie widzi zmiany z telefonu');
  assert.strictEqual(await komp.s.evaluate(() => Magazyn.wczytaj().length), ileWpisow, 'liczba wpisów się zmieniła');
  console.log('5. Komputer widzi decyzję z telefonu. Nic nie zginęło.');

  // 6. Równoczesne dodanie na obu urządzeniach – oba wpisy zostają.
  for (const [u, url] of [[komp, 'https://example.com/z-komputera'], [tel, 'https://example.com/z-telefonu']]) {
    await u.s.click('nav [data-widok=dodaj]');
    await u.s.fill('#nowy-url', url);
    await u.s.click('#form-dodaj button');
  }
  await czekajWysylke(komp.s); await czekajWysylke(tel.s);
  await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
  const adresy = await komp.s.evaluate(() => Magazyn.wczytaj().map(w => w.url));
  assert(adresy.includes('https://example.com/z-komputera') && adresy.includes('https://example.com/z-telefonu'), 'zginął wpis dodany równocześnie');
  console.log('6. Wpisy dodane równocześnie na dwóch urządzeniach – oba są.');

  {
    // 7. Zły klucz (np. skrypt wdrożony od nowa): czytelny błąd, wpisy zostają.
    const przed = await tel.s.evaluate(() => Magazyn.wczytaj().length);
    await tel.s.evaluate(() => localStorage.setItem('potok.v1.skrypt', JSON.stringify({ url: Synchronizacja.skrypt().url, klucz: 'ZLY' })));
    await tel.s.click('#stan-sync');
    await czekajNa(tel.s, /błąd/);
    assert(/zły klucz/.test(await tel.s.getAttribute('#stan-sync', 'title')), 'brak opisu błędu');
    assert.strictEqual(await tel.s.evaluate(() => Magazyn.wczytaj().length), przed, 'błąd usunął wpisy');
    // 8. Odłączenie urządzenia nie usuwa wpisów.
    tel.s.once('dialog', d => d.accept());
    await tel.s.click('nav [data-widok=eksport]');
    await tel.s.click('#rozlacz');
    assert(await tel.s.isVisible('#sync-konfiguracja'), 'po odłączeniu brak instrukcji');
    assert.strictEqual(await tel.s.evaluate(() => Magazyn.wczytaj().length), przed, 'odłączenie usunęło wpisy');
    console.log('7. Zły klucz: czytelny błąd. 8. Odłączenie: wpisy zostają.');
  }

  if (tryb === 'v11') {
    // 9. Skrypt v11: brak prośby o aktualizację, kopia dzienna na Dysku, łączenie w skrypcie.
    await komp.s.click('nav [data-widok=eksport]');
    assert(!(await komp.s.isVisible('#skrypt-aktualizacja')), 'prośba o aktualizację przy najnowszym skrypcie');
    assert(drive.google.kopie().some(k => /^Potok-\d{4}-\d{2}-\d{2}\.json$/.test(k.nazwa)), 'brak kopii dziennej na Dysku');
    // Zmiana na komputerze idzie na Dysk jednym zapytaniem „synchronizuj”.
    const id = await komp.s.evaluate(() => Magazyn.wczytaj()[0].id);
    await komp.s.evaluate(id => Magazyn.zmienStatus(id, 'obczaic'), id);
    await czekajWysylke(komp.s);
    assert.strictEqual(plikNaDrive().wpisy.find(w => w.id === id).status, 'obczaic', 'zmiana nie dotarła na Dysk');
    // Zapis, który gubiłby wpisy (np. stara wersja aplikacji z błędem), skrypt odrzuca.
    const ile = plikNaDrive().wpisy.length;
    assert.match(drive.google.zapytaj({ klucz: 'TAJNY-KLUCZ', akcja: 'zapisz', tresc: JSON.stringify({ wersja: 1, wpisy: [] }) }).blad, /ubyło/);
    assert.strictEqual(plikNaDrive().wpisy.length, ile);
    console.log('9. Skrypt v11: bez prośby o aktualizację, kopia dzienna jest, zmiana wysłana jednym zapytaniem.');

    // 11. Komputer służbowy: przyłączony kodem z listy, potem zdalnie odłączony i wyczyszczony.
    await komp.s.fill('#nazwa-nowego', 'Komputer w pracy');
    await komp.s.check('#nowe-sluzbowe');
    await komp.s.click('#utworz-kod');
    await komp.s.waitForFunction(k => document.querySelector('#nowy-kod').value !== k, kodPolaczenia);
    const kodPraca = await komp.s.inputValue('#nowy-kod');
    const praca = await urzadzenie(przegladarka, {});
    await praca.s.click('nav [data-widok=eksport]');
    await praca.s.click('[data-urzadzenie=sluzbowe]');
    await praca.s.fill('#skrypt-adres', kodPraca);
    await praca.s.click('#polacz-skrypt');
    await czekajNa(praca.s, /zapisane/);
    assert.strictEqual(await praca.s.evaluate(() => Magazyn.wczytaj().length), plikNaDrive().wpisy.length, 'komputer w pracy nie pobrał wpisów');
    assert(!(await praca.s.isVisible('#urzadzenia')), 'komputer służbowy widzi listę urządzeń');
    // Lista na komputerze domowym: telefon, komputer w pracy (💼) i ten komputer.
    await komp.s.click('nav [data-widok=dodaj]');
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.waitForSelector('#lista-urzadzen [data-odlacz]');
    const lista = await komp.s.textContent('#lista-urzadzen');
    assert(/Telefon/.test(lista) && /Komputer w pracy 💼/.test(lista) && /to urządzenie/.test(lista), 'lista urządzeń niepełna: ' + lista);
    komp.s.once('dialog', d => d.accept());
    await komp.s.click('#lista-urzadzen [data-nazwa="Komputer w pracy"]');
    await komp.s.waitForFunction(() => /odłączone/.test(document.querySelector('#lista-urzadzen').textContent));
    // Odłączone schowane pod zwiniętym „Odłączone (1)” – nie zaśmiecają listy.
    assert.strictEqual(await komp.s.evaluate(() => {
      const d = document.querySelector('#lista-urzadzen details');
      return d && !d.open && /Odłączone \(1\)/.test(d.querySelector('summary').textContent) && /Komputer w pracy/.test(d.textContent);
    }), true, 'odłączone urządzenie nie jest schowane pod „Odłączone”');
    // Odświeżenie po synchronizacji nie przerysowuje listy (nic nie znika pod kursorem).
    await komp.s.evaluate(() => { window.__lista = document.querySelector('#lista-urzadzen li'); window.dispatchEvent(new Event('potok-odswiez')); });
    await komp.s.waitForTimeout(500);
    assert(await komp.s.evaluate(() => document.querySelector('#lista-urzadzen li') === window.__lista && !/Wczytuję/.test(document.querySelector('#lista-urzadzen').textContent)), 'lista urządzeń przerysowała się po odświeżeniu');
    // Komputer w pracy przy następnej synchronizacji czyści się sam.
    await praca.s.click('#stan-sync');
    await praca.s.waitForFunction(() => /zostało odłączone/.test(document.querySelector('#komunikat').textContent), null, { timeout: 10000 });
    const zostalo = await praca.s.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('potok') && localStorage.getItem(k) && !/^potok\.v1(\.bledy)?$/.test(k)));
    assert.deepStrictEqual(zostalo, [], 'po odłączeniu w przeglądarce zostały dane Potoku');
    assert.strictEqual(await praca.s.evaluate(() => Magazyn.wczytaj().length), 0, 'po odłączeniu zostały wpisy');
    assert.strictEqual(await praca.s.evaluate(() => Synchronizacja.skrypt()), null, 'po odłączeniu został kod połączenia');
    assert(plikNaDrive().wpisy.length > 0, 'odłączenie ruszyło Dysk');
    // Klucz główny: zmiana z komputera domowego – stary przestaje działać, komputer działa dalej.
    komp.s.once('dialog', d => d.accept());
    await komp.s.click('#urzadzenia summary:text("Klucz główny")');
    await komp.s.click('#zmien-klucz-glowny');
    await komp.s.waitForFunction(() => /Klucz główny zmieniony/.test(document.querySelector('#komunikat').textContent));
    assert.deepStrictEqual(drive.google.zapytaj({ klucz: 'TAJNY-KLUCZ', akcja: 'wersja' }), { blad: 'zły klucz' });
    await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
    assert.deepStrictEqual(praca.bledy, [], 'błędy JavaScript na komputerze w pracy');
    await praca.k.close();
    console.log('11. Komputer służbowy: osobny kod, „Odłącz i wyczyść” z domu – w jego przeglądarce nic nie zostało; klucz główny zmieniony.');
  } else {

    // 9. Tytuły linków: stary skrypt → Pliki proszą o aktualizację; nowy → tytuł i autor same się uzupełniają.
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.waitForSelector('#skrypt-aktualizacja', { state: 'visible', timeout: 10000 });
    await komp.s.click('#pokaz-nowy-skrypt');
    const nowy = await komp.s.inputValue('#nowy-skrypt-tekst');
    assert(nowy.includes("const KLUCZ = 'TAJNY-KLUCZ'") && nowy.includes('WERSJA_SKRYPTU = 11') && nowy.includes('function sprawdzTytuly') && nowy.includes('function wlaczStreszczenia') && nowy.includes('function scalWpisy'), 'nowy skrypt bez klucza, wersji albo scalania');
    // Skrypt w wersji 3 (tytuły działają, streszczeń brak) – ramka dalej prosi o wersję 4.
    drive.wersjaSkryptu = 3;
    // Tytuły innych stron niż YouTube – tylko po włączeniu (domyślnie wyłączone).
    await komp.s.check('#tytuly-wszystkie');
    await komp.s.click('#sync-teraz');
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(w => w.url === 'https://example.com/z-komputera').autor === 'Autor testowy', null, { timeout: 15000 });
    await komp.s.waitForFunction(() => Streszczenia.skryptStary(), null, { timeout: 10000 });
    assert(await komp.s.isVisible('#skrypt-aktualizacja'), 'przy skrypcie v3 brak prośby o wersję 4');
    drive.wersjaSkryptu = 9;   // „wdrożono nową wersję”
    await komp.s.click('#sync-teraz');
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(w => w.url === 'https://example.com/z-komputera').autor === 'Autor testowy', null, { timeout: 15000 });
    // Na komputerze: link z YouTube + dopisane „Streścić” → tytuł i autor też się pobierają, podpowiedź zostaje.
    // Link z miksu (jak w Twoim imporcie) i link, przy którym skrypt się wywraca – oba nie blokują reszty.
    for (const url of ['https://example.com/wolny', 'https://example.com/zepsuty', 'https://www.youtube.com/watch?v=miks456&list=RDxyz&index=4']) {
      await komp.s.click('nav [data-widok=dodaj]');
      await komp.s.fill('#nowy-url', url);
      await komp.s.click('#form-dodaj button');
    }
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(x => (x.url || '').includes('miks456')).tytul === 'Tytuł: https://www.youtube.com/watch?v=miks456', null, { timeout: 15000 });
    // Link bez odpowiedzi po 2 próbach: „bez tytułu”, a w Pliki widać, co poszło nie tak.
    await komp.s.click('#stan-sync');
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(x => x.url === 'https://example.com/wolny').opisPobrany === 'brak-3', null, { timeout: 15000 });
    await komp.s.click('nav [data-widok=eksport]');
    assert.match(await komp.s.textContent('#stan-opisow'), /bez tytułu [1-9].*Ostatni problem.*example\.com\/wolny/);
    await komp.s.click('nav [data-widok=dodaj]');
    await komp.s.fill('#nowy-url', 'https://www.youtube.com/watch?v=komp123');
    await komp.s.fill('#nowy-opis', 'Streścić');
    await komp.s.click('#form-dodaj button');
    await komp.s.waitForFunction(() => { const w = Magazyn.wczytaj().find(x => (x.url || '').includes('komp123')); return w && w.autor === 'Autor testowy' && w.sugestia === 'do_streszczenia' && w.tekst.startsWith('Streścić'); }, null, { timeout: 15000 });
    // Skrypt v9: streszczenia działają, ale ramka dalej proponuje v10 (bezpieczniejszy zapis).
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.waitForFunction(() => !Streszczenia.skryptStary(), null, { timeout: 10000 });
    assert(await komp.s.isVisible('#skrypt-aktualizacja'), 'przy skrypcie v9 brak propozycji wersji 10');
    await czekajWysylke(komp.s);
    await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
    const naDysku = plikNaDrive().wpisy.find(w => w.url === 'https://example.com/z-komputera');
    assert.strictEqual(naDysku.tytul, 'Tytuł: https://example.com/z-komputera', 'tytuł nie trafił na Drive');
    await komp.s.click('nav [data-widok=listy]');
    await komp.s.click('#statusy [data-lista=skrzynka]');
    await komp.s.fill('#szukaj', 'Autor testowy');
    assert(await komp.s.locator('#lista .autor').count() > 0, 'autor nie widać na liście');
    console.log('9. Tytuły: prośba o nowy skrypt, potem tytuł i autor same się uzupełniają (też na Drive).');

    // 10. Streszczenia AI: skrypt (harmonogram) zapisał streszczenie → widać je na liście „Streścić”,
    //     a stamtąd jednym kliknięciem „→ Streścić szczegółowo”. Potok.json nie dostaje streszczeń.
    const w10 = await komp.s.evaluate(() => Magazyn.wczytaj().find(x => (x.url || '').includes('komp123')));
    await komp.s.evaluate(id => Magazyn.zmienStatus(id, 'do_streszczenia'), w10.id);
    await komp.s.click('nav [data-widok=listy]');
    await komp.s.fill('#szukaj', '');
    await komp.s.click('#statusy [data-lista=do_streszczenia]');
    assert.match(await komp.s.textContent('#lista'), /w kolejce \(automat co godzinę\)/, 'brak informacji, że streszczenie czeka');
    drive.streszczenia.push({ id: w10.id, url: w10.url, krotkie: { tekst: 'Film o <testach> po polsku.', model: 'gemini-3.5-flash-lite', data: new Date().toISOString() }, zmieniono: new Date().toISOString() });
    await komp.s.click('#stan-sync');
    await komp.s.waitForSelector('#lista .streszczenie', { timeout: 15000 });
    assert.match(await komp.s.textContent('#lista .streszczenie'), /Film o <testach> po polsku\..*|Streszczenie.*Film o <testach>/s);
    const od = drive.odczytyStreszczen[drive.odczytyStreszczen.length - 1];
    assert(od, 'kolejne odczyty powinny pytać tylko o nowe streszczenia (od)');
    await komp.s.click(`#lista [data-id="${w10.id}"][data-na=szczegolowo]`);
    assert.strictEqual(await komp.s.evaluate(id => Magazyn.wczytaj().find(x => x.id === id).status, w10.id), 'szczegolowo');
    await komp.s.click('#statusy [data-lista=szczegolowo]');
    assert.match(await komp.s.textContent('#lista'), /Szczegółowe streszczenie w kolejce/);
    // „Streść szczegółowo teraz” – od razu, bez czekania na harmonogram.
    await komp.s.click(`#lista [data-streszcz="${w10.id}"][data-rodzaj=szczegolowe]`);
    await komp.s.waitForSelector('#lista details.szczegolowe', { timeout: 15000 });
    assert.match(await komp.s.textContent('#lista details.szczegolowe'), /Na żądanie: /);
    assert.strictEqual(await komp.s.locator('#lista [data-streszcz]').count(), 0, 'po streszczeniu przycisk znika');
    // „Wklej tekst” → „Zapisz jako streszczenie”: gotowe streszczenie z NotebookLM zapisane bez AI.
    const w11 = await komp.s.evaluate(() => Magazyn.wczytaj().find(x => (x.url || '').startsWith('http') && !(x.url || '').includes('komp123')));
    await komp.s.evaluate(id => Magazyn.zmienStatus(id, 'szczegolowo'), w11.id);
    await komp.s.click('#statusy [data-lista=szczegolowo]');
    await komp.s.click(`#lista [data-wklej="${w11.id}"]`);
    await komp.s.fill('#lista .wklej-tekst textarea', 'Streszczenie z NotebookLM: najważniejsze wnioski z rozmowy, akapit pierwszy.');
    await komp.s.click(`#lista [data-gotowe="${w11.id}"]`);
    await komp.s.waitForFunction(id => Streszczenia.dla(id)?.szczegolowe, w11.id, { timeout: 15000 });
    assert.match(await komp.s.textContent('#lista'), /Szczegółowe streszczenie \(wklejone,.*Streszczenie z NotebookLM/s);
    await komp.s.evaluate(id => Magazyn.zmienStatus(id, 'skrzynka'), w11.id);
    await komp.s.click('nav [data-widok=eksport]');
    assert.match(await komp.s.textContent('#stan-streszczen-ai'), /Streszczenia AI: gotowe 1 · do ręcznego 0 · czekają 0/);
    await czekajWysylke(komp.s);
    await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
    const zapisany = plikNaDrive().wpisy.find(x => x.id === w10.id);
    assert.strictEqual(zapisany.status, 'szczegolowo', 'decyzja „Streścić szczegółowo” nie trafiła na Drive');
    assert(!JSON.stringify(plikNaDrive()).includes('Film o <testach>'), 'streszczenie nie powinno trafiać do Potok.json');
    console.log('10. Streszczenia AI: widać je przy wpisie, „→ Streścić szczegółowo” trafia na Drive.');
  }

  assert.deepStrictEqual([...komp.bledy, ...tel.bledy], [], 'błędy JavaScript na stronie');
  assert.deepStrictEqual([...komp.obce, ...tel.obce], [], 'połączenia z innymi serwerami niż skrypt Google');
  await komp.k.close(); await tel.k.close();
}

(async () => {
  const przegladarka = await chromium.launch();
  await scenariusz(przegladarka, 'skrypt');
  await scenariusz(przegladarka, 'v11');
  console.log('E2E DRIVE OK');
  await przegladarka.close();
})().catch(e => { console.error('E2E DRIVE BŁĄD:', e.message); process.exit(1); });
