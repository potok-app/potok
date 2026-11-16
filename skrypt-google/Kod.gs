/* Potok – pośrednik między aplikacją a Twoim Google Drive.
   Wklej na script.google.com (instrukcja w aplikacji: Pliki → Google Drive).

   Co robi: trzyma wszystkie wpisy w pliku „Potok.json” w folderze „Potok”
   na Twoim Drive. Odpowiada tylko na zapytania z właściwym kluczem.
   Nie rusza żadnych plików poza folderem „Potok”. Kod możesz przeczytać.
   Od wersji 2 umie też odczytać tytuł i autora linku (np. filmu z YouTube).
   Wersja 3: mówi, co poszło nie tak przy tytule, i ma funkcję sprawdzTytuly
   do uruchomienia w edytorze (daje skryptowi zgodę na łączenie ze stronami).
   Wersja 4: streszczenia. Co godzinę (harmonogram Google) bierze wpisy
   „Streścić” i „Streścić szczegółowo”, pobiera tekst strony albo film z YouTube,
   prosi silnik AI o streszczenie i zapisuje je w folderze „Potok/Streszczenia”
   (jeden plik na wpis). Pliku Potok.json NIE zmienia – tylko go czyta.
   Ustawienia (Ustawienia projektu → Właściwości skryptu), opis niżej
   przy USTAWIENIA_DOMYSLNE. Klucz Gemini NIE jest w kodzie.
   Wersja 5: streszczenie na żądanie – przycisk „Streść teraz” w aplikacji
   (akcja „streszczTeraz”). Harmonogram co godzinę działa dalej; wyłącza go
   funkcja zatrzymajHarmonogram.
   Wersja 6: przy przeciążeniu Gemini (kod 503) ponowna próba, potem modele
   zapasowe (MODELE_ZAPASOWE) – każdy model ma u Google osobny limit.
   Wersja 7: brak odpowiedzi Gemini (przekroczony czas, np. długi film) nie
   zawiesza „Streść teraz” – po 4 minutach skrypt kończy z czytelnym błędem.
   Wersja 8: filmy dłuższe niż 50 min od razu „do ręcznego” (z długością) –
   nie mieszczą się w jednym darmowym zapytaniu, a dzielenie ich na części
   to za dużo kodu do utrzymania (decyzja z 15.11.2026). Zamiast tego „Wklej
   tekst” w aplikacji: wklejona transkrypcja albo tekst artykułu (akcja
   „streszczTeraz” z polem „tekst”) jest streszczana jak każdy inny materiał.
   Wersja 9: Pobieracz YT dostaje każdy film czekający na streszczenie.
   Wersja 10 (po audycie bezpieczeństwa 16.11.2026):
   - odrzuca zapis, który zgubiłby choć jeden wpis albo nie jest poprawnym plikiem,
   - przed pierwszą zmianą każdego dnia robi kopię Potok.json:
     Potok/kopie/Potok-RRRR-MM-DD.json (kopii nie usuwa),
   - akcja „synchronizuj”: łączy dane urządzenia z plikiem pod blokadą
     (dwa urządzenia naraz nie zgubią sobie zmian) – ten sam kod łączenia
     co w aplikacji (scalWpisy na końcu pliku),
   - pamięta plik po identyfikatorze i nie pisze do pliku w koszu,
   - tytuły linków tylko ze stron HTML, przycięte do 300 znaków. */

const KLUCZ = 'WSTAW_KLUCZ';   // aplikacja wstawia tu Twój tajny klucz
const WERSJA_SKRYPTU = 10;
const WERSJA_DANYCH = 1;               // format pliku Potok.json
const LIMIT_TRESCI = 20 * 1024 * 1024; // 20 MB – dużo więcej niż potrzeba

/** Zapytanie z aplikacji: { klucz, akcja: 'pobierz' | 'zapisz' | 'synchronizuj' | 'opis' | 'wersja' | 'streszczenia' | 'streszczTeraz' | 'zapiszGotowe' | 'doTranskrypcji', tresc?, url?, od?, id?, rodzaj? } */
function doPost(e) {
  let dane;
  try { dane = JSON.parse(e.postData.contents); } catch (x) { return wynik({ blad: 'złe dane' }); }
  if (!dane || dane.klucz !== KLUCZ) return wynik({ blad: 'zły klucz' });
  if (dane.akcja === 'wersja') return wynik({ wersja: WERSJA_SKRYPTU });
  if (dane.akcja === 'opis') return wynik(opisStrony(dane.url));
  if (dane.akcja === 'streszczenia') return wynik(odczytajStreszczenia(dane.od));
  if (dane.akcja === 'streszczTeraz') return wynik(streszczTeraz(dane));
  if (dane.akcja === 'zapiszGotowe') return wynik(zapiszGotowe(dane));
  if (dane.akcja === 'doTranskrypcji') return wynik(doTranskrypcji());

  if (['pobierz', 'zapisz', 'synchronizuj'].indexOf(dane.akcja) < 0) return wynik({ blad: 'nieznana akcja' });

  // Blokada: dwa urządzenia naraz nie nadpiszą sobie pliku.
  const blokada = LockService.getScriptLock();
  blokada.waitLock(20000);
  try {
    const plik = plikPotoku();
    if (plik.blad) return wynik(plik);
    const obecna = plik.getBlob().getDataAsString('UTF-8');
    if (dane.akcja === 'pobierz') return wynik({ tresc: obecna });

    const nowa = sprawdzTresc(dane.tresc);
    if (nowa.blad) return wynik(nowa);
    const stara = sprawdzTresc(obecna);
    if (!stara.blad && Number(stara.dane.wersja) > WERSJA_DANYCH) return wynik({ blad: 'plik zapisała nowsza wersja Potoku – zaktualizuj skrypt' });
    const stareWpisy = stara.blad ? [] : stara.dane.wpisy;   // uszkodzony plik trafi do kopii

    if (dane.akcja === 'zapisz') {
      const brak = brakujace(stareWpisy, nowa.dane.wpisy);
      if (brak) return wynik({ blad: 'ubyło wpisów (' + brak + ') – zapis odrzucony, plik bez zmian' });
      zrobKopie(plik, obecna, !!stara.blad);
      plik.setContent(dane.tresc);
      return wynik({ ok: true });
    }

    // synchronizuj: łączymy tutaj, pod blokadą.
    const s = scalWpisy(nowa.dane.wpisy, stareWpisy);
    if (!s.inneNizZdalne && !stara.blad) return wynik({ tresc: obecna });
    const tresc = JSON.stringify({ wersja: WERSJA_DANYCH, zapisano: new Date().toISOString(), wpisy: s.wpisy }, null, 1);
    zrobKopie(plik, obecna, !!stara.blad);
    plik.setContent(tresc);
    return wynik({ tresc: tresc });
  } finally {
    blokada.releaseLock();
  }
}

