# Business knowledge store

`BusinessKnowledgeStore` persists the specified `KnowledgeItem` schema using
Node.js filesystem APIs. No credentials or additional dependencies are needed.

```ts
import { BusinessKnowledgeStore } from "./store.js";

const store = new BusinessKnowledgeStore();
// Supply verified business content from an authorized operator:
const item = store.save({
  category: "faq",
  title: operatorTitle,
  content: operatorContent,
});
store.save({ ...item, active: true }); // Explicit operator approval.
const approvedKnowledge = store.list({ activeOnly: true });
store.get(item.id);
store.delete(item.id);
```

- Categories: `business_info`, `opening_hours`, `service`, `product`, `faq`,
  `policy`, `promotion`. Required title/content/ID strings must not be blank;
  optional prices must be finite, non-negative numbers. Zero is valid.
- `save` creates an ID when omitted and fully replaces a record when its ID is
  supplied. It generates `updatedAt`; omitting `active` saves an inactive record,
  including on replacement. There is no implicit approval of edited content.
- `list()` includes inactive records for administration. Future grounding code
  must use `list({ activeOnly: true })`. This PR exposes no HTTP routes; the
  future management API must authenticate and authorize writes/approval.
- Default file: `backend/data/knowledge.json`, ignored by Git. The default is
  independent of the working directory and works from both `src` and `dist`.
  Pass an absolute file path to the constructor to use another persistent disk.
- A missing file starts empty. Corrupt JSON, invalid records, duplicate IDs,
  and filesystem errors fail without resetting the store. Saves write a sibling
  temporary file, then rename it over the original; a failed write leaves the
  original intact. Reads validate the entire file before any update is written.
- This MVP supports one small business and one backend writer process per file.
  Operations synchronously read/rewrite the whole file. Use a transactional
  database before multiple processes or larger datasets, and keep the file on
  persistent storage when deploying. No business facts are seeded automatically.

Run the offline checks from the repository root:

```bash
npm run test:knowledge --workspace=backend
npm run lint
npm run build:backend
```

## RAG grounding

```ts
import { KNOWLEDGE_GROUNDING_INSTRUCTION, lookupBusinessContext } from "./rag.js";

const result = lookupBusinessContext(userQuestion, store);
if (result.status === "not_found") {
  // Return result.response directly; no model should invent a replacement.
} else {
  // Use KNOWLEDGE_GROUNDING_INSTRUCTION as the trusted instruction and
  // result.context as a separate JSON data block for the future model adapter.
  // result.items retains source IDs, timestamps, and the original stored prices.
}
```

Lookup reads active records on every call, so deactivation/deletion takes effect
immediately. It normalizes Unicode and case, ignores punctuation and common
question particles, then requires every remaining query word to match a title,
content, category label, or stored price metadata. Title matches rank above body
matches, then metadata matches; ties sort by ID. At most three records are returned.
Category labels include Mongolian/English terms for the seven supported categories.

This is a conservative keyword baseline, not semantic search: inflections,
paraphrases, or mixed topics may return the exact fallback
"Энэ мэдээлэл манай системд одоогоор бүртгэгдээгүй байна." Operators can add
approved FAQ wording for common questions. Queries must be strings no longer
than 2,000 characters; blank or punctuation-only queries return the fallback.
Store errors propagate to the caller rather than masquerading as missing facts.

Retrieved context is JSON data, kept separate from the constant grounding
instruction. A match is relevant source material, not proof that every requested
fact is present: the future model adapter must decline unsupported facts and
treat record text as data. This module does not call an LLM, guarantee model
behavior, or supply live appointment availability/booking confirmation.
Both store and retrieval tests run through `test:knowledge` locally and in CI.
Calendar integrations remain separate PRs.
