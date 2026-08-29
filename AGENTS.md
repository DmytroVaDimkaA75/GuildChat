# Task

Maintain and extend the GuildChat/FoEChat repository from the `feat/widgets` branch while preserving its active dark UI system, React Native architecture, Firebase Realtime Database schema, Cloud Functions contracts, notification routing, and native Android widget pipeline.

This is the repository-wide instruction file. Before implementing a concrete feature or fix, also read the active task-specific agent described in this file.

# Goal

Produce the smallest coherent change that:

- matches the active application as implemented on `feat/widgets`;
- uses the established dark visual language and the correct component pattern for the affected feature;
- preserves the active JavaScript React Native application, native Android widget integration, Firebase data contracts, role checks, and notification behavior;
- avoids schema drift, duplicate Firebase clients, cross-guild data leakage, stale widget data, unrelated refactors, and silent regressions;
- leaves the affected user workflow verifiably working.

# Context

## Branch and repository baseline

- The source baseline for these instructions is branch `feat/widgets`.
- The inspected baseline commit is `020592e1b77170f26759748bded2027ed9148ba2`.
- Before editing, run `git branch --show-current` and inspect the current branch state.
- If `feat/widgets` has advanced, treat the current repository implementation as authoritative and update assumptions by inspecting the code before changing it.
- Do not import architecture, styles, paths, or behavior from `main` or another branch unless the task explicitly requires a comparison or migration.

## Repository layout

The React Native application is at the repository root.

Important roots:

- `index.js`: active application registration, background FCM handler, Notifee background events, and Android widget headless task.
- `App.js`: application bootstrap, language, identity, presence, FCM token registration, guild/widget subscription handling, and initial navigation.
- `components/`: active React Native screens and reusable UI.
- `components/MainContent.js`: primary drawer/stack navigation, notification routing, app-wide dark navigation theme, and drawer UI.
- `constants/theme.ts`: canonical dark color tokens.
- `constants/roles.js`: canonical role values and access helpers.
- `src/`: shared notification, task, and utility logic.
- `functions/`: Firebase Cloud Functions.
- `android/app/src/main/java/com/foechat/mobile/widgets/`: native Android widget providers, worker, preferences, scheduler, and bridge-related implementation.
- `android/app/src/main/res/layout/`: widget layouts.
- `storage.rules`: deployed Firebase Storage path and file constraints.
- `docs/`: feature-specific technical handoffs and confirmed domain documentation.

The repository also contains Expo Router starter/template files under `app/` and TypeScript helper/template files. The active application entry is `index.js` importing `App.js`, not Expo Router. Do not treat `app/` starter screens as UI or navigation authority unless the task explicitly changes the application entry architecture.

## Technology

- Expo SDK 54 with native Android/iOS projects.
- React Native 0.81.x and React 19.
- Active React Native application code is JavaScript.
- React Navigation drawer and stack navigators.
- `@react-native-firebase/database`, `messaging`, `functions`, `storage`, and related native Firebase modules.
- Notifee for local notification channels and foreground/background notification handling.
- AsyncStorage for identity, preferences, notification routing state, and JavaScript-side widget cache.
- Native Android App Widgets implemented in Kotlin.
- Android WorkManager and Firebase native SDK for background widget refresh.
- i18next for localization.
- Cloud Functions v2, primarily in `europe-west1`.
- Firebase Storage with explicit path-specific rules.

## Instruction hierarchy

The repository-wide agent must be stored at:

`/AGENTS.md`

The active task-specific agent must be stored at:

`/codex/tasks/current/AGENTS.md`

Before planning or editing:

1. Read this root `AGENTS.md` completely.
2. Check whether `codex/tasks/current/AGENTS.md` exists.
3. If it exists, read it completely.
4. Treat this root file as the source of persistent architecture, UI, storage, security, and verification rules.
5. Treat the active task agent as the source of the current task goal, business rules, target screens, and acceptance criteria.
6. Task-specific instructions may refine feature behavior but must not weaken security, data integrity, branch isolation, least-change, or verification requirements.
7. Do not read agents under `codex/tasks/archive/` unless the user explicitly identifies one.
8. Do not infer requirements from old task agents, old branches, temporary files, or unrelated documentation.

# Repository Investigation

Before editing any code:

1. Confirm the current branch and inspect the working tree.
2. Read `index.js`, `App.js`, and the relevant navigation stack in `components/MainContent.js` when the task affects startup, routing, notifications, authentication, guild switching, or widgets.
3. Locate the active screen/component and verify that it is imported by an active route or active component.
4. Inspect all imports and all usages of each component, hook, utility, role helper, route, Firebase path, Storage path, native bridge method, or notification type being changed.
5. Search both client and `functions/` code for every affected Realtime Database path.
6. For widget work, inspect all four layers before changing behavior:
   - Firebase/Cloud Functions producer;
   - JavaScript refresh/cache code;
   - React Native native bridge;
   - Kotlin SharedPreferences/Worker/provider rendering.
