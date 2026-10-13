import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  useNavigation,
} from "@raycast/api";
import type { ReactNode } from "react";
import { GENERIC_APP_ICON } from "../lib/app-icon";
import type { SortDir, SortKey } from "../lib/categories";
import { cpuExact, fmtCpu, fmtMem, fmtPorts, fmtRate, memExact } from "../lib/format";
import { formatHelperRole, formatProtectedReason, type Messages } from "../lib/i18n";
import { keywordsForRow } from "../lib/search";
import type { AppRow, Helper } from "../lib/types";

export type Sort = { key: SortKey; dir: SortDir };
type SortOption = Sort & { title: string };
export type QuitFn = (row: AppRow, force: boolean, pids?: number[]) => Promise<boolean>;

type Props = {
  row: AppRow;
  preferences: Preferences;
  t: Messages;
  isNet: boolean;
  sort: Sort;
  quit: QuitFn;
  openActivityMonitor: () => Promise<void>;
  refresh: () => Promise<void>;
  onSortChange: (option: SortOption) => void;
  settingsView: ReactNode;
};

const sortsOf = (t: Messages): SortOption[] => [
  { key: "cpu", dir: "desc", title: t.sortByCpu },
  { key: "mem", dir: "desc", title: t.sortByMemory },
  { key: "name", dir: "asc", title: t.sortByName },
];

/** 网络分类多三个排序列（对齐 goose-monitor）。 */
const netSortsOf = (t: Messages): SortOption[] => [
  { key: "net", dir: "desc", title: t.sortByNetwork },
  { key: "down", dir: "desc", title: t.sortByDownload },
  { key: "up", dir: "desc", title: t.sortByUpload },
];

