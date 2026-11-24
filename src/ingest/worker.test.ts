import { describe, expect, it } from "vitest";
import worker from "../../worker/index";

describe("the Cloudflare Worker's scheduled handler", () => {
  it("fails the invocation when the run cannot start, instead of reporting success", async () => {
    // No DATABASE_URL: nothing to connect to. The handler must reject, so the platform records a failed run.
    await expect(worker.scheduled({ scheduledTime: Date.now(), cron: "*/5 * * * *" }, {} as never)).rejects.toThrow("DATABASE_URL is not set");
  });

  it("serves nothing: it exists only to run on its schedule", async () => {
    expect((await worker.fetch()).status).toBe(404);
  });
});
