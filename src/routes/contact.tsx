import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MapPin, Clock } from "lucide-react";

const SUNBURST_EMAIL = "sunburstpaints242@gmail.com";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact — Sunburst Paints" },
      {
        name: "description",
        content:
          "Reach the Sunburst Paints team in Nassau. Quotes, samples, system specs and pro account questions.",
      },
      { property: "og:title", content: "Contact Sunburst Paints" },
      {
        property: "og:description",
        content: "Nassau-based. Email us for quotes, samples and system specs.",
      },
    ],
  }),
});

function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Get in Touch
          </span>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">We're easy to reach.</h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">
            Email is the fastest way to a quote, a sample, or a system spec. We answer same-day on
            business days.
          </p>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-4 py-16 md:grid-cols-3">
        <Card className="p-6">
          <Mail className="h-8 w-8 text-accent" />
          <div className="mt-3 font-bold text-primary">Email</div>
          <a
            href={`mailto:${SUNBURST_EMAIL}`}
            className="mt-1 block break-all text-sm text-foreground hover:text-accent"
          >
            {SUNBURST_EMAIL}
          </a>
        </Card>
        <Card className="p-6">
          <MapPin className="h-8 w-8 text-accent" />
          <div className="mt-3 font-bold text-primary">Warehouse</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Nassau, New Providence, Bahamas
          </div>
        </Card>
        <Card className="p-6">
          <Clock className="h-8 w-8 text-accent" />
          <div className="mt-3 font-bold text-primary">Hours</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Mon – Fri · 8:00 – 17:00
            <br />
            Sat · 9:00 – 13:00
          </div>
        </Card>
      </section>

      <section className="bg-secondary py-16">
        <div className="container mx-auto max-w-xl px-4">
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-primary">Send us a message</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click below — your email app will open with our address ready to go.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <a href={`mailto:${SUNBURST_EMAIL}?subject=${encodeURIComponent("Quote request")}`}>
                  <Mail className="mr-2 h-4 w-4" /> Request a Quote
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={`mailto:${SUNBURST_EMAIL}?subject=${encodeURIComponent("Sample request")}`}>
                  Request a Sample
                </a>
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
