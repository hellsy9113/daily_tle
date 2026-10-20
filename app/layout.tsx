import { unstable_rethrow } from "next/navigation";
import { serverAccount } from "@/lib/auth/session";
import { siteDescription, siteName, siteOrigin, siteTitle } from "@/lib/site-metadata";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: siteTitle,
  description: siteDescription,
  applicationName: siteName,
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: { card: "summary_large_image", title: siteTitle, description: siteDescription },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let theme: "light" | "dark" | undefined;
  try {
    theme = (await serverAccount())?.theme ?? undefined;
  } catch (error) {
    unstable_rethrow(error);
  }
  return (
    <html
      data-theme={theme}
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
