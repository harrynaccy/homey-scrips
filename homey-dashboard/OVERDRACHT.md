# Overdracht – Homey Dashboard (voor een nieuwe chat)

Stand: 3 oktober 2026. Eigenaar: Ramon. Taal: Nederlands, kort en duidelijk.

## Afspraken met Ramon (belangrijk)
- **Eerst lezen en voorstellen, pas bouwen/wijzigen na "START".** Ook bij kleine dingen.
- Niet om `docker-compose.yml` vragen of het lezen (bevat Homey-sleutel en Claude-sleutel). Niet `spotify-apps.js` (Spotify-sleutels). Nooit wachtwoorden/pincodes zelf invullen.
- Wijzigingen gaan via deze GitHub-branch; Ramon haalt ze binnen met **Systeem → Bijwerken** in het dashboard. Geen zipbestanden meer.
- Kort antwoorden, weinig opsommingen van wat je allemaal gedaan hebt; zeg eerlijk wat niet getest is.
- Na elke wijziging die invloed heeft op het draaien: test lokaal in demo-modus (zie onder) voordat je pusht.
- **Bij elke push OVERDRACHT.md bijwerken** met wat er gebouwd of gewijzigd is (kort, bij "Wat deze sessie is gebouwd" en "Nog open"), in dezelfde push. Ramon vraagt aan het eind van een sessie ter controle "werk OVERDRACHT.md bij".
- **Na het bouwen van een nieuwe tegel/programma altijd afsluiten met de vraag:** "Wil je hier ook een Homey-app van, zodat je het buiten de deur op je telefoon kunt zien?" (Tegels onder Overig bestaan alleen in het dashboard; een eigen Homey-app verschijnt onder Eigen apps én in de Homey-app. Gegevens blijven van de NAS komen, Homey haalt ze thuis op.)

## Opbouw
- **NAS**: Synology DS918+, 192.168.178.79. Dashboard draait in Docker (Container Manager, project `homey-dashboard`), map `/volume1/docker/Homey Dashboard` (= deze map), poort **8095**.
- **docker-compose.yml** (alleen bij Ramon): `./:/app` en `"/volume1/spotify homey:/extra/spotify-homey:ro"` (gedeelde map, alleen lezen). Let op inspringing; een fout pad zet de container uit.
- **Homey Pro** 192.168.178.13 via homey-api (`server/homey.js`), live updates via SSE `/api/events`.
- **Spotify-widgets/weerx** draaien apart op poort 8090, bestanden in gedeelde map `/volume1/spotify homey`. Ramons eigen Homey-app "Spotify Dashboard" staat op zijn laptop in `Bureaublad\Spotify homey app` en gaat via Synology Drive (back-uptaak) naar `spotify homey/homey-app/TAMARA/...`.
- **Tablet**: Samsung Galaxy Tab A11+, 1280×800, Fully Kiosk (PLUS) op 192.168.178.116, Remote Admin lokaal aan (poort 2323), JavaScript-koppeling aan, kioskmodus aan. Homey heeft nog een apparaat "Galaxy Tab A11+" en flows "Tablet Helderheid +/-" (Ramon wilde Homey los van Fully; mogelijk nog opruimen).
- **Laptop**: Windows-programma `desktop/` (Electron, versie 1.1.0) opent alleen het dashboard van de NAS; installer staat in `reserve/1 Installatie`.
- **Bijwerken**: `server/updater.js` haalt deze branch op, maakt back-up, rolt terug bij fout; beschermt `docker-compose.yml`, `data/`, `node_modules/`, `desktop/`, `.env`, `reserve/`.

## Belangrijke bestanden
- Server: `server/server.js` (routes), `auth.js` (beveiliging), `fully.js` (tablet), `reserve.js` (reservemap), `backup.js` (volledige back-up), `health.js` (Controle), `extra.js` (externe tegels), `appscan.js` (widgets van Homey-apps), `updater.js`.
- Voorkant: `public/js/core.js` (status, thema, nacht, screensaver, sync), `editor.js` (achterkant, alle panelen), `tiles.js`/`tiles2.js`/`faders.js`/`clocks.js`/`pages.js`, `connbar.js` (statusbalk linksonder), `main.js` (opstarten).