7. Inspect the actual object shape written by active writers. Do not derive a schema only from readers or documentation.
8. Inspect cleanup behavior, transactions, listener teardown, retry behavior, loading states, errors, empty states, and cross-guild guards.
9. Inspect the closest active analogous component before creating a new UI pattern.
10. Confirm whether a similarly named file is active. Do not copy from `temp*`, backup files, numbered duplicates, old Expo Router templates, or unregistered screens.
11. If the task touches guarantee logic, read the current files under `docs/guarant/` and the active calculation code before editing.
12. If the task touches express leveling, read `docs/CHATGPT_HANDOFF.md`, `functions/expressWorkflow.js`, its tests, and all current express readers/writers.
13. If behavior is not defined by the task or active repository, preserve current behavior instead of inventing a rule.
14. Make the smallest coherent change and avoid unrelated cleanup.

# Existing Architecture

## Application entry and runtime

- `index.js` registers `App` with Expo.
- `index.js` also registers:
  - Notifee background press handling;
  - `GbgWidgetRefreshTask` as a headless task;
  - the Firebase Messaging background handler;
  - data-only widget FCM processing;
  - fallback widget refresh from Firebase.
- `App.js` owns bootstrap-level responsibilities such as language loading, current user/guild resolution, presence, FCM token/device registration, widget subscriptions, and setup-vs-main navigation.
- `components/MainContent.js` owns the active post-login drawer, nested stacks, role-gated routes, notification route validation, cross-guild notification switching, and local notification channels.
- Do not register the same background handler, headless task, or notification event in a second location.

## Firebase client

The active client uses `@react-native-firebase`.

Use imports such as:

- `database from '@react-native-firebase/database'`
- `storage from '@react-native-firebase/storage'`
- `messaging from '@react-native-firebase/messaging'`
- `functions from '@react-native-firebase/functions'`

Do not introduce the modular web Firebase JS SDK into an active flow.
Do not create a second Firebase app.
Do not use the obsolete `firebaseConfig.js` pattern from another branch as the architectural baseline.

## State and identity

Primary AsyncStorage identity keys:

- `userId`
- `guildId`
- `userLanguage`

Widget/device-related keys used by active code include:

- `widgetInstallationId`
- `widgetSubscriptionGuildId`
- `widgetSubscriptionUserId`
- `widget_gbg_next5`
- `widget_gbg_map_state`
- `widget_gbg_map_xml`
- `widget_gbg_updated_at`
- `widget_gbg_last_fcm`

Notification routing has its own shared utility under `src/notifications/notificationRouting`. Reuse that utility and its exact persisted key behavior; do not create another pending-route store.

`GuildContext` is the application-level source of the active guild once bootstrap is complete. Preserve coordinated updates between AsyncStorage, context, navigation, widget subscriptions, and notification routing during guild switches.

## Roles and access

Canonical role values from `constants/roles.js`:

- `guildLeader`
- `tester`
- `developer`
- `member`
- `GBGbot`
- `GBbot`

Use the existing helpers:

- `hasTesterFeatures`
- `hasLeaderFeatures`
- `canAccessGuildTasks`
- `getUkrainianRoleLabel`

Do not duplicate role strings or recreate role logic in individual screens.

Current access behavior:

- tester features are available to `tester` and `developer`;
- leader features are available to `guildLeader`, `tester`, and `developer`;
- guild tasks are restricted to `developer`;
- GBG/GB bot accounts must be filtered with the existing bot utilities where the surrounding feature does so.

## Navigation

The active navigator uses a dark `NavigationContainer` theme and nested drawer/stack navigators.

Preserve:

- existing route names;
- nested route structure;
- route parameter contracts;
- notification deep-link destinations;
- drawer `backBehavior="history"`;
- guild-specific remount behavior;
- role-gated drawer screens;
- back-button semantics;
- header actions and their disabled states.

Do not add a second `NavigationContainer` inside the authenticated application subtree.

## Notifications

The application uses Firebase Messaging plus Notifee.

Known notification/deep-link types include:

- `chat_message`
- `gbg_sector_open`
- `gbg_build_plan`
- `gbg_help`
- `culture_build_ready`
- `express_upgrade`
- `gbg_widget_refresh`
- `widget_gbg_next5`
- `widget_gbg_map_full`

Notification routing must continue to work for:

- foreground;
- background;
- cold start;
- pending route restoration;
- guild switching;
- route access validation;
- local displayed-notification cleanup.

Do not add a notification type in only one layer. Coordinate producer payload, normalization, persistence, validation, navigation, channel selection, and cleanup.

## Android widgets

The widgets are Android-native features, not ordinary React Native cards.

The widget pipeline includes:

- Firebase data and Cloud Function snapshot generation;
- data-only FCM refresh events;
- JavaScript cache writers in `components/GBG/widgetCache.js`;
- fallback refresh in `components/GBG/gbgWidgetRefresh.js`;
- `GbgWidgetBridge`;
- `GbgWidgetRefreshTask`;
- WorkManager refresh;
- native Firebase read of `guilds/{guildId}/GBG/widgetSnapshot`;
- `GbgWidgetPrefs`;
- the top-five sectors provider;
- the GBG map provider;
- Android XML layouts and raw SVG templates.

Native SharedPreferences file:

`gbg_widget_prefs`

Native keys:

- `next5_json`
- `map_meta_json`
- `map_svg_xml`
- `updated_at`
- `guild_id`
- `cache_guild_id`
- `snapshot_updated_at`

Widget invariants:

