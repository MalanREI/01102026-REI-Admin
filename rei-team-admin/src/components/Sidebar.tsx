"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, APP_NAME } from "@/src/config/app.config";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { useState } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      const sb = supabaseBrowser();
      await sb.auth.signOut();
      window.location.href = "/login";
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="h-screen w-64 border-r bg-white p-4 flex flex-col">
      <div className="mb-6">
        <div className="text-lg font-semibold">{APP_NAME}</div>
        <div className="text-xs text-gray-500">Internal team workspace</div>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded px-3 py-2 text-sm",
                active ? "bg-gray-100 font-medium" : "hover:bg-gray-50",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={signOut}
        disabled={signingOut}
        className="mt-4 rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black disabled:opacity-60"
      >
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
    </aside>
  );
}
