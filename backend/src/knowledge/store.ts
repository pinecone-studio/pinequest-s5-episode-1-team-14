import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readJsonArray, writeJsonArray } from "../storage/jsonFile.js";

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
    const ids = new Set<string>();
    return readJsonArray(this.filePath).map((item) => {
      validateItem(item);
      if (ids.has(item.id)) throw new TypeError("Duplicate knowledge item ID");
      ids.add(item.id);
      return item;
    });
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
    writeJsonArray(this.filePath, items);
    return item;
  }

  delete(id: string): boolean {
    const items = this.read();
    const remaining = items.filter((item) => item.id !== id);
    if (remaining.length === items.length) return false;
    writeJsonArray(this.filePath, remaining);
    return true;
  }
}