- cached data must belong to the currently active guild;
- switching guilds clears the old guild's widget cache immediately;
- a cache write from another guild must be rejected;
- stale snapshots must not replace newer snapshots;
- a complete native snapshot is committed atomically;
- WorkManager reports success only after readable cache state is committed;
- widget rendering must tolerate no snapshot, invalid snapshot, offline cache, and transient Firebase failure;
- the native worker supports only the declared widget snapshot schema version;
- `next5` contains at most five sanitized sector entries;
- platform-specific widget code must remain Android-only unless an explicit iOS widget task is requested.

Any change to widget schema, map key, cache key, FCM payload, bridge method, or snapshot freshness logic must update and verify every layer.

# Data Model

These paths are confirmed by active `feat/widgets` code. Preserve spelling, casing, ownership, and value types. A path list is not permission to overwrite its parent.

## Local identity and settings

### AsyncStorage

- `userId`: current user ID.
- `guildId`: current full guild/world key.
- `userLanguage`: selected language.
- widget installation/subscription keys listed under Existing Architecture.
- widget cache keys listed under Existing Architecture.

Do not log the complete AsyncStorage contents in production.

## Users

### `users/{userId}`

Known fields/children:

- `userName`: string
- `password`: legacy access value
- `fcmToken`: legacy/current single-device FCM token
- `userGuilds`
- `devices`
- `setting`

Do not overwrite the user root for a narrow update.

### `users/{userId}/userGuilds/{guildId}`

Known fields/children:

- `imageUrl`: guild-specific profile image URL
- `role`: canonical role string
- `settlement`: per-user, per-guild cultural settlement state

This is the current membership/settings branch. Do not write new data to the obsolete `users/{userId}/{guildId}` shape.

### `users/{userId}/devices/{installationId}`

Known fields:

- `fcmToken`
- `platform`
- `updatedAt`
- `widgetGuildId`

Device records and widget subscriptions must remain consistent when the active user or guild changes.

### `users/{userId}/setting`

Known children:

- `language`
- `timeZone`
- `schedules`
- `notificationMutes`

### `users/{userId}/setting/schedules/{scheduleId}`

A schedule stores one calendar representation:

- `weekly`, keyed by stable day keys `d0` through `d6`; or
- `rollingWeeks`, with:
  - `anchorAt`
  - `anchorDate`
  - `version`
  - `weeks/{wN}/days/{dN}`

Time slots contain the existing fields such as:

- `startMinutes`
- `endMinutes`
- `rangeId`
- `part`: `full`, `head`, or `tail`
- `scheduleId`

Keep compatibility readers for legacy numeric day/week keys unless an explicit migration removes them.

### `users/{userId}/setting/notificationMutes/gbgSectorOpen/{guildId}`

Stores the existing GBG sector notification mute representation, including mute deadline and scope.

### `users/{userId}/userGuilds/{guildId}/settlement`

Known fields/children:

- `settlementName`
- `status`: active flow values include `edit` and `game`
- `tech`
- `sectorObstaclesStatic`
- `openedSectors`
- `placedBuildings`

`placedBuildings` includes the existing building instance representation, including fields such as `instanceId`, `buildingId`, `footprint`, `rotation`, `placedAt`, `passive`, and `job`.

Do not move settlement state back under `guilds/{guildId}/guildUsers/{userId}`.

## Guilds

### `guilds/{guildId}`

Known fields/children:

- `guildName`
- `worldName`
- `guildUsers`
- `setting`
- `chats`
- `GBChat`
- `express`
- `GBG`
- `refreshTriggers`
- `taskSettings`

Use the full stored `guildId`. Do not reconstruct or truncate it except where an existing feature explicitly needs the short in-game guild identifier.

### `guilds/{guildId}/setting`

Known children:

- `GBGGoal`
- `telegram`

### `guilds/{guildId}/guildUsers/{userId}`

Known fields/children:

- `userName`
- `imageUrl`
- `presence`
- `greatBuild`

### `guilds/{guildId}/guildUsers/{userId}/presence`

Known fields:

- `state`
- `lastChanged`
- `lastActivityAt`

Preserve server timestamp usage and online/offline lifecycle behavior.

## Great Buildings

### `greatBuildings/{buildingId}`

Shared catalog.

Known fields include:

- `buildingName`: localized object or supported legacy string
- `buildingImage`: URL string or supported image object
- `levelBase`: external level-cost API base

Use the active language, normalized language code, Ukrainian fallback, English fallback, then an existing string fallback.

### `guilds/{guildId}/guildUsers/{userId}/greatBuild/{buildingId}`

Known fields/children include:

- `level`
- `lock`
- `contributors`
- `guarant`

Do not replace the whole building node to update one field.

### `.../contributors/{contributorId}`

Known reader-visible fields include:

- `forgePoints`
- `level`
- optional player identity fields used for external contributors

Preserve number types for Forge Point totals.

### `.../guarant`

Guarantee data is calculated and consumed by multiple screens and functions. Confirm the exact status/action schema in current code and `docs/guarant/` before editing.

Known status values include, among others:

- `empty_guaranteed`
- `empty_urgent_deposit`
- `empty_urgent_proportional_deposit`
- `guild_member_below_place_cost`
- `guild_member_can_be_overtaken`
- `empty_requires_owner_guarantee`
- no-action/ready states defined by the active guarantee implementation

Do not invent a status, color, message, or visibility rule.

### `guilds/{guildId}/refreshTriggers/greatBuildings`

A transaction-controlled millisecond timestamp used to request a Great Building refresh with a cooldown.

### `guilds/{guildId}/GBChat/{chatId}/messages/{messageId}`

