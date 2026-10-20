import { unstable_rethrow } from "next/navigation";
import { serverAccount } from "@/lib/auth/session";
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
  title: "LeetCode Tracker",
  description:
    "Register once and receive a daily recap of your solved LeetCode questions in Telegram.",
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
