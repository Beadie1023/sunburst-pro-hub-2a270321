import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Anchor, Waves, ShieldCheck, Droplet } from "lucide-react";

export const Route = createFileRoute("/marine")({
  component: MarinePage,
  head: () => ({
    meta: [
      { title: "Marine & Coastal Coatings — Sunburst Paints" },
      {
        name: "description",
        content:
          "Anti-corrosive primers, marine topcoats and seawall sealers engineered for Bahamian salt, sun, and surf.",
      },
      { property: "og:title", content: "Marine & Coastal Coatings" },
      {
        property: "og:description",
        content: "Salt-resistant systems for docks, seawalls and coastal builds.",
      },
    ],
  }),
});

function MarinePage() {
  const systems = [
    {
      icon: Anchor,
      title: "Dock & Pier Systems",
      desc: "Anti-corrosive primer + marine topcoat for hardwood, steel and concrete pilings.",
    },
    {
      icon: Waves,
      title: "Seawall Sealers",
      desc: "Penetrating sealer + flexible elastomeric topcoat to defeat salt spray and tidal cycling.",
    },
    {
      icon: Droplet,
      title: "Coastal Exteriors",
      desc: "UV-stable, mildew-resistant coatings for shoreline residential and commercial builds.",
    },
    {
      icon: ShieldCheck,
      title: "Anti-Corrosive Primers",
      desc: "Zinc-rich and epoxy primers for ferrous metal in marine environments.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Coastal-Grade
          </span>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">
            Coatings that hold the line against salt and sun.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">
            Marine systems engineered for the Bahamian shoreline — from private docks to commercial
            seawalls. Spec'd by contractors. Delivered island-wide.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {systems.map((s) => (
            <Card key={s.title} className="p-6">
              <s.icon className="h-9 w-9 text-accent" />
              <div className="mt-3 text-xl font-bold text-primary">{s.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-secondary py-16">
        <div className="container mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-3xl font-bold text-primary">Need a system spec?</h2>
          <p className="mt-3 text-muted-foreground">
            Tell us about the substrate and exposure — we'll recommend a primer, topcoat and
            recoat schedule sized to your job.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/contact">Request Spec</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/products">Browse Catalog</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
