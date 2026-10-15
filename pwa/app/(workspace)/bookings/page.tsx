import type { Metadata } from "next";
import BookingsPage from "@/components/bookings-page";
import { getBookings } from "@/lib/bookings";

export const metadata: Metadata = { title: "Захиалгууд · CallAI" };

export default async function Page() {
  return <BookingsPage {...await getBookings()} now={Date.now()} />;
}