/** Treść pliku: tekst, poprawny JSON z listą „wpisy”, nie za duży. */
function sprawdzTresc(tresc) {
  if (typeof tresc !== 'string') return { blad: 'brak treści' };
  if (tresc.length > LIMIT_TRESCI) return { blad: 'za duża treść' };
  let d;
  try { d = JSON.parse(tresc); } catch (x) { return { blad: 'treść to nie JSON' }; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.wpisy)) return { blad: 'brak listy wpisów' };
  return { dane: d };
}

/** Ile wpisów (po id) jest w starym pliku, a nie ma ich w nowej treści. */
function brakujace(stare, nowe) {
  const ids = {};
  nowe.forEach(function (w) { if (w && typeof w.id === 'string') ids[w.id] = true; });
  return stare.filter(function (w) { return w && typeof w.id === 'string' && !ids[w.id]; }).length;
}

/** Kopia przed pierwszą zmianą dnia (i zawsze przed nadpisaniem uszkodzonego pliku). Kopii nie usuwamy. */
function zrobKopie(plik, tresc, uszkodzony) {
  if (!tresc) return;
  const folder = podfolder(folderPotoku(plik), 'kopie');
  const dzien = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Warsaw', 'yyyy-MM-dd');
  const nazwa = uszkodzony ? 'Potok-uszkodzony-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json' : 'Potok-' + dzien + '.json';
  if (folder.getFilesByName(nazwa).hasNext()) return;
  folder.createFile(nazwa, tresc, 'application/json');
}

/** Folder, w którym leży Potok.json. */
function folderPotoku(plik) {
  const rodzice = plik.getParents();
  return rodzice.hasNext() ? rodzice.next() : DriveApp.getRootFolder();
}

/** Podfolder o danej nazwie (pomija kosz), tworzony przy pierwszym użyciu. */
function podfolder(rodzic, nazwa) {
  const foldery = rodzic.getFoldersByName(nazwa);
  while (foldery.hasNext()) { const f = foldery.next(); if (!f.isTrashed()) return f; }
  return rodzic.createFolder(nazwa);
}

/** Wpisy z Potok.json (do streszczeń). Plik w koszu → błąd. */
function wpisyPotoku() {
  const plik = plikPotoku();
  if (plik.blad) throw new Error(plik.blad);
  const tresc = plik.getBlob().getDataAsString('UTF-8');
  return tresc && tresc.trim() ? JSON.parse(tresc).wpisy || [] : [];
}

/** Otwarcie adresu w przeglądarce – tylko sprawdzenie, że skrypt działa. */
function doGet() {
  return wynik({ potok: 'skrypt działa', wersja: WERSJA_SKRYPTU });
}

/** Tytuł i autor linku – żeby w Potoku nie było gołych adresów.
    YouTube: oficjalne „oEmbed”. Inne strony: znaczniki og:title itp. z HTML.
    Facebook często wymaga logowania – wtedy tytułu po prostu nie będzie. */
function opisStrony(url) {
  const host = ((String(url || '').match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || '').toLowerCase();
  if (!host) return { blad: 'zły adres' };
  const przytnij = function (t) { return String(t || '').trim().slice(0, 300); };
  try {
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) {
      const odp = UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { muteHttpExceptions: true });
      if (odp.getResponseCode() !== 200) return { tytul: '', problem: 'YouTube: kod ' + odp.getResponseCode() };
      const o = JSON.parse(odp.getContentText());
      return { tytul: przytnij(o.title), autor: przytnij(o.author_name) };
    }
    const odp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept-Language': 'pl,en' } });
    if (odp.getResponseCode() !== 200) return { tytul: '', problem: 'strona: kod ' + odp.getResponseCode() };
    const naglowki = odp.getHeaders() || {};
    const typ = String(naglowki['Content-Type'] || naglowki['content-type'] || '');
    if (typ && !/html/i.test(typ)) return { tytul: '', problem: 'to nie strona (' + typ.split(';')[0] + ')' };
    const html = odp.getContentText().slice(0, 300000);
    const meta = nazwa => {
      const znacznik = (html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + nazwa + '["\'][^>]*>', 'i')) || [])[0] || '';
      const m = znacznik.match(/content=(?:"([^"]*)"|'([^']*)')/i) || [];
      return encje(m[1] || m[2] || '');
    };
    let tytul = meta('og:title') || meta('twitter:title') || encje((html.match(/<title[^>]*>([^<]*)</i) || [])[1] || '');
    if (/^(facebook|instagram|log in|zaloguj się|log into facebook)/i.test(tytul)) tytul = '';
    return { tytul: przytnij(tytul), autor: przytnij(meta('author') || meta('og:site_name')) };
  } catch (x) {
    return { tytul: '', problem: String(x && x.message || x) };
  }
}

