import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Truck,
  ShieldCheck,
  Sun,
  Package,
  Phone,
  MapPin,
  Calculator,
  Anchor,
  Mail,
  Star,
  Quote,
  Zap,
  Waves,
} from "lucide-react";
import heroBg from "@/assets/bahamas-hero.jpg";
import logoAsset from "@/assets/sunburst-logo.png.asset.json";

const SUNBURST_EMAIL = "sunburstpaints242@gmail.com";
const mailto = (subject: string) =>
  `mailto:${SUNBURST_EMAIL}?subject=${encodeURIComponent(subject)}`;

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Sunburst Paints — Bahamian Contractor Paint Supplier" },
      {
        name: "description",
        content:
          "Salt-resistant coatings made in the Bahamas. Zero lead times, contractor pricing, Family Island delivery. Built for pros.",
      },
      { property: "og:title", content: "Sunburst Paints — Made in the Bahamas" },
      {
        property: "og:description",
        content:
          "Salt-resistant coatings, zero lead times, contractor pricing, Family Island delivery.",
      },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative -mt-16 overflow-hidden text-primary-foreground">
        <img
          src={heroBg}
          alt="Aerial view of turquoise Bahamian waters and palm-lined sandbars"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          width={1920}
          height={1088}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.18 0.08 258 / 0.82), oklch(0.24 0.09 258 / 0.55) 60%, oklch(0.18 0.08 258 / 0.4))",
          }}
        />
        <div className="container relative mx-auto px-4 pb-24 pt-32 md:pb-32 md:pt-44">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-accent-foreground shadow-lg">
              <Sun className="h-3.5 w-3.5" /> Made in The Bahamas
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight drop-shadow-lg md:text-6xl">
              The Professional's Choice.
              <br />
              <span className="text-accent">Engineered for the Bahamian Sun.</span>
            </h1>
            <p className="mt-6 text-lg font-medium text-primary-foreground/95 drop-shadow md:text-xl">
              Zero lead times. Salt-resistant coatings. Family Island delivery — every week.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-14 rounded-full bg-accent px-7 text-base font-bold text-accent-foreground shadow-xl transition hover:bg-accent/90 hover:shadow-[0_0_30px_oklch(0.7_0.21_45_/_0.6)]"
              >
                <Link to="/products">Start Your Next Job</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-full border-white/40 bg-white/10 px-7 text-primary-foreground backdrop-blur hover:bg-white/20 hover:text-primary-foreground"
              >
                <Link to="/calculator">
                  <Calculator className="mr-2 h-4 w-4" /> Paint Calculator
                </Link>
              </Button>
            </div>

            {/* Glass stat strip */}
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: "0", v: "Lead Time" },
                { k: "10%", v: "Pro Discount" },
                { k: "Net-30", v: "Approved Crews" },
                { k: "Weekly", v: "Mailboat" },
              ].map((s) => (
                <div
                  key={s.v}
                  className="glass-card rounded-xl px-3 py-3 text-center text-foreground"
                >
                  <div className="text-xl font-extrabold text-primary md:text-2xl">{s.k}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {s.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why local */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Why Local
          </span>
          <h2 className="mt-2 text-3xl font-bold text-primary md:text-4xl">
            Built here. Delivered fast. Priced for crews.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Stop waiting on customs. Stop paying import markups. Get the right paint, fast.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Truck,
              title: "Same-Day Nassau Delivery",
              body: "Job-site drop-off across New Providence. Mailboat shipping to Family Islands every week.",
            },
            {
              icon: Waves,
              title: "Salt-Resistant Coatings",
              body: "Marine-grade formulas built for Bahamian sun, salt spray, and humidity.",
            },
            {
              icon: ShieldCheck,
              title: "Pro Pricing & Net-30",
              body: "Volume-based contractor pricing with credit terms for approved accounts.",
            },
          ].map((f) => (
            <Card
              key={f.title}
              className="group relative overflow-hidden border-l-4 border-l-accent p-6 transition-shadow hover:shadow-pro"
            >
              <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-accent/10 blur-2xl transition-transform group-hover:translate-x-4" />
              <f.icon className="relative h-10 w-10 text-accent" />
              <h3 className="relative mt-4 text-xl font-bold text-primary">{f.title}</h3>
              <p className="relative mt-2 text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Bundles teaser */}
      <section className="bg-secondary py-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
                Crew Kits
              </span>
              <h2 className="mt-2 text-3xl font-bold text-primary md:text-4xl">
                Popular Contractor Bundles
              </h2>
              <p className="mt-2 text-muted-foreground">Pre-built kits to keep crews moving.</p>
            </div>
            <Button asChild variant="link" className="text-accent">
              <Link to="/bundles">View all →</Link>
            </Button>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                tag: "Best Value",
                name: "Interior Job Bundle",
                desc: "Primer + interior paint + rollers, brushes & tape.",
              },
              {
                tag: "Weatherproof",
                name: "Exterior Bundle",
                desc: "Salt-resistant paint, sealer & application tools.",
              },
              {
                tag: "Bulk",
                name: "Contractor Bulk Pack",
                desc: "Multi-job supply package for active crews.",
              },
            ].map((b) => (
              <Card key={b.name} className="overflow-hidden p-0 transition-shadow hover:shadow-pro">
                <div className="bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-accent">
                  {b.tag}
                </div>
                <div className="p-6">
                  <Package className="h-10 w-10 text-primary" />
                  <h3 className="mt-3 text-xl font-bold text-primary">{b.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{b.desc}</p>
                  <Button asChild variant="link" className="mt-3 px-0 text-accent">
                    <Link to="/bundles">See contents →</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Marine + Family Islands feature stripe */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-3 bg-primary p-6 text-primary-foreground">
              <Anchor className="h-7 w-7 text-accent" />
              <h3 className="text-xl font-bold">Marine & Coastal Solutions</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                Anti-corrosive primers, marine-grade topcoats and sealers built for docks,
                seawalls, and shoreline properties.
              </p>
              <Button asChild variant="link" className="mt-3 px-0 text-accent">
                <Link to="/marine">Learn more →</Link>
              </Button>
            </div>
          </Card>
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-3 bg-primary p-6 text-primary-foreground">
              <Truck className="h-7 w-7 text-accent" />
              <h3 className="text-xl font-bold">Family Island Delivery</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                Weekly mailboat shipping to Eleuthera, Exuma, Abaco, Andros, Long Island and beyond.
                We handle logistics; you stay on the job.
              </p>
              <Button asChild variant="link" className="mt-3 px-0 text-accent">
                <Link to="/family-islands">See schedule →</Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-secondary py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
              Trusted by Crews
            </span>
            <h2 className="mt-2 text-3xl font-bold text-primary md:text-4xl">
              What contractors say
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                quote:
                  "Same-day delivery saved my schedule. Their exterior coatings hold up to our salt air better than anything I've imported.",
                name: "Marcus R.",
                role: "Coastal Builders, Nassau",
              },
              {
                quote:
                  "Net-30 terms keep my cash flow tight on big jobs. The contractor pricing is straight-up the best on island.",
                name: "Devon S.",
                role: "Island Painting Co., Eleuthera",
              },
              {
                quote:
                  "Mailboat scheduling is reliable. I order Tuesday, paint arrives Friday on Exuma. Game changer.",
                name: "Trevor B.",
                role: "Out Island Contracting",
              },
            ].map((t) => (
              <Card key={t.name} className="p-6">
                <Quote className="h-7 w-7 text-accent" />
                <p className="mt-3 text-sm text-foreground">{t.quote}</p>
                <div className="mt-4 flex items-center gap-1 text-accent">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <div className="mt-3 text-sm font-semibold text-primary">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <Zap className="mx-auto h-10 w-10 text-accent" />
        <h2 className="mt-3 text-3xl font-bold text-primary md:text-4xl">
          Start your next job today.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Sign up for a contractor account and unlock pro pricing, fast reorders, and Net-30 terms.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link to="/login">Create Pro Account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={mailto("Order request")}>
              <Mail className="mr-2 h-4 w-4" /> Email Sunburst
            </a>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-primary py-10 text-primary-foreground/85">
        <div className="container mx-auto grid gap-6 px-4 md:grid-cols-4">
          <div>
            <div className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5">
              <img
                src={logoAsset.url}
                alt="SunBurst Paints & Coatings — Superior Quality Paints"
                className="h-10 w-auto"
              />
            </div>
            <p className="mt-2 text-xs">Made in The Bahamas. Built for contractors.</p>
          </div>
          <div className="text-sm">
            <div className="mb-2 font-bold text-primary-foreground">Shop</div>
            <ul className="space-y-1">
              <li>
                <Link to="/products" className="hover:text-accent">
                  Products
                </Link>
              </li>
              <li>
                <Link to="/bundles" className="hover:text-accent">
                  Bundles
                </Link>
              </li>
              <li>
                <Link to="/calculator" className="hover:text-accent">
                  Calculator
                </Link>
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <div className="mb-2 font-bold text-primary-foreground">Company</div>
            <ul className="space-y-1">
              <li>
                <Link to="/about" className="hover:text-accent">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contractor-program" className="hover:text-accent">
                  Contractor Program
                </Link>
              </li>
              <li>
                <Link to="/family-islands" className="hover:text-accent">
                  Family Island Delivery
                </Link>
              </li>
              <li>
                <Link to="/marine" className="hover:text-accent">
                  Marine & Coastal
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-accent">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <div className="mb-2 font-bold text-primary-foreground">Contact</div>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" /> Nassau, Bahamas
              </li>
              <li>
                <a href={`mailto:${SUNBURST_EMAIL}`} className="hover:text-accent">
                  <Mail className="mr-1 inline h-3.5 w-3.5" />
                  {SUNBURST_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto mt-8 border-t border-white/10 px-4 pt-6 text-center text-xs">
          © {new Date().getFullYear()} Sunburst Paints. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
