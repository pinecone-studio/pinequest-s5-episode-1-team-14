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

RAG retrieval and calendar integrations are separate PRs.
