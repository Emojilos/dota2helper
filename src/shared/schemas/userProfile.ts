/**
 * Zod-схема UserProfile (TASK-010): персистентная запись профиля пользователя
 * в SQLite. Расширяет AppSettingsSchema (TASK-004, уже включает overlayPositions
 * — TASK-014, widgetsConfig — TASK-017) полями, специфичными для хранилища
 * (конфиг уведомлений, таймстемпы), без дублирования уже описанных полей (INV4).
 *
 * Точная форма notifications_config определит её задача-владелец (TASK-019) —
 * до тех пор это произвольный JSON-объект.
 *
 * INV2: модуль чист (только zod).
 */
import { z } from 'zod'
import { AppSettingsSchema, DEFAULT_APP_SETTINGS } from './settings'

export const JsonConfigSchema = z.record(z.string(), z.unknown())
export type JsonConfig = z.infer<typeof JsonConfigSchema>

export const UserProfileSchema = AppSettingsSchema.extend({
  notificationsConfig: JsonConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})
export type UserProfile = z.infer<typeof UserProfileSchema>

/** Поля дефолтного профиля без таймстемпов (их проставляет репозиторий при создании). */
export const DEFAULT_USER_PROFILE_FIELDS: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
  ...DEFAULT_APP_SETTINGS,
  notificationsConfig: {}
}
