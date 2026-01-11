import "./globals.css";
import type { Metadata } from "next";
import { APP_NAME } from "@/src/config/app.config";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Internal admin panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