/** Uruchom raz w edytorze (wybierz u góry „sprawdzTytuly” → Uruchom):
    Google zapyta o zgodę na łączenie ze stronami, a w dzienniku
    pojawi się tytuł przykładowego filmu – znak, że wszystko działa. */
function sprawdzTytuly() {
  // Jeśli kiedyś odmówiono zgody, Google zapyta o nią jeszcze raz
  // (w dzienniku pojawi się link „Kliknij tutaj, aby przyznać uprawnienia”).
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const o = opisStrony('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  Logger.log(JSON.stringify(o));
  return o;
}

/* ====================== STRESZCZENIA (wersja 4) ======================

   Właściwości skryptu (Ustawienia projektu ⚙ → Właściwości skryptu):
     GEMINI_KLUCZ       klucz z aistudio.google.com → Get API key (wymagany dla Gemini)
     SILNIK             gemini (domyślnie) | ollama | wylaczony
     MODEL_KROTKI       model do krótkich streszczeń
     MODEL_SZCZEGOLOWY  model do szczegółowych streszczeń
     MODELE_ZAPASOWE    modele po przecinku, gdy główny jest przeciążony lub bez limitu
     MAKS_MINUT_FILMU   dłuższe filmy z YouTube idą od razu „do ręcznego” (domyślnie 50)
     OLLAMA_ADRES       np. https://moj-tunel.example (tylko dla SILNIK=ollama)
     OLLAMA_MODEL       np. SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0
     NA_RAZ             ile wpisów streszczać w jednym uruchomieniu (co godzinę)
   Brak właściwości = wartość domyślna poniżej. Zmiana silnika lub modelu
   nie wymaga zmiany kodu. */
const USTAWIENIA_DOMYSLNE = {
  SILNIK: 'gemini',
  // Flash-Lite: w darmowym limicie ok. 15 zapytań/min i 500 dziennie (stan z 11.2026).
  // Lepszy „Flash” daje za darmo tylko ok. 20 zapytań dziennie.
  MODEL_KROTKI: 'gemini-3.5-flash-lite',
  MODEL_SZCZEGOLOWY: 'gemini-3.5-flash-lite',
  // Gdy model jest przeciążony (kod 503) albo wyczerpał dzienny limit (429),
  // skrypt próbuje kolejnych z tej listy (po przecinku).
  // gemini-2.5-flash usunięty 15.11.2026 – Google nie udostępnia go już nowym kontom.
  MODELE_ZAPASOWE: 'gemini-3.8-flash',
  // Filmy dłuższe niż tyle minut – od razu do ręcznego streszczenia (np. w NotebookLM).
  MAKS_MINUT_FILMU: '50',
  OLLAMA_ADRES: '',
  OLLAMA_MODEL: 'SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0',
  NA_RAZ: '6',
};
const MAKS_PROB = 3;            // po tylu nieudanych próbach: „do ręcznego streszczenia”
const MAKS_ZNAKOW = 200000;     // ok. 50 tys. słów – więcej tekstu ze strony nie wysyłamy
const MAKS_WKLEJONEGO = 400000; // wklejona transkrypcja: do ok. 100 tys. słów (kilkugodzinny podcast)
const MIN_ZNAKOW = 600;         // mniej tekstu = raczej logowanie albo paywall

const POLECENIE = {
  // Styl jak przegląd źródła w NotebookLM (decyzja z 15.11.2026: 3–5 zdań to za mało).
  krotkie: 'Napisz po polsku (nawet jeśli materiał jest w innym języku) streszczenie w stylu NotebookLM. ' +
    'Najpierw 2–3 akapity, łącznie ok. 200–300 słów: o czym to jest, jaka jest główna teza lub cel autora, ' +
    'jak autor ją uzasadnia i do jakich wniosków dochodzi. Najważniejsze pojęcia, nazwy i liczby wyróżnij **pogrubieniem**. ' +
    'Potem wiersz „Kluczowe punkty:” i 4–6 krótkich punktów zaczynających się od „- ”. ' +
    'Na końcu jedno zdanie zaczynające się od „Dla kogo:”. ' +
    'Bez wstępów typu „Oto streszczenie”. Jeśli materiał jest pusty, jest stroną logowania ' +
    'albo nie da się go streścić, odpowiedz dokładnie: BRAK TREŚCI',
  szczegolowe: 'Przygotuj szczegółowe streszczenie poniższego materiału po polsku (nawet jeśli jest ' +
    'w innym języku), w Markdown: 1) w jednym akapicie: o czym to jest i główna teza; ' +
    '2) struktura materiału (części / rozdziały); 3) kluczowe tezy i argumenty, każda z ' +
    'przykładem lub dowodem z materiału; 4) co jest nowe lub zaskakujące; 5) słabe punkty ' +
    'lub wątpliwości. Pisz konkretnie, bez lania wody. Jeśli materiału nie da się streścić, ' +
    'odpowiedz dokładnie: BRAK TREŚCI',
};

function ustawienie(nazwa) {
  const v = PropertiesService.getScriptProperties().getProperty(nazwa);
  return v !== null && v !== '' ? String(v).trim() : USTAWIENIA_DOMYSLNE[nazwa];
}

/** Folder „Potok/Streszczenia” (obok Potok.json) – tworzony przy pierwszym użyciu. */
function folderStreszczen() {
  const plik = plikPotoku();
  if (plik.blad) throw new Error(plik.blad);
  return podfolder(folderPotoku(plik), 'Streszczenia');
}

function nazwaPliku(id) { return String(id).replace(/[^\w.-]/g, '_') + '.json'; }

function wczytajStreszczenie(folder, id) {
  const pliki = folder.getFilesByName(nazwaPliku(id));
  if (!pliki.hasNext()) return null;
  try { return JSON.parse(pliki.next().getBlob().getDataAsString('UTF-8')); } catch (x) { return null; }
}

function zapiszStreszczenie(folder, s) {
  s.zmieniono = new Date().toISOString();
  const tresc = JSON.stringify(s, null, 1);
  const pliki = folder.getFilesByName(nazwaPliku(s.id));
  if (pliki.hasNext()) pliki.next().setContent(tresc);
  else folder.createFile(nazwaPliku(s.id), tresc, 'application/json');
}

/** Dla aplikacji: wszystkie streszczenia zmienione po dacie „od” (ISO) albo wszystkie. */
function odczytajStreszczenia(od) {
  const folder = folderStreszczen();
  const pliki = folder.getFiles();
  const lista = [];
  while (pliki.hasNext()) {
    const p = pliki.next();
    if (od && p.getLastUpdated && p.getLastUpdated().toISOString() <= od) continue;
    try { lista.push(JSON.parse(p.getBlob().getDataAsString('UTF-8'))); } catch (x) { /* uszkodzony plik – pomijamy */ }
  }
  return { streszczenia: lista, teraz: new Date().toISOString() };
}

/** Które wpisy czekają na streszczenie (i jakie). Najstarsze decyzje pierwsze. */
function doStreszczenia(wpisy, folder) {
  const kolejka = [];
  for (const w of wpisy) {
    const rodzaj = w.status === 'do_streszczenia' ? 'krotkie' : w.status === 'szczegolowo' ? 'szczegolowe' : null;
    if (!rodzaj || !w.url || !/^https?:\/\//i.test(w.url)) continue;
    const s = wczytajStreszczenie(folder, w.id) || { id: w.id };
    if (s[rodzaj] && s[rodzaj].tekst) continue;
    if ((s.proby && s.proby[rodzaj] || 0) >= MAKS_PROB) continue;
    if (s.doRecznego && s.doRecznego[rodzaj]) continue;
    kolejka.push({ w, s, rodzaj });
  }
  return kolejka;
}

/** YouTube → adres samego filmu (bez list i miksów); inne → null. */
function filmYouTube(url) {
  const m = String(url).match(/^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  return m ? 'https://www.youtube.com/watch?v=' + m[1] : null;
}

/** Strony, z których bez logowania nic nie pobierzemy – od razu „do ręcznego”. */
function wymagaLogowania(url) {
  return /^https?:\/\/([^\/]+\.)?(facebook\.com|fb\.watch|instagram\.com|linkedin\.com|x\.com|twitter\.com|tiktok\.com)\//i.test(url);
}

/** HTML → sam tekst (bez skryptów, stylów, menu). */
function tekstZHtml(html) {
  const tytul = encje((html.match(/<title[^>]*>([^<]*)</i) || [])[1] || '').trim();
  let t = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
  const glowna = t.match(/<(article|main)\b[\s\S]*<\/\1>/i);
  if (glowna && glowna[0].length > 2000) t = glowna[0];
  t = t.replace(/<\/(p|div|h[1-6]|li|br|tr|section|article)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/g, ' ').split('\n').map(l => encje(l).trim()).filter(Boolean).join('\n');
  return { tytul, tekst: t.slice(0, MAKS_ZNAKOW) };
}

/** Błąd ustawień (np. brak klucza) – to nie wina wpisu, więc nie liczy się jako próba. */
function bladUstawien(tresc) { const e = new Error(tresc); e.limit = true; return e; }

/** Wywołanie silnika. material: { tekst } albo { film: adres YouTube }. Zwraca { tekst, model }. */
function zapytajSilnik(rodzaj, material) {
  const silnik = ustawienie('SILNIK').toLowerCase();
  const polecenie = POLECENIE[rodzaj];
  if (silnik === 'gemini') {
    const klucz = ustawienie('GEMINI_KLUCZ');
    if (!klucz) throw bladUstawien('brak GEMINI_KLUCZ we Właściwościach skryptu');
    // Najpierw model z ustawień, potem zapasowe (każdy model ma osobny limit u Google).
    const glowny = ustawienie(rodzaj === 'krotkie' ? 'MODEL_KROTKI' : 'MODEL_SZCZEGOLOWY');
    const modele = [glowny].concat(ustawienie('MODELE_ZAPASOWE').split(',').map(m => m.trim()))
      .filter((m, i, t) => m && t.indexOf(m) === i);
    const czesci = material.film
      // Film: Gemini sam „ogląda” publiczny film z YouTube. Rzadkie klatki
      // (co 10 s) i niska rozdzielczość – mniej tokenów, mieści się w limicie.
      ? [{ fileData: { fileUri: material.film }, videoMetadata: { fps: 0.1 } }, { text: polecenie }]
      : [{ text: polecenie + '\n\n---\n' + material.tekst }];
    let ostatni;
    const bledy = [];
    // Google przerywa skrypt po 6 minutach, a pojedyncze zapytanie po ok. 60 s.
    // Długi film potrafi nie zmieścić się w minucie – wtedy nie próbujemy w kółko,
    // tylko kończymy z czytelnym błędem, zanim Google utnie cały skrypt.
    const start = Date.now();
    const BUDZET_MS = 4 * 60 * 1000;
    for (const model of modele) {
      // Przeciążenie (503/500) zwykle mija po chwili – jedna ponowna próba tym samym modelem.
      for (let proba = 0; proba < 2; proba++) {
        if (Date.now() - start > BUDZET_MS) {
          const e = new Error(bledy.concat('brak czasu na kolejne próby').join(' · ').slice(0, 600));
          e.limit = true;
          throw e;
        }
        if (proba) Utilities.sleep(4000);
        let odp;
        try {
          odp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
            method: 'post', contentType: 'application/json', muteHttpExceptions: true,
            headers: { 'x-goog-api-key': klucz },
            payload: JSON.stringify({ contents: [{ parts: czesci }], generationConfig: { mediaResolution: 'MEDIA_RESOLUTION_LOW' } }),
          });
        } catch (x) {
          // Zwykle przekroczony czas (ok. 60 s) – np. bardzo długi film. Następny model.
          ostatni = new Error('Gemini (' + model + '): brak odpowiedzi – ' + String(x && x.message || x).slice(0, 150) +
            (material.film ? ' (długi film? spróbuj później albo streść ręcznie)' : ''));
          ostatni.limit = true;
          bledy.push(ostatni.message);
          break;
        }
        const kod = odp.getResponseCode();
        let o = {};
        try { o = JSON.parse(odp.getContentText()); } catch (x) { /* nie JSON */ }
        if (kod === 200) {
          const c = (o.candidates || [])[0];
          const tekst = c && c.content && (c.content.parts || []).map(p => p.text || '').join('').trim();
          if (!tekst) throw new Error('Gemini: pusta odpowiedź' + (c && c.finishReason ? ' (' + c.finishReason + ')' : ''));
          return { tekst, model };
        }
        ostatni = new Error('Gemini (' + model + '): kod ' + kod + (o.error && o.error.message ? ' – ' + o.error.message.slice(0, 200) : ''));
        // Limit, przeciążenie, nieznany model – to nie wina wpisu: nie liczymy próby.
        ostatni.limit = [429, 500, 503, 404].includes(kod);
        if (kod === 500 || kod === 503) { if (proba) bledy.push(ostatni.message); continue; }   // ponów ten sam model
        bledy.push(ostatni.message);
        break;                                      // 429 / 404 – od razu następny model
      }
      if (!ostatni.limit) throw ostatni;            // np. 400 – zły materiał, inny model nie pomoże
    }
    // Błędy wszystkich modeli naraz – żeby było widać prawdziwą przyczynę, a nie tylko ostatnią.
    const e = new Error(bledy.join(' · ').slice(0, 600));
    e.limit = true;
    throw e;
  }
  if (silnik === 'ollama') {
    // Ollama na Twoim komputerze – skrypt Google musi mieć do niej adres z internetu
    // (np. tunel). Filmów Ollama nie ogląda – te zostają do ręcznego streszczenia.
    if (material.film) { const e = new Error('Ollama nie streszcza filmów'); e.doRecznego = true; throw e; }
    const adres = ustawienie('OLLAMA_ADRES').replace(/\/+$/, '');
    if (!adres) throw bladUstawien('brak OLLAMA_ADRES we Właściwościach skryptu');
    const model = ustawienie('OLLAMA_MODEL');
    const odp = UrlFetchApp.fetch(adres + '/api/generate', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ model, prompt: polecenie + '\n\n---\n' + material.tekst, stream: false }),
    });
    if (odp.getResponseCode() !== 200) throw new Error('Ollama: kod ' + odp.getResponseCode());
    const tekst = String(JSON.parse(odp.getContentText()).response || '').trim();
    if (!tekst) throw new Error('Ollama: pusta odpowiedź');
    return { tekst, model };
  }
  const e = new Error('streszczenia wyłączone (SILNIK=' + silnik + ')');
  e.wylaczone = true;
  throw e;
}

