import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ED Assignment System",
  description: "Patient assignment board for Kaiser Fontana and Ontario EDs"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
