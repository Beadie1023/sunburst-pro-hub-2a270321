import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sparkles,
  Upload,
  Loader2,
  Palette,
  Camera,
  Calculator,
  ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/pro-hub/ai-design-tools")({
  component: AiDesignToolsPage,
  head: () => ({
    meta: [
      { title: "AI Design Tools — Sunburst Pro Hub" },
      {
        name: "description",
        content:
          "AI-powered color match, room visualizer, and paint estimator for Bahamian contractors.",
      },
    ],
  }),
});

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string | undefined;

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-accent" />
      Waking up AI engine...
    </div>
  );
}

interface UploadBoxProps {
  file: File | null;
  onFile: (f: File | null) => void;
  label?: string;
  height?: string;
}

function UploadBox({ file, onFile, label = "Drop or click to upload an image", height = "h-56" }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`${height} flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center transition hover:border-accent hover:bg-muted/50`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        <img src={previewUrl} alt="preview" className="h-full w-full rounded-lg object-cover" />
      ) : (
        <>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Upload className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
        </>
      )}
    </div>
  );
}

function AiDesignToolsPage() {
  // shared loading state per tab
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  // Tab 1 - Color Match
  const [matchFile, setMatchFile] = useState<File | null>(null);

  // Tab 2 - Visualizer
  const [vizFile, setVizFile] = useState<File | null>(null);
  const [selectedSwatch, setSelectedSwatch] = useState<string | null>(null);

  // Tab 3 - Estimator
  const [form, setForm] = useState({ width: "", height: "", doors: "", windows: "" });

  const swatches = [
    { name: "Coastal Mist", hex: "#A9C4D6" },
    { name: "Bahama Sand", hex: "#E8D7B5" },
    { name: "Conch Pink", hex: "#F2C1B6" },
    { name: "Palm Shade", hex: "#5C7361" },
    { name: "Sunset Coral", hex: "#E89B7A" },
    { name: "Reef Teal", hex: "#3E8B8A" },
    { name: "Cloud White", hex: "#F7F4EE" },
    { name: "Driftwood", hex: "#8B7355" },
  ];

  async function submit(tab: string, payload: FormData | Record<string, unknown>, endpoint: string) {
    setLoadingTab(tab);
    try {
      const url = `${BACKEND_URL ?? ""}${endpoint}`;
      await fetch(url, {
        method: "POST",
        body:
          payload instanceof FormData ? payload : JSON.stringify(payload),
        headers:
          payload instanceof FormData
            ? undefined
            : { "Content-Type": "application/json" },
      }).catch(() => {
        /* frontend-only stub */
      });
    } finally {
      // keep spinner visible briefly to satisfy "immediately trigger loading"
      setTimeout(() => setLoadingTab(null), 1200);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-primary">
          <Sparkles className="h-7 w-7 text-accent" /> AI Design Tools
        </h1>
        <p className="text-muted-foreground">
          Color match, room visualization, and paint estimation — all in one place.
        </p>
      </div>

      <Tabs defaultValue="match" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-grid">
          <TabsTrigger value="match" className="gap-1.5">
            <Palette className="h-4 w-4" /> Color Match
          </TabsTrigger>
          <TabsTrigger value="visualizer" className="gap-1.5">
            <Camera className="h-4 w-4" /> Visualizer
          </TabsTrigger>
          <TabsTrigger value="estimator" className="gap-1.5">
            <Calculator className="h-4 w-4" /> Paint Estimator
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: COLOR MATCH */}
        <TabsContent value="match" className="mt-6">
          <Card className="space-y-5 p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Upload a photo</h2>
              <p className="text-sm text-muted-foreground">
                We'll find the closest Sunburst colors in our 1,200+ catalog.
              </p>
            </div>

            <UploadBox file={matchFile} onFile={setMatchFile} />

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const fd = new FormData();
                  if (matchFile) fd.append("image", matchFile);
                  submit("match", fd, "/api/color-match");
                }}
                disabled={loadingTab === "match"}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {loadingTab === "match" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Waking up AI engine...
                  </>
                ) : (
                  <>Find Matching Colors</>
                )}
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Results</h3>
              <div className="min-h-[180px] rounded-xl border border-border bg-muted/20 p-4">
                {loadingTab === "match" ? (
                  <LoadingSpinner />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-background text-muted-foreground"
                      >
                        <ImageIcon className="h-5 w-5 opacity-40" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: VISUALIZER */}
        <TabsContent value="visualizer" className="mt-6">
          <Card className="p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Room Visualizer</h2>
              <p className="text-sm text-muted-foreground">
                Upload a room photo and preview Sunburst colors on the walls.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
              <div className="space-y-4">
                <UploadBox file={vizFile} onFile={setVizFile} label="Upload a room photo" />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Before
                    </p>
                    <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground">
                      {vizFile ? (
                        <img
                          src={URL.createObjectURL(vizFile)}
                          alt="before"
                          className="h-full w-full rounded-lg object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 opacity-40" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      After
                    </p>
                    <div
                      className="flex aspect-video items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground"
                      style={selectedSwatch ? { backgroundColor: selectedSwatch } : undefined}
                    >
                      {loadingTab === "visualizer" ? (
                        <LoadingSpinner />
                      ) : selectedSwatch ? null : (
                        <ImageIcon className="h-6 w-6 opacity-40" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      const fd = new FormData();
                      if (vizFile) fd.append("image", vizFile);
                      if (selectedSwatch) fd.append("color", selectedSwatch);
                      submit("visualizer", fd, "/api/visualize");
                    }}
                    disabled={loadingTab === "visualizer"}
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {loadingTab === "visualizer" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Waking up AI engine...
                      </>
                    ) : (
                      <>Apply Color</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Sidebar swatches */}
              <aside className="rounded-xl border border-border bg-muted/20 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Swatches
                </h3>
                <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
                  {swatches.map((s) => (
                    <button
                      key={s.hex}
                      onClick={() => setSelectedSwatch(s.hex)}
                      className={`group flex flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition ${
                        selectedSwatch === s.hex
                          ? "border-accent ring-2 ring-accent/40"
                          : "border-border hover:border-accent/60"
                      }`}
                    >
                      <span
                        className="h-8 w-full rounded-md"
                        style={{ backgroundColor: s.hex }}
                      />
                      <span className="truncate text-[10px] font-medium text-foreground">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: ESTIMATOR */}
        <TabsContent value="estimator" className="mt-6">
          <Card className="p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Paint Estimator</h2>
              <p className="text-sm text-muted-foreground">
                Enter your room dimensions to estimate gallons needed.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit("estimator", form, "/api/estimate");
              }}
              className="grid gap-6 lg:grid-cols-[1fr_320px]"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="width">Room Width (ft)</Label>
                  <Input
                    id="width"
                    type="number"
                    min="0"
                    value={form.width}
                    onChange={(e) => setForm({ ...form, width: e.target.value })}
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="height">Room Height (ft)</Label>
                  <Input
                    id="height"
                    type="number"
                    min="0"
                    value={form.height}
                    onChange={(e) => setForm({ ...form, height: e.target.value })}
                    placeholder="e.g. 9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doors">Doors</Label>
                  <Input
                    id="doors"
                    type="number"
                    min="0"
                    value={form.doors}
                    onChange={(e) => setForm({ ...form, doors: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="windows">Windows</Label>
                  <Input
                    id="windows"
                    type="number"
                    min="0"
                    value={form.windows}
                    onChange={(e) => setForm({ ...form, windows: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={loadingTab === "estimator"}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
                  >
                    {loadingTab === "estimator" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Waking up AI engine...
                      </>
                    ) : (
                      <>Calculate Estimate</>
                    )}
                  </Button>
                </div>
              </div>

              <Card className="h-fit border-accent/20 bg-accent/5 p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Summary</h3>
                {loadingTab === "estimator" ? (
                  <LoadingSpinner />
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Wall area</dt>
                      <dd className="font-medium text-foreground">— sq ft</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Openings</dt>
                      <dd className="font-medium text-foreground">— sq ft</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Paintable area</dt>
                      <dd className="font-medium text-foreground">— sq ft</dd>
                    </div>
                    <div className="my-2 h-px bg-border" />
                    <div className="flex justify-between">
                      <dt className="font-semibold text-foreground">Gallons needed</dt>
                      <dd className="font-bold text-accent">—</dd>
                    </div>
                  </dl>
                )}
              </Card>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
