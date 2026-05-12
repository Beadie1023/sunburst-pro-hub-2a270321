import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, ArrowLeft, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/dashboard/colors/import")({
  component: ImportPage,
  head: () => ({ meta: [{ title: "Import Palette CSV — Sunburst Paints" }] }),
});

type Field = "code" | "name" | "collection" | "color_hex" | "active" | "in_stock" | "lrv";

const REQUIRED: Field[] = ["code", "name", "collection", "color_hex"];
const ALL_FIELDS: Field[] = ["code", "name", "collection", "color_hex", "active", "in_stock", "lrv"];

interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

// Try to auto-map a CSV header to a known field
function guessField(header: string): Field | "" {
  const n = normalize(header);
  if (["code", "colorcode", "sku"].includes(n)) return "code";
  if (["name", "colorname"].includes(n)) return "name";
  if (["collection", "family", "group"].includes(n)) return "collection";
  if (["hex", "colorhex", "hexcode", "color"].includes(n)) return "color_hex";
  if (["active", "enabled", "visible"].includes(n)) return "active";
  if (["instock", "stock", "available"].includes(n)) return "in_stock";
  if (n === "lrv") return "lrv";
  return "";
}

function parseBool(v: unknown, fallback = true): boolean {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "t"].includes(s)) return true;
  if (["0", "false", "no", "n", "f"].includes(s)) return false;
  return fallback;
}

