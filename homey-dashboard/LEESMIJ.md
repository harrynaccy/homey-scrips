# Homey Dashboard – installatie

Eigen dashboard voor je tablet. Het draait op je Synology DS918+ en haalt alles live uit je Homey Pro.
De API-sleutel van Homey blijft op de NAS en komt nooit in de browser van de tablet.

---

## Stap 1 – API-sleutel maken in Homey

1. Ga op de laptop naar **my.homey.app** en kies je Homey.
2. Ga naar **Instellingen → API-sleutels → Nieuwe API-sleutel**.
3. Naam: `Tablet dashboard`. Zet deze rechten aan:
   - Apparaten: *bekijken* + *bedienen*
   - Zones: *bekijken*
   - Flows: *bekijken* + *starten*
   - Logica (variabelen): *bekijken* + *wijzigen*
   - Moods: *bekijken* + *instellen*
   - Insights: *bekijken*
   - Apps: *bekijken*
   - Gebruikers/aanwezigheid: *bekijken*
   - Wekkers: *bekijken* + *wijzigen*
   - Meldingen: *bekijken*
   - Geolocatie: *bekijken*
4. Kopieer de sleutel. **Je ziet hem maar één keer.**
5. Zoek het IP-adres van je Homey op, bijvoorbeeld in je router of in de Homey-app onder
   *Instellingen → Algemeen*. Geef de Homey in je router een **vast IP-adres**.

## Stap 2 – Bestanden op de NAS zetten

1. Pak de zip uit.
2. Maak in File Station de map `docker/homey-dashboard` aan (bijvoorbeeld op `volume1`).
3. Kopieer de uitgepakte bestanden erin. `docker-compose.yml` moet direct in die map staan.
4. Open `docker-compose.yml` met de Teksteditor van DSM en vul in:
   - `HOMEY_ADDRESS=http://192.168.178.XX`: het IP-adres van je Homey
   - `HOMEY_TOKEN=...`: de sleutel uit stap 1

   Laat je de voorbeeldwaarden staan, dan start het dashboard in **demo-modus** met nepapparaten.
   Handig om eerst te proberen.

## Stap 3 – Starten in Container Manager

1. Open **Container Manager → Project → Maken**.
2. Projectnaam: `homey-dashboard`. Pad: de map uit stap 2.
3. Kies **Bestaande docker-compose.yml gebruiken** en klik door tot **Klaar**.
4. De eerste start duurt ongeveer een minuut, omdat de onderdelen dan worden gedownload.
5. Open op de laptop **http://192.168.178.79:8095**.

Draait het niet? Kijk dan in Container Manager → Container → `homey-dashboard` → **Logboek**.

## Stap 4 – Tablet met Fully Kiosk (PLUS)

Ga in Fully Kiosk naar *Instellingen* en stel in:

| Instelling | Waarde |
|---|---|
| Web Content Settings → **Start URL** | `http://192.168.178.79:8095` |
| Advanced Web Settings → **Enable JavaScript Interface** | aan (nodig voor helderheid en scherm uit) |
| Web Browsing Settings → **Enable Pull to Refresh** | uit |
| Device Management → **Keep Screen On** | aan |
| Fullscreen Mode / **Hide Status Bar** + **Hide Navigation Bar** | aan |
| Device Management → **Launch on Boot** | aan |
| Motion Detection (optioneel) → **Turn Screen On on Motion** | aan, als je de screensaver "Scherm uit" gebruikt |

## Bediening

- **Achterkant openen:** tik 4× snel op een lege plek of op de tabbalk onderaan.
- **Lamp of schakelaar:** tik voor aan/uit en druk lang voor alle bediening (dimmen, kleur, temperatuur).
- **Op de achterkant:**
  - **Toevoegen**: alles uit je Homey (apparaten, zones, flows, moods, variabelen, grafieken, apps, wekkers, meldingen, aanwezigheid). Ook klok, tekst en webpagina.
  - **Tegel**: titel, weergave, grootte, kleuren, doorzichtigheid, hoeken, tekstgrootte, "eerst bevestigen", dupliceren, kopiëren naar een ander tabblad.
  - **Tabbladen**: maximaal 10. Hier stel je naam, icoon, volgorde, verbergen en starttabblad in.
  - **Scherm**: achtergrond (kleur, verloop of eigen foto, ook per tabblad), helderheid, nachtmodus, screensaver en terug naar start.
  - **Uiterlijk**: thema's (ook eigen thema's opslaan), kleuren, lettertype, glaseffect.
  - **Raster**: kolommen, rijen en ruimte per tabblad.
  - **Systeem**: Homey-status, bibliotheek vernieuwen, back-ups (elke dag automatisch), export/import.
  - **Knoppen**: 11 knopstijlen, gekoppeld aan een apparaat, flow of mood (zie hieronder).
  - **Pictogrammen**: ruim 7000 pictogrammen om op je dashboard te zetten (zie hieronder).
- Een tegel **verplaats** je door hem te slepen. **Groter of kleiner** maken doe je met het rondje rechtsonder.
- Met de pijltjes linksboven kun je **ongedaan maken** en **opnieuw** doen. Alles wordt automatisch opgeslagen.

## Knoppen

