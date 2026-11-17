import { afterEach, describe, expect, it, vi } from "vitest";
import { apiMessages } from "@/lib/api/messages";
import { callApi, formToJson } from "@/lib/api/call";

afterEach(() => vi.unstubAllGlobals());

type State = { status: "idle" } | { status: "error"; message: string } | { status: "done" };
const failed = (message: string): State => ({ status: "error", message });
const form = (entries: [string, string | Blob][]) => {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
};
const answer = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("formToJson", () => {
  it("keeps one value as a string and turns repeated names into an array", () => {
    expect(formToJson(form([["name", "สมชาย"], ["roles", "QC_INSPECTOR"], ["roles", "QA_INSPECTOR"]]))).toEqual({
      name: "สมชาย",
      roles: ["QC_INSPECTOR", "QA_INSPECTOR"],
    });
  });

  it("never sends files", () => {
    expect(formToJson(form([["a", "1"], ["file", new Blob(["secret"])]]))).toEqual({ a: "1" });
  });
});

describe("callApi", () => {
  it("posts the form as JSON to the same origin and returns the answer's state", async () => {
    const fetchMock = answer({ status: "done" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await callApi<State>("/api/auth/change-pin", "POST", form([["current", "123456"]]), failed);
    expect(result).toEqual({ state: { status: "done" }, redirectTo: null, refresh: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/change-pin");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ current: "123456" });
  });

  it("splits redirectTo from the state", async () => {
    vi.stubGlobal("fetch", answer({ status: "done", redirectTo: "/home", refresh: false }));
    expect(await callApi<State>("/api/x", "POST", form([]), failed)).toEqual({ state: { status: "done" }, redirectTo: "/home", refresh: false });
  });

  it("uses the JSON body of an error status as the state (validation messages, 401 with a login address)", async () => {
    vi.stubGlobal("fetch", answer({ status: "error", message: "PIN ปัจจุบันไม่ถูกต้อง" }, 403));
    expect(await callApi<State>("/api/x", "POST", form([]), failed)).toEqual({ state: { status: "error", message: "PIN ปัจจุบันไม่ถูกต้อง" }, redirectTo: null, refresh: false });
  });

  it("lifts `refresh` out of the state too: it asks the page to reload, it is not something to render", async () => {
    vi.stubGlobal("fetch", answer({ status: "error", message: "ผู้ตรวจบางคนไม่พร้อม", unavailable: ["22"], refresh: true }, 422));
    expect(await callApi<State>("/api/x", "POST", form([]), failed)).toEqual({
      state: { status: "error", message: "ผู้ตรวจบางคนไม่พร้อม", unavailable: ["22"] },
      redirectTo: null,
      refresh: true,
    });
    vi.stubGlobal("fetch", answer({ status: "done", refresh: "yes" }));
    expect((await callApi<State>("/api/x", "POST", form([]), failed)).refresh).toBe(false);
  });

  it.each(["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)", 5])("drops a redirectTo that leaves the site: %s", async (redirectTo) => {
    vi.stubGlobal("fetch", answer({ status: "done", redirectTo }));
    expect((await callApi<State>("/api/x", "POST", form([]), failed)).redirectTo).toBeNull();
  });

  it("hands the sent form to `failed`, so a long form can keep what was typed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const sent = form([["name", "Puma"]]);
    const keep = vi.fn((message: string, data: FormData): State => ({ status: "error", message: `${message} / ${data.get("name")}` }));
    const result = await callApi<State>("/api/x", "POST", sent, keep);
    expect(keep).toHaveBeenCalledWith(apiMessages.network, sent);
    expect(result.state).toEqual({ status: "error", message: `${apiMessages.network} / Puma` });
  });

  it("builds the screen's error state when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await callApi<State>("/api/x", "POST", form([]), failed)).toEqual({ state: { status: "error", message: apiMessages.network }, redirectTo: null, refresh: false });
  });

  it("builds the screen's error state when the answer is not our JSON", async () => {
    for (const fetchMock of [answer("<html>Internal Server Error</html>", 500), answer({ message: "no status field" }), answer("null")]) {
      vi.stubGlobal("fetch", fetchMock);
      expect(await callApi<State>("/api/x", "POST", form([]), failed)).toEqual({ state: { status: "error", message: apiMessages.unexpected }, redirectTo: null, refresh: false });
    }
  });
});
