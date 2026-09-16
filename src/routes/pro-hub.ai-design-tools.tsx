import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { recommendColors, visualizeRoom } from "@/lib/ai-advisor.functions";
import { RoomVisualizer } from "@/components/RoomVisualizer";
import {
  Upload,
  Loader2,
  AlertCircle,
  Wand2,
  Palette,
  ScanLine,
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
      className={`${height} flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center transition hover:border-accent`}
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
  const [activeTool, setActiveTool] = useState<"match" | "visualizer">(() =>
    typeof window !== "undefined" && window.location.hash === "#visualizer" ? "visualizer" : "match",
  );
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [matchFile, setMatchFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState("Living Room");
  const [stylePreference, setStylePreference] = useState("Minimalist");
  const [contractorNotes, setContractorNotes] = useState("");
  const [colorResults, setColorResults] = useState<any[]>([]);
  const [uploadedPhoto, setUploadedPhoto] = useState<{ base64: string; mime: string } | null>(null);
  const [visualizingIndex, setVisualizingIndex] = useState<number | null>(null);
  const [visualizedImages, setVisualizedImages] = useState<Record<number, string>>({});
  const [visualizeError, setVisualizeError] = useState<string | null>(null);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const parts = base64String.split(",");
        const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
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
      const fileMime = matchFile.type || "image/jpeg";
      setUploadedPhoto({ base64: base64Data, mime: fileMime });
      setVisualizedImages({});
      setVisualizeError(null);

      // FIXED STRUCTURE: Matched perfectly with the backend Zod validation keys
      const response = await recommendColors({
        data: {
          imageBase64: base64Data,
          mimeType: fileMime,
          roomType: roomType,
          style: stylePreference,
          notes: contractorNotes,
        },
      });

      if (response && response.recommendations) {
        setColorResults(response.recommendations);
      }
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error?.message || JSON.stringify(error) || "An unexpected configuration error occurred.");
    } finally {
      setLoadingTab(null);
    }
  };

  const handleVisualize = async (index: number) => {
    const rec = colorResults[index];
    if (!uploadedPhoto || !rec?.color) return;
    setVisualizingIndex(index);
    setVisualizeError(null);
    try {
      const result = await visualizeRoom({
        data: {
          imageBase64: uploadedPhoto.base64,
          mimeType: uploadedPhoto.mime,
          colorHex: rec.color.hex,
          colorName: rec.color.name,
          surface: "wall",
        },
      });
      setVisualizedImages((prev) => ({ ...prev, [index]: result.imageDataUrl }));
    } catch (error: any) {
      setVisualizeError(error?.message || "Could not generate the visualization.");
    } finally {
      setVisualizingIndex(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Design Tools</h1>
        <p className="text-muted-foreground">Match colors and preview Sunburst paint on your client's walls.</p>
      </div>

      <div className="inline-flex rounded-md border border-border bg-muted/30 p-1">
        <Button
          variant={activeTool === "match" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setActiveTool("match");
            window.history.replaceState(null, "", window.location.pathname);
          }}
        >
          <Palette className="mr-1.5 h-4 w-4" /> Color Match
        </Button>
        <Button
          variant={activeTool === "visualizer" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setActiveTool("visualizer");
            window.history.replaceState(null, "", "#visualizer");
          }}
        >
          <ScanLine className="mr-1.5 h-4 w-4" /> Room Visualizer
        </Button>
      </div>

      {activeTool === "visualizer" ? (
        <RoomVisualizer />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-4 space-y-4">
            <h2 className="text-lg font-semibold">Upload a photo</h2>
            <UploadBox file={matchFile} onFile={setMatchFile} />

            <div className="space-y-2">
              <label className="text-sm font-medium">Room / Surface Type</label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full p-2 border rounded-md bg-background text-sm"
              >
                <option value="Living Room">Living Room</option>
                <option value="Bedroom">Bedroom</option>
                <option value="Kitchen">Kitchen</option>
                <option value="Bathroom">Bathroom</option>
                <option value="Exterior">Exterior</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Style Preference</label>
              <select
                value={stylePreference}
                onChange={(e) => setStylePreference(e.target.value)}
                className="w-full p-2 border rounded-md bg-background text-sm"
              >
                <option value="Minimalist">Minimalist</option>
                <option value="Modern">Modern</option>
                <option value="Traditional">Traditional</option>
                <option value="Coastal">Coastal</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contractor Notes (Optional)</label>
              <textarea
                value={contractorNotes}
                onChange={(e) => setContractorNotes(e.target.value)}
                placeholder="e.g., Low lighting, warm undertones..."
                className="w-full p-2 border rounded-md bg-background h-20 resize-none text-sm"
              />
            </div>

            <Button
              onClick={handleColorMatchRequest}
              className="w-full bg-[#f24e1e] hover:bg-[#d63f13] text-white"
              disabled={loadingTab === "match" || !matchFile}
            >
              {loadingTab === "match" ? "Processing..." : "Find Matching Colors"}
            </Button>
          </Card>

          <div className="space-y-4">
            {loadingTab === "match" && <LoadingSpinner />}
            {errorMsg && <ErrorCard message={errorMsg} />}

            {colorResults.length > 0 && (
              <Card className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">Recommended Colors</h3>
                {visualizeError && <p className="text-xs text-red-600">{visualizeError}</p>}
                <div className="space-y-2">
                  {colorResults.map((rec: any, i: number) => (
                    <div key={i} className="flex flex-col p-3 border rounded-md bg-muted/20 gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full border shadow-sm flex-shrink-0"
                          style={{ backgroundColor: rec.color?.hex || '#ccc' }}
                        />
                        <div>
                          <p className="font-semibold text-sm">{rec.color?.name || "Unnamed Color"}</p>
                          <p className="text-xs text-muted-foreground uppercase font-mono">{rec.color?.hex || ""}</p>
                        </div>
                        <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-accent/10 text-accent rounded uppercase">
                          {rec.role || "primary"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground border-t pt-2 mt-1">
                        <p><strong className="text-foreground">Finish:</strong> {rec.finish || "Satin"}</p>
                        <p className="mt-1">{rec.reason || ""}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={visualizingIndex !== null}
                        onClick={() => handleVisualize(i)}
                      >
                        {visualizingIndex === i ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Wand2 className="mr-2 h-4 w-4" />
                            {visualizedImages[i] ? "Regenerate visualization" : "Visualize this color on my photo"}
                          </>
                        )}
                      </Button>
                      {visualizedImages[i] && (
                        <img
                          src={visualizedImages[i]}
                          alt={`Room repainted in ${rec.color?.name}`}
                          className="w-full rounded-md border mt-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
