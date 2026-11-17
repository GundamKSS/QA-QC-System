import { describe, expect, it, vi } from "vitest";
import { apiReadVersion, invalidateApiReads, subscribeApiReads } from "@/lib/api/invalidate";

describe("invalidateApiReads", () => {
  it("raises the version by one per call, so a request key built from it changes", () => {
    const before = apiReadVersion();
    invalidateApiReads();
    expect(apiReadVersion()).toBe(before + 1);
    invalidateApiReads();
    expect(apiReadVersion()).toBe(before + 2);
  });

  it("tells every subscriber, after the version has moved", () => {
    const seen: number[] = [];
    const a = vi.fn(() => seen.push(apiReadVersion()));
    const b = vi.fn();
    const offA = subscribeApiReads(a);
    const offB = subscribeApiReads(b);
    const before = apiReadVersion();
    invalidateApiReads();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([before + 1]);
    offA();
    offB();
  });

  it("stops telling a subscriber that unsubscribed", () => {
    const listener = vi.fn();
    const off = subscribeApiReads(listener);
    off();
    invalidateApiReads();
    expect(listener).not.toHaveBeenCalled();
  });

  it("tells the whole round even when a subscriber unsubscribes another during it", () => {
    const second = vi.fn();
    let offSecond = () => {};
    const offFirst = subscribeApiReads(() => offSecond());
    offSecond = subscribeApiReads(second);
    invalidateApiReads();
    expect(second).toHaveBeenCalledTimes(1);
    offFirst();
    invalidateApiReads();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
