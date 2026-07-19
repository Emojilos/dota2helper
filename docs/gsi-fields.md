# Ревизия реальных GSI-полей (TASK-009, M0 DoD)

Документ фиксирует, что Dota 2 РЕАЛЬНО присылает в GSI-пакетах — по трём
захваченным сессиям в `test/fixtures/gsi/raw/`, а не по документации Valve
(которая местами устарела/неполна). Все выводы ниже проверены `jq`-запросами
по сырым пакетам, не додуманы.

## Сессии-источники

| Сессия | Режим | Покрытие стадий | Особенность |
|---|---|---|---|
| `session-2026-07-19-bot-match/` (1090 пакетов) | игрок (бот-лобби) | HERO_SELECTION → IN_PROGRESS (без POST_GAME, лобби не доиграно) | единственная сессия с переходом игрока в observer-подобный формат (см. ниже) |
| `ranked-1/` (11573 пакета, прорежено до 40МБ) | игрок (рейтинг) | WAIT_FOR_PLAYERS → HERO_SELECTION(144) → STRATEGY_TIME(74) → TEAM_SHOWCASE(50) → PRE_GAME(320) → IN_PROGRESS → POST_GAME(18), полная лестница | matchid 8904503190, победа радиантов |
| `spectate-1/` (141 пакет) | наблюдатель (зашёл в идущий матч) | IN_PROGRESS(117), POST_GAME(11); драфт-стадии нет | единственный источник данных формата `team2`/`team3` в чистом виде |

## Главный открытый вопрос ЗАКРЫТ: пики драфта игроку НЕ видны

`draft` = `{}` **во всех пакетах всех трёх сессий**, включая полную
рейтинговую стадию пиков (144 пакета `HERO_SELECTION`, объект `draft` пуст
в каждом). Никакого `generic_event` с типом вида `*PICK*` тоже нет — единственная
информация о драфте, которую отдаёт GSI игроку, это **баны** через
`generic_event`/`CHAT_MESSAGE_HERO_BANNED` (`{"type":"CHAT_MESSAGE_HERO_BANNED","value":<hero_id>,...}`).

Следствие для **TASK-027**: авто-детект вражеского/союзного пика через GSI
в игроцком режиме НЕВОЗМОЖЕН. Объём задачи — ручной ввод (или
полуавтомат на банах, если понадобится). Свой герой (`hero.id`) становится
известен сразу после собственного пика, ещё на стадии `HERO_SELECTION` —
до этого `hero.id = 0` и `hero` больше ничего не содержит; `hero.name`
подтягивается чуть позже `hero.id` (скрининг матчапа можно начинать раньше
загрузки карты, по `hero.id`).

Спектейт (`spectate-1`) драфт-стадию не захватил (наблюдатель зашёл в уже
идущий матч) — для наблюдательского режима вопрос формально открыт, но
продукт ориентирован на игрока, поэтому для объёма TASK-027 это не критично.

## Два принципиально разных формата пакета

### Формат «игрок» (свой клиент)

`player`, `hero`, `abilities`, `items` — плоские объекты, описывающие ТОЛЬКО
твоего героя. `buildings` содержит **только твою сторону** (см. ниже).
`couriers`, `roshan`, `neutralitems` — всегда `{}`. Это формат подавляющего
большинства пакетов в `ranked-1` и в начале `session-2026-07-19-bot-match`.

### Формат «наблюдатель» (`team2`/`team3`)

`player`, `hero`, `abilities`, `items`, `wearables` заменяются картами
`{ team2: { player0..player4 }, team3: { player0..player4 } }` — по ОДНОЙ
записи на каждого из 10 игроков (не только "твоего"). `buildings` содержит
**обе стороны** (`radiant` + `dire`). `couriers`, `roshan`, `neutralitems`
**полностью заполнены** (позиции, HP, `items_drop` Рошана и т.д.).
Наблюдательский `player.teamN.playerN` вдобавок содержит поля, которых НЕТ
в игроцком формате: `net_worth`, `hero_damage`, `hero_healing`,
`tower_damage`, `wards_purchased/placed/destroyed`, `runes_activated`,
`camps_stacked`, `gold_spent_on_buybacks`, разбивку урона
`damage_received/outgoing_(pre|post)_reduction_(physical|magical|pure)`.

Это подтверждённый формат `spectate-1` (100% пакетов). **Важная находка:**
тот же формат ненадолго появился и в `session-2026-07-19-bot-match`
(игроцкая сессия!) начиная с `game_time≈1743` (~29 мин) и до конца сессии —
одновременно с тем, как `buildings` в этой же сессии впервые получил ключ
`dire` (совпадение не случайно, см. ниже). Похоже, клиент переключается в
этот формат, когда игрок начинает "наблюдать" — например, после смерти
своего героя без баербека, свободной камерой, или после завершения матча
для его стороны в бот-игре. **Для парсера это значит: `team2`/`team3` формат
может прийти даже в обычной игроцкой сессии, не только при явном спектейте.**

