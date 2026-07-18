import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client"; // adjust to your actual client path

export default function ProductImport() {
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<any[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setPreview(results.data as any[]);
      },
    });
  };

  const handleImport = async () => {
    setStatus("Importing...");
    // Map CSV columns to your products table columns exactly
    const rows = preview.map((row) => ({
      name: row.name,
      price: parseFloat(row.price),
      description: row.description,
      sku: row.sku,
      // add/remove fields to match your `products` table schema
    }));

    const { error } = await supabase.from("products").insert(rows);

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus(`Imported ${rows.length} products successfully.`);
      setPreview([]);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Import Products</h1>
      <input type="file" accept=".csv" onChange={handleFile} />
      {preview.length > 0 && (
        <>
          <p className="mt-4">{preview.length} rows detected. Preview:</p>
          <pre className="text-xs bg-gray-100 p-2 max-h-64 overflow-auto">
            {JSON.stringify(preview.slice(0, 3), null, 2)}
          </pre>
          <button
            onClick={handleImport}
            className="mt-4 bg-black text-white px-4 py-2 rounded"
          >
            Confirm Import
          </button>
        </>
      )}
      <p className="mt-2 text-sm text-gray-500">{status}</p>
    </div>
  );
}
