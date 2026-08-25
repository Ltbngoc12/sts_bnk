import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/context/RoleContext";
import { Sidebar } from "@/components/Sidebar";
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationWidget } from "@/components/NotificationWidget";
import { UnsavedChangesProvider } from "@/context/UnsavedChangesContext";

export const metadata: Metadata = {
  title: "Sentosa ISS Case Management System",
  description: "Functional Case Management System (CMS) for Sentosa Development Corporation (SDC)",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Leaflet CSS used to be two render-blocking <link>s to unpkg.com here: an
          extra DNS + TLS handshake to a third party on every single page load, map
          page or not, and an outage we do not control. It is now imported inside
          MapComponent / BoundaryMapDrawer so it ships with the (already lazy)
          map chunk and only on pages that actually render a map. */}
      <body>
        <RoleProvider>
          <NotificationProvider>
            <UnsavedChangesProvider>
              <div className="app-container">
                <Sidebar />
                <main className="main-content">
                  {children}
                </main>
                <NotificationWidget />
              </div>
            </UnsavedChangesProvider>
          </NotificationProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