Great Building chat is separate from standard chat. Inspect active readers/writers before changing fields.

## Express leveling

### Current grouped schema

`guilds/{guildId}/express/{chatId}`

Known structure:

- `scheduleTime`: millisecond timestamp
- `gbs/{gbRecordId}`
- `interested/{userId}`
- `ranks/{userId}`
- `reserve`
- `reserveSelected`
- `selectedOrder`
- `finalOrder`
- `workflow`

### `.../gbs/{gbRecordId}`

Known fields:

- `allowedGB`: Great Building ID
- `user`: owner user ID
- `levelThreshold`
- `rank`

### `.../interested/{userId}`

Known fields include:

- `owner`
- `contributionMultiplier`
- `confirmationTime`

Use `database.ServerValue.TIMESTAMP` for confirmation time and preserve the existing transaction that does not overwrite an existing confirmation.

### `.../workflow`

Known stage values include:

- `open`
- `postponement`
- `initial_confirmation`
- `reserve_confirmation`
- `final`

The scheduler owns state-machine advancement. UI code must not independently invent transitions.

### Compatibility

Legacy flat express records are still normalized for UI compatibility. The current scheduler intentionally processes the grouped workflow, not legacy records as new grouped workflows.

Do not remove compatibility handling or migrate existing records unless the task explicitly defines the migration.

### `expressNotificationLedger/{guildId}/{chatId}/{event_userId}`

Deduplication ledger for express notifications.

## Standard guild chat

### `guilds/{guildId}/chats/{chatId}`

Known fields/children:

- `type`: `private` or `group`
- `name`
- `members/{userId}`: truthy membership value
- `hiddenMembers/{userId}`: hidden bot membership where present
- `groupAvatar`
- `groupColor`
- `messages`
- `deletedFor/{userId}`

### `guilds/{guildId}/chats/{chatId}/deletedFor/{userId}`

Server timestamp for per-user soft deletion.

A chat remains hidden only until a later visible message exists. Preserve the existing deletion/visibility helper behavior.

### `guilds/{guildId}/chats/{chatId}/messages/{messageId}`

Known reader-visible fields include:

- `senderId`
- `text`
- `html`
- `timestamp`
- `authoredAt`
- `images`
- `imageUrl`
- `audioUrl`
- `readBy`
- reply, reaction, pin, translation, edit, temporary-message, and recipient fields used by `ChatWindow`

Do not treat this list as a complete write schema. Inspect the active message creation/edit/delete code and Cloud Function trigger before modifying messages.

## GBG data and widgets

### `guilds/{guildId}/GBG`

Known children:

- `map`
- `sectors`
- `opponents`
- `widgetSnapshot`

### `guilds/{guildId}/GBG/map`

Known map keys:

- `volcanic_archipelago`
- `waterfall_archipelago`

The compatibility normalizer also recognizes the current legacy spelling handled by active code. Reuse the normalizer.

### `guilds/{guildId}/GBG/sectors/{sectorId}`

Known fields read by screens/widgets include:

- `owner` or `ownerId`
- `color`
- `staff`
- `openTime`
- `army`
- `buildings`

Building entries use existing state/name/readiness fields. Preserve the active bonus calculation and map-neighbor data.

### `guilds/{guildId}/GBG/opponents/{opponentId}`

Known fields include:

- `id`
- `sectorColor`
- `staff`

### `guilds/{guildId}/GBG/widgetSnapshot`

Server-generated/native-readable snapshot.

Known fields:

- `schemaVersion`
- `guildId`
- `updatedAt`
- `mapKey`
- `next5`
- `sectorColors`
- `sectorStaff`

Each `next5` item is sanitized to known fields:

- `sectorId`
- `openTime`
- `army`: `attack`, `defense`, or empty
- `bonusValue`
- `bonusReadyAt`

Changing this schema requires synchronized changes in Cloud Functions, JavaScript refresh/cache logic, Kotlin worker validation/storage, and widget renderers.

### `widgetSubscriptions/{guildId}/{installationId}`

Known fields:

- `userId`
- `fcmToken`
- `platform`
- `updatedAt`

Only active guild members are valid widget recipients. Invalid tokens may trigger cleanup of subscription/device/legacy token paths.

## Guild tasks

### `guilds/{guildId}/taskSettings/automatic/{templateKey}`

Known fields include:

- `showBeforeMinutes`
- `text`

Access is restricted by the existing developer-role check.

## Communities

### `communities/{communityId}`

Known fields/children:

- `name`
- `description`
- `avatarUrl`
- `createdBy`
- `createdAt`
- `memberCount`
- `members`
- `channels`
- `categories`

### `communities/{communityId}/members/{userId}`

Known fields:

- `role`: `owner`, `moderator`, or `member`
- `joinedAt`

### `communities/{communityId}/channels/{channelId}`

Known fields:

- `name`
- `description`
- `categoryId`
- `order`
- `createdBy`
- `createdAt`

### `communities/{communityId}/categories/{categoryId}`

Known fields:

- `name`
- `order`
- `createdBy`
- `createdAt`

### `communityMemberships/{userId}/{communityId}`

Boolean membership index used by the community list.

### `communityMessages/{communityId}/{channelId}/{messageId}`

Community-channel messages are separate from guild chat messages. Inspect active send/edit/reaction/pin/delete code before changing their schema.

## Telegram

### `telegramBot/guildBindings/{guildId}`

