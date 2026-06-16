import assert from "node:assert/strict";
import test from "node:test";
import { uniqueAddresses } from "./history.js";

test("uniqueAddresses keeps valid gateway addresses once", () => {
  const addresses = uniqueAddresses([
    "0xB555CC778c50e02f8b56358B153c0BEBBfA45563",
    "0xb555cc778c50e02f8b56358b153c0bebbfa45563",
    "not-an-address",
    "",
    "0x6567e9e2AdDf00C964DD74C4FBe9A8917A04abD3",
  ]);

  assert.deepEqual(addresses, [
    "0xB555CC778c50e02f8b56358B153c0BEBBfA45563",
    "0x6567e9e2AdDf00C964DD74C4FBe9A8917A04abD3",
  ]);
});
