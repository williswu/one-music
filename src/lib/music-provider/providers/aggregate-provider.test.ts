import { describe, expect, it, vi } from "vitest";
import { AggregateProvider } from "./aggregate-provider";
import type { IMusicProvider } from "../interface";
import type { MusicSource, MusicTrack } from "@/types/music";

const makeTrack = (id: string): MusicTrack => ({
  id,
  name: `Song ${id}`,
  artist: ["Artist"],
  album: "Album",
  pic_id: id,
  url_id: id,
  lyric_id: id,
  source: "netease",
});

const providerReturning = (tracks: MusicTrack[]): Partial<IMusicProvider> => ({
  search: async () => ({ items: tracks, hasMore: false }),
});

describe("AggregateProvider.search", () => {
  it("merges results from all sources", async () => {
    const provider = new AggregateProvider(
      (s: MusicSource) =>
        (
          ({
            netease: providerReturning([makeTrack("n1")]),
            qq: providerReturning([makeTrack("q1")]),
          }) as Partial<Record<MusicSource, IMusicProvider>>
        )[s]!,
      () => ["netease", "qq"]
    );

    const res = await provider.search("test", 1, 20);
    expect(res.items.map((t) => t.id).sort()).toEqual(["n1", "q1"]);
  });

  it("a hanging provider does not block the whole search (timeout fallback)", async () => {
    vi.useFakeTimers();
    try {
      const hanging: Partial<IMusicProvider> = {
        // 永不 settle —— 模拟 CapacitorHttp 原生请求挂起
        search: () => new Promise<never>(() => {}),
      };
      const provider = new AggregateProvider(
        (s: MusicSource) =>
          (
            ({
              netease: providerReturning([makeTrack("n1")]),
              bilibili: hanging,
            }) as Partial<Record<MusicSource, IMusicProvider>>
          )[s]!,
        () => ["netease", "bilibili"]
      );

      const promise = provider.search("孙燕姿", 1, 20);
      const settled = vi.fn();
      promise.then(settled);

      // 超时前不 settle
      await vi.advanceTimersByTimeAsync(11000);
      expect(settled).not.toHaveBeenCalled();

      // 超时后返回快音源的结果
      await vi.advanceTimersByTimeAsync(1500);
      expect(settled).toHaveBeenCalled();
      const res = await promise;
      expect(res.items.map((t) => t.id)).toEqual(["n1"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
