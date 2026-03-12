import "./globals.css";
import { AppShell } from "@vlworkhub/ui";
import { hrMeta, hrNav } from "../lib/resource-config";

export const metadata = { title: "VLWorkHub HR System" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell appName={hrMeta.appName} rootHref={hrMeta.rootHref} navItems={hrNav}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
