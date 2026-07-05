/**
 * Voice transcript normalization for financial commands.
 *
 * Web Speech API on mobile/Safari produces phonetic approximations that
 * break the intent parser. This module runs normalization passes before
 * the transcript reaches the command state.
 *
 * Supports English and Spanish (es-*) device locales:
 *   Spanish pass (if lang starts with "es"):
 *     "envía cien pesos a mamá" → "send 100 COP to mom"
 *   English pass (always):
 *     "one thousand" → "1000", "twenty five" → "25", "kiss" → "KES"
 */

// ── English number tables ────────────────────────────────────────────────────

export const VOICE_TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export const VOICE_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  ...VOICE_TENS,
  hundred: 100, thousand: 1000,
};

// ── Spanish number tables ────────────────────────────────────────────────────

const ES_TENS = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

const ES_NUMBERS = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  ...ES_TENS,
  cien: 100, ciento: 100, mil: 1000,
};

// ── Spanish → English phrase tables ─────────────────────────────────────────

const ES_ACTIONS = [
  [/\b(envía|envia|manda|mandame|transfiere|transfierele|paga|págate|pagar)\b/gi, "send"],
  [/\b(ahora|ya mismo|inmediatamente)\b/gi, "now"],
  [/\b(hoy)\b/gi, "today"],
  [/\b(mañana|manana)\b/gi, "tomorrow"],
  [/\b(cada)\b/gi, "every"],
  [/\b(dólares|dolares)\b/gi, "USDC"],
];

// Family aliases translate directly to the English labels the intent parser expects.
const ES_FAMILY = [
  [/\b(mamá|mama|mami|madre)\b/gi, "mom"],
  [/\b(papá|papa|papi|padre)\b/gi, "dad"],
  [/\b(hermana|hermana menor|hermana mayor)\b/gi, "sister"],
  [/\b(hermano|hermano menor|hermano mayor)\b/gi, "brother"],
  [/\b(tía|tia)\b/gi, "aunt"],
  [/\b(tío|tio)\b/gi, "uncle"],
  [/\b(abuela)\b/gi, "grandma"],
  [/\b(abuelo)\b/gi, "grandpa"],
  [/\b(esposa|mujer)\b/gi, "wife"],
  [/\b(esposo|marido)\b/gi, "husband"],
  [/\b(amigo|amiga)\b/gi, "friend"],
];

// Directional prepositions: "a mamá" → "to mom" (after family translation runs first).
const ES_PREPOSITIONS = [
  [/\ba\b(?=\s+(?:mom|dad|sister|brother|aunt|uncle|grandma|grandpa|wife|husband|friend))/gi, "to"],
];

// LATAM currencies — map spoken names to corridor codes.
// "pesos" alone defaults to COP (most common in this app's market).
// Explicit regional qualifiers ("pesos mexicanos") override it.
const ES_CURRENCIES = [
  [/\b(pesos?\s+mexicanos?|pesos?\s+de\s+méxico|pesos?\s+mxn)\b/gi, "MXN"],
  [/\b(pesos?\s+colombianos?|pesos?\s+de\s+colombia|pesos?\s+cop)\b/gi, "COP"],
  [/\b(pesos?\s+chilenos?|pesos?\s+de\s+chile|pesos?\s+clp)\b/gi, "CLP"],
  [/\b(reais?|reales?|brl)\b/gi, "BRL"],
  [/\b(soles?|pen)\b/gi, "PEN"],
  [/\b(nairas?|ngn)\b/gi, "NGN"],
  [/\bpesos?\b/gi, "COP"],
];

// ── Spanish normalization pass ───────────────────────────────────────────────

function applySpanishNormalization(text) {
  let out = text;

  // Currencies first (before general number/word passes so "mil pesos" → "1000 COP" cleanly)
  for (const [pattern, replacement] of ES_CURRENCIES) {
    out = out.replace(pattern, replacement);
  }

  // Action verbs
  for (const [pattern, replacement] of ES_ACTIONS) {
    out = out.replace(pattern, replacement);
  }

  // Family words before prepositions so "a mamá" becomes "to mom" correctly
  for (const [pattern, replacement] of ES_FAMILY) {
    out = out.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of ES_PREPOSITIONS) {
    out = out.replace(pattern, replacement);
  }

  // Compound Spanish tens-ones: "veinte cinco" → "25", "treinta-dos" → "32"
  out = out.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)[\s-](uno?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
    (_, tens, ones) =>
      String((ES_TENS[tens.toLowerCase()] || 0) + (ES_NUMBERS[ones.toLowerCase()] || 0)),
  );

  // Hundreds: "ciento veinte" → "120", "cien" → "100"
  out = out.replace(
    /\b(cien(?:to)?)\s+(\d+)\b/gi,
    (_, _cien, rest) => String(100 + Number(rest)),
  );

  // Single Spanish number words
  out = out.replace(
    /\b(cero|uno?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[ée]is|diecisiete|dieciocho|diecinueve|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien(?:to)?|mil)\b/gi,
    (word) => String(ES_NUMBERS[word.toLowerCase().replace("é", "e")] ?? word),
  );

  return out;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Normalize a raw voice transcript before handing it to the intent parser.
 *
 * @param {string} text — raw transcript from Web Speech API
 * @param {string} lang — BCP-47 locale from navigator.language (e.g. "es-CO", "en-US")
 */
export function normalizeVoiceTranscript(text, lang = "en") {
  let out = text;

  if (/^es\b/i.test(lang) || /^pt\b/i.test(lang)) {
    out = applySpanishNormalization(out);
  }

  // English compound tens-ones: "twenty five" → "25", "forty-two" → "42"
  out = out.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tens, ones) =>
      String((VOICE_TENS[tens.toLowerCase()] || 0) + (VOICE_NUMBERS[ones.toLowerCase()] || 0)),
  );

  // English "X hundred Y": "one hundred fifty" → "150", "two hundred" → "200"
  out = out.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+(\d+|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?))?/gi,
    (_, multiplier, remainder) => {
      const base = (VOICE_NUMBERS[multiplier.toLowerCase()] || 0) * 100;
      const extra = remainder ? Number(remainder.replace(/\D+/g, "")) || 0 : 0;
      return String(base + extra);
    },
  );

  // English single number words (including "thousand")
  out = out.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/gi,
    (word) => String(VOICE_NUMBERS[word.toLowerCase()] ?? word),
  );

  // KES homophones
  out = out.replace(/\b(kiss|case|keys|kez)\b/gi, "KES");

  return out;
}
