import type { KnowledgeItem } from "../../backend/src/knowledge/store";

export const knowledgeCategories: Record<KnowledgeItem["category"], string> = {
  business_info: "Бизнесийн мэдээлэл", opening_hours: "Цагийн хуваарь", service: "Үйлчилгээ",
  product: "Бүтээгдэхүүн", faq: "Түгээмэл асуулт", policy: "Бодлого", promotion: "Урамшуулал",
};

const demoItems: KnowledgeItem[] = [
  { id: "demo-knowledge-01", category: "business_info", title: "Манай салон", content: "Туршилтын салон: үс засалт, үс будах, маникюрын үйлчилгээтэй.", active: true, updatedAt: "2026-10-08T06:00:00.000Z" },
  { id: "demo-knowledge-02", category: "opening_hours", title: "Ажиллах цаг", content: "Жишээ хуваарь: Даваа–Бямба 09:00–18:00. Нямд амарна.", active: true, updatedAt: "2026-10-08T05:00:00.000Z" },
  { id: "demo-knowledge-03", category: "service", title: "Үс засалт", content: "Жишээ үйлчилгээ: 30 минутын үс засалт.", price: 30000, active: true, updatedAt: "2026-10-08T04:00:00.000Z" },
  { id: "demo-knowledge-04", category: "product", title: "Үс арчилгааны бүтээгдэхүүн", content: "Туршилтын бүтээгдэхүүн. Нөхцөлийг нягтлах шаардлагатай.", price: 25000, active: false, updatedAt: "2026-10-08T03:00:00.000Z" },
  { id: "demo-knowledge-05", category: "faq", title: "Урьдчилан цаг авах уу?", content: "Жишээ хариулт: Тийм, ирэхээсээ өмнө цаг захиална уу.", active: true, updatedAt: "2026-10-08T02:00:00.000Z" },
  { id: "demo-knowledge-06", category: "policy", title: "Цаг өөрчлөх нөхцөл", content: "Жишээ бодлого: Цагаа өөрчлөх бол ажилтантай холбогдоно уу.", active: true, updatedAt: "2026-10-08T01:00:00.000Z" },
  { id: "demo-knowledge-07", category: "promotion", title: "Арчилгааны зөвлөгөө", content: "Жишээ урамшуулал: үнэ төлбөргүй арчилгааны зөвлөгөө. Батлах шаардлагатай.", price: 0, active: false, updatedAt: "2026-10-07T16:15:00.000Z" },
];

export function getKnowledge(): { items: KnowledgeItem[]; isDemo: boolean } {
  const isDemo = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
  return { items: isDemo ? [...demoItems] : [], isDemo };
}
