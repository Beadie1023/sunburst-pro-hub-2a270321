import { createFileRoute, Link, Outlet, useRouterState, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { Palette, FolderKanban, Heart, RotateCcw, Wallet, Search, Wifi, Menu, X, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/pro-hub")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: ProHubLayout,
  head: () => ({
    meta: [
      { title: "Pro Hub — Sunburst Paints Contractor Workspace" },
      { name: "description", content: "Plan projects, browse technical swatches, and reorder fast. Built for Bahamian contractors." },
    ],
  }),
});

const NAV = [
  { to: "/pro-hub", label: "Global Catalog", icon: Palette, exact: true },
  { to: "/pro-hub/ai-advisor", label: "AI Color Advisor", icon: Sparkles },
  { to: "/pro-hub/projects", label: "My Projects", icon: FolderKanban },
  { to: "/pro-hub/saved", label: "Saved Colors", icon: Heart },
  { to: "/pro-hub/reorder", label: "Reorder Center", icon: RotateCcw },
  { to: "/pro-hub/credit", label: "Account Credit", icon: Wallet },
] as const;

function ProHubLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Pro Hub status bar */}
      <div className="border-b border-border bg-primary text-primary-foreground">
        <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-2 py-0.5 font-semibold text-success">
            <Wifi className="h-3 w-3" /> Nassau Warehouse · Online
          </span>
          <span className="hidden sm:inline opacity-80">VAT 10% · Same-day Nassau · Mailboat Family Islands</span>
          <div className="ml-auto hidden flex-1 max-w-sm md:block">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary-foreground/60" />
              <Input
                placeholder="Search colors, collections, products…"
                className="h-8 border-white/20 bg-white/10 pl-8 text-xs text-primary-foreground placeholder:text-primary-foreground/60"
              />
            </div>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto md:hidden inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Menu
          </button>
        </div>
      </div>

      <div className="container mx-auto flex gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside
          className={`${open ? "block" : "hidden"} md:block w-full md:w-56 shrink-0`}
        >
          <nav className="sticky top-20 space-y-1 rounded-lg border border-border bg-card p-2">
            {NAV.map((n) => {
              const active = isActive(n.to, "exact" in n ? n.exact : false);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-foreground/80 hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
