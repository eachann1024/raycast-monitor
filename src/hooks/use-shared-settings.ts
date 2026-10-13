import { Toast, showToast } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { formatTransferError, type Messages } from "../lib/i18n";
import { readSharedSettings, replaceSharedSettings, type SharedSettingsFile } from "../lib/shared-settings";
import type { PortableSettings } from "../lib/settings-transfer";

type Props = {
  preferencePath: string;
  portable: PortableSettings;
  applyPortableLocally: (settings: PortableSettings) => void;
  t: Messages;
};

export function useSharedSettings({ preferencePath, portable, applyPortableLocally, t }: Props) {
  const { value: overridePath, setValue: setOverridePath } = useLocalStorage<string>("sharedSettingsOverridePath", "");
  const { value: pathMode, setValue: setPathMode } = useLocalStorage<"preference" | "override">(
    "sharedSettingsPathMode",
    "preference",
  );
  const sharedPath = pathMode === "override" ? (overridePath?.trim() ?? "") : preferencePath;
  const sharedBaseline = useRef<SharedSettingsFile | null>(null);
  const [sharedStatus, setSharedStatus] = useState(sharedPath ? t.waitingShared : t.noSharedPath);
  const persistPortableChange = async (settings: PortableSettings) => {
    if (!sharedPath) return;
    const baseline = sharedBaseline.current;
    if (!baseline) {
      setSharedStatus(t.sharedUnavailable);
      return;
    }
    try {
      sharedBaseline.current = await replaceSharedSettings(sharedPath, baseline.digest, settings);
      setSharedStatus(t.sharedSynced);
    } catch (error) {
      sharedBaseline.current = null;
      setSharedStatus(`${formatTransferError(error, t)}; ${t.notOverwritten}`);
      await showToast({ style: Toast.Style.Failure, title: t.sharedNotSaved, message: formatTransferError(error, t) });
    }
  };
  useEffect(() => {
    sharedBaseline.current = null;
    if (!sharedPath) {
      setSharedStatus(t.noSharedPath);
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const next = await readSharedSettings(sharedPath);
        if (!active) return;
        if (sharedBaseline.current?.digest !== next.digest) {
          sharedBaseline.current = next;
          applyPortableLocally(next.settings);
        }
        setSharedStatus(t.sharedConnected);
      } catch (error) {
        if (!active) return;
        sharedBaseline.current = null;
        setSharedStatus(`${formatTransferError(error, t)}; ${t.notOverwritten}`);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sharedPath, t]);
  const createShared = async () => {
    const { createSharedSettings } = await import("../lib/shared-settings");
    sharedBaseline.current = await createSharedSettings(sharedPath, portable);
    setSharedStatus(t.sharedFileCreated);
  };
  const selectOverride = async (filePath: string) => {
    if (!filePath.toLowerCase().endsWith(".json")) throw new Error(t.selectDotJson);
    await setOverridePath(filePath);
    await setPathMode("override");
  };
  const createAt = async (filePath: string) => {
    if (!filePath.toLowerCase().endsWith(".json")) throw new Error(t.nameDotJson);
    const created = await import("../lib/shared-settings").then(({ createSharedSettings }) =>
      createSharedSettings(filePath, portable),
    );
    sharedBaseline.current = created;
    await setOverridePath(filePath);
    await setPathMode("override");
    setSharedStatus(t.createdAndSwitched);
  };
  const applyShared = async () => {
    if (!sharedBaseline.current) throw new Error(t.sharedNotRead);
    sharedBaseline.current = await replaceSharedSettings(sharedPath, sharedBaseline.current.digest, portable);
    setSharedStatus(t.localApplied);
  };
  const settingsTransferProps = {
    sharedPath,
    sharedStatus,
    preferencePath,
    overridePath: overridePath ?? "",
    pathMode: pathMode ?? "preference",
    onUsePreference: () => void setPathMode("preference"),
    onUseOverride: () => void setPathMode("override"),
    onSelectOverride: selectOverride,
    onCreateAt: createAt,
    onImport: (next: PortableSettings) => {
      applyPortableLocally(next);
      void persistPortableChange(next);
    },
    onCreate: createShared,
    onApplyLocal: applyShared,
  };
  return { persistPortableChange, settingsTransferProps };
}
