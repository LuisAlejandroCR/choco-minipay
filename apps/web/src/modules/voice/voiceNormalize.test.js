import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVoiceTranscript } from "./voiceNormalize.js";

test("converts KES homophones to KES", () => {
  assert.equal(normalizeVoiceTranscript("send 50 kiss to mom"), "send 50 KES to mom");
  assert.equal(normalizeVoiceTranscript("send 50 case to mom"), "send 50 KES to mom");
  assert.equal(normalizeVoiceTranscript("send 50 keys to mom"), "send 50 KES to mom");
  assert.equal(normalizeVoiceTranscript("send 50 kez to mom"), "send 50 KES to mom");
  // does not replace mid-word
  assert.equal(normalizeVoiceTranscript("kisses for mom"), "kisses for mom");
});

test("converts single number words to digits", () => {
  assert.equal(normalizeVoiceTranscript("one KES to mom"), "1 KES to mom");
  assert.equal(normalizeVoiceTranscript("fifty KES to mom"), "50 KES to mom");
  assert.equal(normalizeVoiceTranscript("hundred KES to mom"), "100 KES to mom");
  // already a digit — unchanged
  assert.equal(normalizeVoiceTranscript("50 KES to mom"), "50 KES to mom");
});

test("converts compound number words to digits", () => {
  assert.equal(normalizeVoiceTranscript("twenty five KES to mom"), "25 KES to mom");
  assert.equal(normalizeVoiceTranscript("forty-two KES to mom"), "42 KES to mom");
  assert.equal(normalizeVoiceTranscript("ninety nine KES to mom"), "99 KES to mom");
});

test("handles case-insensitive number words and homophones", () => {
  assert.equal(normalizeVoiceTranscript("ONE KISS TO MOM"), "1 KES TO MOM");
  assert.equal(normalizeVoiceTranscript("Twenty Five Case"), "25 KES");
});

test("the original 'one kiss to mom' failure case", () => {
  // Voice: "one kiss to mom" → 1 KES to mom → parser reads "1 KES" correctly
  assert.equal(normalizeVoiceTranscript("one kiss to mom"), "1 KES to mom");
});

test("passes through text with no number words or homophones unchanged", () => {
  assert.equal(normalizeVoiceTranscript("send 10 KES to mom every 1st"), "send 10 KES to mom every 1st");
  assert.equal(normalizeVoiceTranscript(""), "");
});
