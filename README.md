# goose-monitor

Find apps by name, PID, or port and quit them. Helpers are grouped under their app.

A [Raycast](https://raycast.com) extension for macOS.

## Features

- **Apps, not processes.** Electron helpers, Chrome renderers, and child workers are grouped under a single row with combined CPU and memory. You quit the whole app instead of hunting for individual helper processes (though you can still inspect and quit individual helpers if desired).
- **Search by port.** Search by port number (`8101` or `:8101`). Matches both active listening sockets (`lsof`) and ports declared in command-line arguments (e.g. `--server.port=8101` or `-Dserver.port=8101`), finding apps even before they finish binding.
- **No confirmation dialog.** Press Enter to quit the selected app immediately. There is no intermediate "are you sure" prompt.
- **Safe termination & post-exit verification.** Before sending `SIGTERM`, the extension verifies process identities against a fresh snapshot to ensure recycled PIDs are never terminated by mistake. Signals are delivered deepest-children-first to prevent respawning, and process exit is re-verified after signalling. If a process ignores `SIGTERM`, it suggests Force Quit.
- **Force Quit with SIGKILL.** Force Quit sends `SIGKILL` directly across the process tree to immediately terminate stubborn or hanging apps.
- **On-demand metric collection.** High-overhead two-frame network rate sampling (`nettop`, ~1s) only runs when viewing the **Network** category. Categories like **All**, **CPU**, **Memory**, **GUI**, and **Background** skip it completely for instantaneous (<100ms) listing and refreshes.
- **简体中文界面。** 进程列表、操作、Toast 和设置项均为中文；只注册一个主命令。

## Installation

### Import Extension (Recommended)

1. Open Raycast.
2. Run **Import Extension**.
3. Select this repository folder (`raycast-monitor`).

### Development

```sh
npm install
npm run dev
```

`ray develop` builds the extension, imports it into Raycast automatically, and rebuilds on every file save.

Other scripts:

- `npm run build` — Bundle extension to `dist/`
- `npm run lint` — Run Raycast linter, ESLint, and Prettier checks
- `npm run fix-lint` — Auto-fix lint and formatting issues
- `bun test` — Run automated unit and integration tests

## Preferences

| 偏好       | 类型   | 默认    | 说明                                     |
| ---------- | ------ | ------- | ---------------------------------------- |
| 刷新       | 下拉   | 每 3 秒 | 关闭、每秒、每 2/3/5 秒                  |
| 显示 PID   | 复选框 | 关      | 在列表中显示进程 PID                     |
| 显示路径   | 复选框 | 关      | 在列表中显示可执行路径                   |
| 关闭窗口   | 复选框 | 关      | 结束进程后关闭 Raycast 窗口              |

## Usage

1. Run **管理进程** from Raycast.
2. Filter by app name, PID, or port number (`8101` or `:8101`).
3. Switch categories via the dropdown (**全部**, **界面**, **CPU**, **内存**, **网络**, **后台**).
4. Press **Enter** to quit the selected app (SIGTERM with exit verification).
5. Use **强制结束** (`Cmd+Enter` or secondary action) to terminate with SIGKILL if an app hangs.
6. Open **查看辅助进程** (`Cmd+Shift+H` or secondary action) to inspect or terminate individual child helpers.

导入导出与偏好设置从 **管理进程 → 设置与导入导出** 进入。为满足单入口要求，两个独立的 CPU/内存菜单栏命令不再注册。

## How this differs from Kill Process

[Kill Process](https://raycast.com/rolandleth/kill-process) is a flat, usage-sorted process list that asks for confirmation. goose-monitor makes different trade-offs:

|                     | goose-monitor                                                    | Kill Process                    |
| ------------------- | ---------------------------------------------------------------- | ------------------------------- |
| Process List        | Grouped by app bundle; helpers collapsed under parent            | Flat process list               |
| Search              | App name, PID, listening ports, CLI-declared ports               | Process name, PID, path         |
| Quit Safety         | Re-verified against fresh snapshot; warns on recycled PID        | Signals listed PID directly     |
| Termination Flow    | Deepest-children-first SIGTERM + exit verification               | Flat signal dispatch            |
| Force Quit          | Dedicated Force Quit (`SIGKILL`) when graceful termination fails | Single kill action              |
| Protected Processes | Greyed out with reason (`system process`, `another user`)        | Shown; fails with generic error |
| On-Demand Sampling  | Heavy `nettop` rate sampling only runs in Network category       | Standard polling                |
| Confirmation        | None (Enter quits immediately)                                   | Optional confirmation dialog    |

## Repository Layout

- `src/` — Extension source code. Entry point: `src/manage-processes.tsx`.
- `src/lib/` — Independent macOS process management module (listing, grouping, search, ports, network, termination).
- `tests/` — Automated test suite with fixture and integration tests (`bun test`).
- `assets/` — Extension icons and metadata assets.

## Publishing

Before submitting to the Raycast Store, ensure `author` in `package.json` matches your Raycast username. Run `npm run lint` and `bun test` to ensure all checks pass.

## License

MIT