### Известное следствие для парсера (найдено, НЕ исправлено — вне объёма TASK-009)

`src/shared/schemas/gsi.ts` (`GsiPlayerSchema`, `GsiHeroSchema`,
`GsiAbilitiesSchema`) требуют плоский формат (`player.steamid` обязателен,
`hero.id` обязателен и т.д.). Пакет в формате `team2`/`team3` **не проходит
эту схему** → `parseGameState` бросает `ZodError` → `GsiServer`
(`src/main/gsi/GsiServer.ts:208`) ловит это и отвечает `422`, **не обновляя
`this.latest`**. Краша нет (обработано корректно), но пока формат
держится (в бот-сессии — до конца записи, т.е. потенциально надолго),
всё состояние приложения (тайминги, advice, панели) замирает на последнем
валидном пакете. Это НЕ вымышленный edge-case — он реально наблюдался в
одной из трёх собранных сессий. Владельцу на заметку для будущей задачи:
парсер должен либо явно распознавать и игнорировать (не считать invalid)
`team2`/`team3`-пакеты, извлекая из них хотя бы `map`, либо GSI-cfg должен
быть донастроен так, чтобы такой режим не отправлялся вовсе.

## `buildings`: своя сторона всегда, вражеская — только после "раскрытия"

В игроцком формате `buildings` изначально содержит только ключ, совпадающий
с `player.team_name` игрока (в `ranked-1` игрок — `radiant`, и `buildings`
всю сессию = `{ radiant: {...} }`). В `session-2026-07-19-bot-match` ключ
`dire` появился впервые на `game_time≈1743` и остался до конца — то есть
вражеские постройки становятся видны в GSI, только когда хотя бы одна из
них "раскрыта" (получила урон/разрушена — глобальный статус на HUD Dota).
До этого момента у GSI попросту нет данных о состоянии вражеских построек.
Обе стороны (`radiant`+`dire`) видны сразу и всегда в наблюдательском
формате.

Структура одной постройки: `{ health, max_health }`, ключ — точное имя
сущности (`dota_goodguys_tower1_top`, `dota_goodguys_tower2_mid`,
`good_rax_melee_top`, `good_rax_range_top`, ... `tower4_top/bot`,
аналогично `dota_badguys_*`/`bad_rax_*` для дайров).

## `minimap`: работает даже при `"minimap": "0"` в cfg (наблюдательский режим)

В `spectate-1` cfg-флаг `minimap` был выставлен в `0` (лёгкий профиль
захвата), но ключ `minimap` всё равно присутствовал в пакетах — похоже,
наблюдательский режим этот флаг игнорирует. В игроцком режиме (`ranked-1`,
`minimap: "1"`) `minimap` — карта объектов `oN: { xpos, ypos, image, team,
yaw, unitname, visionrange }`; наблюдаемые `image`: `minimap_herocircle`,
`minimap_herocircle_self`, `minimap_enemyicon` (вражеский герой ПОД
видимостью), `minimap_courier`, `minimap_creep`, `minimap_death`,
`minimap_tower45/90`, `minimap_racks45/90`, `minimap_miscbuilding`,
`minimap_shop`, `minimap_secretshop`, `minimap_lotuspool`, `minimap_ward_obs`,
`minimap_watcher`, `minimap_ancient`, `minimap_underlord_portal`,
`minimap_plaincircle`. `minimap_enemyicon` — потенциальный (не
реализованный, вне объёма TASK-009) источник частичной информации о
видимых вражеских героях вне драфта.

## `events`: типы, реально встреченные

Массив `events[]`, каждый элемент — `{ game_time, event_type, ... }`.
Встреченные `event_type` (кроме `generic_event`, см. ниже):

| event_type | Поля | Частота (все сессии) |
|---|---|---|
| `bounty_rune_pickup` | `player_id, team, bounty_value, team_gold` | часто |
| `chat_message` | `player_id, channel_type, message` | часто |
| `roshan_killed` | `killed_by_team, killer_player_id` | редко, но присутствует в ИГРОЦКОМ формате |
| `aegis_picked_up` | `player_id, snatched` | редко, ИГРОЦКИЙ формат |
| `tip` | `sender_player_id, receiver_player_id, tip_amount` | средне |

