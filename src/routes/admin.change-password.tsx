import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/change-password")({
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: "Set New Password — Sunburst Admin" }] }),
});

function ChangePasswordPage() {
  const { user, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/admin/login" });
  }, [loading, user, navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = fd.get("password") as string;
    const confirm = fd.get("confirm") as string;
    if (pw.length < 10) return toast.error("Use at least 10 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    if (user) {
      await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      await refreshProfile();
    }
    setBusy(false);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto px-4 py-12">
        <Card className="mx-auto max-w-md p-8">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-accent" />
            <h1 className="text-2xl font-bold text-primary">Set a new password</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            For security, please replace the temporary password before continuing.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
              <p className="mt-1 text-xs text-muted-foreground">Minimum 10 characters.</p>
            </div>
            <div>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
