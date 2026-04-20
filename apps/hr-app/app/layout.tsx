import "./globals.css";
import { HrPortalShell } from "../components/hr-portal-shell";

export const metadata = { title: "VLWorkHub HR System" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <HrPortalShell>{children}</HrPortalShell>
      </body>
    </html>
  );
}
