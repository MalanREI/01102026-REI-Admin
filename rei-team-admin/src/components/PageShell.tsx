import { ReactNode } from "react";
import { Sidebar } from "@/src/components/Sidebar";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
