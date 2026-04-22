import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Loader2, Package, Users, ClipboardList, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (role === "pending") {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="container mx-auto max-w-xl px-4 py-16">
          <Card className="border-l-4 border-l-warning p-8 text-center">
            <h1 className="text-2xl font-bold text-primary">Account Pending Approval</h1>
            <p className="mt-3 text-muted-foreground">
              Thanks for applying. A Sunburst team member will verify your contractor account
              shortly. You'll get an email once approved.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const nav = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/dashboard/orders", label: "Orders", icon: ClipboardList },
    { to: "/dashboard/clients", label: "Clients", icon: Users },
    { to: "/dashboard/products", label: "Products", icon: Package },
  ];

  const isOverview = loc.pathname === "/dashboard" || loc.pathname === "/dashboard/";

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto px-4 py-6">
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <aside className="space-y-1">
            {nav.map((n) => {
              const active = n.exact ? isOverview : loc.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </aside>
          <main>{isOverview ? <Overview /> : <Outlet />}</main>
        </div>
      </div>
    </div>
  );
}

function Overview() {
  const { user, role } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Welcome back</h1>
        <p className="text-muted-foreground">
          {user?.email} · <span className="font-semibold uppercase text-accent">{role}</span>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/dashboard/orders">
          <Card className="p-6 transition-shadow hover:shadow-lg">
            <ClipboardList className="h-8 w-8 text-accent" />
            <div className="mt-3 font-semibold text-primary">Orders</div>
            <div className="text-sm text-muted-foreground">View and manage orders</div>
          </Card>
        </Link>
        <Link to="/dashboard/clients">
          <Card className="p-6 transition-shadow hover:shadow-lg">
            <Users className="h-8 w-8 text-accent" />
            <div className="mt-3 font-semibold text-primary">Clients</div>
            <div className="text-sm text-muted-foreground">Add & track contractor clients</div>
          </Card>
        </Link>
        <Link to="/dashboard/products">
          <Card className="p-6 transition-shadow hover:shadow-lg">
            <Package className="h-8 w-8 text-accent" />
            <div className="mt-3 font-semibold text-primary">Products</div>
            <div className="text-sm text-muted-foreground">Inventory & pricing</div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
