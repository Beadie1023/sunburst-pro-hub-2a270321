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

async function inspectJobsColumns() {
  console.log("Checking candidate columns of 'jobs' table...");
  const candidateCols = [
    "id",
    "customer_id",
    "contractor_id",
    "title",
    "project_name",
    "name",
    "status",
    "price",
    "cost",
    "budget",
    "value",
    "total_value",
    "notes",
    "created_at",
    "updated_at",
    "quote_id"
  ];

  for (const col of candidateCols) {
    const { error } = await supabase.from("jobs").select(col).limit(1);
    if (error) {
      console.log(`Column '${col}': FAILED: ${error.message}`);
    } else {
      console.log(`Column '${col}': SUCCESS!`);
    }
  }
}

inspectJobsColumns();
