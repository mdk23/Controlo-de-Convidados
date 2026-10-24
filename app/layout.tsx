import type { Metadata, Viewport } from "next";
import { body, display, mono } from "@/lib/fonts";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mesas e Entrada",
  description: "Controlo de convidados: mesas, cadeiras e check-in à entrada.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
