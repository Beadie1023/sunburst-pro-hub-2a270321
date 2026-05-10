import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await signIn(fd.get("email") as string, fd.get("password") as string);
    setLoading(false);
    if (error) return toast.error(error, { duration: 8000 });
    toast.success("Welcome back");
    navigate({ to: "/pro-hub" });
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    setLoading(true);
    const { error } = await signUp(
      email,
      fd.get("password") as string,
      {
        full_name: fd.get("full_name") as string,
        company_name: fd.get("company_name") as string,
        phone: fd.get("phone") as string,
      },
    );
    setLoading(false);
    if (error) {
      toast.error(error, { duration: 8000 });
      return;
    }
    toast.success(`Account created! Check ${email} to verify your address, then sign in.`, { duration: 9000 });
    (e.currentTarget as HTMLFormElement).reset();
  };

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto px-4 py-12">
        <Card className="mx-auto max-w-md p-8">
          <h1 className="text-2xl font-bold text-primary">Contractor Pro-Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in or apply for a contractor account.
          </p>
          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Apply</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 pt-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div>
                  <Label htmlFor="company_name">Company / Crew Name</Label>
                  <Input id="company_name" name="company_name" required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" required />
                </div>
                <div>
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" name="email" type="email" required />
                </div>
                <div>
                  <Label htmlFor="password2">Password</Label>
                  <Input id="password2" name="password" type="password" minLength={6} required />
                </div>
                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
                  {loading ? "Creating…" : "Apply for Pro Account"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  New accounts require admin approval before pro pricing unlocks.
                </p>
              </form>
            </TabsContent>
          </Tabs>
          <p className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/" className="hover:text-accent">← Back to home</Link>
            <Link to="/admin/login" className="hover:text-accent">Admin login →</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
