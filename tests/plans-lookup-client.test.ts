import { afterEach, describe, expect, it, vi } from "vitest";
import { apiMessages } from "@/lib/api/messages";
import { lookupReceiptDocRemote } from "@/lib/plans/lookup-client";

afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("lookupReceiptDocRemote", () => {
  it("asks the lookup route with the document type and number (URL-encoded) and returns its result", async () => {
    const found = { kind: "new", docNoNormalized: "408/1234" };
    const fetchMock = answer({ status: "done", result: found });
    vi.stubGlobal("fetch", fetchMock);
    expect(await lookupReceiptDocRemote("PO", "408/1234 &x")).toEqual(found);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plans/lookup-doc?docType=PO&docNo=408%2F1234+%26x");
    expect(init).toMatchObject({ credentials: "same-origin" });
  });

  it("turns a refusal (signed out, database down) into the status box's error with the server's sentence", async () => {
    vi.stubGlobal("fetch", answer({ status: "error", message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", redirectTo: "/login" }, 401));
    expect(await lookupReceiptDocRemote("INVOICE", "INV-1")).toEqual({ kind: "error", message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" });
  });

  it("never throws: a dead network or a non-JSON answer is an error result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await lookupReceiptDocRemote("INVOICE", "INV-1")).toEqual({ kind: "error", message: apiMessages.network });

    for (const fetchMock of [answer("<html>500</html>", 500), answer({ status: "done" }), answer({ status: "done", result: { nokind: 1 } }), answer("null")]) {
      vi.stubGlobal("fetch", fetchMock);
      expect(await lookupReceiptDocRemote("INVOICE", "INV-1")).toEqual({ kind: "error", message: apiMessages.unexpected });
    }
  });
});