/** Jedno streszczenie: pobiera materiał, pyta silnik, zapisuje wynik albo problem. */
function streszczJeden(folder, zadanie) {
  const { w, s, rodzaj } = zadanie;
  s.url = w.url;
  s.tytul = w.tytul || '';
  const doRecznego = powod => {
    s.doRecznego = s.doRecznego || {};
    s.doRecznego[rodzaj] = powod;
    s.problem = powod;
    zapiszStreszczenie(folder, s);
    return 'ręcznie';
  };
  try {
    let material;
    // Tekst wklejony w aplikacji (transkrypcja, artykuł zza paywalla) – bez pobierania strony.
    if (zadanie.tekst) {
      material = { tekst: (w.tytul ? 'Tytuł: ' + w.tytul + '\n\n' : '') + String(zadanie.tekst).slice(0, MAKS_WKLEJONEGO) };
      s.zTekstu = true;
    }
    const film = !material && filmYouTube(w.url);
    if (material) { /* już mamy tekst */ }
    else if (wymagaLogowania(w.url)) return doRecznego('strona wymaga logowania – streść ręcznie albo wklej tekst');
    else if (film) {
      const sekundy = dlugoscFilmu(film);
      const maks = (parseInt(ustawienie('MAKS_MINUT_FILMU'), 10) || 50) * 60;
      if (sekundy && sekundy > maks) return doRecznego('film ma ' + Math.round(sekundy / 60) + ' min – za długi na automat: w Pobieraczu YT kliknij „Streść filmy YouTube z Potoku”, wklej transkrypcję („Wklej tekst”) albo streść w NotebookLM');
      material = { film };
    } else {
      const odp = UrlFetchApp.fetch(w.url, { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept-Language': 'pl,en' } });
      const kod = odp.getResponseCode();
      if (kod === 401 || kod === 403) return doRecznego('strona nie wpuszcza (kod ' + kod + ') – streść ręcznie');
      if (kod !== 200) throw new Error('strona: kod ' + kod);
      const typ = String((odp.getHeaders() || {})['Content-Type'] || (odp.getHeaders() || {})['content-type'] || '');
      if (/pdf|octet-stream/i.test(typ)) return doRecznego('to plik (' + typ.split(';')[0] + '), nie strona – streść ręcznie');
      const { tytul, tekst } = tekstZHtml(odp.getContentText());
      if (tekst.length < MIN_ZNAKOW) return doRecznego('za mało tekstu na stronie (logowanie / paywall?) – streść ręcznie');
      material = { tekst: (tytul ? 'Tytuł: ' + tytul + '\n\n' : '') + tekst };
    }
    const odp = zapytajSilnik(rodzaj, material);
    if (/^BRAK TREŚCI\.?$/i.test(odp.tekst)) return doRecznego('AI nie znalazło treści – streść ręcznie');
    s[rodzaj] = { tekst: odp.tekst, model: odp.model, data: new Date().toISOString() };
    delete s.problem;
    zapiszStreszczenie(folder, s);
    return 'ok';
  } catch (x) {
    if (x.wylaczone) throw x;
    if (x.doRecznego) return doRecznego(x.message + ' – streść ręcznie');
    s.problem = String(x && x.message || x);
    // Przekroczony limit albo brak klucza to nie wina wpisu – nie liczymy próby,
    // przerywamy i spróbujemy za godzinę.
    if (!x.limit) { s.proby = s.proby || {}; s.proby[rodzaj] = (s.proby[rodzaj] || 0) + 1; }
    zapiszStreszczenie(folder, s);
    if (x.limit) throw x;
    return 'błąd';
  }
}

/** Na żądanie z aplikacji: { id, url, tytul, rodzaj: 'krotkie' | 'szczegolowe' }.
    Próbuje od nowa, także gdy wpis był wcześniej oznaczony „do ręcznego”.
    Zwraca { streszczenie } – z tekstem albo z polem „problem”. */
function streszczTeraz(dane) {
  const rodzaj = dane.rodzaj === 'szczegolowe' ? 'szczegolowe' : 'krotkie';
  if (!dane.id || !/^https?:\/\//i.test(String(dane.url || ''))) return { blad: 'zły adres' };
  const folder = folderStreszczen();
  const s = wczytajStreszczenie(folder, dane.id) || { id: dane.id };
  if (s.doRecznego) delete s.doRecznego[rodzaj];
  if (s.proby) delete s.proby[rodzaj];
  try {
    const tekst = String(dane.tekst || '').trim();
    if (dane.tekst !== undefined && tekst.length < 200) return { blad: 'za krótki tekst – wklej całą transkrypcję albo artykuł' };
    streszczJeden(folder, { w: { id: dane.id, url: dane.url, tytul: dane.tytul || '' }, s, rodzaj, tekst: tekst || null });
  } catch (x) {
    // Limit Gemini, brak klucza albo wyłączony silnik – problem jest już zapisany w s.
    s.problem = String(x && x.message || x);
  }
  return { streszczenie: s };
}

/**
 * „Zapisz jako streszczenie”: gotowe streszczenie wklejone z aplikacji
 * (np. z NotebookLM) zapisuje się przy wpisie bez pytania AI – notatnik
 * w NotebookLM można potem usunąć.
 */
function zapiszGotowe(dane) {
  const rodzaj = dane.rodzaj === 'szczegolowe' ? 'szczegolowe' : 'krotkie';
  const tekst = String(dane.tekst || '').trim();
  if (!dane.id) return { blad: 'brak wpisu' };
  if (tekst.length < 50) return { blad: 'za krótki tekst – wklej całe streszczenie' };
  const folder = folderStreszczen();
  const s = wczytajStreszczenie(folder, dane.id) || { id: dane.id };
  s[rodzaj] = { tekst: tekst.slice(0, MAKS_WKLEJONEGO), model: 'wklejone', data: new Date().toISOString() };
  if (s.doRecznego) delete s.doRecznego[rodzaj];
  if (s.proby) delete s.proby[rodzaj];
  delete s.problem;
  zapiszStreszczenie(folder, s);
  return { streszczenie: s };
}

/**
 * Dla Pobieracza YT (na komputerze): filmy z YouTube czekające na streszczenie –
 * „Streścić” / „Streścić szczegółowo” bez gotowego streszczenia albo oznaczone
 * „do ręcznego” (np. za długie). Pobieracz pobiera ich napisy i odsyła je
 * akcją „streszczTeraz” z polem „tekst” (z napisów streszczenie jest pewniejsze
 * niż z samego filmu, a długość filmu nie ma znaczenia).
 */
function doTranskrypcji() {
  const wpisy = wpisyPotoku();
  const folder = folderStreszczen();
  const filmy = [];
  for (const w of wpisy) {
    if (!w.url || !filmYouTube(w.url)) continue;
    const s = wczytajStreszczenie(folder, w.id) || {};
    const zeStatusu = w.status === 'szczegolowo' ? 'szczegolowe' : w.status === 'do_streszczenia' ? 'krotkie' : null;
    for (const rodzaj of ['szczegolowe', 'krotkie']) {
      const potrzebne = rodzaj === zeStatusu || (s.doRecznego && s.doRecznego[rodzaj]);
      if (potrzebne && !(s[rodzaj] && s[rodzaj].tekst)) { filmy.push({ id: w.id, url: w.url, tytul: w.tytul || '', rodzaj }); break; }
    }
  }
  return { filmy };
}

/** Długość filmu z YouTube w sekundach (ze strony filmu) albo null, gdy się nie da sprawdzić. */
function dlugoscFilmu(film) {
  try {
    const odp = UrlFetchApp.fetch(film, { muteHttpExceptions: true, headers: { 'Accept-Language': 'pl,en' } });
    if (odp.getResponseCode() !== 200) return null;
    const html = odp.getContentText();
    const s = html.match(/"lengthSeconds":"(\d+)"/);
    if (s) return parseInt(s[1], 10);
    const ms = html.match(/"approxDurationMs":"(\d+)"/);
    if (ms) return Math.round(parseInt(ms[1], 10) / 1000);
    const iso = html.match(/itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/);
    if (iso && (iso[1] || iso[2] || iso[3])) return (+iso[1] || 0) * 3600 + (+iso[2] || 0) * 60 + (+iso[3] || 0);
    return null;
  } catch (x) { return null; }
}

/** Uruchamiana co godzinę przez harmonogram (i ręcznie, do sprawdzenia). */
function streszczajCoGodzine() {
  // Dwa uruchomienia naraz nie zrobią dwa razy tego samego.
  const pamiec = CacheService.getScriptCache();
  if (pamiec.get('streszczanie')) { Logger.log('Poprzednie streszczanie jeszcze trwa.'); return { pominieto: true }; }
  pamiec.put('streszczanie', '1', 360);
  const start = Date.now();
  const licznik = { ok: 0, 'ręcznie': 0, 'błąd': 0, czeka: 0 };
  try {
    const wpisy = wpisyPotoku();
    const folder = folderStreszczen();
    const kolejka = doStreszczenia(wpisy, folder);
    const naRaz = Math.max(1, parseInt(ustawienie('NA_RAZ'), 10) || 6);
    for (let i = 0; i < kolejka.length; i++) {
      // Limit wpisów i czasu (Google przerywa skrypt po 6 minutach).
      if (i >= naRaz || Date.now() - start > 4 * 60 * 1000) { licznik.czeka = kolejka.length - i; break; }
      if (i > 0) Utilities.sleep(5000);   // nie więcej niż ok. 12 zapytań na minutę
      try { licznik[streszczJeden(folder, kolejka[i])]++; }
      catch (x) {
        Logger.log('Przerwa: ' + x.message);
        licznik.czeka = kolejka.length - i;
        break;
      }
    }
  } finally {
    pamiec.remove('streszczanie');
  }
  Logger.log('Streszczenia: ' + JSON.stringify(licznik));
  return licznik;
}

/** Uruchom raz w edytorze po wklejeniu wersji 4 (wybierz „wlaczStreszczenia” → Uruchom):
    sprawdza klucz Gemini, robi próbne streszczenie i ustawia harmonogram co godzinę. */
function wlaczStreszczenia() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const silnik = ustawienie('SILNIK');
  Logger.log('Silnik: ' + silnik + ', modele: ' + ustawienie('MODEL_KROTKI') + ' / ' + ustawienie('MODEL_SZCZEGOLOWY'));
  const proba = zapytajSilnik('krotkie', { tekst: 'Potok to aplikacja do zbierania linków. Użytkownik zapisuje linki jednym ruchem, ' +
    'a później w przeglądzie decyduje, co z nimi zrobić: streścić, przeczytać w całości albo odłożyć do archiwum. ' +
    'Nic nie jest usuwane. Streszczenia robi automat co godzinę, bez udziału użytkownika.' });
  Logger.log('Próbne streszczenie (' + proba.model + '): ' + proba.tekst);
  const juz = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'streszczajCoGodzine');
  if (!juz) ScriptApp.newTrigger('streszczajCoGodzine').timeBased().everyHours(1).create();
  Logger.log(juz ? 'Harmonogram już był ustawiony.' : 'Ustawiono harmonogram: co godzinę.');
  return { proba: proba.tekst, harmonogram: true };
}

/** Pomocnicze: w dzienniku lista modeli Gemini dostępnych dla Twojego klucza. */
function pokazModele() {
  const odp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': ustawienie('GEMINI_KLUCZ') || '' }, muteHttpExceptions: true });
  const modele = (JSON.parse(odp.getContentText()).models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  Logger.log(modele.join('\n') || odp.getContentText());
  return modele;
}

/** Wyłączenie harmonogramu co godzinę (streszczenia zostają na Drive,
    przycisk „Streść teraz” w aplikacji działa dalej). */
function zatrzymajHarmonogram() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'streszczajCoGodzine').forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Harmonogram wyłączony. Streszczenia zostają w Potok/Streszczenia, „Streść teraz” w aplikacji działa dalej.');
}

