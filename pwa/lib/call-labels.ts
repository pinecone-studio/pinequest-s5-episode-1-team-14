import type { CallSession } from "../../backend/src/calls/store";

export const callStatuses: Record<CallSession["status"], string> = {
  active: "Явагдаж байна", completed: "Дууссан", failed: "Амжилтгүй", handed_off: "Ажилтанд шилжсэн",
};
export const callIntents: Record<NonNullable<CallSession["intent"]>, string> = {
  ASK_PRICE: "Үнэ асуусан", ASK_SERVICE: "Үйлчилгээ асуусан", ASK_OPENING_HOURS: "Цагийн хуваарь асуусан",
  BOOK_APPOINTMENT: "Цаг захиалах", CANCEL_BOOKING: "Захиалга цуцлах", ASK_PRODUCT: "Бүтээгдэхүүн асуусан",
  REQUEST_HUMAN: "Ажилтантай холбогдох", GENERAL_QUERY: "Ерөнхий асуулт",
};