Op de achterkant, onder **Knoppen**, zie je van elke stijl hoe hij eruitziet als hij uit staat (links) en aan staat (rechts).
Tik op **+** en kies wat de knop bedient: een apparaat, een flow of een mood.

| Stijl | Wat het doet |
|---|---|
| Drukknop 3D | Steekt uit als het uit is, zit ingedrukt als het aan is |
| Verlichte knop | Neutraal als het uit is, licht op als het aan is |
| Wandschakelaar | Tuimelschakelaar die omklapt |
| Schakelaar met led | Wandschakelaar met een ledje dat brandt als het aan is |
| Ronde knop met ring | De ring licht op als het aan is |
| Schuifschakelaar | Schuifje zoals op je telefoon |
| Dimknop | Tik = aan/uit, schuif = helderheid |
| Scène- of flowknop | Start een flow of mood en licht kort op |
| Paniek- of alarmknop | Rode knop, vraagt altijd eerst om bevestiging |
| Rolluikknoppen | Omhoog, stop en omlaag |
| Pictogram | Alleen het pictogram, kleurt mee met de toestand |

Tik daarna op de knop en ga naar **Tegel**. Daar stel je in: de knopstijl, waaraan hij gekoppeld is, welke waarde hij laat zien,
het pictogram, de kleur als hij aan of uit is, en of de naam en de toestand eronder staan.

## Pictogrammen

Onder **Pictogrammen** staan ruim 7000 pictogrammen (Material Design Icons), ingedeeld in categorieën zoals Lampen, Sensoren,
Deuren en ramen, Klimaat en Huishoudelijke apparaten. Zoeken kan in het Nederlands en het Engels, bijvoorbeeld *lamp*, *raam*, *wasmachine* of *rookmelder*.
Tik op een pictogram en kies:
- **Op het dashboard, gekoppeld**: het pictogram kleurt mee met het apparaat. Lamp aan = verlicht, raam open = oranje.
- **Als knop**: kies een knopstijl met dit pictogram.
- **Alleen het pictogram**: als versiering of label.
- **Voor de geselecteerde tegel**: geeft een bestaande tegel dit pictogram.

Bij apparaat-, flow- en mood-tegels kun je het pictogram ook wijzigen onder **Tegel → Pictogram → Kiezen**.
De pictogrammen staan op de NAS, dus ze werken ook zonder internet.

## Adressen invullen (webpagina-tegels)

Bij een webpagina-tegel staat het begin van het adres al ingevuld (`http://192.168.178.79:`, je NAS). Je typt alleen de rest erachter, zoals `8090/playlist.html`.
Met de snelknoppen boven het veld (NAS, Spotify, Homey, GitHub, https://, http://) vul je in één tik een ander begin in. Met **✕** maak je het veld leeg voor een heel ander adres.
Het standaardbegin en de snelknoppen pas je aan onder **Systeem → Adressen invullen**.

## Eén achtergrond voor alle tabbladen

Onder **Scherm → Achtergrond** zet de knop **Deze achtergrond op alle tabbladen** de achtergrond die je bekijkt op alle tabbladen.
Eigen achtergronden van losse tabbladen worden dan weggehaald. Met de pijltjes linksboven kun je dat ongedaan maken.

## Widgets van je eigen Homey-apps (Spotify Dashboard)

Onder **Toevoegen → Eigen apps** staan de widgets van je eigen app **Spotify Dashboard**:
- **Alle widgets naadloos**: Nu speelt, Afspeellijst, Platenkast en Aura naast elkaar, met één doorlopende albumhoes. Hiervoor heb je een leeg tabblad nodig.
- De widgets los, als je ze ergens anders wilt neerzetten.

Alle gegevens komen van de app op je Homey. Alleen je Homey praat met Spotify. Bij **Systeem → Eigen apps** zie je of de verbinding met de app werkt, en langs welke weg.

Heb je de widgets in je Homey-app aangepast? Kopieer dan de inhoud van `widgets/<naam>/public/` uit de app naar `appwidgets/nl.ramon.spotifydashboard/<naam>/` op de NAS.

## Bijwerken op de NAS

1. Kopieer de mappen `server/` en `public/` (en `LEESMIJ.md`) over de oude heen in `docker/homey-dashboard`.
   Laat `docker-compose.yml` en de map `data/` staan: daar staan je sleutel en je indeling.
2. Herstart de container in **Container Manager → Container → homey-dashboard → Opnieuw starten**.
3. Tik op de tablet 4× om de achterkant te openen en kies **Systeem → Dashboard herladen**.

## Waar staat wat?

```
docker-compose.yml     instellingen container (Homey-adres + sleutel)
server/                server en Homey-koppeling
server/mdi-icons.json  de pictogrammen (Material Design Icons, zie mdi-icons.LICENSE)
public/                het dashboard zelf
appwidgets/             widgets van je eigen Homey-apps
data/config.json       jouw indeling (wordt automatisch aangemaakt)
data/backups/          automatische en handmatige back-ups
data/backgrounds/      geüploade achtergrondfoto's
```

## Veiligheid

- Het dashboard is nu **alleen in je eigen netwerk** bereikbaar. Zet **geen** poort open in je router.
- Voor toegang van buiten komt later **Tailscale**. Dan kunnen alleen jouw eigen apparaten erbij.
- Deel `docker-compose.yml` niet, want daar staat je Homey-sleutel in.
