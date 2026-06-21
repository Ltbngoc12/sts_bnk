import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/context/RoleContext";
import { Sidebar } from "@/components/Sidebar";
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationWidget } from "@/components/NotificationWidget";

export const metadata: Metadata = {
  title: "Sentosa ISS Case Management System",
  description: "Functional Case Management System (CMS) for Sentosa Development Corporation (SDC)",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossOrigin="" />
      </head>
      <body>
        <RoleProvider>
          <NotificationProvider>
            <div className="app-container">
              <Sidebar />
              <main className="main-content">
                {children}
              </main>
              <NotificationWidget />
            </div>
          </NotificationProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
