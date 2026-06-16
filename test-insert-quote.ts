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

async function testInsertQuote() {
  const tempQuoteId = "00000000-0000-0000-0000-000009999999";
  
  console.log("Cleaning up potential old quote...");
  await supabase.from("quotes").delete().eq("id", tempQuoteId);

  // Get a valid customer ID
  const { data: customers } = await supabase.from("customers").select("id").limit(1);
  if (!customers || customers.length === 0) {
    console.error("No customers in database to test");
    return;
  }
  const targetCustId = customers[0].id;
  console.log("Using customer:", targetCustId);

  const quotePayload = {
    id: tempQuoteId,
    quote_number: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
    customer_id: targetCustId,
    job_id: null,        // TEST NULL
    contractor_id: null,  // TEST NULL
    waste_factor: 10,
    materials_cost: 100,
    labor_cost: 150,
    custom_cost: 0,
    subtotal_cost: 250,
    subtotal_price: 300,
    margin: 20,
    profit: 50,
    notes: "Test Null Join Quote"
  };

  console.log("Attempting to insert quote with null job_id and contractor_id...");
  const { data, error } = await supabase.from("quotes").insert(quotePayload).select();
  if (error) {
    console.error("Quote insert FAILED:", error.message);
  } else {
    console.log("Quote insert SUCCESSFUL!", data);
    await supabase.from("quotes").delete().eq("id", tempQuoteId);
  }
}

testInsertQuote();
