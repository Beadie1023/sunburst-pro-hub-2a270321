import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const InputSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  roomType: z.string().min(1),
  style: z.string().min(1),
  notes: z.string().optional().default(""),
});

export async function recommendColors(input: any) {
  const payloadToValidate = input && typeof input === "object" && "data" in input ? input.data : input;
  const data = InputSchema.parse(payloadToValidate);

  const { data: result, error } = await supabase.functions.invoke("recommend-colors", {
    body: data,
  });

  if (error) throw new Error(error.message || "AI request failed");
  if (result?.error) throw new Error(result.error);

  return result as { recommendations: any[] };
}

const VisualizeSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  colorHex: z.string().min(6),
  colorName: z.string().default("the selected color"),
  surface: z.enum(["wall", "roof", "all"]).default("wall"),
});

export async function visualizeRoom(input: any) {
  const payloadToValidate = input && typeof input === "object" && "data" in input ? input.data : input;
  const data = VisualizeSchema.parse(payloadToValidate);

  const { data: result, error } = await supabase.functions.invoke("visualize-room", {
    body: data,
  });

  if (error) throw new Error(error.message || "AI request failed");
  if (result?.error) throw new Error(result.error);

  return result as { imageDataUrl: string };
}
