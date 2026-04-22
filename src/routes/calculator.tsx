import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Droplets } from "lucide-react";

export const Route = createFileRoute("/calculator")({
  component: CalculatorPage,
  head: () => ({
    meta: [
      { title: "Paint Calculator | Sunburst Paints" },
      { name: "description", content: "Estimate gallons of paint needed for your job in seconds. Built for Bahamian contractors." },
    ],
  }),
});

const COVERAGE: Record<string, number> = {
  smooth: 400,
  textured: 300,
  rough: 250,
};

function CalculatorPage() {
  const [length, setLength] = useState(20);
  const [width, setWidth] = useState(15);
  const [height, setHeight] = useState(10);
  const [coats, setCoats] = useState(2);
  const [surface, setSurface] = useState("smooth");
  const [scope, setScope] = useState("walls");

  const result = useMemo(() => {
    const wallArea = 2 * (length + width) * height;
    const ceilingArea = length * width;
    const area = scope === "walls" ? wallArea : scope === "ceiling" ? ceilingArea : wallArea + ceilingArea;
    const coverage = COVERAGE[surface];
    const gallons = (area * coats) / coverage;
    return {
      area: Math.round(area),
      gallons: Math.ceil(gallons * 10) / 10,
      buckets5: Math.ceil(gallons / 5),
    };
  }, [length, width, height, coats, surface, scope]);

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-accent p-2 text-accent-foreground">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary">Project Paint Calculator</h1>
            <p className="text-muted-foreground">Estimate gallons in seconds. No more guesswork.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-primary">Room Dimensions</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Length (ft)</Label>
                <Input type="number" min={1} value={length} onChange={(e) => setLength(Number(e.target.value))} />
              </div>
              <div>
                <Label>Width (ft)</Label>
                <Input type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </div>
              <div>
                <Label>Height (ft)</Label>
                <Input type="number" min={1} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Coats</Label>
                <Input type="number" min={1} max={4} value={coats} onChange={(e) => setCoats(Number(e.target.value))} />
              </div>
              <div>
                <Label>Surface</Label>
                <Select value={surface} onValueChange={setSurface}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smooth">Smooth</SelectItem>
                    <SelectItem value="textured">Textured</SelectItem>
                    <SelectItem value="rough">Rough / Stucco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walls">Walls only</SelectItem>
                    <SelectItem value="ceiling">Ceiling only</SelectItem>
                    <SelectItem value="both">Walls + Ceiling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-accent bg-primary p-6 text-primary-foreground">
            <div className="flex items-center gap-2 text-accent">
              <Droplets className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Estimated</span>
            </div>
            <div className="mt-4 text-5xl font-extrabold">
              {result.gallons} <span className="text-2xl text-primary-foreground/70">gal</span>
            </div>
            <div className="mt-2 text-sm text-primary-foreground/80">
              ≈ {result.buckets5} × 5-gallon bucket{result.buckets5 === 1 ? "" : "s"}
            </div>
            <div className="mt-6 space-y-1 text-sm text-primary-foreground/90">
              <div>Surface area: <span className="font-bold">{result.area} sq ft</span></div>
              <div>Coverage: <span className="font-bold">{COVERAGE[surface]} sq ft/gal</span></div>
              <div>Coats: <span className="font-bold">{coats}</span></div>
            </div>
            <Button asChild className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/products">Browse Paint →</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
