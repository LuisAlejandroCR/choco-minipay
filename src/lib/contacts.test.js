import assert from "node:assert/strict";
import test from "node:test";
import { contactLabelMatches } from "./contacts.js";

test("contactLabelMatches ignores case, spacing, and leading articles", () => {
  assert.equal(contactLabelMatches("Dad", " dad "), true);
  assert.equal(contactLabelMatches("Mum", "my mum"), true);
  assert.equal(contactLabelMatches("Brian", "the brian"), true);
});

test("contactLabelMatches keeps different contact labels separate", () => {
  assert.equal(contactLabelMatches("Dad", "Brian"), false);
});