**Важная находка:** `roshan_killed`/`aegis_picked_up` приходят как события
даже в игроцком формате, где сам объект `roshan` пуст (`{}`). Значит
тайминг смерти Рошана/подбора аегиса доступен игроку через `events`, БЕЗ
observer-режима — это снимает часть зависимости F3-напоминалок про
Рошана/Тормента от объекта `roshan` (полезно для будущей доработки
`timings`/`rules`, вне объёма TASK-009).

`generic_event` несёт `data` — JSON-строку вида
`{"type": "CHAT_MESSAGE_...", "value": ..., "playerid1": ..., "playerid2": ..., "time": ...}`.
Встреченные `type` (частотный топ по всем сессиям): `CHAT_MESSAGE_ITEM_PURCHASE`,
`CHAT_MESSAGE_HERO_KILL`, `CHAT_MESSAGE_HERO_BANNED` (баны в драфте, см.
выше), `CHAT_MESSAGE_INTHEBAG` (руна силы/богатства подобрана), `CHAT_MESSAGE_STREAK_KILL`,
`CHAT_MESSAGE_TOWER_KILL`, `CHAT_MESSAGE_RANK_WAGER`, `CHAT_MESSAGE_BARRACKS_KILL`,
`CHAT_MESSAGE_FIRSTBLOOD`, `CHAT_MESSAGE_SENTRY_WARD_KILLED`, `CHAT_MESSAGE_RUNE_BOTTLE`,
`CHAT_MESSAGE_SMOKE_ACTIVATED`, `CHAT_MESSAGE_GLYPH_USED`, `CHAT_MESSAGE_BUYBACK`,
`CHAT_MESSAGE_SUPER_CREEPS`, `CHAT_MESSAGE_PAUSE_COUNTDOWN`/`UNPAUSE_COUNTDOWN`,
`CHAT_MESSAGE_OBSERVER_WARD_KILLED`, `CHAT_MESSAGE_DISCONNECT`, `CHAT_MESSAGE_SCAN_USED`,
`CHAT_MESSAGE_COURIER_LOST`/`COURIER_RESPAWNED`, `CHAT_MESSAGE_TOWER_DENY`.

## `hero`: полный список реально наблюдаемых полей

`facet, xpos, ypos, id, name, level, xp, alive, respawn_seconds,
buyback_cost, buyback_cooldown, health, max_health, health_percent, mana,
max_mana, mana_percent, silenced, stunned, disarmed, magicimmune, hexed,
muted, break, aghanims_scepter, aghanims_shard, smoked, permanent_buffs
(карта активных баффов-объектов), has_debuff, talent_1..talent_8 (bool,
включённая ветка таланта на ур. 10/15/20/25), attributes_level`.
Только в наблюдательском формате дополнительно: `selected_unit` (bool, если
это выбранный юнит камеры наблюдателя).

`hero.id` заполняется раньше `hero.name` (замечено на `STRATEGY_TIME`:
пакет с `hero.id=25`, `hero.name` уже тоже есть — оба появляются практически
одновременно на первом пакете после пика, `id` не бывает известен без
`name` дольше одного пакета).

## `abilities`: слоты и "мусорные" способности Dota Plus

`abilities.abilityN` (`N` = 0..9+) — объект
`{ name, level, can_cast, passive, ability_active, cooldown, max_cooldown,
ultimate, [charges, max_charges, charge_cooldown — если способность с зарядами] }`.

**Слоты 0..4 — реальные способности героя** (обычно 0-2 = базовые скиллы,
3 — четвёртый скилл/врождённая пассивка (варьируется по герою), 4 —
ультимейт, `ultimate: true`). **Слоты 5+ — НЕ игровые способности героя**, а
Dota Plus/сезонные предметы (`plus_high_five`, `plus_guild_banner`,
`seasonal_dark_carnival_balloon/firework/pie` — наблюдались в фикстурах).
Каталог виджетов (`content/gsi-field-catalog.json`) сознательно ограничен
слотами 0-4.

## `items`: слоты и структура

`items.slotN` (`N`=0..8 — 6 основных + 3 рюкзак), `items.stashN` (`N`=0..5 —
стеш базы), `items.teleport0` (свиток ТП — отдельный слот, вне основных 6),
`items.neutralN` (`N`=0..1 — активный нейтральный предмет), `items.preserved_neutralN`
(`N`=6..10 — "законсервированные" нейтральные предметы прошлых тиров).
Каждый слот: `{ name }` (`"empty"`, если слот пуст) + опционально
`purchaser` (`player_slot` купившего), `item_level`, `can_cast`, `cooldown`,
`max_cooldown`, `passive`, `item_charges`, `charges`.

## `player`: игроцкий формат vs наблюдательский (важное расхождение)

