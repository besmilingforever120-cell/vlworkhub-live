import "./globals.css";
import { AppShell } from "@vlworkhub/ui";
import { ursafeMeta, ursafeNav } from "../lib/resource-config";

export const metadata = { title: "VLWorkHub UR Safe" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell appName={ursafeMeta.appName} rootHref={ursafeMeta.rootHref} navItems={ursafeNav}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
