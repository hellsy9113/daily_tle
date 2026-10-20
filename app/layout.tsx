import { unstable_rethrow } from "next/navigation";
import { serverAccount } from "@/lib/auth/session";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TimezoneProvider } from "@/components/timezone-provider";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeetCode Tracker",
  description:
    "Register once and receive a daily recap of your solved LeetCode questions in Telegram.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let theme: "light" | "dark" | undefined;
  let timezone = DEFAULT_TIMEZONE;
  try {
    const account = await serverAccount();
    theme = account?.theme ?? undefined;
    timezone = account?.timezone ?? DEFAULT_TIMEZONE;
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
        <TimezoneProvider timezone={timezone}>{children}</TimezoneProvider>
      </body>
    </html>
  );
}