## Wat deze sessie is gebouwd (laatste eerst)
- **Reservebron NS-vertrektijden** (`server/ovgtfs.js`, 3 okt): geeft NS een fout of niets, dan gebruikt de NS-tegel open OV-data van OVapi (gtfs.ovapi.nl/nl, geen sleutel). Dienstregeling `gtfs-nl.zip` (~240 MB) wordt pas opgehaald zodra NS faalt, daarna rond 4 uur 's nachts; alleen treinen van het gekozen station blijven bewaard in `data/gtfs/` (niet in back-ups/reserve). Live vertraging/uitval/spoor uit `trainUpdates.pb` (eigen kleine protobuf-lezer). Tegel toont klein "bron: OV-data". Na een fout 15 min wachten. Status: `/api/x/ns/reserve`. Alleen getest met nepbestanden; koppeling met echte feed (trip_id/realtime_trip_id, spoor uit OVapi-extensie) niet getest.
- **Tegels NS reisinformatie en Bus reisinformatie** (Toevoegen → Overig; `server/ov2.js`, `T.ns`/`T.bus` in tiles2.js). NS via NS API (sleutel `ns` in data/extra-geheim.json, in te vullen bij Tegel; NOOIT in de repo), stations v2, vertrek v2, storingen /disruptions/v3. Bus via OVapi stopareacode incl. GeneralMessages (omleidingen). Verversen 30 s, storingen 5 min. Getest met nepservers (NS_BASE/OVAPI_BASE), niet met de echte API's. Ook gebouwd 2-3 okt: Nu speelt light (appwidgets/…/nu-speelt-light, apiWidget=nu-speelt), Schaduw op Verhoogd, Verbindingen-tegel.
- **Tegel Verbindingen** (Toevoegen → Overig, `T.conn` in tiles2.js) met dezelfde balk als linksonder (`connbar.js`: `C.markup`, `C.info`, stijlen nu op `.connbar`). Vaste balk instelbaar via Scherm → Statusbalk linksonder (`settings.connbar.show`: auto/always/problem/never; auto = bij storing zodra er een Verbindingen-tegel is). Verder vandaag: P2000-tegel, tabbalk volle breedte, eigen 'alles goed'-tekst op Controle-tegel.
- **Tegel P2000 Twente** (Toevoegen → Overig): `server/p2000.js` haalt elke 2 min `alarmeringen.nl/feeds/all.rss` op (plus `region/twente.rss`, die in okt. 2026 stilstond), filtert op links met `/overijssel/twente/`, bewaart 24 uur in `data/p2000.json` (telt niet als wijziging voor de reserve). Ophalen alleen zolang een scherm de tegel toont (stopt na 1 uur zonder vraag). Instellingen: brandweer/ambulance/politie, alleen spoed, alleen plaatsen. Dienst en spoed worden geraden uit omschrijving/P2000-tekst. Bron CC BY-NC-ND, vermelding staat in de tegel. Getest met voorbeeldfeed; echte feed nog niet vanaf de NAS getest.
- **Fouten 1-4 uit de controle van 2 okt**: Homey-luisteraars stapelen niet meer na nieuw/verwijderd apparaat (`homey.js`); agenda kent EXDATE, verplaatste keren (RECURRENCE-ID), geannuleerde afspraken, BYDAY (wekelijks en "2e dinsdag") en COUNT goed (`extra.js` parseIcal); knopstand gaat terug als bedienen mislukt (`core.js` setCap); wachtwoordvakjes donker (`editor.css`). Nog open uit die controle: lege of misleidende layout (dimbalk bij lamp uit, variabele ja/nee, rolluik stop, labels over koppen op de achterkant), webpagina-tegel interactief/herladen, reserve neemt mogelijk node_modules mee.
- **Back-up in één oogopslag**: back-up-icoon met groen/oranje/rood bolletje in de statusbalk; meldingen in Controle (`reserve.issues()`).
- **Reservemap** `reserve/` met `1 Installatie` (exe, zelf neergezet) en `2 Back-up` (elke 24 uur controle, alleen bij wijziging nieuwe zips met én zonder sleutels, laatste 7). Neemt `/extra/*` mee; `knmi.json` telt niet als wijziging. Systeem → Reserve. Laptop krijgt de map via Synology Drive Client (taak "alleen downloaden" naar `C:\Backup Homey via Nas\SynologyDrive`).
- **Offline**: laatste indeling op het apparaat bewaard; NAS weg bij opstarten → gele balk met laatste versie.
- **Nachtthema en nachtachtergrond** (Scherm → Nachtmodus).
- **Beveiliging op de NAS** (`auth.js`): beheer-routes alleen met sessie na pincode of vertrouwd apparaat; actief als pincode ingesteld én "Achterkant op slot" aan (staat aan). Pincode kwijt → `data/flowpin.json` verwijderen.
- **Back-up vóór terugzetten/importeren/alles terugzetten** (`voor-…` in data/backups).
- **Tablet (Fully)** onder Systeem: status, scherm aan/uit, herladen, herstart, schermafdruk, aanbevolen instellingen controleren/toepassen; ook in Controle.
- **Instellingen gelijk houden laptop ↔ tablet**: alleen opslaan bij echte wijziging, 409 bij verouderde versie, wijzigingen van ander apparaat overnemen, na onderbreking opnieuw ophalen.
- Kleinere: Webpagina-tegels standaard zonder kader; Gelijk maken voor als knopjes; lijndikte pictogrammen in eigen blok "Pictogram"; widget-zoeker gebruikt `dashboards.getAppWidgets`.
- Eerder (zie git log): 25 extra tegels, dimmers, klokken, pictogramsets, subpagina's, Controle-verbeteringen, Voorbeeld A11+, camera Reolink.

