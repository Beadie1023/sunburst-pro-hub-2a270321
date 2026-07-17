import { Outlet, createRootRoute, HeadContent } from "@tanstack/react-router";
import { useEffect } from "react";
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
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    document.title = "Sunburst Paints Pro-Portal — Bahamas Contractor Paint Supplier";
  }, []);
  return (
    <AuthProvider>
      <CartProvider>
        <HeadContent />
        <Outlet />
        <Toaster richColors position="top-right" />
      </CartProvider>
    </AuthProvider>
  );
}

