import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

dotenv.config();

let dbConfig = { supabaseUrl: "", supabaseAnonKey: "" };
try {
  const configPath = path.join(process.cwd(), "data_config.json");
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    dbConfig = JSON.parse(raw);
  }
} catch (e) {}

const supabaseUrl = process.env.SUPABASE_URL || dbConfig.supabaseUrl;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || dbConfig.supabaseAnonKey;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectAll() {
  console.log("=== INSPECTING CUSTOMERS ===");
  const { data: custs } = await supabase.from("customers").select("*").limit(5);
  console.log(JSON.stringify(custs, null, 2));

  console.log("\n=== INSPECTING CONTRACTORS ===");
  const { data: contrs } = await supabase.from("contractors").select("*").limit(5);
  console.log(JSON.stringify(contrs, null, 2));

  console.log("\n=== INSPECTING JOBS ===");
  const { data: jobs } = await supabase.from("jobs").select("*").limit(5);
  console.log(JSON.stringify(jobs, null, 2));

  console.log("\n=== INSPECTING QUOTES ===");
  const { data: quotes } = await supabase.from("quotes").select("*").limit(5);
  console.log(JSON.stringify(quotes, null, 2));
}

inspectAll();
