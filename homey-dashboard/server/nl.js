'use strict';
// Technische (Engelse) foutmeldingen omzetten naar gewoon Nederlands.
const RULES = [
  [/fetch failed|getaddrinfo/i, 'Niet bereikbaar vanaf de NAS (geen verbinding met internet, de camera of de dienst). Controleer het adres en of het apparaat aan staat.'],
  [/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|socket hang up|ECONNRESET/i, 'Homey reageert niet. Staat Homey aan en is hij verbonden met het netwerk?'],
  [/ETIMEDOUT|timed? ?out|Timeout/i, 'Homey reageerde niet op tijd. Probeer het zo nog eens.'],
  [/ENOTFOUND|EAI_AGAIN/i, 'Het adres van Homey is niet te vinden. Controleer HOMEY_ADDRESS in docker-compose.yml.'],
  [/Missing Scopes?|scope/i, 'De Homey-sleutel mag dit niet. Maak een Homey-sleutel met meer rechten (zie de handleiding, hoofdstuk Voorbereiding).'],
  [/Invalid (Token|API Key)|Unauthorized|401/i, 'De Homey-sleutel wordt niet geaccepteerd. Controleer HOMEY_TOKEN in docker-compose.yml.'],
  [/\bNot ?Found\b|\b404\b/i, 'Dit bestaat niet (meer). Misschien is het in Homey verwijderd.'],
  [/Nog geen verbinding/i, 'Nog geen verbinding met Homey. Even geduld, of controleer of Homey aan staat.'],
  [/ENOSPC/i, 'De schijf van de NAS is vol.'],
  [/EACCES|EPERM/i, 'Het dashboard mag dit bestand op de NAS niet aanpassen (rechten).'],
  [/unavailable|offline/i, 'Het apparaat is niet bereikbaar.'],
  [/Unexpected token|JSON/i, 'Er kwam een onverwacht antwoord terug. Probeer het opnieuw.'],
];

function nl(err) {
  const msg = String((err && (err.message || err)) || '');
  if (!msg) return 'Er ging iets mis.';
  for (const [re, txt] of RULES) if (re.test(msg)) return txt;
  // geen Engelse woorden of foutcodes? dan is het al een eigen (Nederlandse) melding
  if (!/\b(the|is|are|not|cannot|can't|failed|error|invalid|unable|missing|unknown|unavailable|request|response|undefined|null)\b|\bE[A-Z]{4,}\b/i.test(msg)) return msg;
  return 'Er ging iets mis: ' + msg;
}

module.exports = { nl };