## Nog open
0. **Homey-app "Reisinfo"** (NS- en Bus-widget, aparte app naast Spotify Dashboard): pas maken als Ramon dat aangeeft. Nog te kiezen: twee losse widgets of één, station/halte kiezen in de widget of overnemen van de dashboardtegels. Ramon installeert zelf met `homey app install`.
1. **Tablet krijgt de reservemap**: SMB aan op de NAS, eventueel aparte NAS-gebruiker met alleen lezen, FolderSync op de tablet (naar lokale map, dagelijks, filter "met-sleutels" uitsluiten).
2. Ideeënlijst (nog niet gebouwd): scherm wekken via Homey (voordeur/beweging), nachtstand op Homey-status, zoeken in de instellingen, controle op kapotte tegels, kopiëren naar ander tabblad, echte tablet-schermafdruk in de A11+-voorbeeldweergave, handleiding (`public/handleiding.html`) bijwerken met alles van deze week.
3. Ook genoemd maar niet gekozen: alarmscherm bij rook, waarschuwing raam open + regen, starttabblad per tijd van de dag, vegen tussen tabbladen.
4. Widget-zoeker (Homey-app-widgets) nog niet getest op de echte Homey na de laatste aanpassing; externe tegels (deel 6) nog niet allemaal door Ramon getest.
5. Later (Ramon): camera-tegel Reolink verder, toegang van buitenaf (Tailscale) – eerst beveiliging is nu klaar.

## Lokaal testen (voor Claude)
Demo-modus: kopie van `server/` en `public/` in een kladmap, `node_modules` erbij (express, homey-api), starten met `DATA_DIR=<leeg> PORT=<vrije poort> node server/server.js`, eventueel `EXTRA_DIR=<map>` voor gekoppelde mappen. Testen met Playwright/Chromium. Gebruik voor elke test een nieuwe poort in plaats van processen te stoppen.
