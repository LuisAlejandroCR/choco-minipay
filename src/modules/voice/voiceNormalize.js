/**
 * Voice transcript normalization for financial commands.
 *
 * Web Speech API on mobile/Safari produces phonetic approximations that
 * break the intent parser:
 *   "one kiss" → "1 KES"  (homophone + number word)
 *   "twenty five" → "25"   (word numbers)
 *
 * This module runs a single normalization pass on the raw transcript before
 * it reaches the command state. The user sees the normalized text in the
 * input box and can still edit before submitting.
 *
 * Exported separately so it can be unit-tested without mounting the full UI.
 */

export const VOICE_TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export const VOICE_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  ...VOICE_TENS,
  hundred: 100,
};

/**
 * Normalize a raw voice transcript before handing it to the intent parser.
 *
 * Passes applied in order:
 * 1. Compound tens-ones ("twenty five" → "25", "forty-two" → "42")
 * 2. Single number words ("one" → "1", "hundred" → "100")
 * 3. KES homophones ("kiss", "case", "keys", "kez" → "KES")
 */
export function normalizeVoiceTranscript(text) {
  return text
    .replace(
      /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
      (_, tens, ones) =>
        String((VOICE_TENS[tens.toLowerCase()] || 0) + (VOICE_NUMBERS[ones.toLowerCase()] || 0)),
    )
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi,
      (word) => String(VOICE_NUMBERS[word.toLowerCase()] || word),
    )
    .replace(/\b(kiss|case|keys|kez)\b/gi, "KES");
}
