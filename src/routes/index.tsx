import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Truck, ShieldCheck, Sun, Package, Phone, MapPin, Calculator } from "lucide-react";
import beachBg from "@/assets/bahamas-beach.jpg";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero with Bahamas beach background */}
      <section className="relative -mt-16 overflow-hidden text-primary-foreground">
        <img
          src={beachBg}
          alt="Turquoise Bahamian beach"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
        {/* Dark overlay for sunlight readability */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, oklch(0.18 0.08 258 / 0.78), oklch(0.24 0.09 258 / 0.55))" }} />
        <div className="absolute inset-0 bg-black/30" />
        <div className="container relative mx-auto px-4 pb-20 pt-32 md:pb-28 md:pt-40">
          <div className="max-w-3xl">
            <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground shadow-lg">
              Made in the Bahamas
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight drop-shadow-lg md:text-6xl">
              The Professional's Choice.
              <br />
              <span className="text-accent">Engineered for the Bahamian Sun.</span>
            </h1>
            <p className="mt-6 text-lg font-medium text-primary-foreground/95 drop-shadow md:text-xl">
              Zero Lead Times. Zero Customs. Zero Delays.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-14 rounded-full bg-accent text-base text-accent-foreground shadow-xl transition hover:bg-accent/90 hover:shadow-[0_0_30px_oklch(0.7_0.21_45_/_0.6)]">
                <Link to="/products">Start Your Next Job</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-full border-white/40 bg-white/10 text-primary-foreground backdrop-blur hover:bg-white/20 hover:text-primary-foreground">
                <Link to="/calculator"><Calculator className="mr-2 h-4 w-4" /> Paint Calculator</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Why local */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-primary md:text-4xl">
          Why Contractors Choose Local
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Stop waiting on customs. Stop paying import markups. Get the right paint, fast.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { icon: Truck, title: "Same-Day Nassau Delivery", body: "Job-site drop-off across New Providence. Mailboat shipping to Family Islands." },
            { icon: Sun, title: "Climate-Specific Formulas", body: "Salt-resistant, UV-stable coatings built for our sun, our salt, our humidity." },
            { icon: ShieldCheck, title: "Pro Pricing & Net-30", body: "Volume-based contractor pricing with credit terms for approved accounts." },
          ].map((f) => (
            <Card key={f.title} className="p-6 border-l-4 border-l-accent">
              <f.icon className="h-10 w-10 text-accent" />
              <h3 className="mt-4 text-xl font-bold text-primary">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Bundles teaser */}
      <section className="bg-secondary py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold text-primary md:text-4xl">Popular Contractor Bundles</h2>
              <p className="mt-2 text-muted-foreground">Pre-built kits to keep crews moving.</p>
            </div>
            <Button asChild variant="link" className="text-accent">
              <Link to="/bundles">View all →</Link>
            </Button>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { tag: "Best Value", name: "Interior Job Bundle", desc: "Primer + interior paint + rollers, brushes & tape.", price: "Coming soon" },
              { tag: "Weatherproof", name: "Exterior Bundle", desc: "Salt-resistant paint, sealer & application tools.", price: "Coming soon" },
              { tag: "Bulk", name: "Contractor Bulk Pack", desc: "Multi-job supply package for active crews.", price: "Coming soon" },
            ].map((b) => (
              <Card key={b.name} className="overflow-hidden p-0">
                <div className="bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-accent">
                  {b.tag}
                </div>
                <div className="p-6">
                  <Package className="h-10 w-10 text-primary" />
                  <h3 className="mt-3 text-xl font-bold text-primary">{b.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{b.desc}</p>
                  <p className="mt-4 text-sm font-semibold text-accent">{b.price}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold text-primary md:text-4xl">Start your next job today.</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Sign up for a contractor account and unlock pro pricing, fast reorders, and Net-30 terms.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/login">Create Pro Account</Link>
          </Button>
          <a
            href="https://wa.me/12423570000?text=Hi%20Sunburst%20Paints%2C%20I%27d%20like%20to%20place%20an%20order"
            target="_blank"
            rel="noreferrer"
          >
            <Button size="lg" variant="outline">
              <Phone className="mr-2 h-4 w-4" /> Order via WhatsApp
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t border-border bg-primary py-8 text-primary-foreground/80">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 text-sm md:flex-row">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Nassau, Bahamas
          </div>
          <div>© {new Date().getFullYear()} Sunburst Paints. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
