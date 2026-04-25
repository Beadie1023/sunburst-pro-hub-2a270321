import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Sun } from "lucide-react";

export function Header() {
  const { user, role, signOut } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-md supports-[backdrop-filter]:bg-transparent"
      style={{ background: "var(--gradient-header)" }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 text-primary-foreground">
        <Link to="/" className="flex items-center gap-2 font-bold text-primary-foreground">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-md">
            <Sun className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base">SUNBURST PAINTS</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-accent">
              Pro-Portal
            </div>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link to="/" className="text-primary-foreground/90 hover:text-accent">
            Home
          </Link>
          <Link to="/products" className="text-primary-foreground/90 hover:text-accent">
            Products
          </Link>
          <Link to="/bundles" className="text-primary-foreground/90 hover:text-accent">
            Bundles
          </Link>
          <Link to="/calculator" className="text-primary-foreground/90 hover:text-accent">
            Calculator
          </Link>
          {user && (
            <Link to="/dashboard" className="text-primary-foreground/90 hover:text-accent">
              Dashboard
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/cart"
            className="relative inline-flex h-10 items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-medium text-primary-foreground backdrop-blur hover:bg-white/20"
            aria-label="Cart"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground">
                {itemCount}
              </span>
            )}
          </Link>
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
                className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
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