Verified guild-to-Telegram binding.

### `guilds/{guildId}/setting/telegram`

Guild-visible Telegram binding status/error mirror.

Telegram credentials are Cloud Function secrets. Never expose the bot token to the client.

## Firebase Storage

Confirmed paths and limits from `storage.rules`:

- `images/{fileName}`: guild-chat image, image only, maximum 15 MiB.
- `voiceMessages/{chatId}/{fileName}`: voice message, audio or supported octet-stream, maximum 25 MiB.
- `guilds/{guildId}/chats/{chatId}/groupAvatar.jpg`: group avatar, image only, maximum 5 MiB.
- `communities/{communityId}/avatar.jpg`: community avatar, image only, maximum 5 MiB.
- `communityImages/{communityId}/{channelId}/{fileName}`: community message image, image only, maximum 15 MiB, deletable.
- `chatImages/{fileName}`: legacy image uploader path, image only, maximum 15 MiB.

Do not invent a new Storage folder when an established path fits.
Do not weaken Storage rules to make an upload succeed.
When an upload precedes a database write, clean up the uploaded object if the database operation fails and the feature already owns that cleanup responsibility.

# Business Rules

## Global

- Current repository behavior is authoritative unless the active task explicitly changes it.
- Guild-scoped operations must use the active full `guildId`.
- Writes must be scoped to the current user/guild/entity and must not replace broad parent nodes.
- Multi-location consistency must use `update`, transactions, or coordinated rollback.
- Realtime listeners must be removed with the same reference and callback.
- Server-owned timestamps and state transitions must remain server-owned.
- Bot users must be filtered with existing utilities where the feature expects human users only.
- Existing compatibility readers must remain until an explicit migration removes them.

## Chat

- A user sees a guild chat only when present in `members`.
- Per-user chat deletion writes `deletedFor/{userId}` and does not delete the shared chat.
- Messages newer than the soft-delete timestamp can make the chat visible again.
- Unread state is derived from messages not sent by the current user and not present in `readBy/{userId}`.
- Group creation includes the creator, selected users, and currently required hidden bot members.
- A group has either an uploaded avatar URL or an assigned fallback color.

## Express

- Owners are counted once even if also present in `interested`.
- Selection and confirmation follow the server workflow documented and tested in `functions/expressWorkflow.js`.
- Owners are always handled according to the current confirmed workflow rules.
- Confirmation timestamp order is meaningful and must not be overwritten.
- Active duplicate express scheduling for the same owner/Great Building is blocked by the existing shared transaction path.
- Manual cancellation must never delete another owner's Great Building record.
- Final completion removes only the completed Great Building; the final remaining Great Building removes the whole group.
- UI visibility and actions depend on workflow stage and membership in the selected/final sets.

## Widgets

- Never show data from a previously selected guild after guild switching.
- Reject cross-guild FCM/cache writes.
- Reject stale widget snapshots.
- Keep JavaScript and native cache representations consistent.
- Keep widget refresh data-only; do not display a user notification for a pure widget refresh event.
- Maintain fallback behavior when `widgetSnapshot` is absent.
- Do not rename headless task, bridge methods, SharedPreferences file, keys, or provider classes without a coordinated migration.

## Cultural settlement schedules

- Stable schedule keys are prefixed (`dN`, `wN`); legacy numeric keys remain readable.
- Overnight intervals are represented as `head` and `tail`.
- Preserve the user's stored time zone once set unless the user explicitly changes it.
- Manual time input must allow the complete intended time to be entered before destructive normalization or validation.

# UI / UX Requirements

## Source of truth

Use this precedence:

1. Explicit active task-agent UI requirements.
2. The active target screen and its directly related active components.
3. `constants/theme.ts`.
4. The closest active analogous screen in the same feature family.
5. Platform-native behavior when no repository pattern exists.

Do not import the old light theme from `main`.
Do not use `#517da2` as the app-wide header color.
Do not generate a generic white-card/iOS design that is absent from `feat/widgets`.

## Canonical dark palette

Use semantic tokens from `constants/theme.ts` instead of duplicating literals:

- background: `#0f1115`
- surface: `#152330`
- elevated/highlighted surface: `#1b2b3b`
- border/separator: `#36516a`
- primary text: `#f4f7fb`
- secondary/muted text: `#9aa3b2`
- primary accent: `#4ea1ff`
- soft primary accent: `#82c6ff`
- success: `#4edb78`
- warning: `#ffa51f`
- danger: `#ff5b5b`
- modal overlay: `rgba(0,0,0,0.72)`

A feature may use an established local semantic variation such as darker express surfaces, but new UI must not invent a separate palette without a feature reason.

## Navigation headers

Standard stack header:

- background: app background;
- no elevation or shadow;
- 1 px bottom border using the elevated surface color;
- title centered;
- title and icons use primary text;
- title weight approximately 600;
- standard action/back icons are 24 px;
- horizontal edge spacing is normally 10–15 px.

Screens that intentionally merge with an elevated top surface may use the active surface-highlight header pattern already registered in navigation.

## Drawer

Preserve the active drawer design:

