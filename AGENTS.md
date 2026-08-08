# Task

Temporarily add a refresh action to the right side of the header on the "Гаранти" screen.

When the refresh action is pressed, update every GB belonging to the current guild by writing the current refresh time so that all of them are treated as if they had just been refreshed normally.

# Goal

Provide a temporary manual action on the "Гаранти" screen that allows the user to mark all GBs in the current guild as freshly updated with a single press.

The resulting data state must be equivalent to each GB having just gone through the application's existing normal refresh/update flow with respect to its refresh timestamp.

# Context

- The affected screen is the "Гаранти" screen.
- The refresh button must appear on the right side of this screen's header.
- The screen contains filters such as availability/status and seat-count filters.
- The bulk refresh operation applies to all GBs in the current guild, not only GBs currently visible after applying UI filters.
- This button is temporary.
- Existing refresh behavior for an individual GB must be treated as the source of truth for how a GB refresh timestamp is stored.
- Terminology used in this file:
  - `GB` corresponds to `ВС` in the application/domain.
  - `FP` corresponds to `СО` in the application/domain.

# Repository Investigation

Before editing code:

1. Locate the implementation of the "Гаранти" screen and its header configuration.
2. Inspect how header actions are implemented on this screen and analogous screens.
3. Locate the existing logic used when a single GB is normally refreshed or marked as updated.
4. Determine from the existing implementation:
   - which data field represents the GB refresh/update time;
   - the timestamp format/type used;
   - how the current timestamp is produced;
   - which Firebase/API path or data-access service performs the update.
5. Locate how the current guild is identified on the "Гаранти" screen.
6. Locate how all GBs belonging to the current guild are queried or represented.
7. Inspect usages and dependencies of the related components, hooks, services, utilities, and data-access code.
8. Inspect the existing Firebase/API integration and actual data structures involved.
9. Find analogous bulk-write or multi-record update patterns already used in the repository.
10. Inspect how the UI/state reacts to updated GB timestamps and whether local state, cache, subscriptions, or queries require any explicit synchronization.
11. Reuse the existing architecture and conventions.
12. Make the smallest coherent change required for this task.

Do not assume file paths, Firebase paths, field names, timestamp representations, or data structures. Discover them from the repository.

# Existing Architecture

Preserve and reuse the architecture and conventions found in the repository.

The implementation must reuse the existing GB refresh/update semantics rather than introducing a second definition of what it means for a GB to be freshly updated.

If Firebase is used:

- use the Firebase SDK and integration pattern already present in the project;
- reuse existing data-access helpers where practical;
- do not introduce an additional Firebase client or parallel data layer.

# Data Model

Do not change the existing data schema.

For every GB belonging to the current guild, write the same refresh/update field used by the existing normal GB refresh flow.

Use the same timestamp type and time-source convention as the existing individual GB refresh implementation.

Do not introduce an additional timestamp field solely for this temporary button.

Preserve all unrelated GB fields.

# Business Rules

- A button press must affect every GB in the current guild.
- The operation must not be limited to GBs currently rendered on screen.
- The operation must not be limited by the currently selected availability/status filter.
- The operation must not be limited by the currently selected seat-count filter.
- Each affected GB must receive a refresh timestamp representing the current refresh operation.
- After the operation, every affected GB must be treated by existing application logic as if it had just been refreshed normally.
- GBs belonging to other guilds must not be modified.
- Existing GB data other than the required refresh/update value must remain unchanged.

# UI / UX Requirements

- Add a temporary refresh action on the right side of the "Гаранти" screen header.
- Preserve the existing back action.
- Preserve the existing screen title.
- Preserve the existing header layout and screen content except for the new action.
- Use the project's existing header-button and icon conventions where available.
- The action must visually fit the existing header.
- Pressing the action triggers the bulk refresh for the current guild.
- Do not modify the existing filters or their behavior.

If the project already has an established loading, disabled, or in-progress state for asynchronous header actions, reuse that pattern.

# Implementation Requirements

- Preserve JavaScript if the affected project uses JavaScript.
- Do not migrate affected JavaScript files to TypeScript.
- Preserve the existing component style and architecture.
- Prefer existing functional components and React Hooks when consistent with the codebase.
- Reuse the existing GB update helpers/services where practical.
- Do not duplicate the existing individual GB refresh timestamp logic.
- Use the existing mechanism for determining the current guild.
- Obtain the complete set of GBs for the current guild independently of the active UI filters.
- Perform writes using the repository's existing Firebase/API conventions.
- If the existing data layer has an established batch or multi-record update pattern, reuse it where appropriate.
- Ensure that triggering the operation does not overwrite unrelated GB fields.
- After a successful update, ensure application state reflects the new timestamps according to the repository's existing synchronization pattern.
- Preserve existing error-handling conventions.
- Avoid unrelated refactors.
- Preserve unrelated working behavior.
- Do not hardcode Firebase paths, IDs, credentials, secrets, or schema assumptions that can be discovered from the existing implementation.
- Do not weaken security rules to make the feature work.

# Edge Cases

- If the current guild has no GBs, the action must not modify unrelated data or fail solely because there are no records to update.
- Active screen filters must not cause only a filtered subset of GBs to be updated.
- GBs from another guild must remain unchanged.
- Repeated presses must continue to use the existing refresh semantics rather than introducing alternate state.
- Preserve the repository's existing behavior for failed writes or partial failures instead of inventing a new data model or recovery mechanism.

# Do Not

- Do not update only the currently rendered or filtered GBs.
- Do not modify GBs from other guilds.
- Do not introduce a new refresh timestamp field when an existing field already defines this state.
- Do not change the database schema.
- Do not change Firebase security rules merely to make this feature work.
- Do not introduce a second Firebase SDK/client.
- Do not refactor unrelated screens, services, navigation, hooks, or data models.
- Do not change the existing filters or their semantics.
- Do not remove existing functionality.
- Do not migrate JavaScript to TypeScript.
- Do not hardcode secrets or credentials.

# Acceptance Criteria

- The "Гаранти" screen has a temporary refresh action on the right side of its header.
- The existing back action and title remain intact.
- Pressing the refresh action targets all GBs belonging to the current guild.
- GBs hidden by the currently selected filters are still included.
- Every GB in the current guild receives the same kind of refresh timestamp used by the existing normal GB refresh flow.
- The written timestamp represents the current refresh operation according to the application's existing time-source convention.
- Existing application logic subsequently treats every affected GB as freshly updated.
- GBs belonging to other guilds are not modified.
- No unrelated GB fields are overwritten.
- No database schema changes are introduced.
- Existing filters and normal "Гаранти" screen behavior continue to work.
- The implementation follows the project's existing Firebase/API, state-management, and UI conventions.
- No unrelated functionality is changed.

# Verification

After implementation:

1. Verify the existing individual GB refresh implementation and confirm the bulk action uses the same timestamp field, timestamp type, and time-source semantics.
2. Open the "Гаранти" screen and confirm the refresh action appears on the right side of the header.
3. Confirm the existing back action and title remain unchanged.
4. Select filters that hide some GBs.
5. Trigger the refresh action.
6. Verify that both visible and filtered-out GBs in the current guild receive the new refresh timestamp.
7. Verify that all affected GBs are treated as freshly updated by the existing application logic.
8. Verify that GBs belonging to another guild remain unchanged.
9. Verify behavior when the current guild contains no GBs.
10. Verify that unrelated GB fields remain unchanged.
11. Verify that screen state/cache/subscriptions reflect the update according to existing repository behavior.
12. Run the repository's relevant linting, tests, or validation commands for the affected code where available.
