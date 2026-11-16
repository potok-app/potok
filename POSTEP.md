# Potok – postęp prac i decyzje

## 16.11.2026 (3) – przenosiny na osobny adres (B-05)
- Repozytorium przeniesione do osobnej organizacji: **github.com/potok-app/potok**. Adres aplikacji: **https://potok-app.github.io/potok/** (strona działa, publikacja przez GitHub Actions jak dotąd).
- Stary adres https://cyberia-studio-projects.github.io/potok/ to teraz osobne, małe repozytorium ze stroną, która czyści z przeglądarki stare dane Potoku i przekierowuje pod nowy adres (sprawdzone: przekierowuje).
- Dane w przeglądarce są osobne dla każdego adresu, więc na każdym urządzeniu: otworzyć nowy adres → Pliki → Google Drive → wkleić kod połączenia (adres /exec + „#” + klucz). Na telefonie: odinstalować starą aplikację Potok i zainstalować z nowego adresu (inaczej „Udostępnij → Potok” trafia pod stary adres).
- Wpisy z 9.11 niżej podają stary adres – zostawione jako historia.

## 16.11.2026 (2) – osobny kod dla każdego urządzenia, zdalne „Odłącz i wyczyść” (aplikacja v29, skrypt Google v11)
Prośba (B-10 z audytu): móc zdalnie odłączyć komputer służbowy i wyczyścić z jego przeglądarki wszystko o Potoku.
- **Skrypt v11:** każde urządzenie ma własny klucz. We Właściwościach skryptu tylko skrót (SHA-256): `U_<skrót>` = nazwa, służbowe, dodano, ostatnio; `X_<skrót>` = data odłączenia (osobno, żeby zapis „ostatnio” go nie nadpisał). Klucz główny przenoszony do właściwości `KLUCZ_GLOWNY` i służy już tylko do przyłączania. Akcje: `zarejestruj`, `urzadzenia`, `noweUrzadzenie`, `odlacz`, `zmienKluczGlowny`; funkcja `nowyKluczGlowny` w edytorze (awaryjnie). Odłączone urządzenie na każde zapytanie dostaje `{ odlaczone: true }`. Komputer, który choć raz zgłosił się jako służbowy, nie zarządza urządzeniami.
- **Aplikacja:** przy skrypcie 11 urządzenie z kluczem głównym samo dostaje własny klucz i zapomina główny. Pliki → **Urządzenia**: lista (nazwa, 💼, ostatnio widziane), „Utwórz kod połączenia” dla nowego urządzenia (też Pobieracza), „Odłącz i wyczyść”, „Zmień klucz główny”. Po `odlaczone` aplikacja usuwa pamięć podręczną, service workera, wszystkie klucze `potok*` z localStorage i sessionStorage, przeładowuje się i mówi, co się stało.
- **B-09** zostaje jak jest (🏠 = tylko prywatnie; na służbowym wpis widoczny, link zablokowany). **B-05** załatwione 16.11 – patrz wpis „przenosiny” wyżej.
- **Testy:** test-skryptu (klucze, skróty zamiast kluczy, prawa służbowego, odłączenie dla każdej akcji, zmiana klucza głównego), e2e-drive krok 11 (komputer w pracy przyłączony kodem z listy, odłączony z domu, w jego przeglądarce nic nie zostaje).

## 16.11.2026 – poprawki po audycie bezpieczeństwa i architektury (wersja aplikacji 28, skrypt Google v10)
Audyt (Fable 5.2) leży w plikach projektu, poza publicznym repo. Wdrożone (Opus 5.5):
- **Dane nie mogą zniknąć (B-01, A-01, A-04):** `Magazyn.napraw` sprawdza i naprawia każdy wpis na wejściu (pamięć, kopia, Drive, formularz); nieznane pola zostają, elementy niebędące wpisami są odkładane w `potok.v1.odrzucone`. Nieczytelne dane → tryb tylko do odczytu, surowa kopia pod `potok.v1.uszkodzone.<data>`, czerwony pasek z decyzją. Bezpiecznik w `zapisz`: zapis, który zgubiłby wpis, jest wstrzymany; brak miejsca → czytelny błąd. W Pliki widać zajętość pamięci.
- **Wejścia i HTML (B-02, B-03, B-06, B-14, B-15):** linki tylko http/https/file (`Magazyn.bezpiecznyAdres`, przy zapisie i rysowaniu), wszystkie atrybuty przez `esc`, `noopener noreferrer`. Udostępnienie: limity długości, zepsuty adres nie blokuje startu, komunikat „Dodano z udostępnienia · Cofnij (do Archiwum)”. Eksport .md bez HTML z cudzych tytułów. Zmyślone identyfikatory w testach.
- **Druga linia obrony (B-04, B-05, B-11, B-12, A-05, A-06):** Content-Security-Policy w index.html, ochrona przed ramką, usunięty skrypt logowania Google. Service worker pamięta tylko pliki aplikacji (bez adresów z udostępnień, bez 404). `js/bledy.js` + Pliki → Diagnostyka. `testy/test-spojnosci.js` pilnuje wersji i listy plików. CI publikuje tylko pliki strony, uprawnienia per zadanie, `package-lock.json` + `npm ci`, Playwright 1.63.0.
- **Skrypt Google v10 – zawiera też streszczenia AI z v9 (B-07, B-08, B-13, A-03):** odrzuca zapis gubiący wpisy i złą treść, kopia dzienna `Potok/kopie/Potok-RRRR-MM-DD.json` (nie kasowane), akcja `synchronizuj` łączy dane pod blokadą, plik pamiętany po id, plik w koszu → błąd. Aplikacja ze starszym skryptem działa po staremu i pokazuje ramkę aktualizacji. Wspólne `js/scal.js` wstawiane do Kod.gs przez `npm run skrypt`.
- **Tytuły (B-08):** domyślnie tylko YouTube; inne strony po włączeniu w Pliki. Nigdy: 🏠, komputer służbowy, linki z tokenami/„potwierdź/wypisz”, sieć lokalna.
- **Konflikty (A-02, A-11):** przy różnych statusach decyduje ostatnia decyzja w sklejonej historii; 🏠 ma własny czas (`prywatneZmieniono`); remis rozstrzygany tak samo na obu urządzeniach. Plik z nowszą wersją formatu → nic nie wysyłamy. Licznik zmian: zmiana w trakcie wysyłania nie gubi znacznika „do wysłania”.
- **Usunięte:** ścieżka Google Cloud/OAuth (A-07; jest w historii gita).
- **Nie zrobione, czeka na decyzję użytkownika:** 🏠 na służbowym poza blokadą linku (B-09), osobny adres strony (B-05), „Wyczyść to urządzenie” i osobne klucze na urządzenie (B-10). Odłożone (niski priorytet): A-08 (opis jako obiekt), A-09 (podział app.js), migracje jednorazowe.
- **Testy:** 74 jednostkowe (nowy `testy/zle-dane.js`), test-skryptu na v10, e2e-drive uruchamia prawdziwy Kod.gs (scenariusz v10) obok starego skryptu, e2e-offline sprawdza przez http: CSP, ramkę, service worker, złośliwe udostępnienia, diagnostykę, pasek uszkodzonych danych.

## 15.11.2026 (7) – Pobieracz dostaje każdy film YouTube czekający na streszczenie (skrypt v9, aplikacja v27)
- Objaw przy pierwszej próbie: Pobieracz napisał „żaden film nie czeka na transkrypcję”, a „Streść teraz” przy podcaście (3 h) nic nie zmieniło – przy wpisie dalej stary błąd 404 ze skryptu v7. Film nie miał oznaczenia „do ręcznego”, a skrypt v8 dawał Pobieraczowi tylko takie.
- Prawdopodobna przyczyna: skrypt Google nie odczytał długości filmu ze strony YouTube (YouTube pokazuje serwerom Google inną stronę), więc wysłał cały film do Gemini i nie zdążył przed limitem czasu.
- Skrypt v9: `doTranskrypcji` zwraca każdy film z YouTube ze statusem „Streścić” / „Streścić szczegółowo” albo „do ręcznego” bez gotowego streszczenia – Pobieracz nie zależy już od tego, czy skrypt rozpozna długość. Długość filmu odczytywana także z `approxDurationMs` i `itemprop="duration"`.
- Pobieracz YT 1.7.1: przycisk „✨ Streść filmy YouTube z Potoku”.

## 15.11.2026 (6) – długie filmy do ręcznego, „Wklej tekst”, zapis streszczeń z NotebookLM, Pobieracz YT (skrypt v8, aplikacja v26)
- Objaw: kilkugodzinny podcast (np. Lex Fridman) nie streszczał się – darmowy Gemini nie mieści takiego filmu w limicie czasu i tokenów, a model `gemini-2.5-flash` zwracał 404 („no longer available to new users”).
- Decyzja: automat ma zostać prosty i utrzymywalny. Rozważane i odrzucone: dzielenie filmu na części (więcej zapytań, więcej miejsc na błąd – „to będzie koszmar”), automatyczne pobieranie transkrypcji z YouTube (kruche, YouTube często to zmienia), płatny Gemini (wbrew zasadzie „bez abonamentu”).
- Skrypt v8: film dłuższy niż `MAKS_MINUT_FILMU` (ustawienie, domyślnie 50) od razu trafia „do ręcznego” z podaną długością – bez wysyłania do Gemini. Modele zapasowe: tylko `gemini-3.8-flash` (2.5 usunięty). Gdy żaden model nie zadziała, błąd zbiera komunikaty wszystkich modeli.
- **„📋 Wklej tekst”** przy wpisie otwiera pole, a pod nim dwa przyciski:
  - **„✨ Streść ten tekst”** – wklejona transkrypcja (np. z Pobieracza YT) albo tekst artykułu zza paywalla idzie do AI zamiast strony/filmu (akcja `streszczTeraz` z polem `tekst`, min. 200 znaków).
  - **„💾 Zapisz jako streszczenie”** – gotowe streszczenie (np. z NotebookLM, po „daj bardziej szczegółowe streszczenie”) zapisuje się przy wpisie bez AI (akcja `zapiszGotowe`, opis „wklejone”). Powód: darmowy NotebookLM ma limit 50 notatników; wartościowe streszczenie trafia do Potoku, a notatnik można usunąć.
- Streszczenia przy wpisach są domyślnie zwinięte (widać tylko nagłówek „Streszczenie (model, data)”), rozwijają się i zwijają kliknięciem. Powód: rozwinięte, długie streszczenia na telefonie wymagały dużo przewijania.
- **Połączenie z Pobieraczem YT** (prośba: „nie widzę sensu ręcznego operowania Pobieraczem i wklejania”): nowa akcja skryptu `doTranskrypcji` zwraca filmy YouTube „do ręcznego” bez streszczenia. Pobieracz YT 1.7 (na komputerze, osobny program) ma przycisk „✨ Streść długie filmy z Potoku”: pobiera ich napisy przez yt-dlp i wysyła je akcją `streszczTeraz` z polem `tekst`. Pobieracz potrzebuje tylko kodu połączenia z „Pliki → Kopiuj kod połączenia”. Dlaczego na komputerze: YouTube blokuje pobieranie napisów z serwerów Google, a z domowego komputera yt-dlp działa.
- Jak postępować z długim filmem: poza domem NotebookLM (albo zostawić „do ręcznego” na później), w domu jedno kliknięcie w Pobieraczu („Streść długie filmy z Potoku”) albo NotebookLM.
- Testy: długi film → do ręcznego (bez Gemini), ustawienie limitu minut, wklejony tekst, za krótki tekst, zapis gotowego streszczenia bez AI, zbiorczy błąd modeli; e2e-drive: „Wklej tekst” → „Zapisz jako streszczenie”.

## 15.11.2026 (5) – długie filmy: limit czasu zamiast zawieszenia (skrypt v7)
- Objaw: „Streść teraz” przy długim podcaście z YouTube – po chwili przycisk wraca, a przy wpisie nadal „w kolejce”, bez żadnego błędu. Pierwszy link (krótszy) streścił się poprawnie.
- Przyczyna (najbardziej prawdopodobna): Google przerywa pojedyncze zapytanie skryptu po ok. 60 s, a cały skrypt po 6 min. Gemini przy długim filmie potrafi nie odpowiedzieć w minutę; skrypt v6 próbował wtedy kolejnych modeli (z ponowieniami), aż Google uciął całe wykonanie – aplikacja nie dostała odpowiedzi, a nic się nie zapisało.
- Skrypt v7: brak odpowiedzi Gemini → od razu następny model (bez ponawiania tego samego), a po 4 minutach koniec z czytelnym błędem „brak odpowiedzi … (długi film? …)”, zapisanym przy wpisie, bez zużycia prób. Napis na przycisku: „film może potrwać kilka minut”.
- Jeśli długie filmy będą stale przekraczać czas: rozwiązaniem byłaby transkrypcja zamiast filmu (Pobieracz YT) – do decyzji później.

## 15.11.2026 (4) – wynik ostatniej próby widoczny przy wpisie (aplikacja v25)
- Problem przy diagnozie: po „Streść teraz” wynik był tylko w komunikacie na dole ekranu (znika po 3,5 s), a przy wpisie zostawał stary błąd bez daty – nie było wiadomo, czy to nowa, czy stara próba.
- Teraz „ostatnia próba” ma datę i godzinę, a gdy skrypt Google w ogóle nie odpowie (sieć, przekroczony czas), aplikacja zapisuje to przy wpisie („brak odpowiedzi skryptu Google: …”).
- Jak rozpoznać wersję skryptu po błędzie: v6 pisze „Gemini (nazwa-modelu): kod …”, starsze „Gemini: kod …”.

## 15.11.2026 (3) – przeciążenie Gemini: ponowna próba i modele zapasowe (skrypt v6, aplikacja v24)
- Objaw: „Streść teraz” → „Gemini: kod 503 – This model is currently experiencing high demand”. To chwilowe przeciążenie serwerów Google (darmowy Flash-Lite), nie błąd po naszej stronie.
- Skrypt v6: przy 503/500 czeka 4 s i ponawia ten sam model; potem próbuje modeli zapasowych z ustawienia `MODELE_ZAPASOWE` (domyślnie `gemini-3.8-flash,gemini-2.5-flash`). Przy 429 (wyczerpany limit) i 404 (nieznany model) od razu następny model – każdy model ma u Google osobny limit. Przy streszczeniu zapisuje się model, który naprawdę streścił.
- Przeciążenie, limit i nieznany model nie zużywają 3 prób wpisu (to nie wina wpisu). Błąd 400 (zły materiał) dalej liczy się jako próba i nie przechodzi na inne modele.
- Aplikacja przy skrypcie starszym niż 6 pokazuje ramkę aktualizacji (wystarczy nowy kod + nowa wersja wdrożenia).
- Testy: 503 → ponowienie → model zapasowy → sukces; wszystkie przeciążone → problem bez zużycia prób; 429 → każdy model raz; 400 → 3 próby.

## 15.11.2026 (2) – „Streść teraz”, start na „Dodaj”, checkbox „Streścić” (skrypt v5, aplikacja v23)
- **„✨ Streść teraz”** przy wpisie (skrzynka, „Streścić”, „Streścić szczegółowo”; tylko linki www bez streszczenia). Prośba: wolę zamawiać streszczenie z aplikacji, niż czekać na harmonogram. Skrypt Google robi je od razu (zwykle 10–60 s) i zwraca; aplikacja pokazuje wynik albo powód, czemu się nie da. Ponawia też wpisy oznaczone wcześniej „do ręcznego”.
  - Skrypt v5: nowa akcja `streszczTeraz` { id, url, tytul, rodzaj }. Harmonogram co godzinę działa dalej (nic nie kosztuje poza limitem). Wyłącza go funkcja `zatrzymajHarmonogram` – dawna `wylaczStreszczenia`, zmieniona, bo myliła się z `wlaczStreszczenia` (wybrana przez pomyłkę 15.11).
  - Aplikacja przy skrypcie starszym niż 5 pokazuje ramkę aktualizacji. Kto ma już v4 z kluczem Gemini, robi tylko kroki 1, 2, 5, 6 (nowy kod + nowa wersja wdrożenia).
- **Start na „Dodaj”:** po otwarciu i odświeżeniu aplikacji pierwszy widok to „Dodaj” (wcześniej przegląd albo Pliki). Kliknięcie w logo „Potok” też przenosi do „Dodaj”. Powód: najczęściej otwieram Potok, żeby coś zapisać.
- **Checkbox „Streścić”** pod polem „Opis”, domyślnie wyłączony. Zaznaczenie dopisuje „Streścić ” na początku opisu (widać to w polu), odznaczenie zdejmuje. Powód: najczęstszy dopisek, szkoda pisać go ręcznie. Wpis dalej trafia do skrzynki z podpowiedzią „Streścić”.
- Testy: `test-skryptu.js` (streszczTeraz: od razu, zapis na Drive, ponowna próba po „do ręcznego”, limit 429, zły adres, zły klucz), `e2e.js` (start na „Dodaj”, logo, checkbox), `e2e-drive.js` krok 10 („Streść szczegółowo teraz”).

## 15.11.2026 – streszczenie w stylu NotebookLM
- Prośba: „3–5 zdań to za mało, niech robi mniej więcej tak jak NotebookLM”. Zwykłe streszczenie (lista „Streścić”) ma teraz 2–3 akapity (ok. 200–300 słów: o czym, główna teza, uzasadnienie, wnioski) z pogrubionymi kluczowymi pojęciami, potem „Kluczowe punkty:” (4–6 punktów) i „Dla kogo:”. Zmienione tylko polecenie (`POLECENIE.krotkie` w Kod.gs). Szczegółowe bez zmian.
- Limit zapytań się nie zmienia (jedno zapytanie na wpis), dłuższa odpowiedź mieści się w darmowym limicie tokenów.

## 14.11.2026 – streszczenia AI: skrypt Google wersja 4 (wersja aplikacji 22)
- **Po co:** zamiast ręcznie wysyłać listę „Streścić” do NotebookLM, streszczenia robią się same. Całość planu jest w projekcie LokalnyLLM (`D:\ClaudeCode\LokalnyLLM\POSTEP.md`).
- **Skrypt Google v4** (`skrypt-google/Kod.gs`): funkcja `streszczajCoGodzine` uruchamiana co godzinę przez harmonogram Google (działa, gdy komputer jest wyłączony). Bierze wpisy „Streścić” (krótkie streszczenie, 3–5 zdań) i „Streścić szczegółowo” (struktura, tezy, argumenty z przykładami, co nowe, słabe punkty). Wynik zapisuje w `Potok/Streszczenia/<id wpisu>.json`. **Potok.json tylko czyta**, więc nie ma ryzyka nadpisania wpisów.
  - Filmy z YouTube: adres idzie wprost do Gemini (sam film, bez listy/miksu), klatka co 10 s i niska rozdzielczość, żeby godzinny film zmieścił się w darmowym limicie. Tylko filmy publiczne.
  - Strony: skrypt pobiera HTML i wycina sam tekst (bez skryptów, menu, stopek). Mniej niż 600 znaków (logowanie/paywall), Facebook/Instagram/LinkedIn/X/TikTok i pliki PDF → „✋ do ręcznego streszczenia” z powodem, bez pytania AI.
  - Limit Gemini (kod 429) albo brak klucza: przerwa do następnej godziny, bez liczenia prób. Inne błędy: do 3 prób, potem wpis czeka na ręczne.
  - Najwyżej 6 wpisów na godzinę (ustawienie `NA_RAZ`) i 5 s przerwy między zapytaniami.
- **Silnik jako ustawienie** (Właściwości skryptu, nie kod): `SILNIK` = gemini (domyślnie) / ollama / wylaczony, `MODEL_KROTKI` i `MODEL_SZCZEGOLOWY` (domyślnie `gemini-3.5-flash-lite`: ok. 15 zapytań/min i 500 dziennie za darmo), `OLLAMA_ADRES` i `OLLAMA_MODEL` (Bielik) na wypadek przejścia na lokalny model. Ollama nie ogląda filmów – te idą wtedy do ręcznego.
- **Klucz Gemini tylko we Właściwościach skryptu** (`GEMINI_KLUCZ`), nigdy w kodzie, bo repozytorium jest publiczne.
- Funkcje do uruchomienia w edytorze: `wlaczStreszczenia` (zgody Google + próbne streszczenie + harmonogram co godzinę, bez dubli), `pokazModele` (lista modeli dostępnych dla klucza), `wylaczStreszczenia` (zdejmuje harmonogram, streszczenia zostają).
- **Aplikacja (wersja 22):**
  - nowy status i lista **„Streścić szczegółowo”** (zaraz po „Streścić”); przycisk „→ Streścić szczegółowo” jest na listach, nie w przeglądzie skrzynki, bo decyzję podejmujesz po przeczytaniu krótkiego streszczenia,
  - streszczenie widać przy wpisie (na listach i w przeglądzie), z modelem i datą; „⏳ w kolejce” albo „✋ do ręcznego streszczenia: powód”,
  - aplikacja pobiera streszczenia po każdej synchronizacji (`js/streszczenia.js`, akcja `streszczenia`, tylko zmienione od ostatniego razu) i pamięta je na urządzeniu (widać je bez internetu),
  - eksport .md (także lista „Zapisać do Obsidian”) zawiera streszczenia,
  - ramka „Zaktualizuj skrypt Google” pojawia się teraz przy skrypcie starszym niż 4 i ma kroki z kluczem Gemini; w Pliki jest linijka „Streszczenia AI: gotowe · do ręcznego · czekają”.
- Eksport listy do NotebookLM zostaje (np. dla rzeczy „do ręcznego”).
- Testy: `test-skryptu.js` sprawdza streszczenia na udawanym Google i Gemini (YouTube, paywall, Facebook, PDF, limit 429, 3 próby, brak klucza, Ollama, „BRAK TREŚCI”, NA_RAZ, harmonogram); 4 nowe testy w przeglądarce; krok 10 w `e2e-drive.js` (streszczenie widać na liście, „→ Streścić szczegółowo” trafia na Drive, streszczenie nie trafia do Potok.json).

## 9.11.2026 – skrypt Google wersja 3 (wersja aplikacji 20)
- Objaw: „pobrane 0 · bez tytułu 25”, bez żadnego błędu. Skrypt v2 połykał każdy błąd pobierania i zwracał pusty tytuł. Najpewniej Google nie dał mu zgody na łączenie ze stronami (UrlFetchApp), bo przy „Nowej wersji” wdrożenia nie zawsze pyta o nowe uprawnienia.
- Skrypt v3: zwraca `problem` (np. brak uprawnień, kod HTTP), ma akcję `wersja` i funkcję `sprawdzTytuly` do uruchomienia w edytorze (wymusza zgodę Google, w dzienniku pokazuje tytuł „Me at the zoo”).
- Potwierdzone u użytkownika: dziennik pokazał „Brak uprawnień: script.external_request”. Ponowne uruchomienie nie pytało o zgodę (Google zapamiętał odmowę przy zgodzie szczegółowej). Rozwiązanie: `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` na początku `sprawdzTytuly`, wtedy w dzienniku pojawia się link do przyznania zgody. Dopisane do skryptu (wersja aplikacji 21).
- Aplikacja: raz na uruchomienie (i po „Synchronizuj teraz”) sprawdza wersję skryptu. Przy starszej pokazuje ramkę aktualizacji (5 kroków) i nie pobiera tytułów. Z v3 ponawia nieudane próby v2 (`brak`, `brak-2`). Nowe nieudane mają `brak-3`, a problem widać w Pliki.

## 9.11.2026 – jeden „wolny” link blokował wszystkie tytuły (wersja 19)
- Objaw: po wersji 18 dalej żadnych tytułów, nawet dla zwykłych stron. Przyczyna (odtworzona w teście): gdy skrypt Google nie odpowie dla jakiegoś linku (np. przekroczy czas na wolnej stronie), przeglądarka zgłasza błąd sieci. Potok uznawał wtedy „brak internetu” i za każdym razem stawał na tym samym linku.
- Teraz taki link jest pomijany, po 2 próbach dostaje „bez tytułu”, a 3 takie błędy pod rząd = przerwa (raczej sieć). W Pliki → Google Drive jest linijka „Tytuły linków: pobrane · bez tytułu · czekają” i ostatni problem.

## 9.11.2026 – tytuły dla linków z miksów YouTube (wersja 18)
- Zaimportowane linki „watch?v=…&list=RD…&index=…” zostawały jako „YouTube · id”. Prawdopodobna przyczyna: YouTube nie podaje tytułu dla adresu z miksem. Teraz po tytuł idzie sam film (`Opisy.adresDoOpisu`), a stare nieudane próby (`brak`) są ponawiane raz. Nowe nieudane mają `brak-2`.
- Błąd przy jednym linku (np. skrypt zwrócił stronę błędu) nie zatrzymuje już uzupełniania pozostałych.

## 9.11.2026 – tytuły także przy dodawaniu na komputerze
- Gdy w „Dodaj” wpiszesz link i opis składający się z samych oznaczeń („Streścić”, „(Zgłębić)”, „XD”…), tytułem jest adres. Potem w tle pobiera się prawdziwy tytuł i autor, a podpowiedź statusu zostaje. Własny opis („Streścić – wywiad z…”) zostaje tytułem. Wpisy dodane wcześniej z tytułem „Streścić” poprawiają się same (wersja 17). Funkcja `Import.tylkoOznaczenia`; testy w testy.js i e2e-drive.js (krok 9).

## 9.11.2026 – „Streszczone” jednym kliknięciem
- Po pobraniu pliku / skopiowaniu adresów Potok pamięta (na tym urządzeniu), które wpisy wysłano do NotebookLM. W Pliki → Kolejka „Streścić” pojawia się przycisk „Streszczone – przenieś N wysłanych do Archiwum”, z potwierdzeniem i „Cofnij”.
- Przenosi tylko te wysłane, które dalej są w „Streścić”: przesunięte wcześniej do „Zgłębić” i dodane po wysłaniu zostają. Test 8c w e2e.js.

## 9.11.2026 – kolejka „Streścić”: które wpisy ręcznie
- Pytanie: „Streścić 25”, a w pliku 20 adresów. Odpowiedź: 5 to pliki z dysku (file://) lub notatki bez linku, których NotebookLM nie pobierze z adresu. Teraz pod licznikiem jest rozwijana lista tych wpisów (z nazwą/ścieżką pliku). Test w e2e.js sprawdza, że www + ręczne = lista „Streścić”.
- Usuwanie z Archiwum: na razie zostaje jak jest (nic nie usuwamy).

## 9.11.2026 – tytuł i autor linków (YouTube, strony, Facebook na ile się da)
- Prośba: link udostępniony z YouTube zapisywał się jako goły adres. Tytuł i autor przyspieszają segregację.
- Skrypt Google w wersji 2 ma akcję „opis”. Dla YouTube używa oficjalnego oEmbed, dla innych stron czyta og:title / <title>. Facebook zwykle wymaga logowania, więc tam tytuł bywa pusty.
- Aplikacja (`js/opisy.js`) po każdej synchronizacji uzupełnia w tle wpisy z tytułem „z automatu” (goły adres, „YouTube · id”), jeden link naraz. Twoje własne opisy i oryginalny tekst się nie zmieniają. Pod tytułem widać autora, na karcie i na liście; wyszukiwarka szuka też po autorze.
- Opis nie zmienia „zmieniono”, a scalanie przenosi go osobno, więc pobrany tytuł nie nadpisze decyzji z innego urządzenia.
- Stary skrypt: Pliki → Google Drive pokazują ramkę „Zaktualizuj skrypt Google” z nowym skryptem (ten sam klucz) i 4 krokami (Zarządzaj wdrożeniami → Nowa wersja; adres się nie zmienia).
- Testy: 3 nowe w testy.js, „opis” w test-skryptu.js (YouTube, og:title z apostrofami i encjami, Facebook-logowanie, 404, brak sieci), krok 9 w e2e-drive.js (stary skrypt → ramka; nowy → tytuł i autor, też na Drive).

## 9.11.2026 – poprawka „Udostępnij → Potok”
- Błąd: udostępnienie z YouTube na Androidzie nic nie dodawało. Chrome przy share_target typu GET zastępuje parametry z adresu „action”, więc znikało nasze `udostepnij=1`.
- Poprawka: udostępnienie rozpoznajemy po samych parametrach title/text/url. Nowy test e2e odtwarza adres taki, jak buduje go Chrome.
- Telefon połączony z Drive kodem połączenia – działa (90 wpisów).
- Telefon mógł trzymać starą wersję do 10 minut (pamięć przeglądarki przy GitHub Pages). Service worker pyta teraz zawsze serwer (`cache: 'no-cache'`). Na dole „Pliki” jest numer wersji i ślad ostatniego udostępnienia.
- Nowy test `testy/e2e-offline.js`: aplikacja z adresu http z service workerem, bez internetu się otwiera, a udostępnienie bez sieci dodaje wpis.

## 9.11.2026 – Drive przez skrypt Google (decyzja)
- Google Cloud wymaga weryfikacji dwuetapowej, a nie chcę telefonu ani PIN-u w Windowsie. **Wybrałem skrypt Google** (bez Google Cloud).
- Jak to działa: krótki skrypt `skrypt-google/Kod.gs` wklejasz raz na script.google.com i wdrażasz jako „Aplikacja internetowa” (Wykonuj jako: Ja, Dostęp: Każdy). Skrypt odpowiada tylko na zapytania z Twoim tajnym kluczem (32 znaki, wygenerowany przez aplikację) i zapisuje wyłącznie `Potok/Potok.json`.
- Konfiguracja w aplikacji: **Pliki → Google Drive** (5 kroków z instrukcją). Na drugim urządzeniu wklejasz **kod połączenia** (adres#klucz) z pierwszego.
- Zaleta: bez logowania co godzinę. Ryzyko: kto zna kod połączenia, ma dostęp do Potok.json. Dlatego kodu nie wysyłaj nikomu, a w razie wycieku wdróż skrypt z nowym kluczem.
- „Odłącz to urządzenie” nie usuwa wpisów.
- Testy: `testy/test-skryptu.js` (skrypt na udawanym Google: klucz, plik, zapis/odczyt, polskie znaki, blokada) + `e2e-drive.js` przechodzi cały scenariusz w obu trybach (skrypt i Google Cloud).
- Sposób przez Google Cloud (Client ID) zostaje w kodzie jako alternatywa, nieużywana.

## 9.11.2026 – synchronizacja z Google Drive (krok 2b)
- **Gotowe w kodzie** (`js/synchronizacja.js`). Włączy się po wpisaniu Client ID z Google Cloud w `window.USTAWIENIA.googleClientId`. Bez niego znaczek ☁ jest ukryty i aplikacja działa jak dotąd.
- Dane: folder **Potok** → plik **Potok.json** na Twoim Drive. Uprawnienie `drive.file`, więc aplikacja widzi tylko pliki, które sama utworzyła.
- Łączenie urządzeń: wpis z jednej strony zostaje zawsze, przy konflikcie wygrywa nowsza zmiana (pole `zmieniono`), a historie z obu stron są sklejane. Nic nie ginie, data dodania się nie zmienia.
- Automatycznie: przy otwarciu, 1,5 s po każdej zmianie, po powrocie internetu i po powrocie do karty. Bez internetu zmiany czekają w kolejce („do wysłania”).
- Znaczek **☁** u góry pokazuje stan: zapisane HH:MM / czeka na wysłanie / bez internetu – wyślę później / kliknij, aby zsynchronizować (sesja Google trwa ok. 1 h, potem jedno kliknięcie).
- Testy: 48 w przeglądarce + `testy/e2e-drive.js` – dwa urządzenia na udawanym Drive, decyzja bez internetu, powrót sieci, równoczesne dodanie, wygasła sesja.
- Google Cloud wymaga weryfikacji dwuetapowej. Można ją włączyć kluczem dostępu (Windows Hello), bez numeru telefonu.

## 9.11.2026 – Potok pod adresem https (krok 2a)
- Adres: **https://cyberia-studio-projects.github.io/potok/** (repozytorium: github.com/cyberia-studio-projects/potok, publiczne – tylko kod).
- Do repozytorium NIE trafiają: Twoje pliki .docx, zrzuty ekranu, kopie .json (plik `.gitignore`). Testy używają zmyślonego `testy/przyklad.docx`.
- Przy każdej zmianie GitHub uruchamia testy (w przeglądarce + „jak człowiek”). Strona publikuje się tylko wtedy, gdy przejdą (`.github/workflows/testy-i-strona.yml`; tego pliku nie ma w folderze na dysku, jest tylko w repozytorium).
- Uwaga: dane w przeglądarce są osobne dla każdego adresu. Wersja z pliku `index.html` i wersja z adresu https mają osobne wpisy. Żeby przenieść wpisy, użyj kopii .json (Pliki → Pobierz kopię → na stronie https: Przywróć z kopii) albo zaimportuj dokument ponownie.
- Następny krok (2b): zapis na Google Drive.

## 8.11.2026 (noc, 2) – „Więcej wyborów” dla wpisu bez linku
- Wpis bez linku pokazuje najpierw 3 przyciski (Dla Claude'a / Zrobię sam / Archiwum). Przycisk **„Więcej wyborów →”** rozwija wszystkie 9 decyzji (Streścić, Obczaić, Zgłębić, Obsidian, Muzyczki, Śmieszne, Dla Claude'a, Zrobię sam, Archiwum). „← Mniej wyborów” wraca do 3.
- Dla linku działa to tak samo jak wcześniej: „To zadanie →” i „← To jednak treść”.
- Ramka z podpowiedzią pokazuje się tylko wtedy, gdy podpowiadany przycisk jest widoczny.

## 8.11.2026 (noc) – ZASADA: zapis bez decyzji, decyzja w przeglądzie
- **Dlaczego:** zapisuję szybko, żeby nie obciążać głowy. Nie chcę przy zapisie pisać nawiasów ani decydować, co z tym zrobić. Decyzja przychodzi później, kiedy mam czas.
- **Zmiana:** *wszystko* trafia do skrzynki, także wpisy bez linku. Nie ma już automatycznego sortowania do „Zadań” (to zastępuje regułę z sekcji „wieczór, 2”).
- W przeglądzie wpis bez linku ma przyciski zadaniowe: **Dla Claude'a / Zrobię sam / Archiwum**. Link ma 7 decyzji treściowych oraz przycisk **„To zadanie →”**, który przełącza na przyciski zadaniowe („← To jednak treść” wraca).
- Oznaczenia w tekście, np. „(Claude…)”, tylko podświetlają podpowiadany przycisk. Bez oznaczenia nic nie jest podpowiadane.
- Wpisy przeniesione wcześniej automatycznie (bez Twojej decyzji) wróciły do skrzynki. Wpisy, które przesunąłeś sam, zostały na miejscu. Wszystko jest zapisane w historii.
- „Sam” nazywa się teraz „Zrobię sam”.
- Na „Listach” i w „Zadaniach” jest u góry podsumowanie: „W skrzynce · Potok · Zadania · Razem”.
- Testowanie od zera: okno incognito (Ctrl+Shift+N) i przeciągnięcie `index.html`. Zamknięcie okna wyrzuca próbne dane, a prawdziwe zostają.
- Testy: 41 w przeglądarce + test „jak człowiek” (zadanie w przeglądzie, „To zadanie →”, podsumowanie).

## 8.11.2026 (wieczór, 5) – 🏠 „Tylko prywatnie”
- **Problem:** część rzeczy chcę otwierać tylko na prywatnym komputerze.
- **Decyzja:** to nie jest kolejna lista, tylko **znaczek przy wpisie** (niezależny od decyzji Streścić / Zgłębić / …).
  - W przeglądzie, nad decyzjami, jest duży przełącznik **„🏠 Tylko prywatnie: TAK / nie”**. Domyślnie wyłączony, a włączenie nie przeskakuje do następnego wpisu.
  - Na listach i w Zadaniach każdy wpis ma przycisk 🏠 do zmiany później.
  - W „Pliki → To urządzenie” wybierasz raz: **prywatny** albo **💼 służbowy**. Na służbowym wpisy z 🏠 są widoczne, ale link się nie otwiera („🏠 Otwórz w domu”). Ustawienie jest osobne dla każdego urządzenia.
  - Podpowiedź: „(Dom)”, „(Claude-dom)”, „-dom”, „prywatne” od razu włączają domek. Twój wybór zawsze wygrywa z podpowiedzią.
  - W eksporcie .md wpis z domkiem ma dopisek „🏠 prywatne”.
- Pełny pożytek będzie po synchronizacji z Google Drive, bo na razie każde urządzenie ma własne dane.
- Testy: 41 w przeglądarce + test „jak człowiek” (przełącznik, tryb służbowy, link blokowany i odblokowany).

## 8.11.2026 (wieczór, 4) – „Muzyczki do zachowania”
- Nowa decyzja i lista **Muzyczki do zachowania**. W przeglądzie jest 7 przycisków (Archiwum na całą szerokość).
- Podpowiedź dają słowa: muzyczki, muzyka, piosenka, utwór.
- Testy: 37 w przeglądarce + test „jak człowiek”.

## 8.11.2026 (wieczór, 3) – „Śmieszne” i „Zapisać do Obsidian”
- Dwie nowe decyzje w przeglądzie i nowe listy: **Zapisać do Obsidian** (wiedza do notatek) i **Śmieszne** (rolki, memy – rozrywka osobno). Razem w przeglądzie jest teraz 6 przycisków: Streścić / Obczaić / Zgłębić / Zapisać do Obsidian / Śmieszne / Archiwum.
- Podpowiedzi: „XD”, „XDDDD” na początku wpisu → Śmieszne; „(Obsidian)”, „[Obsidian]”, „zapisać … Obsidian” → Zapisać do Obsidian.
- W „Pliki” jest nowy przycisk: **lista „Zapisać do Obsidian” jako osobny .md** (do wrzucenia do skarbca). Eksport całego Potoku zostaje bez zmian.
- Przycisk „To zadanie, nie treść →” skrócony do „To zadanie →”.
- Testy: 36 w przeglądarce + test „jak człowiek” (sprawdza m.in. podpowiedź „Śmieszne” i eksport listy Obsidian).

## 8.11.2026 (wieczór, 2) – osobne „Do zrobienia”, czysty Potok
- **Problem:** w Potoku lądowały też plany i pomysły (np. „Weekend: …”, „(Claude-dom) …”). W dokumencie było ich 41 na 90 wpisów i zaśmiecały przegląd linków.
- **Decyzja:** Potok jest tylko na *treści do przyswojenia*. Plany i pomysły trafiają do zakładki **Zadania** („Do zrobienia”), gdzie są trzy listy: **Dla Claude'a / Sam / Zrobione**. „Zrobione” niczego nie kasuje.
- Wpis **bez linku** trafia tam automatycznie, także przy imporcie i przy ręcznym dodaniu. Oznaczenie „(Claude…)” albo „[Claude…]” kieruje go do „Dla Claude'a”, a wszystko inne do „Sam”. Wpis można przestawić jednym kliknięciem (także „→ Potok”).
- Notatki zaimportowane wcześniej, które czekały w skrzynce, przeniosły się same przy otwarciu aplikacji. W historii mają dopisek „automatycznie”. Wpisów, o których już zdecydowałeś, to nie dotyczy.
- W przeglądzie jest nowy przycisk **„To zadanie, nie treść →”** dla linków, które są właściwie zadaniem (np. „wyciągnąć tezy z …”).
- Przy pomysłach dla Claude'a jest przycisk **Kopiuj**, żeby od razu wkleić pomysł w rozmowę.
- Zasada: przeglądać trzeba tylko skrzynkę. Pozostałe listy to półki, do których zaglądasz, kiedy chcesz.
- Wynik na Twoim dokumencie: w skrzynce zostaje 49 linków, a w Zadaniach jest 23 dla Claude'a i 18 „Sam”.
- Testy: 34 w przeglądarce + test „jak człowiek” (sprawdza m.in., że w skrzynce nie zostaje nic bez linku).

## 8.11.2026 (wieczór) – nowe etykiety i popychanie dalej
- Decyzje w przeglądzie: **Streścić / Obczaić / Zgłębić / Archiwum** (+ „Pomiń na razie”).
  - Streścić – niech streści AI (NotebookLM).
  - Obczaić – przejrzeć, poeksplorować samemu.
  - Zgłębić – poświęcić czas: przeczytać albo obejrzeć w całości. Zastępuje „Do przeczytania”, bo w Potoku są też filmy.
  - Archiwum – nic nie robię, wpis zostaje.
- Na listach każdy wpis ma przyciski „→ Obczaić / → Zgłębić / → Archiwum” itd. Typowe użycie: lista „Streścić”, przeczytane streszczenie, „→ Zgłębić”. Wpis pokazuje, skąd przyszedł (np. „Streścić → Zgłębić, 8 lis 2026”), pełna historia zmian jest zapisana.
- Wpisy zapisane wcześniej jako „Do przeczytania” same przechodzą do „Zgłębić” przy otwarciu aplikacji (nic nie ginie).
- Podpowiedź „Zgłębić” dają słowa: przeczytać, poczytać, zgłębić, obejrzeć.
- Zakładka „Import / eksport” nazywa się teraz „Pliki” (mieściła się źle na telefonie).
- Testy: 30 w przeglądarce + test „jak człowiek” sprawdzający popchnięcie Streścić → Zgłębić.

## Stan na 8.11.2026 – wersja 1 (lokalna, bez synchronizacji)

### Co działa
- **Import** dokumentu z Google Docs (.docx, także .txt). Ponowny import nie dubluje wpisów.
- **Przegląd jeden wpis naraz**: (od wieczora 8.11 – patrz wyżej) Streścić / Obczaić / Zgłębić / Archiwum, plus „Pomiń na razie” i „Cofnij”.
- **Data dodania** zapisuje się sama i jest zawsze widoczna.
- **Listy** wpisów wg statusu z wyszukiwarką; status można zmienić z listy.
- **Dodaj** ręcznie (np. w pracy, w przeglądarce).
- **Eksport kolejki „do streszczenia”** do jednego pliku .txt (same adresy, po jednym w linii – do wklejenia w NotebookLM: Dodaj źródło → Witryna) lub do schowka.
- **Eksport całości do .md** dla Obsidiana (sekcje wg statusu, data przy każdym wpisie, oryginalny tekst).
- **Kopia zapasowa .json** i przywracanie (przywrócenie tylko dokłada brakujące wpisy, nic nie nadpisuje).
- Przygotowane pod Androida: manifest z „Udostępnij → Potok” i praca offline (service worker). Zadziała, gdy aplikacja będzie pod adresem https (krok 2).

### Jak uruchomić
- Aplikacja: dwuklik `index.html` (Chrome / Edge / Firefox). Nic nie trzeba instalować.
- **Podgląd jak na telefonie**: dwuklik `podglad.html` (dwie ramki w rozmiarach telefonów). Dokładniej: w Chrome/Edge F12 → Ctrl+Shift+M i wybór modelu telefonu.
- **Testy**: dwuklik `testy/testy.html` – zielone „Wszystko OK” albo czerwona lista błędów. Testy używają osobnego miejsca w pamięci i nie ruszają Twoich wpisów.
- Test „jak człowiek” (`testy/e2e.js`): udaje telefon Pixel 7, importuje prawdziwy dokument, klika decyzje, eksportuje pliki. Wymaga Node + Playwright, więc uruchamia go Claude (później GitHub przy każdej zmianie).

### Pliki
| Plik | Co robi |
|---|---|
| `index.html`, `styl.css` | wygląd i układ |
| `js/magazyn.js` | zapis wpisów w przeglądarce (localStorage); celowo brak funkcji usuwania |
| `js/zip.js` | czytanie .docx bez bibliotek |
| `js/import.js` | dokument → wpisy (rozpoznawanie linków, tytułów, oznaczeń) |
| `js/eksport.js` | pliki .txt / .md / .json |
| `js/app.js` | ekrany i przyciski |
| `manifest.webmanifest`, `sw.js`, `ikona.svg` | instalacja jako aplikacja, offline, udostępnianie |
| `testy/` | testy (testy.html + testy.js, e2e.js, przykładowy .docx) |

### Decyzje
1. **Jeden akapit dokumentu = jeden wpis.** Akapit z kilkoma linkami („… oraz …”) dzielimy na osobne wpisy; każdy zachowuje pełny oryginalny tekst.
2. **Akapity bez linku** (zadania, pomysły typu „(Claude-dom) …”) też są importowane jako notatki – nic nie ginie. Pomijane są tylko puste akapity i takie bez liter (np. samotny cudzysłów).
3. **Oznaczenia** („Streścić”, „(Streścić)”, „[Streścić]”, „Obczaić”, „Poeksplorować”…) dają tylko **podpowiedź** (podświetlony przycisk). Decyzję podejmujesz sam. „Nie da się streścić” nie daje podpowiedzi.
4. **Data dodania przy imporcie** = moment importu, z dopiskiem „oryginalna data dodania nieznana” (dokument nie zawiera dat).
5. **Identyczne akapity** w dokumencie (ten sam tekst i link) importują się raz. W obecnym dokumencie są 2 takie powtórzenia.
6. **Linki do plików na dysku** (`file:///C:/…`) są importowane, ale nie trafiają do pliku dla NotebookLM (aplikacja pokazuje, ile trzeba dodać ręcznie).
7. **Dane w localStorage** (prosto i czytelnie; wystarczy na tysiące linków). Do czasu synchronizacji z Google Drive dane są tylko w tej jednej przeglądarce – rób kopię .json.
8. **Bez bibliotek zewnętrznych** – mniej rzeczy do utrzymania; .docx rozpakowuje wbudowany w przeglądarkę mechanizm.

### Wynik importu „Potok - od 10.2026.docx”
90 wpisów (2 powtórzenia pominięte): 49 linków i 41 notatek/zadań bez linku. Podpowiedź „do streszczenia” ma 24 wpisy, „obczaić” 11.

## Następne kroki (propozycja)
1. Wystawienie aplikacji pod darmowym adresem https (GitHub Pages) – wtedy działa na telefonie z linku, instalacja na Androidzie i „Udostępnij → Potok”. Testy będą się tam uruchamiać same przy każdej zmianie.
2. Synchronizacja z Google Drive.
3. Pobieranie prawdziwych tytułów (np. filmów YouTube) zamiast „YouTube · identyfikator”.
4. Proponowane tagi (do zatwierdzenia) i znacznik wiarygodności źródła.
