import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";

process.env.DB_STORAGE = "/tmp/wake-up-device-ec2-contract.sqlite";
const { app } = await import("../server.ts");

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

before(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("protects the EC2 console with OIDC login", async () => {
    const response = await fetch(`${baseUrl}/ec2`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location") ?? "", /^\/auth\/login\?returnTo=/);
});

test("rejects protected JSON routes without exposing automation data", async () => {
    const response = await fetch(`${baseUrl}/ec2/runs`, { redirect: "manual" });
    assert.equal(response.status, 401);
});
