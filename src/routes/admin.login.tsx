import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
  head: () => ({ meta: [{ title: "Admin Login — Sunburst Paints" }] }),
});

function AdminLogin() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setLoading(false);
      return toast.error(error);
    }
    // Verify admin role before sending into dashboard
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setLoading(false);
      return toast.error("Login failed");
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      await supabase.auth.signOut();
      setLoading(false);
      return toast.error("This account does not have admin access.");
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", u.user.id)
      .maybeSingle();
    setLoading(false);
    if (profile?.must_change_password) {
      toast.message("Please set a new password to continue.");
      navigate({ to: "/admin/change-password" });
    } else {
      toast.success("Welcome, admin");
      navigate({ to: "/dashboard" });
    }
  };

  const handleForgot = async () => {
    const email = (document.getElementById("admin-email") as HTMLInputElement | null)?.value;
    if (!email) return toast.error("Enter your email above first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/change-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Reset link sent — check your email");
  };

  return (
    <div className="min-h-screen bg-primary">
      <Header />
      <div className="container mx-auto px-4 py-12">
        <Card className="mx-auto max-w-md border-l-4 border-l-accent p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">Admin Console</h1>
              <p className="text-xs text-muted-foreground">Restricted access · staff only</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" name="email" type="email" required autoComplete="username" />
            </div>
            <div>
              <Label htmlFor="admin-password">Password</Label>
              <Input id="admin-password" name="password" type="password" required autoComplete="current-password" />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <button onClick={handleForgot} className="underline hover:text-accent">
              Forgot password?
            </button>
            <Link to="/login" className="underline hover:text-accent">
              Contractor login →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