Игроцкий `player` (плоский, про себя): `steamid, accountid, name, activity,
kills, deaths, assists, last_hits, denies, kill_streak, commands_issued,
kill_list (карта victimid_N→count), team_name, player_slot, team_slot, gold,
gold_reliable, gold_unreliable, gold_from_hero_kills, gold_from_creep_kills,
gold_from_summon_kills, gold_from_income, gold_from_shared, gpm, xpm`.

Наблюдательский `player.teamN.playerN` содержит ВСЕ те же поля **плюс**:
`net_worth, hero_damage, hero_healing, tower_damage, wards_purchased,
wards_placed, wards_destroyed, runes_activated, water_runes_activated,
bounty_runes_activated, camps_stacked, support_gold_spent,
consumable_gold_spent, item_gold_spent, gold_lost_to_death,
gold_spent_on_buybacks, damage_received_pre_reduction_(physical|magical|pure),
damage_received_post_reduction_(physical|magical|pure),
damage_outgoing_pre_reduction_(physical|magical|pure),
damage_outgoing_post_reduction_(physical|magical|pure)`.

**Значит: `net_worth` и вся расширенная статистика НЕДОСТУПНЫ живому GSI в
игроцком режиме** (только своя голда, не net worth). Для персональной
статистики уровня "networth сейчас" (бенчмарк-виджеты, TASK-039) нужен либо
STRATZ/OpenDota пост-фактум, либо приближение из `player.gold` + оценки трат
на предметы (`items`) — GSI живьём networth не отдаёт.

## `map`: полный список полей

`name, matchid, game_time, clock_time, daytime, nightstalker_night,
radiant_score, dire_score, game_state, paused, win_team, customgamename,
ward_purchase_cooldown`. `game_state` — реально встреченные значения:
`DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD`,
`DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD`, `DOTA_GAMERULES_STATE_HERO_SELECTION`,
`DOTA_GAMERULES_STATE_STRATEGY_TIME`, `DOTA_GAMERULES_STATE_TEAM_SHOWCASE`,
`DOTA_GAMERULES_STATE_PRE_GAME`, `DOTA_GAMERULES_STATE_GAME_IN_PROGRESS`,
`DOTA_GAMERULES_STATE_POST_GAME`. Стадия `TEAM_SHOWCASE` (демонстрация пиков
до входа на карту, ~50 пакетов в `ranked-1`) не была учтена в исходном плане
опроса — учтена здесь.

## `POST_GAME`: подтверждён полноценным

`map.win_team` (`"radiant"`/`"dire"`), `map.radiant_score`/`map.dire_score`,
`player.kills/deaths/assists` — все доступны и стабильны в 18 (`ranked-1`) и
11 (`spectate-1`) пакетах `POST_GAME`. Контракт `MatchCompletionDetector`
(TASK-033) подтверждён реальными данными.

## `league`, `wearables`, `provider`, `auth` — вспомогательные, не для каталога

`league.selection_priority` (`rules, previous/current_priority_team_id,
priority_team_choice, non_priority_team_choice, used_coin_toss`),
`league.league_id`, `league.match_id` — актуальны только для матчей лиг,
`league_id=0` вне лиги. `wearables.wearableN` — ID косметики, декоративно,
не нужно для F1-F5. `provider` (`name, appid, version, timestamp`) и `auth.token`
— служебные, уже используются `GsiServer` (TASK-005).

## `added`/`previously` — служебная диффа GSI, не поля состояния

Стандартный механизм GSI Valve: `added`/`previously` зеркалят структуру
пакета, показывая, какие секции изменились/были на предыдущем шаге
(`{"events": {"event": true}}`, `{"map": {...}}` и т.д.). Не несут игровых
данных сами по себе, `parseGameState` их не использует и не должен.

## Что попало в `content/gsi-field-catalog.json`

Каталог (F5, конструктор виджетов) наполнен ТОЛЬКО полями, наблюдаемыми
выше, с курируемым отбором (не механический дамп всех слотов — стеш-слоты
базы, `preserved_neutral6-10`, разбивка урона наблюдателя и т.п. в каталог
не включены как малополезные для live-оверлея игрока, но задокументированы
здесь как реально существующие). Категории соответствуют разделу 5.2 PRD:
`hero | player | match | abilities | items`; форматы — `int | percent |
time | gold | bool | text`. Все записи каталога `preset: false` — составные
виджеты (таймер руны, счётчик стаков) проектируются в TASK-016, это не
сырые поля. Каждая запись проверена unit-тестом
(`test/shared/gsiFieldCatalog.test.ts`) на реальное присутствие в
захваченном пакете `ranked-1`.
