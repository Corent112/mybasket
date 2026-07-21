import type { Metadata } from "next";
import { Roboto, Alfa_Slab_One } from "next/font/google";

import "./globals.css";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

const roboto = Roboto({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

const alfa = Alfa_Slab_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-alfa",
});

export const metadata: Metadata = {
  title: "MyBasket",
  description: "L'application des coachs de basket",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${roboto.variable} ${alfa.variable}`}>
      <body>
        <div className="app-shell">
          <Header />

          <main className="app-main">
            {children}
          </main>

          <Footer />
        </div>
      </body>
    </html>
  );
}