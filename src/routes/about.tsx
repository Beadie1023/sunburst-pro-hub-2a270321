import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, Anchor, Truck, ShieldCheck, MapPin } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About Sunburst Paints — Made in The Bahamas" },
      {
        name: "description",
        content:
          "Sunburst Paints is a Bahamian-owned manufacturer of salt-resistant coatings built for contractors working in our climate.",
      },
      { property: "og:title", content: "About Sunburst Paints" },
      {
        property: "og:description",
        content:
          "Bahamian-owned. Climate-engineered coatings. Built for the contractors who build the islands.",
      },
    ],
  }),
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Our Story
          </span>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">
            Bahamian-made paint for the people who build the islands.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">
            Sunburst Paints was founded by tradesmen who got tired of waiting weeks for imported
            coatings — and watching them fail under our sun and salt within a season.
          </p>
        </div>
      </section>

      <section className="container mx-auto grid gap-8 px-4 py-16 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold text-primary">Why we exist</h2>
          <p className="mt-3 text-muted-foreground">
            Imported paint isn't built for our climate. The UV index, the salt air, the humidity —
            they break down formulas designed for North American suburbs. We engineer every product
            for the Bahamian environment, then stock it locally so contractors never wait on
            customs.
          </p>
          <h2 className="mt-8 text-2xl font-bold text-primary">What we believe</h2>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>• Local manufacturing means faster jobs and fewer callbacks.</li>
            <li>• Contractors deserve fair pricing, real terms, and a real phone number.</li>
            <li>• Every gallon should outlast the season it's painted in.</li>
          </ul>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: Sun, k: "Climate-engineered", v: "Formulas tested in Bahamian conditions." },
            { icon: Truck, k: "Local stock", v: "Nassau warehouse, weekly mailboats." },
            { icon: ShieldCheck, k: "Pro accounts", v: "Volume pricing & Net-30 terms." },
            { icon: Anchor, k: "Marine grade", v: "Coastal coatings that hold the line." },
          ].map((b) => (
            <Card key={b.k} className="p-5">
              <b.icon className="h-8 w-8 text-accent" />
              <div className="mt-3 font-bold text-primary">{b.k}</div>
              <div className="text-sm text-muted-foreground">{b.v}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-secondary py-16">
        <div className="container mx-auto px-4 text-center">
          <MapPin className="mx-auto h-8 w-8 text-accent" />
          <h2 className="mt-3 text-3xl font-bold text-primary">Nassau-based. Family Island ready.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Visit us at our Nassau warehouse, or order online for delivery anywhere in the Bahamas.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/products">Shop Catalog</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/contact">Contact Us</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
