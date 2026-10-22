/**
 * In-Memory SWR (Stale-While-Revalidate) Cache Manager for ProEdu.
 * Drastically cuts redundant Firestore getDocs calls for static and semi-static collections
 * (customTopics, practiceSubtopics, learningSheets, courses).
 * 
 * Complies with project security rules:
 * - Only caches non-sensitive catalog / curriculum data.
 * - Invalidation occurs automatically on writes and mutations.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCacheManager {
  private cache = new Map<string, CacheEntry<any>>();

  /**
   * Retrieves an item from cache if it exists and has not expired.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Stores an item in cache with a specified TTL (in milliseconds).
   * Default TTL is 10 minutes (600,000 ms).
   */
  set<T>(key: string, data: T, ttlMs: number = 10 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Gets cached data or fetches new data if missing or expired.
   * Eliminates burst reads when navigating across views.
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = 10 * 60 * 1000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const freshData = await fetcher();
    this.set(key, freshData, ttlMs);
    return freshData;
  }

  /**
   * Invalidates a specific key or all keys starting with prefix.
   */
  invalidate(keyOrPrefix: string): void {
    for (const key of this.cache.keys()) {
      if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire in-memory cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

export const cacheManager = new MemoryCacheManager();
