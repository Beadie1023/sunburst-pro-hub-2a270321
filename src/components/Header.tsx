import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sun } from "lucide-react";

export function Header() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-primary">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sun className="h-5 w-5" style={{ color: "oklch(0.7 0.21 45)" }} />
          </div>
          <div className="leading-tight">
            <div className="text-base">SUNBURST PAINTS</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-accent">
              Pro-Portal
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link to="/" className="text-foreground hover:text-accent">
            Home
          </Link>
          <Link to="/products" className="text-foreground hover:text-accent">
            Products
          </Link>
          {user && (
            <Link to="/dashboard" className="text-foreground hover:text-accent">
              Dashboard
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {role === "pending" && (
                <span className="hidden rounded bg-warning/20 px-2 py-1 text-xs font-semibold text-foreground sm:inline">
                  Pending Approval
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/login">Contractor Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
