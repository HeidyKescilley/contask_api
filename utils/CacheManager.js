const NodeCache = require("node-cache");
const logger = require("../logger/logger");

class CacheManager {
  constructor(options = { stdTTL: 900, checkperiod: 120 }) {
    this.cache = new NodeCache(options);
    this.registry = {};
  }

  register(key, fetchFunction) {
    this.registry[key] = fetchFunction;
  }

  async getOrFetch(key, fetchFunction) {
    let data = this.cache.get(key);
    if (!data) {
      const fn = fetchFunction || this.registry[key];
      if (!fn) throw new Error(`No fetch function for cache key: ${key}`);
      const result = await fn();
      data = JSON.parse(JSON.stringify(result));
      this.cache.set(key, data);
    }
    return data;
  }

  invalidate(keys) {
    keys.forEach((key) => this.cache.del(key));
  }

  invalidateByPrefix(prefix) {
    const keysToDelete = this.cache
      .keys()
      .filter((key) => key.startsWith(prefix));
    if (keysToDelete.length > 0) {
      this.cache.del(keysToDelete);
      logger.info(
        `Caches invalidados com prefixo '${prefix}': ${keysToDelete.join(", ")}`
      );
    }
  }

  async reload(key) {
    const fn = this.registry[key];
    if (!fn) throw new Error(`No registered fetch function for cache key: ${key}`);
    this.cache.del(key);
    const result = await fn();
    const data = JSON.parse(JSON.stringify(result));
    this.cache.set(key, data);
    return data;
  }

  async reloadAllGlobal() {
    await this.reload("companies_all");
    await this.reload("recent_companies");
    await this.reload("recent_active_companies");
    await this.reload("recent_status_changes");
  }

  async reloadMyCompanies(userId) {
    const key = `my_companies_${userId}`;
    if (!this.registry[key]) return null;
    return this.reload(key);
  }
}

module.exports = new CacheManager();
