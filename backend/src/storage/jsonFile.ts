import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonArray(filePath: string): unknown[] {
  let json: string;
  try {
    json = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new TypeError("Store must contain an array");
  return data as unknown[];
}

export function writeJsonArray(filePath: string, items: readonly unknown[]): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, JSON.stringify(items, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
