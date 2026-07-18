/** Барель data-слоя main (TASK-021). */
export {
  StratzClient,
  createStratzClient,
  STRATZ_ENDPOINT,
  STRATZ_ATTRIBUTION,
  type StratzClientOptions
} from './StratzClient'
export { RateLimiter, StratzRateLimitError, type RateLimiterOptions } from './RateLimiter'
export {
  OpenDotaClient,
  createOpenDotaClient,
  OPENDOTA_ENDPOINT,
  OPENDOTA_ATTRIBUTION,
  type OpenDotaClientOptions
} from './OpenDotaClient'
export { MatchupCacheStore, type MatchupCacheGroup } from './MatchupCacheStore'
export { HeroPoolCacheStore, type HeroPoolCacheGroup } from './HeroPoolCacheStore'
export {
  DataService,
  type StratzDataSource,
  type OpenDotaDataSource,
  type DataServiceOptions
} from './DataService'
export {
  CacheWarmer,
  type CacheWarmerDataSource,
  type CacheWarmerProgress,
  type CacheWarmerOptions
} from './CacheWarmer'
