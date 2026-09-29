import { Icon, MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { fmtPctInt } from "./lib/format";
import { AppMenu, FooterSection, hottestRows, loadCpuMenu, useMessages, useQuit } from "./menu-bar-view";

export default function CpuMenuBar() {
  const t = useMessages();
  const { data, isLoading, revalidate } = useCachedPromise(loadCpuMenu, [], {
    keepPreviousData: true,
  });
  const quit = useQuit(revalidate);
  const rows = data?.rows ?? [];
  const topCpu = hottestRows(rows, "cpu");

  return (
    <MenuBarExtra
      icon={data?.iconPath ? { source: data.iconPath } : Icon.Gauge}
      title={fmtPctInt(data?.cpuRatio)}
      tooltip={t.cpuValue(fmtPctInt(data?.cpuRatio))}
      isLoading={isLoading && !data}
    >
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title={`${t.user} · ${t.system}`}
          subtitle={`${fmtPctInt(data?.userRatio)} · ${fmtPctInt(data?.sysRatio)}`}
        />
        <MenuBarExtra.Item
          title={`${t.efficiency} · ${t.performance}`}
          subtitle={`${fmtPctInt(data?.eRatio)} · ${fmtPctInt(data?.pRatio)}`}
        />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section title={`${t.processes} · ${t.cpu}`}>
        {topCpu.map((row) => (
          <AppMenu key={`cpu:${row.id}`} row={row} metric="cpu" onQuit={quit} t={t} />
        ))}
      </MenuBarExtra.Section>
      <FooterSection onRefresh={() => void revalidate()} t={t} />
    </MenuBarExtra>
  );
}
