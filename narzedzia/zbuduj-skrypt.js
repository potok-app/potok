/* zbuduj-skrypt.js – składa skrypt Google i jego kopię w aplikacji.
   1. Wstawia aktualny js/scal.js do skrypt-google/Kod.gs (między znacznikami),
      żeby aplikacja i skrypt łączyły dane tym samym kodem.
   2. Tworzy js/skrypt-google.js – tekst skryptu pokazywany w Pliki → Google Drive.
   Użycie: npm run skrypt   (test-skryptu.js sprawdza, że wszystko jest aktualne) */
const fs = require('fs');
const path = require('path');

const KATALOG = path.resolve(__dirname, '..');
const POCZATEK = '// ----- scal.js (kopia z aplikacji – nie edytuj tutaj, tylko js/scal.js i `npm run skrypt`) -----\n';
const KONIEC = '// ----- koniec scal.js -----\n';

function zbuduj() {
  const plikGs = path.join(KATALOG, 'skrypt-google', 'Kod.gs');
  const kod = fs.readFileSync(plikGs, 'utf8');
  const scal = fs.readFileSync(path.join(KATALOG, 'js', 'scal.js'), 'utf8');
  const a = kod.indexOf(POCZATEK), b = kod.indexOf(KONIEC);
  if (a < 0 || b < a) throw new Error('W Kod.gs brakuje znaczników scal.js');
  const nowyKod = kod.slice(0, a + POCZATEK.length) + scal + kod.slice(b);
  const js = '/* skrypt-google.js – tekst skryptu Google (skrypt-google/Kod.gs) pokazywany w aplikacji.\n' +
    '   NIE EDYTUJ RĘCZNIE: tworzy go `npm run skrypt` (narzedzia/zbuduj-skrypt.js). */\n' +
    'const SKRYPT_GOOGLE = ' + JSON.stringify(nowyKod) + ';\n';
  return { plikGs, nowyKod, js };
}

if (require.main === module) {
  const { plikGs, nowyKod, js } = zbuduj();
  fs.writeFileSync(plikGs, nowyKod);
  fs.writeFileSync(path.join(KATALOG, 'js', 'skrypt-google.js'), js);
  console.log('Zbudowano skrypt-google/Kod.gs i js/skrypt-google.js');
}
module.exports = { zbuduj };