- background: canonical background;
- width: 320;
- overlay: approximately `rgba(0,0,0,0.85)`;
- profile/header horizontal padding: 20;
- profile avatar: 60 × 60 with rounded-square radius 20;
- username: 20 px, weight 700;
- world badge: surface background, 1 px border, radius 12, 6/12 padding;
- section labels: 12 px uppercase, weight 700, letter spacing 1;
- menu rows: 16 px vertical and 24 px horizontal padding;
- active row uses a surface background, primary icon, primary text emphasis, and a 4 px right-side primary indicator;
- inactive rows use muted icons/text.

Do not replace the right-side active indicator with an unrelated selection treatment.

## Surfaces and cards

There is no single radius for every feature. Use the active family:

- onboarding connection card: radius 22, max width 460, surface background, 1 px border;
- profile section card: radius 14;
- community/general content card: radius 16;
- GB center panels/cards: radius 17;
- chat list cards: radius 24;
- compact option/list cards may use 5–14 depending on the active feature.

General card treatment:

- dark surface background;
- 1 px semantic border;
- primary and muted text;
- restrained shadow/elevation, only where the active analogous component uses it;
- 12–18 px internal padding;
- 10–14 px outer gaps for card lists.

Do not flatten an established card-heavy screen into plain rows.
Do not add oversized cards to a screen whose active pattern uses compact rows.

## Typography

Use the system font.

Common active roles:

- large screen/hero title: 23–24 px, weight 700–800;
- card/section title: 16–20 px, weight 600–700;
- body: 14–16 px;
- supporting text: 12–14 px, muted;
- uppercase metadata label: 11–13 px, weight 700–800, optional letter spacing;
- button text: 13–16 px, weight 700;
- primary accent titles may use soft primary or primary depending on the active feature.

Do not introduce custom font dependencies.

## Buttons

Primary button:

- background: primary accent;
- white text;
- radius typically 9–13;
- active height/min-height typically 38–52;
- weight 700;
- show an ActivityIndicator during async submission;
- block duplicate submissions.

Secondary button:

- use the active feature's bordered dark-surface treatment;
- primary or primary-soft text;
- maintain equal visual height with paired primary buttons where practical.

Disabled button:

- set `disabled`;
- block the handler;
- use opacity approximately 0.35–0.42 or the existing disabled style;
- opacity alone is not sufficient.

Destructive action:

- use danger/red treatment;
- require the existing confirmation flow;
- never style destructive confirmation as an ordinary primary-blue action.

Floating action buttons are allowed only where the active feature uses them, such as community creation. Reuse the existing 56 × 56 primary circular pattern rather than adding FABs globally.

## Inputs

Standard dark input:

- background: app background or elevated surface according to context;
- 1 px canonical border;
- primary text;
- muted placeholder;
- radius approximately 10–13;
- minimum height approximately 44–52;
- horizontal padding approximately 12–14;
- primary selection/caret color.

For multiline input, preserve top alignment and adequate minimum height.

Numeric/time input:

- keep raw text separate from committed numeric/time state when needed;
- allow intermediate values;
- do not rewrite a partially entered value into another valid value;
- validate and clamp on blur, explicit confirmation, or completed parse;
- preserve direct manual entry in addition to wheel/dial/stepper interaction.

## Chips, badges, and statuses

- standard filter chip radius: 18;
- inactive chip: surface + border + muted text;
- active chip: primary or primary-soft surface with primary/soft-primary text;
- unread badge: primary, minimum 20 × 20, radius 10, white 12 px bold text;
- count badge: primary-soft/elevated surface, pill radius;
- semantic status badges must use active success/warning/danger foreground, border, and background combinations;
- status text and visibility must come from current feature business rules, not from color guesswork.

## Avatars and media

Use the size established by context:

- contributor avatar: 38–42;
- member row avatar: 46;
- chat list avatar: 58;
- drawer avatar: 60;
- onboarding/group image: 64 rounded square;
- Great Building progress image: 114 inside a 132/140 progress ring.

Chat list avatars:

- 58 × 58;
- circular;
- primary border;
- private online indicator: 14 × 14 success dot with surface border.

Great Building images normally use `contain`.
Do not substitute unrelated stock/fantasy portraits in implementation or visual specifications.

## Chat list pattern

Preserve the active ChatList visual and interaction model:

- screen background;
- list horizontal padding 14;
- chat card radius 24;
- card min-height 92;
- padding 16;
- 58 px avatar;
- name 17/600;
- preview 13/muted;
- right column for time, unread badge, and chevron;
- swipe-left delete reveal;
- delete background red;
- animated row entrance;
- empty-state icon circle and two-level message.

## Great Building screen patterns

`GBCenterScreen`:

- large navigation cards, min-height approximately 96;
- radius 17;
- 57 px icon tile, radius 15;
- title 20/700 and muted subtitle;
- count pill and chevron;
- bordered panels for activity and secondary actions.

`MyGBCenterScreen`:

- filter chips above cards;
- card radius 17 with darker feature surface and blue-gray border;
- circular building image with progress ring and percentage pill;
- lock action is a 44 × 44 rounded-square button;
- compact information grid with vertical divider;
- semantic guarantee badge;
- overlapping contributor avatars;
- expand/collapse control;
- primary express button height 46 and radius 12;
- hide/disable express scheduling according to active duplicate scheduling rules.

Do not replace these screens with the old stepper-and-gray-card design from another branch.

## Modal patterns

Use the active modal family that matches the interaction.

### Centered form/dialog modal

Used for focused forms and lists.

