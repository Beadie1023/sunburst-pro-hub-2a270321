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

async function checkMetadata() {
  console.log("Attempting to query constraints via HTTP / PostgREST from public schema if exposed, or other catalogs...");
  
  // Try querying table info from Postgres catalog if Supabase POSTGREST allows.
  // Often it doesn't allow direct SELECT on pg_catalog/information_schema directly unless exposed, 
  // but let's try calling RPC or select.
  try {
    const { data, error } = await supabase.from("pg_constraint").select("*");
    if (error) {
      console.log("pg_constraint query failed:", error.message);
    } else {
      console.log("pg_constraint query success!", data);
    }
  } catch (err: any) {
    console.log("pg_constraint error:", err.message);
  }

  // Let's also check if we can query 'customers' again to inspect if there's any other column that must match.
  const { data: cols } = await supabase.from("customers").select("*").limit(1);
  console.log("\nSample Customer:", cols);
}

checkMetadata();
