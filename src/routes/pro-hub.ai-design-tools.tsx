import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recommendColors } from "@/lib/ai-advisor.functions";
import {
  Sparkles,
  Upload,
  Loader2,
  Palette,
  Camera,
  Calculator,
  Check,
  AlertCircle,
  Copy,
  Download,
  RotateCcw,
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

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
      <span>Waking up AI engine... analyzing lighting & textures...</span>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="flex gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertCircle className="h-5 w-5 flex-shrink-0" />
      <div>
        <p className="font-medium">Analysis Failed</p>
        <p className="text-xs text-red-600 mt-1">{message}</p>
      </div>
    </Card>
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`${height} flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center transition hover:border-accen[...]
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

interface VisualizerProps {
  imageUrl: string;
  selectedColor: { hex: string; name: string } | null;
  onReset: () => void;
}

function RoomVisualizer({ imageUrl, selectedColor, onReset }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sliderPos, setSliderPos] = useState(50);

  useEffect(() => {
    if (!canvasRef.current || !imageUrl || !selectedColor) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Draw overlay on right side based on slider
      const overlayWidth = (img.width * sliderPos) / 100;
      ctx.save();
      ctx.fillStyle = selectedColor.hex;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(overlayWidth, 0, img.width - overlayWidth, img.height);
      ctx.restore();

      // Draw slider line
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(overlayWidth, 0);
      ctx.lineTo(overlayWidth, img.height);
      ctx.stroke();
    };
    img.src = imageUrl;
  }, [imageUrl, selectedColor, sliderPos]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png");
    link.download = `color-preview-${Date.now()}.png`;
    link.click();
  };

  if (!selectedColor) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Select a color from the results to see a preview
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden bg-muted">
        <canvas ref={canvasRef} className="w-full h-auto max-h-96" />
        <input
          type="range"
          min="0"
          max="100"
          value={sliderPos}
          onChange={(e) => setSliderPos(parseInt(e.target.value))}
          className="absolute bottom-4 left-4 right-4 w-auto max-w-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={onReset} variant="outline" size="sm" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        <Button onClick={handleDownload} size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Download Preview
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        Drag the slider to preview the color overlay
      </div>
    </div>
  );
}

function AiDesignToolsPage() {
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab 1 - Color Match States
  const [matchFile, setMatchFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState("Living Room");
  const [stylePreference, setStylePreference] = useState("Modern");
  const [contractorNotes, setContractorNotes] = useState("");
  const [colorResults, setColorResults] = useState<any[]>([]);

  // Tab 2 - Visualizer States
  const [vizFile, setVizFile] = useState<File | null>(null);
  const [vizPreviewUrl, setVizPreviewUrl] = useState<string | null>(null);
  const [selectedSwatch, setSelectedSwatch] = useState<{ hex: string; name: string } | null>(null);

  // Tab 3 - Estimator States
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [doors, setDoors] = useState("0");
  const [windows, setWindows] = useState("0");
  const [estimationResult, setEstimationResult] = useState<{
    area: number;
    gallons: number;
    coats: number;
  } | null>(null);

  // Update visualizer preview
  useEffect(() => {
    if (vizFile) {
      const url = URL.createObjectURL(vizFile);
      setVizPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setVizPreviewUrl(null);
  }, [vizFile]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const rawBase64 = base64String.split(",")[1];
        resolve(rawBase64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleColorMatchRequest = async () => {
    if (!matchFile) return;
    setLoadingTab("match");
    setErrorMsg(null);
    setColorResults([]);

    try {
      const base64Data = await fileToBase64(matchFile);

      const response = await recommendColors({
        data: {
          imageBase64: base64Data,
          mimeType: matchFile.type,
          roomType: roomType,
          style: stylePreference,
          notes: contractorNotes,
        },
      });

      if (response.success && response.recommendations) {
        setColorResults(response.recommendations);
      } else {
        setErrorMsg(response.error || "Failed to match colors");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setErrorMsg(msg);
      console.error("Color match error:", msg);
    } finally {
      setLoadingTab(null);
    }
  };

  const calculatePaintNeeded = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const d = parseInt(doors) || 0;
    const wnd = parseInt(windows) || 0;

    if (w <= 0 || h <= 0) {
      setEstimationResult(null);
      return;
    }

    const totalArea = w * h - d * 20 - wnd * 15;
    const gallonsNeeded = Math.max(0.5, Math.ceil((totalArea / 350) * 10) / 10);
    const coats = Math.ceil(totalArea / 350 / 3.5); // 2-3 coats typical

    setEstimationResult({
      area: Math.max(0, totalArea),
      gallons: gallonsNeeded,
      coats: Math.max(1, coats),
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

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

            <div className="grid gap-4 md:grid-cols-2">
              <UploadBox file={matchFile} onFile={setMatchFile} />

              <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider">
                    Room / Surface Type
                  </Label>
                  <Select value={roomType} onValueChange={setRoomType}>
                    <SelectTrigger className="mt-1 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Living Room">Living Room</SelectItem>
                      <SelectItem value="Exterior Siding">Exterior Siding</SelectItem>
                      <SelectItem value="Kitchen">Kitchen</SelectItem>
                      <SelectItem value="Bedroom">Bedroom</SelectItem>
                      <SelectItem value="Commercial Space">Commercial Space</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider">
                    Style Preference
                  </Label>
                  <Select value={stylePreference} onValueChange={setStylePreference}>
                    <SelectTrigger className="mt-1 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Modern">Modern</SelectItem>
                      <SelectItem value="Coastal">Coastal / Bahamian</SelectItem>
                      <SelectItem value="Minimalist">Minimalist</SelectItem>
                      <SelectItem value="Traditional">Traditional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider">
                    Contractor Notes (Optional)
                  </Label>
                  <Input
                    placeholder="e.g., Low lighting, warm undertones..."
                    value={contractorNotes}
                    onChange={(e) => setContractorNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <Button
                  onClick={handleColorMatchRequest}
                  disabled={!matchFile || loadingTab === "match"}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg mt-2"
                >
                  {loadingTab === "match" ? "Analyzing..." : "Find Matching Colors"}
                </Button>
              </div>
            </div>

            {loadingTab === "match" && <LoadingSpinner />}
            {errorMsg && <ErrorCard message={errorMsg} />}

            {colorResults.length > 0 ? (
              <div className="mt-6 space-y-4">
                <h3 className="text-sm font-medium text-foreground">
                  AI Recommended Colors ({colorResults.length} found)
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {colorResults.map((color, idx) => (
                    <Card
                      key={idx}
                      className="flex flex-col overflow-hidden border bg-background hover:shadow-md transition"
                    >
                      <div
                        className="h-24 w-full"
                        style={{ backgroundColor: color.hex }}
                      />
                      <div className="flex-1 space-y-2 p-3">
                        <div>
                          <p className="font-medium text-sm text-foreground">{color.name}</p>
                          <p className="text-xs text-muted-foreground">{color.collection}</p>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Code:</span>
                            <span className="font-mono font-medium">{color.code}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Hex:</span>
                            <span className="font-mono font-medium">{color.hex}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Match:</span>
                            <span className="font-medium text-accent">
                              {Math.round(100 - (color.colorDifference / 255) * 100)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Role:</span>
                            <span className="font-medium capitalize">{color.role}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic mt-2">
                          "{color.reason}"
                        </p>
                      </div>
                      <Button
                        onClick={() => copyToClipboard(color.hex)}
                        variant="ghost"
                        size="sm"
                        className="w-full gap-2 rounded-none border-t"
                      >
                        <Copy className="h-3 w-3" />
                        Copy Hex
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </TabsContent>

        {/* TAB 2: VISUALIZER */}
        <TabsContent value="visualizer" className="mt-6">
          <Card className="space-y-5 p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Room Visualizer</h2>
              <p className="text-sm text-muted-foreground">
                Upload a room photo and preview colors before purchasing.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <UploadBox
                file={vizFile}
                onFile={setVizFile}
                label="Upload room photo"
                height="h-64"
              />

              {vizPreviewUrl && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">
                      Select Color to Preview
                    </Label>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {colorResults.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {colorResults.slice(0, 8).map((color) => (
                          <button
                            key={color.id}
                            onClick={() =>
                              setSelectedSwatch({ hex: color.hex, name: color.name })
                            }
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition ${
                              selectedSwatch?.hex === color.hex
                                ? "border-accent bg-accent/5"
                                : "border-border hover:border-accent/50"
                            }`}
                          >
                            <div
                              className="h-12 w-12 rounded"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className="text-xs font-medium text-center truncate">
                              {color.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Run color match first to see available colors
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {vizPreviewUrl && (
              <RoomVisualizer
                imageUrl={vizPreviewUrl}
                selectedColor={selectedSwatch}
                onReset={() => setSelectedSwatch(null)}
              />
            )}
          </Card>
        </TabsContent>

        {/* TAB 3: PAINT ESTIMATOR */}
        <TabsContent value="estimator" className="mt-6">
          <Card className="space-y-5 p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Paint Estimator</h2>
              <p className="text-sm text-muted-foreground">
                Calculate how much paint you'll need for your project.
              </p>
            </div>

            <form onSubmit={calculatePaintNeeded} className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="width" className="text-xs font-bold uppercase tracking-wider">
                  Wall Width (ft)
                </Label>
                <Input
                  id="width"
                  type="number"
                  step="0.1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="e.g., 12"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="height" className="text-xs font-bold uppercase tracking-wider">
                  Wall Height (ft)
                </Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g., 8"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="doors" className="text-xs font-bold uppercase tracking-wider">
                  Number of Doors
                </Label>
                <Input
                  id="doors"
                  type="number"
                  min="0"
                  value={doors}
                  onChange={(e) => setDoors(e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="windows" className="text-xs font-bold uppercase tracking-wider">
                  Number of Windows
                </Label>
                <Input
                  id="windows"
                  type="number"
                  min="0"
                  value={windows}
                  onChange={(e) => setWindows(e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>

              <Button
                type="submit"
                className="col-span-full md:col-span-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg"
              >
                Calculate Paint Needed
              </Button>
            </form>

            {estimationResult && (
              <div className="grid gap-4 md:grid-cols-4 border-t pt-6">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase font-medium">
                    Paintable Area
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {estimationResult.area.toFixed(0)} sq ft
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase font-medium">
                    Gallons Needed
                  </p>
                  <p className="text-2xl font-bold text-accent mt-1">
                    {estimationResult.gallons} gal
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase font-medium">
                    Recommended Coats
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {estimationResult.coats} coat{estimationResult.coats !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="rounded-lg bg-accent/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase font-medium">
                    Total Volume
                  </p>
                  <p className="text-2xl font-bold text-accent mt-1">
                    {(estimationResult.gallons * estimationResult.coats).toFixed(1)} gal
                  </p>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
              <p>
                <strong>Coverage:</strong> 350 sq ft per gallon (2 coats typical)
              </p>
              <p>
                <strong>Deductions:</strong> 20 sq ft per door, 15 sq ft per window
              </p>
              <p>
                <strong>Note:</strong> Add 10-15% extra for waste and touch-ups.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