- overlay: approximately 0.68–0.75 black;
- center content;
- horizontal overlay padding: 20–24;
- card background: surface;
- 1 px border when used by the analogous component;
- radius: 16–18;
- max width commonly 360 for compact dialogs;
- title: 17–20 px, weight 700;
- body/support text: muted;
- explicit close path;
- Android `onRequestClose`;
- bounded `ScrollView` for long content;
- `KeyboardAvoidingView` or equivalent when inputs can be obscured.

### Bottom selection sheet

Used for country/world and long simple selections.

- dark overlay using canonical overlay;
- align to bottom;
- surface background;
- top-left/top-right radius 22;
- 1 px border;
- max height approximately 68% of viewport;
- top handle: 42 × 4;
- padding approximately 18;
- option rows min-height approximately 58, radius 13;
- visible close action;
- safe-area bottom padding;
- `FlatList` for unbounded options.

### Compact selector/action modal

Used by express selection and similar focused actions.

- dark centered surface card;
- title;
- bounded internal scrolling;
- selected rows use the active primary checkbox/icon;
- paired secondary then primary action;
- primary disabled when selection is invalid;
- prevent duplicate submit.

### Native alerts

Keep native `Alert` for simple existing confirmations, errors, and platform prompts where the active flow already uses it. Do not replace all alerts globally during an unrelated task.

## Loading, empty, and errors

- full-screen loading uses background and primary ActivityIndicator;
- card-local async actions show local loading rather than blocking unrelated content;
- empty states use muted explanatory text and, where active, an outlined/elevated icon container;
- recoverable failures should be shown to the user;
- technical errors may be logged without secrets, tokens, full payloads, or personal data;
- do not add empty catch blocks to new user-facing work.

## Accessibility

- icon-only controls need an accessibility label and button role;
- selected/disabled states must be semantic, not color-only;
- touch targets should be approximately 44 × 44 or larger;
- text must maintain contrast on dark surfaces;
- modals require a clear title and close path;
- important content must survive text scaling and narrow screens.

# Implementation Requirements

## JavaScript and native code

- Keep active React Native application code in JavaScript.
- Do not migrate active JavaScript files to TypeScript.
- Use functional components and Hooks.
- Follow the active file's formatting and module style.
- Reuse shared utilities and canonical theme/role constants.
- Do not create numbered duplicate components.
- Kotlin changes are allowed only when the task actually affects Android-native widget behavior or another existing native integration.
- Do not convert native widget code to Java or move it into JavaScript without an explicit architecture task.

## Firebase Realtime Database

- Use `database().ref(...)`.
- Validate required identifiers before constructing a path.
- Read/write the narrowest practical node.
- Use `update` for partial or multi-location writes.
- Use transactions for conflict-sensitive counters, state machines, timestamp preservation, duplicate prevention, and ownership checks.
- Use `database.ServerValue.TIMESTAMP` for server-ordered timestamps.
- Do not replace a broad parent with `set` for a narrow change.
- Preserve current value types.
- Remove every persistent listener with the exact reference/callback.
- Handle missing, partial, and legacy-compatible data.
- Avoid new full-root scans.
- Do not change a path/schema without an explicit requirement and coordinated migration.

## Firebase Storage

- Use `@react-native-firebase/storage`.
- Request media permission only when needed.
- Validate picker cancellation using the current Expo ImagePicker response shape.
- Write a database download URL only after upload succeeds.
- Clean up orphaned uploads when the feature's database save fails.
- Respect `storage.rules` path, content type, and size constraints.
- Do not weaken rules or make all writes public as a fix.

## Async and lifecycle

- prevent repeated submissions;
- maintain accurate loading/busy state;
- ignore stale async results after unmount or guild switch;
- do not navigate away before required writes complete;
- cancel timers and AppState listeners;
- unsubscribe Firebase listeners;
- preserve notification-route generation/cancellation protections;
- preserve guild-switch ordering.

## Localization

- Reuse i18next in localized active features.
- Add keys consistently across currently supported language resources when adding production text to a localized screen.
- Do not hardcode new text merely because an older nearby file contains hardcoded Ukrainian or Russian.
- Preserve localized Great Building name fallback behavior.
- Preserve Ukrainian UI copy where the screen is intentionally not yet localized unless the task includes localization.

## Performance

- Use `FlatList` for large/unbounded lists.
- Use stable domain/Firebase IDs as keys.
- Avoid per-row listeners when one collection listener is sufficient.
- Cache external lookups with the existing TTL/request-deduplication pattern.
- Do not create broad root listeners for convenience.
- Keep expensive map/SVG parsing out of ordinary rerenders.
- Preserve current request cancellation and cache freshness logic.
- Use memoization only for measurable/stability needs.

## Security

- Never hardcode new secrets, API tokens, service account JSON, credentials, or encryption keys.
- Never expose `TELEGRAM_BOT_TOKEN` to the client.
- Keep privileged Firebase Admin operations in Cloud Functions.
- Do not log FCM tokens, passwords, access codes, entire AsyncStorage, private messages, or complete notification payloads in production.
- Do not copy or expand the legacy hardcoded password-encryption pattern.
- Do not weaken Database or Storage rules.
- Preserve role checks on both route visibility and the actual operation.
- Verify community owner/moderator checks before write operations.
- Verify current guild membership before deep-link navigation and widget delivery.
- Treat committed credential artifacts as sensitive; never quote or duplicate their contents.

# Edge Cases

Handle relevant cases without broad behavior changes:

