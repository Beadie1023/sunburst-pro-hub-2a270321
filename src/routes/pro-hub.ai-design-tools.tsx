import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { recommendColors } from "@/lib/ai-advisor.functions"; 
import {
  Sparkles,
  Upload,
  Loader2,
  Palette,
  Camera,
  Calculator,
  PaintBucket,
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
      <span>Waking up AI engine... analyzing spaces & calculations...</span>
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
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  // Tab 1 - Color Match States
  const [matchFile, setMatchFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState("Living Room");
  const [stylePreference, setStylePreference] = useState("Modern");
  const [contractorNotes, setContractorNotes] = useState("");
  const [colorResults, setColorResults] = useState<any[]>([]); 

  // Tab 2 - Visualizer States
  const [vizFile, setVizFile] = useState<File | null>(null);
  const [selectedSwatch, setSelectedSwatch] = useState<string | null>(null);

  // Tab 3 - Estimator States
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [doors, setDoors] = useState("0");
  const [windows, setWindows] = useState("0");
  const [calculatedGallons, setCalculatedGallons] = useState<number | null>(null);

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
    setColorResults([]);

    try {
      const base64Data = await fileToBase64(matchFile);
      const response = await recommendColors({
        imageBase64: base64Data,
        mimeType: matchFile.type,
        roomType: roomType,
        style: stylePreference,
        notes: contractorNotes,
      });

      if (response && response.recommendations) {
        setColorResults(response.recommendations);
      }
    } catch (error) {
      console.error("AI Color Match Execution fault:", error);
    } finally {
      setLoadingTab(null);
    }
  };

  const calculatePaint = () => {
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const d = parseInt(doors) || 0;
    const win = parseInt(windows) || 0;

    if (w <= 0 || h <= 0) return;

    // Standard paint estimation arithmetic logic
    const totalWallArea = w * h;
    const deductions = (d * 21) + (win * 15); 
    const paintableArea = Math.max(0, totalWallArea - deductions);
    
    // 1 Gallon roughly covers 350 sq ft with 2 coats
    const gallonsNeeded = Math.ceil((paintableArea / 350) * 2);
    setCalculatedGallons(gallonsNeeded);
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
                  <Label className="text-xs font-bold uppercase tracking-wider">Room / Surface Type</Label>
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
                  <Label className="text-xs font-bold uppercase tracking-wider">Style Preference</Label>
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
                  <Label className="text-xs font-bold uppercase tracking-wider">Project Notes (Optional)</Label>
                  <Textarea 
                    value={contractorNotes} 
                    onChange={(e) => setContractorNotes(e.target.value)} 
                    placeholder="E.g., High humidity area, lots of direct sunlight..." 
                    className="mt-1 bg-background resize-none h-16"
                  />
                </div>

                <Button 
                  onClick={handleColorMatchRequest} 
                  disabled={!matchFile || loadingTab === "match"}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg mt-2"
                >
                  Find Matching Colors
                </Button>
              </div>
            </div>
