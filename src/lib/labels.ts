/** Deutsche Namen für Felder und Werte aus /optionen. Unbekannte Werte erscheinen roh. */

export const FIELD_LABELS: Record<string, string> = {
  titel: 'Titel',
  format: 'Format',
  plattengroesse: 'Plattengröße',
  platten: 'Platten',
  breite: 'Breite',
  hoehe: 'Höhe',
  modus: 'Bildausschnitt',
  stil: 'Stil',
  relief: 'Relief',
  relief_hoehe: 'Reliefhöhe',
  teile: 'Teile im Bild',
  kontrast: 'Kontrast',
  saettigung: 'Sättigung',
  farbkategorien: 'Oberflächen',
  exotische_farben: 'Alle Sonderfarben',
  max_farben: 'Höchstens so viele Farben',
  dithering: 'Farbübergänge',
  staerke: 'Stärke der Übergänge',
  farbabstand: 'Farbvergleich',
  aufraeumen: 'Einzelne Pixel glätten',
  zerlegung: 'Teile zusammenfassen',
  rahmen: 'Rahmenbreite',
  rahmenfarbe: 'Rahmenfarbe',
  eckenfarbe: 'Eckenfarbe',
  rahmen_teile: 'Teile im Rahmen',
  rahmen_erhoehung: 'Rahmen erhöhen',
  unterbau: 'Unterbau',
  unterbaufarbe: 'Farbe des Unterbaus',
  ausgaben: 'Dateien',
}

export const FIELD_HINTS: Record<string, string> = {
  kontrast: '1 = unverändert',
  saettigung: '1 = unverändert',
  max_farben: '0 = so viele wie nötig',
  rahmen: 'In Noppen, 0 = ohne Rahmen',
  rahmen_erhoehung: 'Plates unter dem Rahmen',
  relief_hoehe: 'Höchste Stufe in Plates',
  staerke: '0 = harte Kanten, 1 = weiche Übergänge',
  exotische_farben: 'Metallic, Perlmutt, Transparent und mehr',
  aufraeumen: 'Ersetzt einzelne Pixel durch die Nachbarfarbe',
  plattengroesse: 'Noppen pro Platte',
}

export const VALUE_LABELS: Record<string, Record<string, string>> = {
  stil: { quadrat: 'Quadrate', formen: 'Formen', punkte: 'Punkte', noppen: 'Noppen' },
  unterbau: { art: 'LEGO-Art-Paneele', grundplatte: 'Grundplatte', platten: 'Große Plates', ohne: 'Ohne' },
  relief: { ohne: 'Flach', motiv: 'Motiv erhöht', hell: 'Helles erhöht', dunkel: 'Dunkles erhöht' },
  dithering: {
    nearest: 'Aus',
    floyd_steinberg: 'Floyd-Steinberg',
    atkinson: 'Atkinson',
    sierra_lite: 'Sierra Lite',
    ordered: 'Raster',
  },
  farbabstand: { cie76: 'Schnell (CIE76)', ciede2000: 'Genau (CIEDE2000)' },
  zerlegung: { single_stud: 'Nur 1×1-Teile', greedy: 'Große Teile zuerst' },
  modus: { zuschneiden: 'Zuschneiden', einpassen: 'Einpassen' },
  teile: { plate: 'Plates', tile: 'Tiles', brick: 'Bricks' },
  rahmen_teile: { plate: 'Plates', tile: 'Tiles', brick: 'Bricks' },
  farbkategorien: {
    solid: 'Uni',
    transparent: 'Transparent',
    metallic: 'Metallic',
    pearl: 'Perlmutt',
    chrome: 'Chrom',
    glitter: 'Glitzer',
    speckle: 'Gesprenkelt',
    satin: 'Satin',
    milky: 'Milchig',
    rubber: 'Gummi',
  },
  ausgaben: {
    preview_png: 'Vorschaubild',
    ldraw: '3D-Modell',
    parts_list_csv: 'Teileliste',
    official_parts_lists: 'Bestelllisten',
    instructions_png: 'Bauanleitung',
    result_json: 'Ergebnisdaten',
  },
  format: {
    mini: 'Mini',
    klein: 'Klein',
    quadrat: 'Quadrat',
    gross: 'Groß',
    riesig: 'Riesig',
    quer: 'Quer',
    hoch: 'Hoch',
    breit: 'Breit',
    panorama: 'Panorama',
    weltkarte: 'Weltkarte',
  },
}

export const STYLE_HINTS: Record<string, string> = {
  quadrat: 'Nur eckige Teile, klarer Pixel-Look',
  formen: 'Runde und schräge Teile glätten die Kanten',
  punkte: 'Runde Teile, wie bei LEGO Art',
  noppen: 'Das Bild entsteht aus Noppen',
}

export const valueLabel = (field: string, value: string | number) =>
  VALUE_LABELS[field]?.[String(value)] ?? String(value)

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field

/** Stile mit Formteilen: brauchen Plates/Tiles statt Bricks. */
export const SHAPE_STYLES = ['formen', 'punkte', 'noppen']
/** Stile, die einen Unterbau brauchen. */
export const BASE_STYLES = ['punkte', 'noppen']

/** Zahl im deutschen Format. */
export const number = (value: number, digits = 0) =>
  value.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits })

/** Noppen → Zentimeter (1 Noppe = 8 mm). */
export const studsToCm = (studs: number) => number(studs * 0.8, studs % 5 === 0 ? 0 : 1)
