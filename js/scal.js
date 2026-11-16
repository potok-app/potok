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
