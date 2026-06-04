import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { recommendColors } from "@/lib/ai-advisor.functions"; // ⚡ Hooks up your server function directly
import {
  Sparkles,
  Upload,
  Loader2,
  Palette,
  Camera,
  Calculator,
  ImageIcon,
  Check,
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
  const [colorResults, setColorResults] = useState<any[]>([]); // 🎨 Holds your real Gemini recommendations!

  // Tab 2 - Visualizer States
  const [vizFile, setVizFile] = useState<File | null>(null);
  const [selectedSwatch, setSelectedSwatch] = useState<string | null>(null);

  // Tab 3 - Estimator States
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

  // Utility function to convert the picked file into a Base64 stream string for Gemini Vision
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Clean out the mime prefix header string line if present
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
      
      // Execute the server function we linked to your Render backend
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
              
              {/* Context inputs to give Gemini premium clarity parameters */}
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
                      <SelectItem value="Modern">Modern / Clean</SelectItem>
                      <SelectItem value="Coastal">Coastal / Bahamian Vibe</SelectItem>
                      <SelectItem value="Traditional">Traditional</SelectItem>
                      <SelectItem value="Minimalist">Minimalist</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider">Contractor Notes</Label>
                  <Textarea 
                    placeholder="High humidity area, client wants light trim..." 
                    value={contractorNotes}
                    onChange={(e) => setContractorNotes(e.target.value)}
                    className="mt-1 bg-background resize-none h-16"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleColorMatchRequest}
                disabled={loadingTab === "match" || !matchFile}
                className="bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto"
              >
                {loadingTab === "match" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing Textures...
                  </>
                ) : (
                  <>Find Matching Colors</>
                )}
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Results</h3>
