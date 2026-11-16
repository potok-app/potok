/* udawany-google.js – udawane usługi Google (Drive, blokada, właściwości,
   harmonogram, internet, Gemini) w pamięci, żeby uruchomić prawdziwy
   skrypt-google/Kod.gs bez Google. Używają go test-skryptu.js i e2e-drive.js. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KOD = fs.readFileSync(path.join(__dirname, '..', 'skrypt-google', 'Kod.gs'), 'utf8');

/** Nowy „Google” z prawdziwym Kod.gs w środku. klucz – tajny klucz skryptu. */
function nowyGoogle(klucz = 'tajny') {
  const foldery = [];   // foldery w „Moim dysku” (najwyższy poziom)
  const plikiPoId = {};
  let licznik = 0;
  const iterator = lista => ({ hasNext: () => lista.length > 0, next: () => lista.shift() });
  let zegar = 0;   // kolejne „czasy zmian” plików
  const nowyFolder = (nazwa, lista, rodzic) => {
    const pliki = [];
    const podfoldery = [];
    const f = {
      nazwa, pliki, podfoldery, rodzic, kosz: false,
      getId: () => 'f-' + nazwa,
      isTrashed: () => f.kosz || !!(rodzic && rodzic.isTrashed()),
      getFilesByName: n => iterator(pliki.filter(p => p.nazwa === n)),
      getFiles: () => iterator(pliki.slice()),
      getFoldersByName: n => iterator(podfoldery.filter(x => x.nazwa === n)),
      createFolder: n => nowyFolder(n, podfoldery, f),
      createFile: (n, tresc) => {
        const p = { id: 'p' + (++licznik), nazwa: n, tresc, czas: ++zegar, kosz: false,
          getId: () => p.id,
          isTrashed: () => p.kosz || f.isTrashed(),
          getParents: () => iterator([f]),
          getBlob: () => ({ getDataAsString: () => p.tresc }),
          setContent: t => { p.tresc = t; p.czas = ++zegar; },
          getLastUpdated: () => new Date(Date.UTC(2026, 0, 1) + p.czas * 1000) };
        pliki.push(p); plikiPoId[p.id] = p; return p;
      },
    };
    lista.push(f);
    return f;
  };
  const korzen = { pliki: [], podfoldery: foldery, isTrashed: () => false };
  korzen.getFoldersByName = n => iterator(foldery.filter(x => x.nazwa === n));
  korzen.createFolder = n => nowyFolder(n, foldery, null);
  let blokady = 0;
  const g = {
    foldery,
    DriveApp: {
      getFoldersByName: n => iterator(foldery.filter(f => f.nazwa === n)),
      createFolder: n => nowyFolder(n, foldery, null),
      getRootFolder: () => korzen,
      getFileById: id => { if (!plikiPoId[id]) throw new Error('brak pliku'); return plikiPoId[id]; },
    },
    LockService: { getScriptLock: () => ({ waitLock: () => { blokady++; }, releaseLock: () => { blokady--; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ tekst: t, setMimeType() { return this; } }) },
    blokady: () => blokady,
    // Udawany internet: adres → { kod, tekst, naglowki }.
    strony: {},
    // Udawane Gemini: funkcja (zapytanie, model) → { kod, odpowiedz }.
    gemini: null,
    zapytaniaGemini: [],
    wlasciwosci: {},
    pamiec: {},
    wyzwalacze: [],
    dziennik: [],
    Logger: { log: t => g.dziennik.push(String(t)) },
    Utilities: {
      sleep: () => {}, formatDate: d => d.toISOString().slice(0, 10),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      // Jak w Google: bajty ze znakiem (-128…127).
      computeDigest: (alg, tekst) => Array.from(require('crypto').createHash(alg).update(tekst, 'utf8').digest(), b => (b > 127 ? b - 256 : b)),
      getUuid: () => require('crypto').randomUUID(),
    },
    Session: { getScriptTimeZone: () => 'Europe/Warsaw' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: n => (n in g.wlasciwosci ? g.wlasciwosci[n] : null),
      setProperty: (n, v) => { g.wlasciwosci[n] = String(v); },
      getProperties: () => Object.assign({}, g.wlasciwosci),
    }) },
    CacheService: { getScriptCache: () => ({ get: k => g.pamiec[k] || null, put: (k, v) => { g.pamiec[k] = v; }, remove: k => { delete g.pamiec[k]; } }) },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' }, requireAllScopes: () => {},
      getProjectTriggers: () => g.wyzwalacze.slice(),
      deleteTrigger: t => { g.wyzwalacze = g.wyzwalacze.filter(x => x !== t); },
      newTrigger: f => ({ timeBased: () => ({ everyHours: h => ({ create: () => { const t = { getHandlerFunction: () => f, h }; g.wyzwalacze.push(t); return t; } }) }) }),
    },
    UrlFetchApp: { fetch: (url, opcje = {}) => {
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        const model = decodeURIComponent((url.match(/models\/([^:]+):/) || [])[1] || '');
        const zap = { url, model, klucz: (opcje.headers || {})['x-goog-api-key'], dane: JSON.parse(opcje.payload) };
        g.zapytaniaGemini.push(zap);
        const o = g.gemini(zap);
        return { getResponseCode: () => o.kod || 200, getContentText: () => JSON.stringify(o.odpowiedz), getHeaders: () => ({}) };
      }
      const st = g.strony[url];
      if (!st) throw new Error('brak sieci');
      return { getResponseCode: () => st.kod || 200, getContentText: () => st.tekst, getHeaders: () => st.naglowki || { 'Content-Type': 'text/html; charset=utf-8' } };
    } },
  };
  vm.runInNewContext(KOD.replace("'WSTAW_KLUCZ'", JSON.stringify(klucz)), g);
  // Pomocnicze: zapytanie jak z aplikacji, folder Potok, plik Potok.json i kopie.
  g.zapytaj = dane => JSON.parse(g.doPost({ postData: { contents: typeof dane === 'string' ? dane : JSON.stringify(dane) } }).tekst);
  g.potok = () => foldery.find(f => f.nazwa === 'Potok' && !f.kosz);
  g.plikJson = () => g.potok().pliki.find(p => p.nazwa === 'Potok.json');
  g.kopie = () => (g.potok().podfoldery.find(f => f.nazwa === 'kopie') || { pliki: [] }).pliki;
  return g;
}

module.exports = { nowyGoogle, KOD };
