import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const KNOWLEDGE_CATEGORIES = [
  "business_info", "opening_hours", "service", "product", "faq", "policy", "promotion",
] as const;

export type KnowledgeItem = {
  id: string;
  category: (typeof KNOWLEDGE_CATEGORIES)[number];
  title: string;
  content: string;
  price?: number;
  active: boolean;
  updatedAt: string;
};

function validateItem(value: unknown): asserts value is KnowledgeItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Knowledge item must be an object");
  }
  const item = value as Record<string, unknown>;
  const fields = ["id", "category", "title", "content", "price", "active", "updatedAt"];
  if (Object.keys(item).some((key) => !fields.includes(key))) {
    throw new TypeError("Unknown knowledge item field");
  }
  for (const key of ["id", "title", "content", "updatedAt"]) {
    if (typeof item[key] !== "string" || !item[key].trim()) {
      throw new TypeError(`${key} must be a non-empty string`);
    }
  }
  if (!KNOWLEDGE_CATEGORIES.some((category) => category === item.category)) {
    throw new TypeError("Invalid knowledge category");
  }
  if (typeof item.active !== "boolean") {
    throw new TypeError("active must be a boolean");
  }
  if (item.price !== undefined &&
      (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0)) {
    throw new TypeError("price must be a finite, non-negative number");
  }
  const date = item.updatedAt as string;
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date) {
    throw new TypeError("updatedAt must be an ISO timestamp");
  }
}

// ponytail: synchronous whole-file storage for one small-business backend process;
// use a transactional database before multiple writers or a large knowledge base.
export class BusinessKnowledgeStore {
  constructor(private readonly filePath = resolve(__dirname, "../../data/knowledge.json")) {}

  private read(): KnowledgeItem[] {
    let json: string;
    try {
      json = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data)) throw new TypeError("Knowledge store must contain an array");
    const ids = new Set<string>();
    return (data as unknown[]).map((item) => {
      validateItem(item);
      if (ids.has(item.id)) throw new TypeError("Duplicate knowledge item ID");
      ids.add(item.id);
      return item;
    });
  }

  private write(items: KnowledgeItem[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, JSON.stringify(items, null, 2) + "\n", {
        encoding: "utf8", flag: "wx", mode: 0o600,
      });
      renameSync(temporaryPath, this.filePath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }

  list({ activeOnly = false }: { activeOnly?: boolean } = {}): KnowledgeItem[] {
    return this.read().filter((item) => !activeOnly || item.active);
  }

  get(id: string): KnowledgeItem | undefined {
    return this.read().find((item) => item.id === id);
  }

  // Full replacement by ID; omitted IDs are generated. Approval must be explicit.
  save(input: unknown): KnowledgeItem {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Knowledge item must be an object");
    }
    const fields = input as Record<string, unknown>;
    const item = {
      ...fields,
      id: fields.id === undefined ? randomUUID() : fields.id,
      active: fields.active === undefined ? false : fields.active,
      updatedAt: new Date().toISOString(),
    };
    validateItem(item);
    const items = this.read();
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index === -1) items.push(item);
    else items[index] = item;
    this.write(items);
    return item;
  }

  delete(id: string): boolean {
    const items = this.read();
    const remaining = items.filter((item) => item.id !== id);
    if (remaining.length === items.length) return false;
    this.write(remaining);
    return true;
  }
}
