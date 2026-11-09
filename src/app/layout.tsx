import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/lib/wagmi/provider";
import { AuthProvider } from "@/lib/auth/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Good Square — Open Community Infrastructure",
    template: "%s · Good Square",
  },
  description:
    "One infrastructure. Unlimited communities. Open-source, modular community infrastructure on Celo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Web3Provider>
          <AuthProvider>
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </AuthProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
