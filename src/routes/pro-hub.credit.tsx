import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/pro-hub/credit")({
  component: () => (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-primary">Account Credit</h1>
        <p className="text-muted-foreground">Net-30 terms, deposits, and credit balance.</p>
      </div>
      <Card className="p-12 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-3 text-lg font-semibold">Credit accounts coming soon</h3>
        <p className="mt-1 text-sm text-muted-foreground">Net-30 application and balance tracking arrive in the next release.</p>
        <Link to="/contractor-program" className="mt-3 inline-block text-accent underline">
          Learn about the contractor program →
        </Link>
      </Card>
    </div>
  ),
});
