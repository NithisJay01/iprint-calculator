import assert from "node:assert/strict";
import worker from "./index.js";

const baseEnv = {
  NOTION_TOKEN: "notion-token",
  WRITE_API_KEY: "staff-key",
  NOTION_DATA_SOURCE_ID: "presets-id",
  NOTION_MATERIALS_DATA_SOURCE_ID: "materials-id",
  NOTION_SERVICES_DATA_SOURCE_ID: "services-id",
  NOTION_CUSTOMERS_DATA_SOURCE_ID: "customers-id",
  NOTION_QUOTES_DATA_SOURCE_ID: "quotes-id",
  NOTION_TICKETS_DATA_SOURCE_ID: "tickets-id",
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: "items-id",
  TURNSTILE_EXPECTED_HOSTNAME: "iprint.tchl.online"
};

const publicRequest = token => {
  const form = new FormData();
  form.append("order", "{}");
  if (token) form.append("turnstileToken", token);
  return new Request("https://worker.test/public/orders", { method: "POST", body: form });
};

let response = await worker.fetch(publicRequest(), {
  ...baseEnv,
  PUBLIC_ORDER_ENABLED: "false"
});
assert.equal(response.status, 503);
assert.equal((await response.json()).code, "PUBLIC_ORDER_DISABLED");

response = await worker.fetch(publicRequest(), {
  ...baseEnv,
  PUBLIC_ORDER_ENABLED: "true"
});
assert.equal(response.status, 503);
assert.equal((await response.json()).code, "TURNSTILE_NOT_CONFIGURED");

response = await worker.fetch(publicRequest(), {
  ...baseEnv,
  PUBLIC_ORDER_ENABLED: "true",
  TURNSTILE_SECRET_KEY: "secret"
});
assert.equal(response.status, 400);
assert.equal((await response.json()).code, "TURNSTILE_REQUIRED");

const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
};

try {
  response = await worker.fetch(publicRequest("invalid-token"), {
    ...baseEnv,
    PUBLIC_ORDER_ENABLED: "true",
    TURNSTILE_SECRET_KEY: "secret"
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "TURNSTILE_FAILED");
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async (url, options = {}) => {
  assert.equal(String(url), "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  const body = options.body;
  assert.equal(body.get("secret"), "secret");
  assert.equal(body.get("response"), "valid-token");
  assert.ok(body.get("idempotency_key"));
  return Response.json({
    success: true,
    hostname: "iprint.tchl.online",
    action: "create_order"
  });
};

try {
  response = await worker.fetch(publicRequest("valid-token"), {
    ...baseEnv,
    PUBLIC_ORDER_ENABLED: "true",
    TURNSTILE_SECRET_KEY: "secret"
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "INVALID_ORDER");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Public order security test passed");
