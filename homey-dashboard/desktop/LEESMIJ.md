# Homey Dashboard voor Windows

Een eigen programma op je pc dat het dashboard van je NAS in een eigen venster opent.
Het dashboard zelf blijft op de NAS draaien: browser, snelkoppeling en tablet blijven gewoon werken.

## Installeren

1. Dubbelklik op `Homey-Dashboard-Setup-1.0.0.exe`.
2. Zegt Windows **"Windows heeft uw pc beschermd"**? Klik op **Meer informatie** en daarna op **Toch uitvoeren**.
   (Het programma is niet "ondertekend" met een betaald certificaat; daarom waarschuwt Windows.)
3. Volg de stappen. Er zijn geen beheerdersrechten nodig. Standaard komt het in `%LOCALAPPDATA%\Programs\Homey Dashboard`.
4. Er komt een snelkoppeling op het bureaublad en in het startmenu.

Verwijderen: **Instellingen → Apps → Homey Dashboard → Verwijderen**, of via het startmenu.

## Gebruik

Druk op **Alt** om het menu te tonen.

| Toets | Wat |
|---|---|
| Ctrl+E | Achterkant (bewerken) openen of sluiten |
| F5 | Herladen |
| F11 | Volledig scherm |
| Ctrl + / Ctrl − / Ctrl 0 | Groter / kleiner / normaal |
| Ctrl+, | Adres van het dashboard wijzigen |

Is de NAS niet bereikbaar, dan zie je een melding en probeert het programma het elke 15 seconden opnieuw.
Venstergrootte, positie en het adres worden onthouden.

## Zelf opnieuw bouwen

Nodig: Node.js en NSIS (`makensis`).

```
npm install
npm run dist
```

Het installatiebestand komt in `dist/`.
