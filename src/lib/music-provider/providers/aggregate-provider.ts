import { IMusicProvider } from "../interface";
import {
  MusicSource,
  MusicTrack,
  SearchPageResult,
  SongLyric,
  SearchIntent,
} from "@/types/music";
import { mergeAndSortTracks } from "@/lib/utils/search-helper";
import { logger } from "@/lib/logger";

type ProviderResolver = (source: MusicSource) => IMusicProvider;

/**
 * 单个音源的搜索兜底超时。CapacitorHttp 原生请求不遵守 AbortSignal，
 * 个别站点（如 B 站风控挂起）会让 promise 永不 settle，
 * 若不设兜底会拖死整个 Promise.all，聚合搜索一直转圈。
 */
const PROVIDER_SEARCH_TIMEOUT_MS = 12000;

const EMPTY_PAGE: SearchPageResult<MusicTrack> = {
  items: [],
  hasMore: false,
};

export class AggregateProvider implements IMusicProvider {
  source = "aggregate" as const;
  constructor(
    private resolver: ProviderResolver,
    private getSources: () => MusicSource[]
  ) {}

  async search(
    query: string,
    page: number,
    count: number,
    signal?: AbortSignal,
    intent?: SearchIntent
  ): Promise<SearchPageResult<MusicTrack>> {
    const aggregatedSources = this.getSources();

    const results = await Promise.all(
      aggregatedSources.map(async (s) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const search = this.resolver(s).search(
            query,
            page,
            count,
            signal,
            intent
          );
          const timeout = new Promise<SearchPageResult<MusicTrack>>(
            (resolve) => {
              timer = setTimeout(
                () => resolve(EMPTY_PAGE),
                PROVIDER_SEARCH_TIMEOUT_MS
              );
            }
          );
          return await Promise.race([search, timeout]);
        } catch (e) {
          logger.warn("AggregateProvider", `Search failed for ${s}`, e);
          return EMPTY_PAGE;
        } finally {
          clearTimeout(timer);
        }
      })
    );

    if (signal?.aborted) return { items: [], hasMore: false };

    const merged = mergeAndSortTracks(
      results.flatMap((r) => r.items),
      query
    );

    return {
      items: merged,
      hasMore: results.every((r) => r.hasMore),
    };
  }

  async getUrl(_track: MusicTrack): Promise<string | null> {
    return null;
  }
  async getPic(_track: MusicTrack): Promise<string | null> {
    return null;
  }
  async getLyric(_track: MusicTrack): Promise<SongLyric | null> {
    return null;
  }
}
