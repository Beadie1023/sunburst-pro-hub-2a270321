import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, Calendar, MapPin } from "lucide-react";

export const Route = createFileRoute("/family-islands")({
  component: FamilyIslandsPage,
  head: () => ({
    meta: [
      { title: "Family Island Delivery — Sunburst Paints" },
      {
        name: "description",
        content:
          "Weekly mailboat delivery to Eleuthera, Exuma, Abaco, Andros, Long Island and beyond. Order online and we handle the logistics.",
      },
      { property: "og:title", content: "Family Island Paint Delivery" },
      {
        property: "og:description",
        content: "Weekly mailboat shipping across the Bahamas. Built for working contractors.",
      },
    ],
  }),
});

const ROUTES = [
  { island: "Eleuthera", day: "Tuesday & Friday", port: "Governor's Harbour" },
  { island: "Exuma", day: "Tuesday", port: "George Town" },
  { island: "Abaco", day: "Wednesday", port: "Marsh Harbour" },
  { island: "Andros", day: "Wednesday", port: "Fresh Creek / Mangrove Cay" },
  { island: "Long Island", day: "Thursday", port: "Salt Pond" },
  { island: "Cat Island", day: "Thursday", port: "New Bight" },
  { island: "Bimini", day: "Friday", port: "Alice Town" },
  { island: "Inagua", day: "Bi-weekly", port: "Matthew Town" },
];

function FamilyIslandsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Out-Island Logistics
          </span>
          <h1 className="mt-2 text-4xl font-extrabold md:text-5xl">
            Weekly mailboat to every island we serve.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">
            Order online by Monday noon — we handle dock-side delivery to your island all week.
            One contact, one invoice, one tracking number.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold text-primary">Delivery schedule</h2>
            <p className="mt-1 text-muted-foreground">
              Cut-off is 12:00 PM the day before sailing. Schedules subject to weather.
            </p>
          </div>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/products">Start Order</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROUTES.map((r) => (
            <Card key={r.island} className="p-5">
              <MapPin className="h-6 w-6 text-accent" />
              <div className="mt-2 text-lg font-bold text-primary">{r.island}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground" /> {r.day}
              </div>
              <div className="text-xs text-muted-foreground">Port: {r.port}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-secondary py-16">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <Truck className="mx-auto h-9 w-9 text-accent" />
          <h2 className="mt-3 text-3xl font-bold text-primary">How it works</h2>
          <ol className="mx-auto mt-6 grid max-w-2xl gap-4 text-left md:grid-cols-3">
            {[
              { n: "1", t: "Place order", d: "Online or by email — we confirm stock." },
              { n: "2", t: "We ship", d: "Crated and tagged for your mailboat run." },
              { n: "3", t: "Pick up dockside", d: "Or arrange last-mile to your job." },
            ].map((s) => (
              <li key={s.n} className="rounded-md bg-background p-4">
                <div className="text-2xl font-extrabold text-accent">{s.n}</div>
                <div className="mt-1 font-bold text-primary">{s.t}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.d}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
