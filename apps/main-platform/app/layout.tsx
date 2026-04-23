import "./globals.css";

export const metadata = {
  title: "VLWorkHub",
  description: "Integrated platform for care, HR, and safety operations."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