export function ProcessRow({
  row,
  preferences,
  t,
  isNet,
  sort,
  quit,
  openActivityMonitor,
  refresh,
  onSortChange,
  settingsView,
}: Props) {
  return (
    <List.Item
      key={row.id}
      title={row.name}
      subtitle={subtitleOf(row, preferences, t)}
      icon={row.iconPath ? { fileIcon: row.iconPath } : { source: GENERIC_APP_ICON, fallback: Icon.AppWindow }}
      keywords={keywordsForRow(row)}
      accessories={accessoriesOf(row, isNet, t)}
      actions={
        <ActionPanel>
          {row.protected ? (
            <>
              <Action.CopyToClipboard
                title={t.copyPid}
                content={`${row.pid}`}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              {row.path ? <Action.ShowInFinder title={t.showInFinder} path={row.path} /> : null}
              {row.path ? (
                <Action.CopyToClipboard
                  title={t.copyPath}
                  content={row.path}
                  shortcut={Keyboard.Shortcut.Common.CopyPath}
                />
              ) : null}
            </>
          ) : (
            <>
              <Action title={t.quit} icon={Icon.XMarkCircle} onAction={() => void quit(row, false)} />
              <Action
                title={t.forceQuit}
                icon={Icon.XMarkCircleFilled}
                shortcut={Keyboard.Shortcut.Common.Remove}
                style={Action.Style.Destructive}
                onAction={() => void quit(row, true)}
              />
              {row.helpers.length > 0 ? (
                <Action.Push title={t.showHelpers} icon={Icon.List} target={<Helpers row={row} quit={quit} t={t} />} />
              ) : null}
              <Action.CopyToClipboard
                title={t.copyPid}
                content={`${row.pid}`}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              {row.path ? (
                <Action.CopyToClipboard
                  title={t.copyPath}
                  content={row.path}
                  shortcut={Keyboard.Shortcut.Common.CopyPath}
                />
              ) : null}
              {row.path ? <Action.ShowInFinder title={t.showInFinder} path={row.path} /> : null}
            </>
          )}
          <Action title={t.openActivityMonitor} icon={Icon.Monitor} onAction={() => void openActivityMonitor()} />
          <Action title={t.openPreferences} icon={Icon.Gear} onAction={openExtensionPreferences} />
          <Action.Push title={t.settingsTransfer} icon={Icon.Gear} target={settingsView} />
          <ActionPanel.Section>
            {[...sortsOf(t), ...(isNet ? netSortsOf(t) : [])].map((option) => (
              <Action
                key={`${option.key}-${option.dir}`}
                title={option.title}
                icon={isCurrentSort(option, sort) ? Icon.CheckCircle : undefined}
                onAction={() => onSortChange(option)}
              />
            ))}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title={t.refresh}
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={() => void refresh()}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

/** 端口 / 受保护原因 / 可选的 PID、路径 —— 标题里已有的名字不再重复，辅助进程数也不重复。 */
function subtitleOf(row: AppRow, preferences: Preferences, t: Messages): string {
  const parts: string[] = [];
  if (row.ports.length) parts.push(t.portLabel(fmtPorts(row.ports)));
  if (row.protectedReason) parts.push(formatProtectedReason(row.protectedReason, t));
  if (preferences.showPID) parts.push(t.pidLabel(row.pid));
  if (preferences.showPath) parts.push(row.path);
  return parts.join(" · ");
}

function accessoriesOf(row: AppRow, isNet: boolean, t: Messages): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];
  if (row.protected) {
    const reason = formatProtectedReason(row.protectedReason, t);
    accessories.push({
      tag: { value: t.protected, color: Color.SecondaryText },
      tooltip: reason ? t.protectedWith(reason) : t.protected,
    });
  }
  if (isNet) {
    accessories.push({
      text: fmtRate(row.netDown),
      icon: Icon.ArrowDown,
      tooltip: t.download(fmtRate(row.netDown)),
    });
    accessories.push({ text: fmtRate(row.netUp), icon: Icon.ArrowUp, tooltip: t.upload(fmtRate(row.netUp)) });
  }
  accessories.push({ text: fmtCpu(row.cpu), icon: Icon.Gauge, tooltip: t.cpuValue(cpuExact(row.cpu)) });
  accessories.push({
    text: fmtMem(row.memBytes),
    icon: Icon.MemoryChip,
    tooltip: t.memoryValue(memExact(row.memBytes)),
  });
  return accessories;
}

const isCurrentSort = (option: SortOption, sort: Sort): boolean => option.key === sort.key && option.dir === sort.dir;

/** 子进程页：helper 可以单独结束，不需要回主列表。 */
function Helpers({ row, quit, t }: { row: AppRow; quit: QuitFn; t: Messages }) {
  const { pop } = useNavigation();
  const quitHelper = async (helper: Helper, force = false) => {
    if (await quit(row, force, [helper.pid])) pop();
  };
  return (
    <List navigationTitle={t.helpersNav(row.name)}>
      {row.helpers.map((helper) => (
        <List.Item
          key={`${row.id}:${helper.pid}`}
          title={helper.name}
          subtitle={formatHelperRole(helper.role, t)}
          icon={Icon.Gear}
          accessories={[
            { text: fmtCpu(helper.cpu), icon: Icon.Gauge, tooltip: t.cpuValue(cpuExact(helper.cpu)) },
            {
              text: fmtMem(helper.memBytes),
              icon: Icon.MemoryChip,
              tooltip: t.memoryValue(memExact(helper.memBytes)),
            },
            { text: t.pidLabel(helper.pid) },
          ]}
          actions={
            <ActionPanel>
              <Action title={t.quitHelper} icon={Icon.XMarkCircle} onAction={() => void quitHelper(helper, false)} />
              <Action
                title={t.forceQuitHelper}
                icon={Icon.XMarkCircleFilled}
                style={Action.Style.Destructive}
                onAction={() => void quitHelper(helper, true)}
              />
              <Action.CopyToClipboard title={t.copyPid} content={`${helper.pid}`} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
