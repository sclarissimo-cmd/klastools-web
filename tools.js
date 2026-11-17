// Catalogus van de startpagina: rubrieken en tools. Pas hier de indeling aan.
// map = mapnaam in build/web/ (= widgetnaam in kleine letters); jaren = [van, tot] leerjaar (1..6).
// Een rubriek zonder tools wordt niet getoond. Volgorde hier = volgorde op de pagina.
var RUBRIEKEN = [
  { id: 'klas', naam: 'Klasmanagement', uitleg: 'Tijd, beurten en rust in de klas.' },
  { id: 'samen', naam: 'Leerlingen doen mee', uitleg: 'Iedereen antwoordt, met een eigen toestel of door handen te tellen.' },
  { id: 'getallen', naam: 'Rekenen – getallen', uitleg: 'Getallen en breuken zichtbaar maken.' },
  { id: 'meten', naam: 'Rekenen – meten en tijd', uitleg: 'Klok, geld en maten.' },
  { id: 'taal', naam: 'Taal', uitleg: 'Woorden, letters en zinnen.' }
];

var TOOLS = [
  { map: 'timer', naam: 'Timer', rubriek: 'klas', jaren: [1, 6],
    tekst: 'Aftellen in uren, minuten en seconden, digitaal of als zandloper, met een bel. Ook een stopwatch.' },
  { map: 'stemmen', naam: 'Stemmen', rubriek: 'samen', jaren: [1, 6],
    tekst: 'Leerlingen stemmen met hun gsm of tablet via een QR-code, of je telt handen. Meerkeuze, ja/nee, duim, schaal en woordwolk.' },
  { map: 'getalbeelden', naam: 'Getalbeelden', rubriek: 'getallen', jaren: [1, 2],
    tekst: 'Eierdozen in tienstructuur met gekleurde bollen. Twee dozen voor de brug over 10.' },
  { map: 'honderdveld', naam: 'Honderdveld', rubriek: 'getallen', jaren: [1, 3],
    tekst: 'Honderdveld van 10 x 10 met gekleurde bollen. Kleur een vakje of meteen een hele rij.' },
  { map: 'breuken', naam: 'Breuken', rubriek: 'getallen', jaren: [3, 6],
    tekst: 'Chocoladerepen en taarten in gelijke stukken, met de breuk en het percent erbij.' },
  { map: 'klok', naam: 'Klok', rubriek: 'meten', jaren: [1, 4],
    tekst: 'Wijzerklok en digitale klok samen, met de Vlaamse bewoording: “kwart over drie”.' },
  { map: 'geld', naam: 'Geld', rubriek: 'meten', jaren: [1, 6],
    tekst: 'Geldbordje met euromunten en -biljetten: leggen en tellen, een bedrag leggen met zo weinig mogelijk stukken, wisselgeld teruggeven.' }
];
