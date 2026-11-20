import { describe, expect, it } from "vitest";
import { activeReadIds, notificationReadKey, parseReadIds } from "@/lib/notifications/read-state";
import { mergeActiveReadIds, parseNotificationReadPayload } from "@/lib/notifications/read-validation";

describe("device notification receipts", () => {
  it("isolates accounts and safely handles unavailable or corrupt storage", () => {
    expect(notificationReadKey("person-1")).not.toBe(notificationReadKey("person-2"));
    for (const value of [null, "{", "null", "{}", "42"]) expect([...parseReadIds(value)]).toEqual([]);
    expect([...parseReadIds('["work:1",null,42,"work:1"]')]).toEqual(["work:1"]);
  });

  it("keeps outstanding work read but allows a returned or reassigned item to alert", () => {
    const read = new Set(["work:1:IN_PROGRESS", "work:2:IN_PROGRESS"]);
    expect([...activeReadIds(read, [{ id: "work:1:IN_PROGRESS" }, { id: "work:2:RETURNED" }])]).toEqual(["work:1:IN_PROGRESS"]);
    expect(activeReadIds(read, []).has("work:1:IN_PROGRESS")).toBe(false);
  });

  it("merges server-synced read IDs with local receipts and drops inactive IDs", () => {
    const merged = mergeActiveReadIds(
      ["work:1:IN_PROGRESS", "work:old:IN_PROGRESS"],
      new Set(["work:2:RETURNED"]),
      [{ id: "work:1:IN_PROGRESS" }, { id: "work:2:RETURNED" }, { id: "work:3:IN_PROGRESS" }],
    );
    expect([...merged]).toEqual(["work:1:IN_PROGRESS", "work:2:RETURNED"]);
  });

  it("validates read payloads, strips unsafe external hrefs, and deduplicates IDs", () => {
    const result = parseNotificationReadPayload({
      items: [
        { id: "work:1:IN_PROGRESS", kind: "returned", title: "ตีกลับ", href: "https://evil.example/phish" },
        { id: "work:1:IN_PROGRESS", kind: "returned", title: "ตีกลับล่าสุด", href: "/jobs?view=mine" },
      ],
    });
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          id: "work:1:IN_PROGRESS",
          woNo: null,
          kind: "returned",
          title: "ตีกลับล่าสุด",
          body: null,
          href: "/jobs?view=mine",
        },
      ],
    });

    const badHref = parseNotificationReadPayload({
      items: [{ id: "work:2", href: "//evil.example" }],
    });
    expect(badHref.ok).toBe(true);
    if (badHref.ok) expect(badHref.entries[0].href).toBeNull();

    const tooMany = parseNotificationReadPayload({
      ids: Array.from({ length: 201 }, (_, i) => `id-${i}`),
    });
    expect(tooMany.ok).toBe(false);
  });
});
