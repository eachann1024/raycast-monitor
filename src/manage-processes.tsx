import {
  Icon,
  LaunchType,
  List,
  LocalStorage,
  Toast,
  closeMainWindow,
  environment,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { useCachedPromise, useLocalStorage } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { ProcessRow, type QuitFn, type Sort } from "./components/process-row";
import { useSharedSettings } from "./hooks/use-shared-settings";
import { defaultSort, filterRows, sortRows, visibleCategories } from "./lib/categories";
import { run } from "./lib/exec";
import { formatKillError, type Messages } from "./lib/i18n";
import { killProcess } from "./lib/kill";
import { refreshSnapshot } from "./lib/snapshot";
import type { Capabilities, CategoryId } from "./lib/types";
import type { PortableSettings } from "./lib/settings-transfer";
import { useMessages } from "./locale";
import SettingsTransfer from "./settings-transfer";

const CATEGORY_ICON: Record<CategoryId, Icon> = {
  all: Icon.List,
  gui: Icon.AppWindow,
  cpu: Icon.Gauge,
  mem: Icon.MemoryChip,
  net: Icon.Globe,
  bg: Icon.Gear,
};

function categoryTitle(id: CategoryId, t: Messages): string {
  switch (id) {
    case "gui":
      return t.gui;
    case "cpu":
      return t.cpu;
    case "mem":
      return t.memory;
    case "net":
      return t.network;
    case "bg":
      return t.background;
    default:
      return t.all;
  }
}

export default function ManageProcesses() {
  const t = useMessages();
  const preferences = getPreferenceValues<Preferences>();
  const preferencePath = preferences.sharedSettingsFilePath?.trim() ?? "";
  const { value: storedCategory, setValue: setStoredCategory } = useLocalStorage<CategoryId>("category", "all");
  const category = storedCategory ?? "all";

  // 首帧还没采到能力开关，先当作都可用，跳过采集时沿用缓存避免 Dropdown 闪烁
  const [capabilities, setCapabilities] = useState<Capabilities>({ gui: true, net: true });
  const categories = visibleCategories(capabilities);
  // 存着的分类可能刚被能力开关关掉。
  const activeCategory: CategoryId = categories.some((item) => item.id === category) ? category : "all";
  const isNet = activeCategory === "net";

  const { data, isLoading, revalidate, mutate } = useCachedPromise(
    refreshSnapshot,
    [{ gui: activeCategory === "gui", net: isNet }],
    {
      keepPreviousData: true,
      onData(snapshot) {
        if (activeCategory === "gui") {
          setCapabilities((prev) =>
            prev.gui !== snapshot.capabilities.gui ? { ...prev, gui: snapshot.capabilities.gui } : prev,
          );
        }
        if (activeCategory === "net") {
          setCapabilities((prev) =>
            prev.net !== snapshot.capabilities.net ? { ...prev, net: snapshot.capabilities.net } : prev,
          );
        }
      },
    },
  );

  // 排序选择按普通 / 网络两组分别持久化，没选过就用该分类的默认排序。
  const { value: storedSort, setValue: setStoredSort } = useLocalStorage<Sort>("sort", defaultSort("all"));
  const { value: storedNetworkSort, setValue: setStoredNetworkSort } = useLocalStorage<Sort>(
    "sortNetwork",
    defaultSort("net"),
  );
  const sort = (isNet ? storedNetworkSort : storedSort) ?? defaultSort(activeCategory);
  const applyPortableLocally = (settings: PortableSettings) => {
    void LocalStorage.setItem("category", JSON.stringify(settings.category));
    void LocalStorage.setItem("sort", JSON.stringify(settings.sort));
    void LocalStorage.setItem("sortNetwork", JSON.stringify(settings.networkSort));
    setStoredCategory(settings.category);
    setStoredSort(settings.sort);
    setStoredNetworkSort(settings.networkSort);
  };
  const portable: PortableSettings = {
    category,
    sort: storedSort ?? defaultSort("all"),
    networkSort: storedNetworkSort ?? defaultSort("net"),
  };
  const { persistPortableChange, settingsTransferProps } = useSharedSettings({
    preferencePath,
    portable,
    applyPortableLocally,
    t,
  });
  const settingsView = <SettingsTransfer {...settingsTransferProps} />;
  const rows = data ? sortRows(filterRows(data.rows, activeCategory), sort.key, sort.dir) : [];

  // 行序会随排序与刷新变化：把选择固定在进程 id 上，回车永远落在用户选中的那个进程。
  // id 失效（已结束 / 被搜索过滤掉）时才交回 Raycast，回到默认首项。
  const [selectedId, setSelectedId] = useState<string>();
  const selected = selectedId && rows.some((row) => row.id === selectedId) ? selectedId : undefined;

  // 轮询与手动刷新共用的受保护刷新：避免 manual refresh 与 interval 重叠或重入。
  const sampling = useRef(false);
  const refresh = async () => {
    if (sampling.current) return;
    sampling.current = true;
    try {
      await revalidate();
    } finally {
      sampling.current = false;
    }
  };

  const refreshDuration = Number(preferences.refreshDuration);
  useEffect(() => {
    if (!refreshDuration || environment.launchType === LaunchType.Background) return;
    const timer = setInterval(() => {
      void refresh();
    }, refreshDuration);
    return () => clearInterval(timer);
  }, [refreshDuration, revalidate]);

  const quit: QuitFn = async (row, force, pids) => {
    const verb = force ? t.forceQuit : t.quit;
    const result = await killProcess(row, { force, pids });
    if (!result.ok) {
      await showToast({
        style: Toast.Style.Failure,
        title: t.couldNot(verb, row.name),
        message: formatKillError(result.error, t),
      });
      await refresh();
      return false;
    }
    await showToast({ style: Toast.Style.Success, title: t.did(verb, row.name) });
    if (pids) {
      // 只结束了组里一个 helper，行还在，等真实快照回来。
      await refresh();
    } else {
      // 乐观移除整行；mutate 结束后自带 revalidate。
      await mutate(undefined, {
        optimisticUpdate: (snapshot) =>
          snapshot && { ...snapshot, rows: snapshot.rows.filter((item) => item.id !== row.id) },
      });
    }
    if (preferences.closeWindowAfterQuit) await closeMainWindow({ clearRootSearch: true });
    return true;
  };

  const openActivityMonitor = async () => {
    try {
      await run("/usr/bin/open", ["-a", "Activity Monitor"]);
    } catch {
      await showToast({ style: Toast.Style.Failure, title: t.couldNotOpenActivityMonitor });
    }
  };

  return (
    <List
      navigationTitle={t.processes}
      isLoading={isLoading && rows.length === 0}
      selectedItemId={selected}
      onSelectionChange={(id) => setSelectedId(id ?? undefined)}
      searchBarPlaceholder={t.searchPlaceholder}
      filtering
      searchBarAccessory={
        <List.Dropdown
          tooltip={t.category}
          value={activeCategory}
          onChange={(next) => {
            const nextCategory = next as CategoryId;
            void setStoredCategory(nextCategory);
            void persistPortableChange({ ...portable, category: nextCategory });
          }}
        >
          {categories.map((item) => (
            <List.Dropdown.Item
              key={item.id}
              value={item.id}
              title={categoryTitle(item.id, t)}
              icon={CATEGORY_ICON[item.id]}
            />
          ))}
        </List.Dropdown>
      }
    >
      {!isLoading && rows.length === 0 && (
        <List.Item title={t.noProcesses} subtitle={t.noProcessesHint} icon={Icon.Info} />
      )}
      {rows.map((row) => (
        <ProcessRow
          key={row.id}
          row={row}
          preferences={preferences}
          t={t}
          isNet={isNet}
          sort={sort}
          quit={quit}
          openActivityMonitor={openActivityMonitor}
          refresh={refresh}
          onSortChange={(option) => {
            void (isNet ? setStoredNetworkSort(option) : setStoredSort(option));
            const next = {
              ...portable,
              category: activeCategory,
              ...(isNet ? { networkSort: option } : { sort: option }),
            };
            void persistPortableChange(next);
          }}
        />
      ))}
    </List>
  );
}
