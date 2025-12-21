import { redirect } from "next/navigation";

// Vicu now uses /hoy as main home, projects list hidden from nav
// Redirect any direct visits to /experiments back to /hoy
export default function ExperimentsPage() {
  redirect("/hoy");
}