/** &amp; &quot; &#39; &#x105; itp. → zwykłe znaki. */
function encje(t) {
  return t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Plik „Potok.json”. Za pierwszym razem szukamy go po nazwie (pomijając kosz)
    albo tworzymy, potem pamiętamy jego identyfikator. Plik w koszu → błąd,
    a nie nowy pusty plik (żeby nic nie zginęło). */
function plikPotoku() {
  const ustawienia = PropertiesService.getScriptProperties();
  const id = ustawienia.getProperty('plikId');
  if (id) {
    let plik = null;
    try { plik = DriveApp.getFileById(id); } catch (x) { plik = null; }
    if (plik && plik.isTrashed()) return { blad: 'Plik Potok/Potok.json jest w koszu Google Drive. Przywróć go z kosza.' };
    if (plik) return plik;
  }
  let folder = null;
  const foldery = DriveApp.getFoldersByName('Potok');
  while (foldery.hasNext()) { const f = foldery.next(); if (!f.isTrashed()) { folder = f; break; } }
  if (!folder) folder = DriveApp.createFolder('Potok');
  let plik = null;
  const pliki = folder.getFilesByName('Potok.json');
  while (pliki.hasNext()) { const p = pliki.next(); if (!p.isTrashed()) { plik = p; break; } }
  if (!plik) plik = folder.createFile('Potok.json', '{"wersja":1,"wpisy":[]}', 'application/json');
  ustawienia.setProperty('plikId', plik.getId());
  return plik;
}

function wynik(obiekt) {
  return ContentService.createTextOutput(JSON.stringify(obiekt)).setMimeType(ContentService.MimeType.JSON);
}

// ----- scal.js (kopia z aplikacji – nie edytuj tutaj, tylko js/scal.js i `npm run skrypt`) -----
/* =====================================================================
   scal.js – łączenie wpisów z dwóch miejsc: tego urządzenia i pliku na Drive.

   Ten sam kod działa w aplikacji i w skrypcie Google (skrypt-google/Kod.gs
   ma jego dokładną kopię między znacznikami „scal.js”). Po zmianie tutaj
   uruchom:  npm run skrypt  – przepisze kopię w Kod.gs i js/skrypt-google.js.
   Test (test-skryptu.js) pilnuje, żeby obie kopie były identyczne.

   Dlatego ten plik nie korzysta z niczego innego z aplikacji.

   Zasady:
    - wpis, który jest tylko po jednej stronie, zostaje (nic nie ginie),
    - wpis po obu stronach: wygrywa wersja zmieniona później („zmieniono”),
      a przy równym czasie obie strony wybierają to samo (porównanie treści),
    - historie zmian z obu stron są sklejane – historia nie ginie,
    - status przy różnicy: ostatnia decyzja w sklejonej historii,
      bo zegar jednego urządzenia może się spieszyć,
    - 🏠 (prywatne) ma własny czas zmiany i nie przepada przez decyzję
      podjętą na drugim urządzeniu; tak samo pobrany tytuł,
    - wpis bez poprawnego identyfikatora (uszkodzony) zostaje bez zmian.
   ===================================================================== */

/** Kiedy wpis zmienił się ostatnio (tekst daty ISO; porównywany jak tekst). */
function czasZmianyWpisu(w) {
  const hist = Array.isArray(w.historia) ? w.historia : [];
  const h = hist[hist.length - 1];
  return String(w.zmieniono || (h && h.data) || w.dodano || '');
}

/**
 * Łączy wpisy: lokalne (to urządzenie) + zdalne (plik na Drive).
 * Zwraca { wpisy, inneNizZdalne } – inneNizZdalne = trzeba zapisać wynik na Drive.
 */
function scalWpisy(lokalne, zdalne) {
  const wynik = new Map();
  const bezId = [];   // uszkodzone wpisy – zostają, nic nie ginie
  const poprawny = w => w && typeof w === 'object' && typeof w.id === 'string';
  for (const w of zdalne) { if (poprawny(w)) wynik.set(w.id, w); else bezId.push(w); }
  for (const l of lokalne) {
    if (!poprawny(l)) { bezId.push(l); continue; }
    const z = wynik.get(l.id);
    if (!z) { wynik.set(l.id, l); continue; }
    const cl = czasZmianyWpisu(l), cz = czasZmianyWpisu(z);
    let nowszy = cl > cz ? l : cl < cz ? z : (JSON.stringify(l) >= JSON.stringify(z) ? l : z);
    const starszy = nowszy === l ? z : l;
    // Tytuł pobrany z internetu na jednym urządzeniu nie ginie przez
    // decyzję podjętą na drugim (opis nie zmienia „zmieniono”).
    if (!nowszy.opisPobrany && starszy.opisPobrany)
      nowszy = Object.assign({}, nowszy, { tytul: starszy.tytul, autor: starszy.autor, opisPobrany: starszy.opisPobrany });
    // Sklejenie historii (bez powtórzeń), posortowane po dacie.
    const widziane = new Set();
    const historia = [].concat(Array.isArray(z.historia) ? z.historia : [], Array.isArray(l.historia) ? l.historia : [])
      .filter(h => {
        if (!h || typeof h !== 'object') return false;
        const k = h.data + '|' + h.z + '|' + h.na;
        if (widziane.has(k)) return false;
        widziane.add(k);
        return true;
      })
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const scalony = Object.assign({}, nowszy, { historia });
    // Różne statusy: decyduje ostatnia decyzja w historii z obu urządzeń.
    if (l.status !== z.status && historia.length && historia[historia.length - 1].na)
      scalony.status = historia[historia.length - 1].na;
    // 🏠 – wygrywa późniejsza zmiana samego znaczka.
    const pl = String(l.prywatneZmieniono || ''), pz = String(z.prywatneZmieniono || '');
    if (pl || pz) {
      const zrodlo = pl >= pz ? l : z;
      if (typeof zrodlo.prywatne === 'boolean') scalony.prywatne = zrodlo.prywatne;
      scalony.prywatneZmieniono = zrodlo.prywatneZmieniono;
    }
    wynik.set(l.id, scalony);
  }
  const porzadek = (a, b) => ((a.kolejnosc || 0) - (b.kolejnosc || 0)) || String(a.dodano).localeCompare(String(b.dodano));
  const bezPowtorzen = bezId.filter((w, i) => bezId.findIndex(x => JSON.stringify(x) === JSON.stringify(w)) === i);
  const wpisy = Array.from(wynik.values()).sort(porzadek).concat(bezPowtorzen);
  const zdalnePoprawne = zdalne.filter(poprawny).sort(porzadek).concat(zdalne.filter(w => !poprawny(w)));
  const inneNizZdalne = JSON.stringify(wpisy) !== JSON.stringify(zdalnePoprawne);
  return { wpisy, inneNizZdalne };
}
// ----- koniec scal.js -----