function normalizeHex(v: string): string | null {
  if (!v) return null;
  let s = v.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return "#" + s.toUpperCase();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ImportPage() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [mapping, setMapping] = useState<Record<Field, string>>({
    code: "",
    name: "",
    collection: "",
    color_hex: "",
    active: "",
    in_stock: "",
    lrv: "",
  });
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);

    const onData = (rows: Record<string, string>[], headers: string[]) => {
      setParsed({ headers, rows });
      // Auto-map
      const next: Record<Field, string> = {
        code: "",
        name: "",
        collection: "",
        color_hex: "",
        active: "",
        in_stock: "",
        lrv: "",
      };
      headers.forEach((h) => {
        const f = guessField(h);
        if (f && !next[f]) next[f] = h;
      });
      setMapping(next);
    };

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
          const headers = json.length ? Object.keys(json[0]) : [];
          onData(json, headers);
        } catch (err) {
          toast.error("Failed to parse XLSX file");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const headers = res.meta.fields ?? [];
          onData(res.data, headers);
        },
        error: () => toast.error("Failed to parse CSV file"),
      });
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const requiredMissing = REQUIRED.filter((f) => !mapping[f]);

  const previewRows = useMemo(() => parsed?.rows.slice(0, 5) ?? [], [parsed]);

  const buildRecords = () => {
    if (!parsed) return [];
    return parsed.rows
      .map((r, i) => {
        const code = String(r[mapping.code] ?? "").trim();
        const name = String(r[mapping.name] ?? "").trim();
        const collection = String(r[mapping.collection] ?? "").trim();
        const hex = normalizeHex(String(r[mapping.color_hex] ?? ""));
        if (!code || !name || !collection || !hex) {
          return { _error: `Row ${i + 2}: missing/invalid required field` };
        }
        const rec: Record<string, unknown> = {
          code,
          name,
          collection,
          hex,
        };
        if (mapping.active) rec.active = parseBool(r[mapping.active], true);
        if (mapping.in_stock) rec.in_stock = parseBool(r[mapping.in_stock], true);
        if (mapping.lrv) {
          const lrv = Number(r[mapping.lrv]);
          if (!isNaN(lrv)) rec.lrv = lrv;
        }
        return rec;
      });
  };

  const runImport = async () => {
    if (!parsed) return;
    if (requiredMissing.length) {
      toast.error(`Map required fields: ${requiredMissing.join(", ")}`);
      return;
    }
    setImporting(true);
    setProgress(0);
    setResult(null);

    const built = buildRecords();
    const errors: string[] = [];
    const valid: Record<string, unknown>[] = [];
    built.forEach((b) => {
      if ((b as any)._error) errors.push((b as any)._error);
      else valid.push(b);
    });

    // Detect duplicates by code (within file)
    const seen = new Set<string>();
    const deduped: Record<string, unknown>[] = [];
    for (const r of valid) {
      const code = String(r.code);
      if (seen.has(code)) {
        errors.push(`Duplicate code in file skipped: ${code}`);
        continue;
      }
      seen.add(code);
      deduped.push(r);
    }

    // Fetch existing codes to compute inserted vs updated
    const codes = deduped.map((r) => String(r.code));
    const existing = new Set<string>();
    for (const c of chunk(codes, 500)) {
      const { data } = await supabase.from("paint_colors").select("code").in("code", c);
      (data ?? []).forEach((r) => existing.add(r.code));
    }
    const insertedCount = deduped.filter((r) => !existing.has(String(r.code))).length;
    const updatedCount = deduped.length - insertedCount;

    // Upsert in batches
    const batches = chunk(deduped, 200);
    let done = 0;
    for (const b of batches) {
      const { error } = await supabase
        .from("paint_colors")
        .upsert(b as any, { onConflict: "code", ignoreDuplicates: false });
      if (error) errors.push(`Batch error: ${error.message}`);
      done += b.length;
      setProgress(Math.round((done / deduped.length) * 100));
    }

    setImporting(false);
    setResult({
      inserted: insertedCount,
      updated: updatedCount,
      skipped: built.length - deduped.length,
      errors,
    });
    toast.success(`Import complete: +${insertedCount} new, ${updatedCount} updated`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link to="/dashboard/colors" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to catalog
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-primary">Import Palette</h1>
          <p className="text-muted-foreground">
            Upload a CSV or XLSX file to add or update Sunburst paint colors. Existing colors are matched by code.
          </p>
        </div>
      </div>

      {!parsed && (
        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed p-12 text-center transition ${
            dragOver ? "border-accent bg-accent/5" : "border-border"
          }`}
        >
          <Upload className="h-10 w-10 text-accent" />
          <div>
            <div className="font-semibold">Drag &amp; drop your file here</div>
            <div className="text-sm text-muted-foreground">CSV or XLSX, up to ~10,000 rows</div>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <span className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90">
              Browse files
            </span>
          </label>
          <p className="text-xs text-muted-foreground max-w-md">
            Required columns: <strong>code</strong>, <strong>name</strong>, <strong>collection</strong>, <strong>color_hex</strong>. Optional: active, in_stock, lrv.
          </p>
        </Card>
      )}

      {parsed && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-accent" />
                <div>
                  <div className="font-semibold">{fileName}</div>
                  <div className="text-xs text-muted-foreground">{parsed.rows.length} rows · {parsed.headers.length} columns</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setParsed(null);
                  setFileName("");
                  setResult(null);
                }}
              >
                Choose different file
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Map columns
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ALL_FIELDS.map((f) => (
                <div key={f}>
                  <Label className="text-xs">
                    {f} {REQUIRED.includes(f) && <span className="text-destructive">*</span>}
                  </Label>
                  <Select
                    value={mapping[f] || "__none__"}
                    onValueChange={(v) => setMapping({ ...mapping, [f]: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Not mapped —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {requiredMissing.length > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> Missing required mappings: {requiredMissing.join(", ")}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Preview (first 5 rows)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {ALL_FIELDS.map((f) => (
                      <th key={f} className="px-3 py-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => {
                    const hex = normalizeHex(String(r[mapping.color_hex] ?? ""));
                    return (
                      <tr key={i} className="border-t border-border">
                        {ALL_FIELDS.map((f) => (
                          <td key={f} className="px-3 py-2">
                            {f === "color_hex" && hex ? (
                              <div className="flex items-center gap-2">
                                <span className="h-5 w-5 rounded border border-border" style={{ backgroundColor: hex }} />
                                <span className="font-mono text-xs">{hex}</span>
                              </div>
                            ) : (
                              <span className="text-xs">{mapping[f] ? String(r[mapping[f]] ?? "") : "—"}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Existing colors are updated by <strong>code</strong>. IDs, project references, and saved colors are preserved.
            </p>
            <Button
              onClick={runImport}
              disabled={importing || requiredMissing.length > 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                </>
              ) : (
                <>Import {parsed.rows.length} rows</>
              )}
            </Button>
          </div>

          {importing && <Progress value={progress} />}

          {result && (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
                <CheckCircle2 className="h-5 w-5 text-success" /> Import complete
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="New" value={result.inserted} />
                <Stat label="Updated" value={result.updated} />
                <Stat label="Skipped" value={result.skipped} tone="warning" />
                <Stat label="Errors" value={result.errors.length} tone={result.errors.length ? "destructive" : undefined} />
              </div>
              {result.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-destructive">
                    {result.errors.length} issue(s) — view details
                  </summary>
                  <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-muted-foreground">
                    {result.errors.slice(0, 200).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "destructive" }) {
  const cls =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-accent";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
