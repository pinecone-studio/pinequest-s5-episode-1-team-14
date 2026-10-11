// Жишээ рестораны мэдлэгийн сан үүсгэх нэг удаагийн script.
// Ажиллуулах: npx tsx src/knowledge/seed.ts (backend/-ээс)

import { BusinessKnowledgeStore } from "./store.js";

const store = new BusinessKnowledgeStore();

const items: Array<Parameters<typeof store.save>[0]> = [
  {
    id: "hours",
    category: "opening_hours",
    title: "Ажлын цаг",
    content: "Манайх өдөр бүр өглөөний 11:00 цагаас оройн 22:00 цаг хүртэл ажилладаг.",
    active: true,
  },
  {
    id: "menu-buuz",
    category: "product",
    title: "Бууз",
    content: "Уламжлалт монгол бууз, 5ш нэг порц.",
    price: 15000,
    active: true,
  },
  {
    id: "menu-khuushuur",
    category: "product",
    title: "Хуушуур",
    content: "Шарсан хуушуур, 3ш нэг порц.",
    price: 12000,
    active: true,
  },
  {
    id: "menu-guriltai-shol",
    category: "product",
    title: "Гурилтай шөл",
    content: "Монгол гурилтай шөл, мах, ногоотой.",
    price: 18000,
    active: true,
  },
  {
    id: "vegetarian",
    category: "faq",
    title: "Вегетариан сонголт",
    content: "Манайд ногоон гурилтай шөл, хуурга зэрэг вегетариан хоол байдаг.",
    active: true,
  },
];

for (const item of items) store.save(item);
console.log(`${items.length} мэдлэгийн бичлэг нэмэгдлээ.`);
