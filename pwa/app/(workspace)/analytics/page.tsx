import type { Metadata } from "next";
import AnalyticsPage from "@/components/analytics-page";
import { getCalls } from "@/lib/calls";
import { getBookings } from "@/lib/bookings";

export const metadata: Metadata = { title: "Тайлан · AI Front-Desk Mongolia" };

export default async function Page() {
  const [{ calls, source }, { bookings, source: bookingsSource }] = await Promise.all([getCalls(), getBookings()]);
  // Send only reporting fields to this client page; names, phone numbers and provider IDs stay out.
  return <AnalyticsPage source={source} bookingsSource={bookingsSource} now={Date.now()}
    calls={calls.map(({ startedAt, duration, status, intent, bookingCreated }) => ({ startedAt, duration, status, intent, bookingCreated }))}
    bookings={bookings.map(({ startTime }) => ({ startTime }))} />;
}
