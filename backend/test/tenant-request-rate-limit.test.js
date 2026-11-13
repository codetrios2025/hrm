import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";

process.env.TENANT_SIGNUP_MODE = "approval";
const { default: app } = await import("../src/app.js");
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;

after(
  () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

test("signup request limiter allows five attempts per hour per IP", async () => {
  const responses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    responses.push(
      await fetch(`${baseUrl}/api/public/signup-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
  }
  assert.deepEqual(
    responses.map(({ status }) => status),
    [400, 400, 400, 400, 400, 429],
  );
});
