# Overdracht – Homey Dashboard (voor een nieuwe chat)

Stand: 2 oktober 2026. Eigenaar: Ramon. Taal: Nederlands, kort en duidelijk.

## Afspraken met Ramon (belangrijk)
- **Eerst lezen en voorstellen, pas bouwen/wijzigen na "START".** Ook bij kleine dingen.
- Niet om `docker-compose.yml` vragen of het lezen (bevat Homey-sleutel en Claude-sleutel). Niet `spotify-apps.js` (Spotify-sleutels). Nooit wachtwoorden/pincodes zelf invullen.
- Wijzigingen gaan via deze GitHub-branch; Ramon haalt ze binnen met **Systeem → Bijwerken** in het dashboard. Geen zipbestanden meer.
- Kort antwoorden, weinig opsommingen van wat je allemaal gedaan hebt; zeg eerlijk wat niet getest is.
- Na elke wijziging die invloed heeft op het draaien: test lokaal in demo-modus (zie onder) voordat je pusht.

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
1. **Tablet krijgt de reservemap**: SMB aan op de NAS, eventueel aparte NAS-gebruiker met alleen lezen, FolderSync op de tablet (naar lokale map, dagelijks, filter "met-sleutels" uitsluiten).
2. Ideeënlijst (nog niet gebouwd): scherm wekken via Homey (voordeur/beweging), nachtstand op Homey-status, zoeken in de instellingen, controle op kapotte tegels, kopiëren naar ander tabblad, echte tablet-schermafdruk in de A11+-voorbeeldweergave, handleiding (`public/handleiding.html`) bijwerken met alles van deze week.
3. Ook genoemd maar niet gekozen: alarmscherm bij rook, waarschuwing raam open + regen, starttabblad per tijd van de dag, vegen tussen tabbladen.
4. Widget-zoeker (Homey-app-widgets) nog niet getest op de echte Homey na de laatste aanpassing; externe tegels (deel 6) nog niet allemaal door Ramon getest.
5. Later (Ramon): camera-tegel Reolink verder, toegang van buitenaf (Tailscale) – eerst beveiliging is nu klaar.

## Lokaal testen (voor Claude)
Demo-modus: kopie van `server/` en `public/` in een kladmap, `node_modules` erbij (express, homey-api), starten met `DATA_DIR=<leeg> PORT=<vrije poort> node server/server.js`, eventueel `EXTRA_DIR=<map>` voor gekoppelde mappen. Testen met Playwright/Chromium. Gebruik voor elke test een nieuwe poort in plaats van processen te stoppen.
