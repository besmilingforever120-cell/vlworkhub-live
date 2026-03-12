import "./globals.css";
import { AppShell } from "@vlworkhub/ui";
import { careMeta, careNav } from "../lib/resource-config";

export const metadata = { title: "VLWorkHub Care System" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell appName={careMeta.appName} rootHref={careMeta.rootHref} navItems={careNav}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
