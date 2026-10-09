import type { Metadata } from "next";
import AnalyticsPage from "@/components/analytics-page";
import { getCalls } from "@/lib/calls";
import { getBookings } from "@/lib/bookings";

export const metadata: Metadata = { title: "Тайлан · AI Front-Desk Mongolia" };

export default function Page() {
  const { calls, isDemo } = getCalls();
  const { bookings } = getBookings();
  // Send only reporting fields to this client page; names, phone numbers and provider IDs stay out.
  return <AnalyticsPage isDemo={isDemo}
    calls={calls.map(({ startedAt, duration, status, intent, bookingCreated }) => ({ startedAt, duration, status, intent, bookingCreated }))}
    bookings={bookings.map(({ startTime }) => ({ startTime }))} />;
}
