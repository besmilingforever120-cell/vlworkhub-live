import "./globals.css";
import { UrsafeShell } from "../components/ursafe-shell";

export const metadata = { title: "VLWorkHub UR Safe" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen bg-gray-100 text-slate-900 antialiased">
        <UrsafeShell>{children}</UrsafeShell>
      </body>
    </html>
  );
}
