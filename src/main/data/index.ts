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
export {
  MatchupRepository,
  type MatchupDataSource,
  type MatchupQueryResult,
  type MatchupRepositoryOptions
} from './MatchupRepository'
