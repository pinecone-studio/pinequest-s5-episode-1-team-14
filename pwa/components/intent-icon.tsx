import type { CallSession } from "../../backend/src/calls/store";
import { Icon, type IconName } from "./ui";

const INTENT_ICON: Partial<Record<NonNullable<CallSession["intent"]>, [IconName, string]>> = {
  BOOK_APPOINTMENT: ["calendar", "tone-aqua"], CANCEL_BOOKING: ["calendar", "tone-orange"], ASK_PRICE: ["tag", "tone-orange"],
  ASK_OPENING_HOURS: ["clock", "tone-violet"], REQUEST_HUMAN: ["user", "tone-blue"],
};

// Дуудлагын зорилгыг илтгэх дугуй тэмдэг — Ерөнхий тойм, Дуудлагууд хоёуланд ижил.
export function IntentIcon({ intent }: { intent: CallSession["intent"] }) {
  const [icon, tone] = (intent && INTENT_ICON[intent]) || ([intent ? "chat" : "phone", "tone-gray"] as const);
  return <span className={"feed-icon " + tone} aria-hidden="true"><Icon name={icon} size={16} /></span>;
}
