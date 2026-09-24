import { describe, expect, test } from "bun:test";
import { formatHelperRole, formatKillError, formatProtectedReason, formatTransferError, t } from "../src/lib/i18n";
import { fmtPctInt } from "../src/lib/format";

describe("English interface", () => {
  test("labels and transfer errors", () => {
    expect(t.quit).toBe("Quit");
    expect(t.settingsAndTransfer).toBe("Settings & Data Transfer");
    expect(t.otherProcesses(3)).toBe("3 other processes");
    expect(t.memPressureTooltip(fmtPctInt(0.72), fmtPctInt(0.34))).toBe("Memory 72% · Pressure 34%");
    expect(formatTransferError(new Error("共享文件已被外部修改，已阻止覆盖；请先重新读取"))).toContain("overwrite blocked");
  });

  test("process reasons and errors keep unknown values", () => {
    expect(formatProtectedReason("system process")).toBe("System process");
    expect(formatProtectedReason("another user")).toBe("Another user");
    expect(formatHelperRole("Main Process")).toBe("Main Process");
    expect(formatHelperRole("Custom Role")).toBe("Custom Role");
    expect(formatKillError("Process did not exit. Try Force Quit.")).toBe("Process did not exit. Try Force Quit.");
    expect(formatKillError("PID 12: Operation not permitted")).toBe("PID 12: Operation not permitted");
  });
});
