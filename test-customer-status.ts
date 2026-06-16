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

async function testLowercaseStatus() {
  const tempCustId = "00000000-0000-0000-0000-000001234567";
  const tempJobId = "00000000-0000-0000-0000-000002345678";

  console.log("Cleaning up potential old data...");
  await supabase.from("jobs").delete().eq("id", tempJobId);
  await supabase.from("customers").delete().eq("id", tempCustId);

  console.log("\nInserting customer...");
  const customerPayload = {
    id: tempCustId,
    name: "Test Customer Lc",
    email: "test-lc@example.com",
    phone: "+15551234",
    address: "123 Lc St",
    status: "Lead"
  };

  const { error: custErr } = await supabase.from("customers").insert(customerPayload);
  if (custErr) {
    console.error("Customers insert failed:", custErr.message);
    return;
  }
  console.log("Customer inserted successfully.");

  // Test lowercase 'lead' status
  const jobPayloadLc = {
    id: tempJobId,
    customer_id: tempCustId,
    title: "Lowercase Test",
    status: "lead" // lowercase 'lead' matching SQL CHECK exactly!
  };

  console.log("Inserting job with lowercase status 'lead'...");
  const { error: jobErr } = await supabase.from("jobs").insert(jobPayloadLc);
  if (jobErr) {
    console.error("Job insert failed:", jobErr.message);
  } else {
    console.log("Job insert with lowercase status 'lead' SUCCESSFUL!");
  }

  // Clean up
  await supabase.from("jobs").delete().eq("id", tempJobId);
  await supabase.from("customers").delete().eq("id", tempCustId);
}

testLowercaseStatus();
