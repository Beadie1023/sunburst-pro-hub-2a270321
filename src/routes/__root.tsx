import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sunburst Paints Pro-Portal — Bahamas Contractor Paint Supplier" },
      {
        name: "description",
        content:
          "The Bahamas' professional paint supplier. Salt-resistant coatings, zero lead times, contractor pricing. Order online for Nassau & Family Islands.",
      },
      { property: "og:title", content: "Sunburst Paints Pro-Portal — Bahamas Contractor Paint Supplier" },
      {
        property: "og:description",
        content: "Engineered for the Bahamian Sun. Built for contractors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Sunburst Paints Pro-Portal — Bahamas Contractor Paint Supplier" },
      { name: "description", content: "Sunburst Pro Connect is a B2B web app for Bahamian contractors to order paint and supplies." },
      { property: "og:description", content: "Sunburst Pro Connect is a B2B web app for Bahamian contractors to order paint and supplies." },
      { name: "twitter:description", content: "Sunburst Pro Connect is a B2B web app for Bahamian contractors to order paint and supplies." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cd4306ce-0e7d-4ef2-90d9-98c930ef5cd2/id-preview-95927564--a123152b-b888-47d3-ba43-be6fd54f8d5a.lovable.app-1776872236564.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cd4306ce-0e7d-4ef2-90d9-98c930ef5cd2/id-preview-95927564--a123152b-b888-47d3-ba43-be6fd54f8d5a.lovable.app-1776872236564.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <CartProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </CartProvider>
    </AuthProvider>
  );
}
