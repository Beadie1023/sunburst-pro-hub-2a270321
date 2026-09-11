import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const InputSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  roomType: z.string().min(1),
  style: z.string().min(1),
  notes: z.string().optional().default(""),
});

// Calls the server-side edge function; no AI keys ever reach the browser.
export async function recommendColors(input: any) {
  const payload = input && typeof input === "object" && "data" in input ? input.data : input;
  const data = InputSchema.parse(payload);

  const { data: result, error } = await supabase.functions.invoke("recommend-colors", {
    body: data,
  });
  if (error) throw new Error(error.message || "Failed to get recommendations");
  if (result?.error) throw new Error(result.error);

  return result as { recommendations: any[] };
}
