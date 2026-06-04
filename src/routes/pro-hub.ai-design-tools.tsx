import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { recommendColors } from "@/lib/ai-advisor.functions";
import {
  Upload,
  Loader2,
  AlertCircle,
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

      ctx.drawImage(img, 0, 0);

      const overlayWidth = (img.width * sliderPos) / 100;
      ctx.save();
      ctx.fillStyle = selectedColor.hex;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(overlayWidth, 0, img.width - overlayWidth, img.height);
      ctx.restore();

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
    </div>
  );
}

function AiDesignToolsPage() {
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [matchFile, setMatchFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState("Living Room");
  const [stylePreference, setStylePreference] = useState("Minimalist");
  const [contractorNotes, setContractorNotes] = useState("");
  const [, setColorResults] = useState<any[]>([]);

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

      // CRITICAL FIX: Ensure payload variables wrap inside a single structural object parameter
      const response = await recommendColors({
        image: base64Data,
        roomType: roomType,
        stylePreference: stylePreference,
        contractorNotes: contractorNotes,
      });

      if (response && response.colors) {
        setColorResults(response.colors);
      } else if (Array.isArray(response)) {
        setColorResults(response);
      }
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error?.message || JSON.stringify(error) || "An unexpected configuration error occurred.");
    } finally {
      setLoadingTab(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Design Tools</h1>
        <p className="text-muted-foreground">Color match, room visualization, and paint estimation.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">Upload a photo</h2>
          <UploadBox file={matchFile} onFile={setMatchFile} />
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Room / Surface Type</label>
            <select 
              value={roomType} 
              onChange={(e) => setRoomType(e.target.value)}
              className="w-full p-2 border rounded-md bg-background"
            >
              <option value="Living Room">Living Room</option>
              <option value="Bedroom">Bedroom</option>
              <option value="Kitchen">Kitchen</option>
              <option value="Exterior">Exterior</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Style Preference</label>
            <select 
              value={stylePreference} 
              onChange={(e) => setStylePreference(e.target.value)}
              className="w-full p-2 border rounded-md bg-background"
            >
              <option value="Minimalist">Minimalist</option>
              <option value="Modern">Modern</option>
              <option value="Traditional">Traditional</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Contractor Notes (Optional)</label>
            <textarea
              value={contractorNotes}
              onChange={(e) => setContractorNotes(e.target.value)}
              placeholder="e.g., Low lighting, warm undertones..."
              className="w-full p-2 border rounded-md bg-background h-20 resize-none"
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
        </div>
      </div>
    </div>
  );
}
