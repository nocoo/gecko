import type { Metadata } from "next";
import googleFonts from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const Inter = googleFonts.Inter;
const DM_Sans = googleFonts.DM_Sans;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  ),
  title: "Gecko — Screen Time Dashboard",
  description: "Personal screen time tracking and focus analytics",
  openGraph: {
    title: "Gecko — Screen Time Dashboard",
    description: "Personal screen time tracking and focus analytics",
    type: "website",
    // opengraph-image.png in src/app/ is auto-discovered by Next.js
  },
  // icon.png, apple-icon.png, favicon.ico in src/app/ are auto-discovered
  // by Next.js file-based metadata convention — no manual <link> tags needed.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: apply dark class before first paint to prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("theme");var d=window.matchMedia("(prefers-color-scheme:dark)").matches;if(s==="dark"||(s!=="light"&&d))document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${dmSans.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
