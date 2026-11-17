import { afterEach, describe, expect, it, vi } from "vitest";
import { apiMessages } from "@/lib/api/messages";
import { readApi, readView, settleRead, type ReadSettled } from "@/lib/api/read";

afterEach(() => vi.unstubAllGlobals());

type Data = { rows: number[] };
const answer = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("readApi", () => {
  it("gets the route with the session cookie and no caching, and returns the data as sent", async () => {
    const fetchMock = answer({ rows: [1, 2] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await readApi<Data>("/api/jobs?view=mine")).toEqual({ ok: true, data: { rows: [1, 2] } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/jobs?view=mine");
    expect(init).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    expect(init.body).toBeUndefined();
  });

  it("hands the abort signal to fetch, so a newer request can cancel this one", async () => {
    const fetchMock = answer({ rows: [] });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await readApi<Data>("/api/x", { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("uses the message and sign-in address of an error answer (401)", async () => {
    vi.stubGlobal("fetch", answer({ status: "error", message: apiMessages.signedOut, redirectTo: "/login?next=%2Fjobs" }, 401));
    expect(await readApi<Data>("/api/x")).toEqual({ ok: false, message: apiMessages.signedOut, redirectTo: "/login?next=%2Fjobs" });
  });

  it("uses the message of an error answer that has no address (database down)", async () => {
    vi.stubGlobal("fetch", answer({ status: "error", message: "เชื่อมต่อฐานข้อมูลไม่ได้" }, 503));
    expect(await readApi<Data>("/api/x")).toEqual({ ok: false, message: "เชื่อมต่อฐานข้อมูลไม่ได้", redirectTo: null });
  });

  it.each(["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)", 5])("drops a redirectTo that leaves the site: %s", async (redirectTo) => {
    vi.stubGlobal("fetch", answer({ status: "error", message: "x", redirectTo }, 401));
    expect(await readApi<Data>("/api/x")).toMatchObject({ ok: false, redirectTo: null });
  });

  it("says something unexpected happened when an error answer is not our JSON, or has no message", async () => {
    for (const fetchMock of [answer("<html>Internal Server Error</html>", 500), answer({ status: "error" }, 500), answer({ message: "" }, 500), answer("null", 502)]) {
      vi.stubGlobal("fetch", fetchMock);
      expect(await readApi<Data>("/api/x")).toEqual({ ok: false, message: apiMessages.unexpected, redirectTo: null });
    }
  });

  it("says the network is down when fetch fails (offline, server restarting)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await readApi<Data>("/api/x")).toEqual({ ok: false, message: apiMessages.network, redirectTo: null });
  });

  it("does not trust a success that is not a JSON object (a proxy's login page, null, a number)", async () => {
    for (const fetchMock of [answer("<html>please sign in</html>"), answer("null"), answer("5"), answer("")]) {
      vi.stubGlobal("fetch", fetchMock);
      expect(await readApi<Data>("/api/x")).toEqual({ ok: false, message: apiMessages.unexpected, redirectTo: null });
    }
  });
});

describe("settleRead / readView — what the screen shows while requests come and go", () => {
  const first: ReadSettled<Data> = settleRead(null, "0|/api/x?a=1", { ok: true, data: { rows: [1] } });

  it("is loading with nothing to show before the first answer", () => {
    expect(readView<Data>(null, "0|/api/x?a=1")).toEqual({ data: null, error: null, loading: true });
  });

  it("shows the data, not loading, once the answer for the current request is in", () => {
    expect(first).toEqual({ key: "0|/api/x?a=1", data: { rows: [1] }, error: null });
    expect(readView(first, "0|/api/x?a=1")).toEqual({ data: { rows: [1] }, error: null, loading: false });
  });

  it("keeps the previous data on screen while a different request (new filter, reload) is on its way", () => {
    expect(readView(first, "0|/api/x?a=2")).toEqual({ data: { rows: [1] }, error: null, loading: true });
    expect(readView(first, "1|/api/x?a=1")).toEqual({ data: { rows: [1] }, error: null, loading: true });
  });

  it("keeps the previous data under the message when a later request fails", () => {
    const failed = settleRead(first, "1|/api/x?a=1", { ok: false, message: "ล่ม", redirectTo: null });
    expect(failed).toEqual({ key: "1|/api/x?a=1", data: { rows: [1] }, error: "ล่ม" });
    expect(readView(failed, "1|/api/x?a=1")).toEqual({ data: { rows: [1] }, error: "ล่ม", loading: false });
  });

  it("has no data when the very first request fails", () => {
    const failed = settleRead<Data>(null, "0|/api/x", { ok: false, message: "ล่ม", redirectTo: null });
    expect(readView(failed, "0|/api/x")).toEqual({ data: null, error: "ล่ม", loading: false });
  });

  it("does not show an old error for a newer request, and a good answer clears it", () => {
    const failed = settleRead(first, "1|/api/x?a=1", { ok: false, message: "ล่ม", redirectTo: null });
    expect(readView(failed, "2|/api/x?a=1").error).toBeNull();
    const recovered = settleRead(failed, "2|/api/x?a=1", { ok: true, data: { rows: [2] } });
    expect(readView(recovered, "2|/api/x?a=1")).toEqual({ data: { rows: [2] }, error: null, loading: false });
  });
});
