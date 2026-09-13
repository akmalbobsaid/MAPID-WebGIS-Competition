import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RUJAK — Transit ke Kuliner",
  description: "WebGIS penemuan kuliner berdasarkan jangkauan jalan kaki dari transit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
