import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "letdove knowledge base",
  description: "A structured visual knowledge base and prompt library for LetDove content cards.",
  openGraph: {
    title: "letdove knowledge base",
    description: "Structured cards for prompts, visual systems, and content taxonomy.",
    type: "website"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
