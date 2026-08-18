[中文](./README.md) | [English](./README_EN.md)

# @dsh-external/ui-archive-manager

## Introduction

`ui-archive-manager` is an archived-session management plugin for the DSH Web client. It adds an "Archive Manager" page to the Settings screen, showing all archived sessions in a workspace → session hierarchy, and supports restoring, permanently deleting, and searching sessions individually or in batch.

## Installation

### Method 1: Super Module Injector

```text
dev_build_plugin  {"dir": "C:/Users/<user>/.dsh/plugins/ui-archive-manager"}
dev_inject_plugin {"dir": "C:/Users/<user>/.dsh/plugins/ui-archive-manager"}
```

Open or refresh DSH Web and go to Settings → Archive Manager.

### Method 2: dsh CLI (Official Project Way)

If you have the `dsh` CLI installed, follow the official project tutorial to install with `dsh plugin`:

```bash
# Install from a local plugin directory
dsh plugin --profile web add C:/Users/<user>/.dsh/plugins/ui-archive-manager

# Or install from the GitHub repository
dsh plugin --profile web add github:xiyue718/dsh-ui-archive-manager
```

Start after installation:

```bash
dsh --profile web
```

View the composed configuration:

```bash
dsh --profile web --dump-config
```

See the project documentation for details: `docs/user/develop/basic/publish.md`.

Build artifacts: host `lib/index.js`, client `lib/client.js`, package `dsh-external-ui-archive-manager-0.1.0.tgz`.

## Usage

1. Start the DSH Web client.
2. Open the Settings panel.
3. Click "Archive Manager".
4. Expand/collapse workspaces to browse archived sessions.
5. Select all sessions in a workspace with one click, or select multiple sessions for batch operations.
6. Click "Restore" or "Delete" and confirm in the built-in modal dialog.
7. The list refreshes automatically and shows success or failure feedback through the built-in Toast.

## Features

- Shows archived sessions in a workspace → session hierarchy, matching the Usage Stats plugin page structure.
- Each workspace is displayed as a card and can be expanded/collapsed independently.
- Expand/collapse controls use icons only, without text.
- "Select All" uses the same native checkbox style as individual archived sessions and is positioned at the far left of the workspace title.
- Session information includes: title, session ID, last activity/archive reference time, creation time, whether the session is still live, and whether it is persisted.
- Restore one session: unarchive it back to the normal session list.
- Permanently delete one session: delete the session log and workspace association.
- Batch restore: unarchive multiple selected sessions.
- Batch delete: permanently delete multiple selected sessions.
- Search/filter: filter by session title, session ID, and date (last activity/creation date).
- Confirmation dialogs: restore and delete operations use the project's built-in Modal.
- Operation feedback: the list refreshes automatically and shows success/failure via the built-in Toast.
- Safety: deletion provides clear feedback for still-live sessions; deletion removes the session from the archive set, workspace binding, in-memory live registry, and persisted session directory in order.

### Host API

```http
GET /@dsh-external/ui-archive-manager/api/archived
```

```http
POST /@dsh-external/ui-archive-manager/api/restore
Content-Type: application/json

{ "sessionIds": ["session-xxx"] }
```

```http
POST /@dsh-external/ui-archive-manager/api/delete
Content-Type: application/json

{ "sessionIds": ["session-xxx"] }
```

## How It Works

The plugin consists of a host half and a client half.

On the host side, it exposes the archive management API through `webServer.register`. When reading the archive list, it gets archived session IDs from `workspaceRegistry.archivedSessionIds`, then reads titles, creation time, last activity time, and live status through `sessionQuery` / `sessionPersistence`. Restore removes the target IDs from `archivedSessionIds` via `workspaceRegistry.setState`; permanent delete unarchives the session, detaches it from its workspace, removes it from the in-memory live session/agent registry, and deletes the persisted session directory.

The DSH host currently stores only the archived session ID set and does not keep a separate archive timestamp. Therefore the plugin shows the "last activity/archive reference time" (the last event time in the log) and uses creation time for sorting and search.

On the client side, it registers the Archive Manager page in Settings, loads data through the Host API, renders the hierarchical list, and uses the built-in Modal and Toast for confirmation and feedback.
