import type { Metadata } from "next";
import BookingsPage from "@/components/bookings-page";
import { getBookings } from "@/lib/bookings";

export const metadata: Metadata = { title: "Захиалгууд · AI Front-Desk Mongolia" };

export default function Page() {
  return <BookingsPage {...getBookings()} />;
}
