import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getServerSession } from "@/lib/security";

export const metadata: Metadata = {
  title: "Dashboard | Pengingat Jadwal",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession();
  if (!session.authenticated) {
    redirect("/login");
  }

  return <DashboardShell />;
}
