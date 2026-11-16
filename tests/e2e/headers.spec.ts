import { expect, test } from "@playwright/test";

// The security headers are set in next.config.ts. These tests read them from the
// running production server, the same one Vercel runs.

test("pages carry exactly one strict content security policy and the other security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp.split(",").length, "one policy, not two stacked").toBe(1);
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/'unsafe-eval'/);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("API responses and data files get the same security headers", async ({ request }) => {
  for (const path of ["/catalog.json", "/status.json"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-security-policy"], path).toContain("default-src 'self'");
    expect(response.headers()["cache-control"], path).toContain("must-revalidate");
  }
});