- missing `userId` or `guildId`;
- guild changed during an async request;
- user removed from a guild;
- role changed while a protected screen is open;
- missing or partial Firebase node;
- legacy schedule keys;
- legacy flat express records;
- duplicate express creation;
- repeated confirmation tap;
- stale notification route;
- deep link to deleted/inaccessible chat;
- invalid FCM token;
- multiple devices for one user;
- widget FCM for a non-active guild;
- stale widget snapshot;
- widget absent from launcher;
- WorkManager transient network failure;
- missing widget snapshot with fallback GBG data available;
- malformed map/sector data;
- storage upload succeeds but database write fails;
- media permission denied;
- keyboard obscures modal input;
- Android hardware back while a modal is open;
- app resumes from background;
- narrow phone, tablet, and orientation change;
- partially typed numeric/time input;
- cross-midnight schedule;
- timezone and daylight-saving transition;
- external API timeout;
- deleted Great Building catalog entry;
- missing localized building name;
- empty, loading, error, and disabled states.

# Do Not

- Do not use `main` as the design or schema baseline.
- Do not restore the old light `#517da2` visual system.
- Do not treat Expo Router starter files as the active app.
- Do not migrate active JavaScript screens to TypeScript.
- Do not introduce the web Firebase modular SDK.
- Do not initialize another Firebase app.
- Do not invent a database path, field, Storage path, role, workflow stage, guarantee status, widget key, or notification type.
- Do not rename misspelled/legacy paths during unrelated work.
- Do not remove compatibility readers without an explicit migration.
- Do not overwrite broad parent nodes.
- Do not delete another user's data through a client-side filter assumption.
- Do not weaken Firebase or Storage security.
- Do not create cross-guild widget cache writes.
- Do not let stale widget data overwrite newer data.
- Do not change only the JavaScript half of a native widget contract.
- Do not duplicate notification/background handlers.
- Do not create another navigation container in the authenticated tree.
- Do not copy UI from temporary, unregistered, template, or old-branch files.
- Do not replace active feature-specific card radii with a fabricated universal radius.
- Do not add unrelated refactors, formatting churn, dependency upgrades, or schema cleanup.
- Do not leave debug alerts, token logs, full payload logs, or silent empty catches in new production behavior.
- Do not remove existing functionality.

# Acceptance Criteria

A completed change must satisfy every applicable item:

1. The checked-out branch and active task agent were verified before implementation.
2. Active entry points and route registrations were inspected.
3. The change follows the active `feat/widgets` architecture.
4. UI uses the canonical dark palette and the correct feature-family component pattern.
5. Headers, cards, buttons, inputs, chips, badges, avatars, modals, loading, empty, and disabled states match active analogues.
6. No old light-theme assumptions from another branch were introduced.
7. Navigation names, parameters, back behavior, role gating, and notification destinations remain valid.
8. New localized text follows the active localization approach.
9. Firebase reads/writes use confirmed current paths and value shapes.
10. No broad parent is unintentionally replaced.
11. Conflict-sensitive writes use the existing transaction/server-timestamp pattern.
12. Realtime, AppState, timer, and messaging listeners are cleaned up.
13. Cloud Function producers and client consumers still agree.
14. Notification behavior works in all relevant app states.
15. Widget changes preserve active-guild isolation, freshness, atomic cache writes, and all JS/native contracts.
16. Storage writes use an allowed path and respect type/size constraints.
17. No secret, token, password, or private payload is exposed.
18. No unrelated feature, schema, branch behavior, or dependency is changed.
19. Relevant automated checks pass or unverified checks are explicitly reported.

# Verification

After implementation:

1. Review `git diff --check` and the complete diff.
2. Re-open every edited file and inspect syntax, imports, Hook dependencies, listener cleanup, and error handling.
3. Search all usages of each changed route, path, field, role, notification type, cache key, bridge method, and shared component.
4. Confirm active readers and writers agree on shape and type.
5. Confirm Cloud Functions and client/native consumers agree.
6. Verify loading, empty, error, disabled, success, and repeated-submit states.
7. Verify Android hardware back, modal close, keyboard avoidance, scrolling, and safe areas.
8. Verify manual time/numeric input with intermediate values and zero-containing times.
9. Verify guild switching and cross-guild data isolation.
10. For chat changes, verify unread ordering, soft deletion, later-message reappearance, private/group rows, and swipe delete.
11. For express changes, run:
    - `node --test functions/expressWorkflow.test.js`
    - `node --check functions/expressWorkflow.js`
    - `node --check functions/index.js`
12. For widget changes:
    - verify foreground FCM, background FCM, cold/background headless refresh, and periodic WorkManager refresh;
    - verify both top-five and map widgets;
    - verify no-widget behavior;
    - verify guild switching clears old data;
    - verify stale and cross-guild snapshots are ignored;
    - run `npm run generate:widget-maps` when widget map source/templates change;
    - run the relevant Android Gradle build/tests supported by the repository.
13. Inspect root package scripts before running commands. Existing relevant scripts include:
    - `npm run lint`
    - `npm run android`
    - `npm run ios`
    - `npm run build:android:candidate`
    - `npm run generate:widget-maps`
14. Run only commands supported by the current repository.
15. If a platform/build/test cannot run in the environment, state exactly what was not verified and why.
16. Summarize changed files, affected Firebase/Storage paths, native contracts, migrations if any, and verification results.
