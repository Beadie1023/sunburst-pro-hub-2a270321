import dotenv from "dotenv";
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

async function fetchOpenApi() {
  if (!supabaseUrl) return;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${supabaseAnonKey}`
      }
    });
    
    if (!res.ok) {
      console.error("HTTP error:", res.status, res.statusText);
      return;
    }

    const data: any = await res.json();
    
    console.log("=== JOBS TABLE DEFINITIONS ===");
    const jobsPath = data.paths["/jobs"];
    if (jobsPath) {
      console.log(JSON.stringify(jobsPath, null, 2));
    } else {
      console.log("No /jobs path found.");
    }

    console.log("\n=== CUSTOMERS TABLE DEFINITIONS ===");
    const custsPath = data.paths["/customers"];
    if (custsPath) {
      console.log(JSON.stringify(custsPath, null, 2));
    } else {
      console.log("No /customers path found.");
    }
  } catch (err: any) {
    console.error("Failed to query OpenAPI schema:", err.message);
  }
}

fetchOpenApi();
