import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {distanceKm, validSignature} from "../src/controllers/payment/payment.js";

test("distance calculation identifies nearby coordinates", () => {
  assert.ok(distanceKm({latitude: 28.6139, longitude: 77.209}, {latitude: 28.614, longitude: 77.209}) < 0.1);
});

test("Razorpay signature validation rejects tampering", () => {
  const secret = "test-secret";
  const payload = "order_1|pay_1";
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(validSignature(payload, signature, secret), true);
  assert.equal(validSignature(`${payload}x`, signature, secret), false);
});
