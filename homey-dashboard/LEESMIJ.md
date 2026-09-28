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
- Een tegel **verplaats** je door hem te slepen. **Groter of kleiner** maken doe je met het rondje rechtsonder.
- Met de pijltjes linksboven kun je **ongedaan maken** en **opnieuw** doen. Alles wordt automatisch opgeslagen.

## Widgets van je eigen Homey-apps (Spotify Dashboard)

Onder **Toevoegen → Eigen apps** staan de widgets van je eigen app **Spotify Dashboard**:
- **Alle widgets naadloos**: Nu speelt, Afspeellijst, Platenkast en Aura naast elkaar, met één doorlopende albumhoes. Hiervoor heb je een leeg tabblad nodig.
- De widgets los, als je ze ergens anders wilt neerzetten.

Alle gegevens komen van de app op je Homey. Alleen je Homey praat met Spotify. Bij **Systeem → Eigen apps** zie je of de verbinding met de app werkt, en langs welke weg.

Heb je de widgets in je Homey-app aangepast? Kopieer dan de inhoud van `widgets/<naam>/public/` uit de app naar `appwidgets/nl.ramon.spotifydashboard/<naam>/` op de NAS.

## Waar staat wat?

```
docker-compose.yml     instellingen container (Homey-adres + sleutel)
server/                server en Homey-koppeling
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
