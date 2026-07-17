/**
 * Репозиторий профиля пользователя (TASK-010). Единственная строка (id=1) в
 * user_profile; при отсутствии создаётся дефолтный профиль
 * (DEFAULT_USER_PROFILE_FIELDS из shared — INV4, без ручных дублей дефолтов).
 * JSON-поля (overlay_positions/notifications_config/widgets_config) хранятся
 * как TEXT и (де)сериализуются здесь.
 */
import { DEFAULT_USER_PROFILE_FIELDS, UserProfileSchema, type UserProfile } from '@shared/schemas/userProfile'
import type { DatabaseInstance } from './openDatabase'

interface UserProfileRow {
  steam_id: string | null
  verbosity: string
  hotkey_expanded_panel: string
  draft_ranking_mode: string
  silent_mode: number
  overlay_positions: string
  notifications_config: string
  widgets_config: string
  created_at: string
  updated_at: string
}

function rowToProfile(row: UserProfileRow): UserProfile {
  return UserProfileSchema.parse({
    steamId: row.steam_id,
    verbosity: row.verbosity,
    hotkeyExpandedPanel: row.hotkey_expanded_panel,
    draftRankingMode: row.draft_ranking_mode,
    silentMode: row.silent_mode === 1,
    overlayPositions: JSON.parse(row.overlay_positions),
    notificationsConfig: JSON.parse(row.notifications_config),
    widgetsConfig: JSON.parse(row.widgets_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })
}

export class UserProfileRepository {
  constructor(private readonly db: DatabaseInstance) {}

  /** Возвращает профиль (id=1), создавая дефолтный при первом обращении. */
  getOrCreate(): UserProfile {
    const existing = this.selectRow()
    if (existing) {
      return rowToProfile(existing)
    }

    const now = new Date().toISOString()
    const profile: UserProfile = {
      ...DEFAULT_USER_PROFILE_FIELDS,
      createdAt: now,
      updatedAt: now
    }
    this.insertRow(profile)
    return profile
  }

  /** Частично обновляет профиль (кроме createdAt), проставляет updatedAt. */
  update(patch: Partial<Omit<UserProfile, 'createdAt' | 'updatedAt'>>): UserProfile {
    const current = this.getOrCreate()
    const next: UserProfile = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }
    this.db
      .prepare(
        `UPDATE user_profile SET
          steam_id = ?,
          verbosity = ?,
          hotkey_expanded_panel = ?,
          draft_ranking_mode = ?,
          silent_mode = ?,
          overlay_positions = ?,
          notifications_config = ?,
          widgets_config = ?,
          updated_at = ?
        WHERE id = 1`
      )
      .run(
        next.steamId,
        next.verbosity,
        next.hotkeyExpandedPanel,
        next.draftRankingMode,
        next.silentMode ? 1 : 0,
        JSON.stringify(next.overlayPositions),
        JSON.stringify(next.notificationsConfig),
        JSON.stringify(next.widgetsConfig),
        next.updatedAt
      )
    return next
  }

  private selectRow(): UserProfileRow | undefined {
    return this.db.prepare<[], UserProfileRow>('SELECT * FROM user_profile WHERE id = 1').get()
  }

  private insertRow(profile: UserProfile): void {
    this.db
      .prepare(
        `INSERT INTO user_profile (
          id, steam_id, verbosity, hotkey_expanded_panel, draft_ranking_mode,
          silent_mode, overlay_positions, notifications_config, widgets_config,
          created_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        profile.steamId,
        profile.verbosity,
        profile.hotkeyExpandedPanel,
        profile.draftRankingMode,
        profile.silentMode ? 1 : 0,
        JSON.stringify(profile.overlayPositions),
        JSON.stringify(profile.notificationsConfig),
        JSON.stringify(profile.widgetsConfig),
        profile.createdAt,
        profile.updatedAt
      )
  }
}
