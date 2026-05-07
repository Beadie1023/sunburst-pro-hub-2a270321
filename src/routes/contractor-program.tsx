import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, Wallet, Truck, Tag } from "lucide-react";

export const Route = createFileRoute("/contractor-program")({
  component: ContractorProgram,
  head: () => ({
    meta: [
      { title: "Contractor Program — Sunburst Paints" },
      {
        name: "description",
        content:
          "Volume pricing, Net-30 terms, dedicated account manager, and priority delivery for approved Bahamian contractors.",
      },
      { property: "og:title", content: "Sunburst Contractor Program" },
      {
        property: "og:description",
        content: "Pro pricing, Net-30, priority delivery for approved crews.",
      },
    ],
  }),
});

function ContractorProgram() {
  const benefits = [
    { icon: Tag, k: "Pro Pricing", v: "Up to 10%+ off retail on every gallon, every order." },
    { icon: Wallet, k: "Net-30 Terms", v: "Approved accounts get 30-day credit terms." },
    { icon: Truck, k: "Priority Delivery", v: "Same-day Nassau, first-on mailboat to Family Islands." },
    { icon: ShieldCheck, k: "Account Manager", v: "Direct line for reorders, samples, and color matching." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Pro Accounts
          </span>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">
            Built for the crews who keep the islands looking sharp.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">
            Real pricing. Real terms. Real delivery. The Sunburst Contractor Program is free to
            join for licensed Bahamian contractors and approved field crews.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/login">Apply Now</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground">
              <Link to="/contact">Talk to Us</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-4 py-16 md:grid-cols-2 lg:grid-cols-4">
        {benefits.map((b) => (
          <Card key={b.k} className="p-6">
            <b.icon className="h-9 w-9 text-accent" />
            <div className="mt-3 text-lg font-bold text-primary">{b.k}</div>
            <p className="mt-1 text-sm text-muted-foreground">{b.v}</p>
          </Card>
        ))}
      </section>

      <section className="bg-secondary py-16">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="text-3xl font-bold text-primary">How to qualify</h2>
          <ul className="mt-4 space-y-3 text-muted-foreground">
            {[
              "Active Bahamian business licence or trade certification.",
              "Minimum 3 jobs completed in the last 12 months (we'll ask for references).",
              "Valid TIN and contact details for invoicing.",
              "Net-30 terms require credit review (1–2 business days).",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-success" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/login">Create Pro Account</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
