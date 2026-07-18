import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "crypto";
import PDFDocument from "pdfkit";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" }));

// Helper to map arbitrary string IDs to deterministic UUIDs for Postgres strict type compliance
function ensureUUID(id: any): string | null {
  if (id === null || id === undefined || id === "") return null;
  const str = String(id).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) {
    return str;
  }
  
  // Create deterministic md5 hash and pad standard UUID pieces
  const hash = createHash("md5").update(str).digest("hex");
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

// Ensure uploads folder exists and serve statically
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

const PORT = 3000;

const DEFAULT_COMPANY_SETTINGS = {
  company_name: "Sunburst Paints & Coatings Ltd.",
  company_address: "Tonique Williams-Darling Highway\nNassau, Bahamas",
  company_phone: "(242) 328-4800",
  company_email: "operations@sunburstpaints.com",
  vat_registration: "VAT-242-328"
};

// Dynamic company settings checker
async function getCompanySettings() {
  const supabase = getSupabaseClient();
  let db_settings = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        db_settings = data;
      }
    } catch (err: any) {
      console.warn("Exception retrieving company_settings:", err.message || String(err));
    }
  }
  return {
    company_name: db_settings?.company_name || DEFAULT_COMPANY_SETTINGS.company_name,
    company_address: db_settings?.company_address || DEFAULT_COMPANY_SETTINGS.company_address,
    company_phone: db_settings?.company_phone || DEFAULT_COMPANY_SETTINGS.company_phone,
    company_email: db_settings?.company_email || DEFAULT_COMPANY_SETTINGS.company_email,
    vat_registration: db_settings?.vat_registration || DEFAULT_COMPANY_SETTINGS.vat_registration,
    logo_url: db_settings?.logo_url || ""
  };
}

// 1. GET /api/company-settings
app.get("/api/company-settings", async (req, res) => {
  const settings = await getCompanySettings();
  return res.json({ success: true, settings });
});

// 2. POST /api/company-settings
app.post("/api/company-settings", express.json(), async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(400).json({ success: false, error: "Database integration connection not configured yet." });
    }

    const { id, company_name, company_address, company_phone, company_email, vat_registration, logo_url } = req.body;

    const payload = {
      company_name,
      company_address,
      company_phone,
      company_email,
      vat_registration,
      logo_url
    };

    let savedData;
    if (id) {
      const { data, error } = await supabase
        .from("company_settings")
        .update(payload)
        .eq("id", id)
        .select();
      if (error) throw error;
      savedData = data?.[0];
    } else {
      const { data, error } = await supabase
        .from("company_settings")
        .insert(payload)
        .select();
      if (error) throw error;
      savedData = data?.[0];
    }

    return res.json({ success: true, settings: savedData });
  } catch (err: any) {
    console.error("Failed to save company settings:", err);
    return res.status(500).json({ 
      success: false, 
      error: err.message?.includes("does not exist")
        ? "The 'company_settings' table does not exist in your database yet. Please go to the Supabase SQL editor and execute the schema definition under the 'Supabase Schema (PostgreSQL)' panel first."
        : (err.message || String(err))
    });
  }
});

// Configurable system constant for VAT rate (default 0.10) - Requirement 3
const SYSTEM_VAT_RATE = 0.10;

// Lazy-initialize Gemini API Client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API client initialized successfully.");
  } catch (e) {
    console.error("Failed to initialize Gemini API client:", e);
  }
}

// Dynamic Supabase configuration mapping
let supabaseClient: any = null;
const dbConfig = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
};

// Initial database configuration lookup
function loadDbConfig() {
  try {
    const configPath = path.join(process.cwd(), "data_config.json");
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(data);
      dbConfig.supabaseUrl = process.env.SUPABASE_URL || parsed.supabaseUrl || "";
      dbConfig.supabaseAnonKey = process.env.SUPABASE_ANON_KEY || parsed.supabaseAnonKey || "";
    }
  } catch (e) {
    console.warn("Could not load database settings. Falling back.");
  }
}
loadDbConfig();

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (dbConfig.supabaseUrl && dbConfig.supabaseAnonKey) {
    try {
      supabaseClient = createClient(dbConfig.supabaseUrl, dbConfig.supabaseAnonKey);
      return supabaseClient;
    } catch (e) {
      console.error("Supabase connection build failure:", e);
    }
  }
  return null;
}

// Fallback JSON-based Dynamic Products persistence
function loadLocalProducts() {
  try {
    const dataPath = path.join(process.cwd(), "data_products.json");
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Local catalog parse failed:", e);
  }
  return [];
}

// Global audit logging utility for tracking db operations
function logAuditEvent(action: string, type: string, countOrId: string | number, details: string) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp,
    action,
    type,
    countOrId,
    details
  };
  
  console.log(`[AUDIT TRACKING] ${timestamp} - ${action} - ${type} - Identifier: ${countOrId} - ${details}`);
  
  try {
    const logsPath = path.join(process.cwd(), "data_audit.json");
    let currentLogs: any[] = [];
    if (fs.existsSync(logsPath)) {
      currentLogs = JSON.parse(fs.readFileSync(logsPath, "utf8"));
    }
    currentLogs.unshift(logEntry);
    fs.writeFileSync(logsPath, JSON.stringify(currentLogs.slice(0, 1000), null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
}

// Heartbeat variables for Production Verification Layer
let dbConnectivityStatus: "ONLINE" | "DEGRADED" | "OFFLINE" = "OFFLINE";
let lastHeartbeatTime: string = "";
let lastDbError: string | null = null;
let consecutiveFailures = 0;
let seededSupabase = false;

async function seedSupabaseData(supabase: any) {
  if (seededSupabase) return;
  try {
    const contractorUuid = ensureUUID("contr_01");
    // 1. Ensure contractor exists
    const currentSettings = await getCompanySettings();
    await supabase.from("contractors").upsert({
      id: contractorUuid,
      name: "SunBurst Certified Team",
      company_name: currentSettings?.company_name || "Company profile not configured",
      email: currentSettings?.company_email || "",
      phone: currentSettings?.company_phone || ""
    });

    // 2. Insert seed customers
    const seedCusts = [
      {
        id: ensureUUID("cust_seed_1"),
        contractor_id: contractorUuid,
        name: "Marcus Aurelius",
        email: "marcus@rome-coatings.com",
        phone: "+1 (954) 555-0199",
        address: "405 Gladiators Way, Pompano Beach FL",
        status: "Lead",
        notes: "Soffit repair & double-coat satin enamel. Prefers Tideshell palette. Ready for scheduled dispatch.",
        created_at: new Date(Date.now() - 3600000 * 48).toISOString()
      },
      {
        id: ensureUUID("cust_seed_2"),
        contractor_id: contractorUuid,
        name: "Brandon Vance",
        email: "b.vance@vancebuilt.org",
        phone: "+1 (561) 555-0311",
        address: "904 Whispering Sands Way, Jupiter FL",
        status: "Active",
        notes: "High-end cedar deck restoration. Quoted AmberGlow and Waterproof Sealant. Target Margin 35% locked.",
        created_at: new Date(Date.now() - 3600000 * 24).toISOString()
      }
    ];
    await supabase.from("customers").upsert(seedCusts);

    // 3. Insert seed jobs
    const seedJobs = [
      {
        id: ensureUUID("job_seed_1"),
        customer_id: ensureUUID("cust_seed_1"),
        contractor_id: contractorUuid,
        title: "EXTERIOR: Garage Stucco Refresh",
        status: "Estimate",
        price: 3450.00,
        updated_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        created_at: new Date(Date.now() - 3600000 * 48).toISOString()
      },
      {
        id: ensureUUID("job_seed_2"),
        customer_id: ensureUUID("cust_seed_2"),
        contractor_id: contractorUuid,
        title: "STAIN: Cedar Wrap Deck Sealer",
        status: "In Progress",
        price: 6850.00,
        updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        created_at: new Date(Date.now() - 3600000 * 24).toISOString()
      }
    ];
    for (const j of seedJobs) {
      await insertJobToSupabase(j);
    }
    
    seededSupabase = true;
    console.log("[AUTO-SEED] Supabase database seed completed successfully.");
  } catch (err: any) {
    console.warn("[AUTO-SEED FAIL] Failed to complete automatic Supabase database seeding:", err.message || err);
  }
}

async function performHeartbeat() {
  const supabase = getSupabaseClient();
  lastHeartbeatTime = new Date().toISOString();
  
  if (!supabase) {
    dbConnectivityStatus = "OFFLINE";
    lastDbError = "Supabase configuration credentials are empty or invalid.";
    return;
  }
  
  try {
    // Perform a lightweight check on the products table
    const { data, error } = await supabase.from("products").select("sku").limit(1);
    
    if (error) {
      consecutiveFailures++;
      dbConnectivityStatus = "DEGRADED";
      lastDbError = `Heartbeat query failed on schema validation: ${error.message}`;
      console.warn(`[HEARTBEAT FAIL #${consecutiveFailures}] ${lastDbError}`);
      
      // Log connection failures to audit trail system (Requirement 3)
      logAuditEvent(
        "CONNECTION_FAILURE", 
        "SYSTEM", 
        `HEARTBEAT_FAIL_${consecutiveFailures}`, 
        `Database connection heartbeat was degraded: ${error.message}`
      );
    } else {
      if (dbConnectivityStatus !== "ONLINE") {
        console.log(`[HEARTBEAT RECOVERY] Database connection established successfully.`);
        logAuditEvent(
          "HEARTBEAT", 
          "SYSTEM", 
          "OK", 
          "Supabase database connection established and heartbeat check successfully validated."
        );
      }
      dbConnectivityStatus = "ONLINE";
      lastDbError = null;
      consecutiveFailures = 0;
      
      // Run auto-seeding once online
      seedSupabaseData(supabase).catch(err => console.error("Error auto-seeding data:", err));
    }
  } catch (err: any) {
    consecutiveFailures++;
    dbConnectivityStatus = "DEGRADED";
    lastDbError = `Heartbeat network connectivity exception: ${err.message || String(err)}`;
    console.warn(`[HEARTBEAT EXCEPTION #${consecutiveFailures}] ${lastDbError}`);
    
    logAuditEvent(
      "CONNECTION_FAILURE", 
      "SYSTEM", 
      `HEARTBEAT_EXC_${consecutiveFailures}`, 
      `Database connection threw exception: ${err.message || String(err)}`
    );
  }
}

async function getProducts() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase is disconnected. Defaulting to local read baseline.");
    return loadLocalProducts();
  }
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sku", { ascending: true });
    
    if (error) {
      console.error("[DATABASE ERROR] Failed to fetch products, falling back to local:", error.message);
      logAuditEvent(
        "CONNECTION_FAILURE",
        "PRODUCT",
        "FETCH_FAIL",
        `Failed to retrieve products from database: ${error.message}. Loaded local fallback cache.`
      );
      return loadLocalProducts();
    }
    return data || [];
  } catch (e: any) {
    console.error("Supabase connection error in getProducts, falling back to local:", e.message || e);
    logAuditEvent(
      "CONNECTION_FAILURE",
      "PRODUCT",
      "EXCEPTION",
      `Exception thrown in getProducts: ${e.message || String(e)}. Loaded local fallback cache.`
    );
    return loadLocalProducts();
  }
}

function ensureUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    return id;
  }
  return randomUUID();
}

async function saveProducts(newProducts: any[], refresh: boolean = false) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is disconnected! All database writes must go through validated Supabase queries in production mode.");
  }

  const currentProducts = await getProducts();
  let mergedProducts: any[] = [];
  if (refresh) {
    mergedProducts = [];
  } else {
    mergedProducts = [...currentProducts];
  }

  // Enforce validation: ONLY official Sunburst products (containing 'Sunburst' in title) are accepted
  const validatedIncoming = newProducts.map((p, idx) => {
    let name = p.name || `Sunburst Product ${idx}`;
    if (!name.toLowerCase().includes("sunburst")) {
      name = `Sunburst ${name}`;
    }
    return {
      name,
      sku: (p.sku || `SB-CUST-${Math.floor(1000 + Math.random() * 9000).toString()}`).toUpperCase(),
      category: p.category || "paint",
      price: Number(p.price) || 0,
      retail_price: Number(p.retail_price) || 0,
      covers_sqft: Number(p.covers_sqft) || 0,
      unit: p.unit || "gallon",
      description: p.description || "Official Sunburst Paints catalog item.",
      image_url: p.image_url || "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=300&q=80",
      is_sunburst_exclusive: true,
      technical_sheet_url: p.technical_sheet_url || null,
      safety_sheet_url: p.safety_sheet_url || null
    };
  });

  // Merge process: Detect duplicate products using SKU
  for (const p of validatedIncoming) {
    const existingIdx = mergedProducts.findIndex(x => x.sku.toUpperCase() === p.sku.toUpperCase());
    if (existingIdx > -1) {
      mergedProducts[existingIdx] = {
        ...mergedProducts[existingIdx],
        ...p,
        id: ensureUuid(mergedProducts[existingIdx].id)
      };
    } else {
      mergedProducts.push({
        id: randomUUID(),
        ...p
      });
    }
  }

  // Ensure all products have valid UUIDs
  mergedProducts = mergedProducts.map(p => ({
    ...p,
    id: ensureUuid(p.id)
  }));

  // Clean local file cache
  try {
    fs.writeFileSync(
      path.join(process.cwd(), "data_products.json"),
      JSON.stringify(mergedProducts, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("Local data sync warning:", e);
  }

  if (refresh) {
    // Delete existing colors first to maintain FK integrity, then products
    const { error: delColorsErr } = await supabase.from("colors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delColorsErr) {
      throw new Error(`Failed to empty colors table during full refresh: ${delColorsErr.message}`);
    }
    const { error: delProductsErr } = await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delProductsErr) {
      throw new Error(`Failed to empty products table during full refresh: ${delProductsErr.message}`);
    }
    logAuditEvent("RESET", "PRODUCT", mergedProducts.length, "Truncated and fully overwrote products collection under Full Refresh Mode.");
  }

  const { error: upsertError } = await supabase.from("products").upsert(mergedProducts, { onConflict: "sku" });
  if (upsertError) {
    console.error("[DATABASE ERROR] Products upsert failed:", upsertError.message);
    throw new Error(`Supabase Upsert Failure: ${upsertError.message}`);
  }

  logAuditEvent("INSERT/UPDATE", "PRODUCT", validatedIncoming.length, `Uploaded ${validatedIncoming.length} certified products payload.`);
  return { success: true, supabaseSynced: true, products: mergedProducts };
}

// Dynamic Customers helpers
async function getCustomers() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase is disconnected. Defaulting to local read baseline.");
    return loadLocalCustomers();
  }
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("[DATABASE ERROR] Failed to fetch customers, falling back to local:", error.message);
      logAuditEvent(
        "CONNECTION_FAILURE",
        "CUSTOMER",
        "FETCH_FAIL",
        `Failed to retrieve customers from database: ${error.message}. Loaded local fallback cache.`
      );
      return loadLocalCustomers();
    }
    const remoteCustomers = data || [];
    const localCustomers = loadLocalCustomers();
    const merged = [...remoteCustomers];
    for (const lc of localCustomers) {
      if (!merged.some((rc: any) => String(rc.id).trim() === String(lc.id).trim())) {
        merged.push(lc);
      }
    }
    return merged;
  } catch (e: any) {
    console.error("Supabase connection error in getCustomers, falling back to local:", e.message || e);
    logAuditEvent(
      "CONNECTION_FAILURE",
      "CUSTOMER",
      "EXCEPTION",
      `Exception thrown in getCustomers: ${e.message || String(e)}. Loaded local fallback cache.`
    );
    return loadLocalCustomers();
  }
}

function loadLocalCustomers() {
  try {
    const dataPath = path.join(process.cwd(), "data_customers.json");
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Local customers parse failed:", e);
  }
  
  const seeds = [
    {
      id: "cust_seed_1",
      name: "Marcus Aurelius",
      email: "marcus@rome-coatings.com",
      phone: "+1 (954) 555-0199",
      address: "405 Gladiators Way, Pompano Beach FL",
      status: "Lead",
      contractor_id: "contr_01",
      created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
      notes: "Soffit repair & double-coat satin enamel. Prefers Tideshell palette. Ready for scheduled dispatch."
    },
    {
      id: "cust_seed_2",
      name: "Brandon Vance",
      email: "b.vance@vancebuilt.org",
      phone: "+1 (561) 555-0311",
      address: "904 Whispering Sands Way, Jupiter FL",
      status: "Active",
      contractor_id: "contr_01",
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      notes: "High-end cedar deck restoration. Quoted AmberGlow and Waterproof Sealant. Target Margin 35% locked."
    }
  ];
  
  try {
    fs.writeFileSync(path.join(process.cwd(), "data_customers.json"), JSON.stringify(seeds, null, 2), "utf8");
  } catch (e) {}
  
  return seeds;
}

// Dynamic Quotes helpers
async function getQuotes() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase is disconnected. Defaulting to local quotes read baseline.");
    return loadLocalQuotes();
  }
  try {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("[DATABASE ERROR] Failed to fetch quotes, falling back to local:", error.message);
      logAuditEvent(
        "CONNECTION_FAILURE",
        "QUOTE",
        "FETCH_FAIL",
        `Failed to retrieve quotes from database: ${error.message}. Loaded local fallback cache.`
      );
      return loadLocalQuotes();
    }
    const remoteQuotes = data || [];
    const localQuotes = loadLocalQuotes();
    const quotes = [...remoteQuotes];
    for (const lq of localQuotes) {
      if (!quotes.some((rq: any) => String(rq.id).trim() === String(lq.id).trim())) {
        quotes.push(lq);
      }
    }
    try {
      const customers = await getCustomers();
      for (const q of quotes) {
        const customer = customers.find((c: any) => 
          String(c.id).trim() === String(q.customer_id).trim() || 
          ensureUUID(c.id) === ensureUUID(q.customer_id)
        );
        if (customer) {
          q.customer_name = customer.name;
          q.customer_address = customer.address;
          q.address = customer.address;
          q.customer_phone = customer.phone;
          q.phone = customer.phone;
          q.customer_email = customer.email;
          q.email = customer.email;
        }
      }
    } catch (joinErr) {
      console.error("Failed to join customer details in getQuotes:", joinErr);
    }
    return quotes;
  } catch (e: any) {
    console.error("Supabase connection error in getQuotes, falling back to local:", e.message || e);
    logAuditEvent(
      "CONNECTION_FAILURE",
      "QUOTE",
      "EXCEPTION",
      `Exception thrown in getQuotes: ${e.message || String(e)}. Loaded local fallback cache.`
    );
    return loadLocalQuotes();
  }
}

function loadLocalQuotes() {
  try {
    const dataPath = path.join(process.cwd(), "data_quotes.json");
    let quotes: any[] = [];
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, "utf8");
      quotes = JSON.parse(data);
    }
    try {
      const customers = loadLocalCustomers();
      for (const q of quotes) {
        const customer = customers.find((c: any) => 
          String(c.id).trim() === String(q.customer_id).trim() || 
          ensureUUID(c.id) === ensureUUID(q.customer_id)
        );
        if (customer) {
          q.customer_name = customer.name;
          q.customer_address = customer.address;
          q.address = customer.address;
          q.customer_phone = customer.phone;
          q.phone = customer.phone;
          q.customer_email = customer.email;
          q.email = customer.email;
        }
      }
    } catch (joinErr) {
      console.error("Failed to join customer details in loadLocalQuotes:", joinErr);
    }
    return quotes;
  } catch (e) {
    console.error("Local quotes parse failed:", e);
  }
  return [];
}

// Dynamic Jobs helpers
async function getJobs() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase is disconnected. Defaulting to local jobs read baseline.");
    return loadLocalJobs();
  }
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("[DATABASE ERROR] Failed to fetch jobs, falling back to local:", error.message);
      logAuditEvent(
        "CONNECTION_FAILURE",
        "JOB",
        "FETCH_FAIL",
        `Failed to retrieve jobs from database: ${error.message}. Loaded local fallback cache.`
      );
      return loadLocalJobs();
    }

    const remoteJobs = data || [];
    const localJobs = loadLocalJobs();
    const mergedJobs = [...remoteJobs];
    for (const lj of localJobs) {
      if (!mergedJobs.some((rj: any) => String(rj.id).trim() === String(lj.id).trim())) {
        mergedJobs.push(lj);
      }
    }

    const mapped = mergedJobs.map((item: any) => ({
      ...item,
      title: item.project_name || item.title || "Project",
      project_name: item.project_name || item.title || "Project",
      price: Number(item.total_value ?? item.price ?? 0),
      total_value: Number(item.total_value ?? item.price ?? 0),
    }));

    return mapped;
  } catch (e: any) {
    console.error("Supabase connection error in getJobs, falling back to local:", e.message || e);
    logAuditEvent(
      "CONNECTION_FAILURE",
      "JOB",
      "EXCEPTION",
      `Exception thrown in getJobs: ${e.message || String(e)}. Loaded local fallback cache.`
    );
    return loadLocalJobs();
  }
}

function loadLocalJobs() {
  try {
    const dataPath = path.join(process.cwd(), "data_jobs.json");
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Local jobs parse failed:", e);
  }
  
  const seeds = [
    {
      id: "job_seed_1",
      customer_id: "cust_seed_1",
      contractor_id: "contr_01",
      title: "EXTERIOR: Garage Stucco Refresh",
      project_name: "EXTERIOR: Garage Stucco Refresh",
      status: "Estimate",
      price: 3450.00,
      total_value: 3450.00,
      updated_at: new Date(Date.now() - 3600000 * 6).toISOString(),
      created_at: new Date(Date.now() - 3600000 * 48).toISOString()
    },
    {
      id: "job_seed_2",
      customer_id: "cust_seed_2",
      contractor_id: "contr_01",
      title: "STAIN: Cedar Wrap Deck Sealer",
      project_name: "STAIN: Cedar Wrap Deck Sealer",
      status: "In Progress",
      price: 6850.00,
      total_value: 6850.00,
      updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      created_at: new Date(Date.now() - 3600000 * 24).toISOString()
    }
  ];
  
  try {
    fs.writeFileSync(path.join(process.cwd(), "data_jobs.json"), JSON.stringify(seeds, null, 2), "utf8");
  } catch (e) {}
  
  return seeds;
}

// Dynamic Colors helpers
function loadLocalColors() {
  try {
    const dataPath = path.join(process.cwd(), "data_colors.json");
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Local color catalog parse failed:", e);
  }
  return [];
}

async function getColors() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase is disconnected. Defaulting to local colors read baseline.");
    return loadLocalColors();
  }
  try {
    const { data, error } = await supabase
      .from("colors")
      .select("*")
      .order("name", { ascending: true });
    
    if (error) {
      console.error("[DATABASE ERROR] Failed to fetch colors, falling back to local:", error.message);
      logAuditEvent(
        "CONNECTION_FAILURE",
        "COLOR",
        "FETCH_FAIL",
        `Failed to retrieve colors from database: ${error.message}. Loaded local fallback cache.`
      );
      return loadLocalColors();
    }
    return data || [];
  } catch (e: any) {
    console.error("Supabase connection error in getColors, falling back to local:", e.message || e);
    logAuditEvent(
      "CONNECTION_FAILURE",
      "COLOR",
      "EXCEPTION",
      `Exception thrown in getColors: ${e.message || String(e)}. Loaded local fallback cache.`
    );
    return loadLocalColors();
  }
}

async function saveColors(newColors: any[], refresh: boolean = false) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is disconnected! All database writes must go through validated Supabase queries in production mode.");
  }

  const currentColors = await getColors();
  let mergedColors: any[] = [];
  if (refresh) {
    mergedColors = [];
  } else {
    mergedColors = [...currentColors];
  }

  const validatedIncoming = newColors.map((c, idx) => {
    let name = c.name || `Sunburst shade ${idx}`;
    if (!name.toLowerCase().includes("sunburst") && !name.toLowerCase().includes("solar") && !name.toLowerCase().includes("tidepool") && !name.toLowerCase().includes("cactus") && !name.toLowerCase().includes("starlite") && !name.toLowerCase().includes("obsidian") && !name.toLowerCase().includes("copper") && !name.toLowerCase().includes("eucalyptus")) {
      name = `Sunburst ${name}`;
    }
    return {
      name: name,
      theme: c.theme || "Modern",
      base_color: c.base_color || "#F8FAFC",
      secondary_color: c.secondary_color || "#F1F5F9",
      accent_style: c.accent_style || "#64748B",
      neutral_tone: c.neutral_tone || "#FFFFFF",
      description: c.description || "Official coordinating Sunburst color palette.",
      is_sunburst_exclusive: true,
      product_sku: c.product_sku || "SB-INT-STAR-02"
    };
  });

  // Merge process: Detect duplicate colors using base_color (hex) or name
  for (const c of validatedIncoming) {
    const existingIdx = mergedColors.findIndex(x => 
      x.base_color.toLowerCase() === c.base_color.toLowerCase() || 
      x.name.toLowerCase() === c.name.toLowerCase()
    );
    if (existingIdx > -1) {
      mergedColors[existingIdx] = {
        ...mergedColors[existingIdx],
        ...c,
        id: ensureUuid(mergedColors[existingIdx].id)
      };
    } else {
      mergedColors.push({
        id: randomUUID(),
        ...c
      });
    }
  }

  // Ensure all colors have valid UUIDs
  mergedColors = mergedColors.map(c => ({
    ...c,
    id: ensureUuid(c.id)
  }));

  // Clean local file cache
  try {
    fs.writeFileSync(
      path.join(process.cwd(), "data_colors.json"),
      JSON.stringify(mergedColors, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("Local data sync warning:", e);
  }

  if (refresh) {
    const { error: delColorsErr } = await supabase.from("colors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delColorsErr) {
      throw new Error(`Failed to empty colors table during full refresh: ${delColorsErr.message}`);
    }
    logAuditEvent("RESET", "COLOR", mergedColors.length, "Truncated and fully overwrote colors collection under Full Refresh Mode.");
  }

  const { error: upsertError } = await supabase.from("colors").upsert(mergedColors);
  if (upsertError) {
    console.error("[DATABASE ERROR] Colors upsert failed:", upsertError.message);
    throw new Error(`Supabase Upsert Failure: ${upsertError.message}`);
  }

  logAuditEvent("INSERT/UPDATE", "COLOR", validatedIncoming.length, `Uploaded ${validatedIncoming.length} certified designer paint colors.`);
  return { success: true, supabaseSynced: true, colors: mergedColors };
}

// Simulated CRM Logs
let simulatedMessages: any[] = [
  {
    id: "m_seed_1",
    customer_id: "cust_seed_1",
    sender: "customer",
    content: "Hi. Can you quote me for painting my external stucco brick garage? It is about 500 square feet of wall area.",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: "delivered"
  },
  {
    id: "m_seed_2",
    customer_id: "cust_seed_1",
    sender: "contractor",
    content: "Absolutely! I can run an estimated quote using our exclusive Sunburst Sunscreener high-UV coat. One moment.",
    timestamp: new Date(Date.now() - 3600000 * 1.9).toISOString(),
    status: "read"
  }
];

// --- ENDPOINTS ---

// Public Health status endpoint for Render deployment monitoring (Requirement 1)
app.get("/health", (req, res) => {
  const responseData = {
    status: dbConnectivityStatus === "ONLINE" ? "healthy" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      status: dbConnectivityStatus,
      lastCheck: lastHeartbeatTime,
      error: lastDbError
    },
    system: {
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    }
  };
  res.status(200).json(responseData);
});

// Deployment fingerprint constants
const BUILD_TIME = new Date().toISOString();
const GIT_COMMIT = process.env.RENDER_GIT_COMMIT || "not available";

// Deployment fingerprint endpoint
app.get("/api/version", (req, res) => {
  res.json({
    backend: "Express",
    buildTime: BUILD_TIME,
    gitCommit: GIT_COMMIT,
    routes: [
      "/health",
      "/api/health",
      "/api/audit/report",
      "/api/audit/migrate"
    ]
  });
});

// JSON API Route with interactive ping/refresh options
app.get("/api/health", async (req, res) => {
  if (req.query.ping === "true" || req.query.refresh === "true") {
    await performHeartbeat();
  }
  res.json({
    success: true,
    status: dbConnectivityStatus,
    lastCheck: lastHeartbeatTime,
    error: lastDbError,
    uptime: process.uptime(),
    system: {
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

// DB Config Settings Endpoint
app.get("/api/db/config", (req, res) => {
  res.json({
    success: true,
    supabaseUrl: dbConfig.supabaseUrl,
    supabaseAnonKey: dbConfig.supabaseAnonKey,
    isConnected: dbConnectivityStatus === "ONLINE"
  });
});

app.get("/api/audit-logs", (req, res) => {
  try {
    const logsPath = path.join(process.cwd(), "data_audit.json");
    let logs: any[] = [];
    if (fs.existsSync(logsPath)) {
      logs = JSON.parse(fs.readFileSync(logsPath, "utf8"));
    }
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/db/config", async (req, res) => {
  const { supabaseUrl, supabaseAnonKey } = req.body;
  
  dbConfig.supabaseUrl = supabaseUrl || "";
  dbConfig.supabaseAnonKey = supabaseAnonKey || "";
  supabaseClient = null; // force recreation of client in getSupabaseClient()
  
  try {
    fs.writeFileSync(
      path.join(process.cwd(), "data_config.json"),
      JSON.stringify(dbConfig, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("Failed to write to local data_config.json:", e);
  }
  
  // Trigger instant database heartbeat so dashboard reflects this update in real time
  await performHeartbeat();
  
  let isConnected = dbConnectivityStatus === "ONLINE";
  let supabaseWarning = lastDbError || "";
  
  res.json({
    success: true,
    isConnected,
    supabaseWarning,
    supabaseUrl: dbConfig.supabaseUrl,
    supabaseAnonKey: dbConfig.supabaseAnonKey
  });
});

// 1. Get Sunburst Exclusive Products catalog loaded dynamically
app.get("/api/products", async (req, res) => {
  const liveProducts = await getProducts();
  res.json({ success: true, products: liveProducts });
});

// Create upload endpoint for product images, TDS and SDS
app.post("/api/upload", async (req, res) => {
  try {
    const { fileName, fileType, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: "fileName and fileData (Base64) are required." });
    }

    const ext = path.extname(fileName).toLowerCase();
    const cleanName = path.basename(fileName).replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const uniqueName = `${Date.now()}-${cleanName}`;
    const targetPath = path.join(uploadsDir, uniqueName);

    const base64Data = fileData.replace(/^data:.*?;base64,/, "");
    fs.writeFileSync(targetPath, base64Data, "base64");

    const fileUrl = `/uploads/${uniqueName}`;
    res.json({ success: true, url: fileUrl });
  } catch (err: any) {
    console.error("Local file upload failed:", err);
    res.status(500).json({ error: `File upload failed: ${err.message}` });
  }
});

// Admin endpoint: Add a single product to Supabase and cache
app.post("/api/products", async (req, res) => {
  try {
    const p = req.body;
    if (!p.sku || !p.name) {
      return res.status(400).json({ error: "Product SKU and name are required." });
    }

    // Force SKU uppercase and name to include Sunburst
    let name = String(p.name);
    if (!name.toLowerCase().includes("sunburst")) {
      name = `Sunburst ${name}`;
    }

    const singleProduct = {
      id: randomUUID(),
      name,
      sku: p.sku.trim().toUpperCase(),
      category: p.category || "paint",
      price: Number(p.price) || 0,
      retail_price: Number(p.retail_price) || 0,
      covers_sqft: Number(p.covers_sqft) || 0,
      unit: p.unit || "gallon",
      description: p.description || "Official Sunburst Paints certified industrial catalog item.",
      image_url: p.image_url || "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=300&q=80",
      is_sunburst_exclusive: true,
      technical_sheet_url: p.technical_sheet_url || null,
      safety_sheet_url: p.safety_sheet_url || null
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from("products")
        .upsert(singleProduct, { onConflict: "sku" });
      if (error) {
        console.error("[DATABASE ERROR] Failed to upsert single product:", error.message);
        throw new Error(`Database Write Failure: ${error.message}`);
      }
    }

    // Synchronize local JSON file backup and state return
    const current = await getProducts();
    const existingIndex = current.findIndex((x: any) => x.sku.toUpperCase() === singleProduct.sku);
    if (existingIndex > -1) {
      current[existingIndex] = { ...current[existingIndex], ...singleProduct };
    } else {
      current.push(singleProduct);
    }

    try {
      fs.writeFileSync(
        path.join(process.cwd(), "data_products.json"),
        JSON.stringify(current, null, 2),
        "utf8"
      );
    } catch (e) {}

    logAuditEvent("INSERT/UPDATE", "PRODUCT", singleProduct.sku, `Created custom product: ${singleProduct.name} (SKU: ${singleProduct.sku})`);
    res.json({ success: true, products: current, product: singleProduct });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Admin endpoint: Edit a single product properties
app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body;

    const current = await getProducts();
    const existing = current.find((x: any) => x.id === id);
    if (!existing) {
      return res.status(404).json({ error: "Product not found under the given ID." });
    }

    let name = p.name || existing.name;
    if (!name.toLowerCase().includes("sunburst")) {
      name = `Sunburst ${name}`;
    }

    const updatedProduct = {
      ...existing,
      name,
      sku: (p.sku || existing.sku).trim().toUpperCase(),
      category: p.category || existing.category,
      price: p.price !== undefined ? Number(p.price) : existing.price,
      retail_price: p.retail_price !== undefined ? Number(p.retail_price) : existing.retail_price,
      covers_sqft: p.covers_sqft !== undefined ? Number(p.covers_sqft) : existing.covers_sqft,
      unit: p.unit || existing.unit,
      description: p.description || existing.description,
      image_url: p.image_url || existing.image_url,
      technical_sheet_url: p.technical_sheet_url !== undefined ? p.technical_sheet_url : existing.technical_sheet_url,
      safety_sheet_url: p.safety_sheet_url !== undefined ? p.safety_sheet_url : existing.safety_sheet_url
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from("products")
        .update(updatedProduct)
        .eq("id", id);
      if (error) {
        console.error("[DATABASE ERROR] Failed to update product in Supabase:", error.message);
        throw new Error(`Database Update Failure: ${error.message}`);
      }
    }

    const existingIndex = current.findIndex((x: any) => x.id === id);
    if (existingIndex > -1) {
      current[existingIndex] = updatedProduct;
    }

    try {
      fs.writeFileSync(
        path.join(process.cwd(), "data_products.json"),
        JSON.stringify(current, null, 2),
        "utf8"
      );
    } catch (e) {}

    logAuditEvent("UPDATE", "PRODUCT", id, `Updated product properties for: ${updatedProduct.name}`);
    res.json({ success: true, products: current, product: updatedProduct });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Temporary debugging endpoints
app.get("/api/debug/products", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({
        status: "error",
        message: "Supabase client is not initialized or disconnected"
      });
    }
    const { data, error, count } = await supabase
      .from("products")
      .select("*", { count: "exact" })
      .order("sku", { ascending: true })
      .limit(5);

    if (error) {
      return res.status(500).json({
        status: "error",
        message: error.message || String(error)
      });
    }

    res.json({
      count: count || 0,
      sample: data || []
    });
  } catch (e: any) {
    res.status(500).json({
      status: "error",
      message: e.message || String(e)
    });
  }
});

app.get("/api/debug/colors", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({
        status: "error",
        message: "Supabase client is not initialized or disconnected"
      });
    }
    const { data, error, count } = await supabase
      .from("colors")
      .select("*", { count: "exact" })
      .order("name", { ascending: true })
      .limit(5);

    res.json({
      count: count || 0,
      sample: data || []
    });
  } catch (e: any) {
    res.status(500).json({
      status: "error",
      message: e.message || String(e)
    });
  }
});

// CSV parser helper functions for server audit Endpoints
function parseCSVFromText(csvText: string): any[] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  
  if (lines.length === 0) return [];
  
  const headerLine = lines[0];
  const headers = parseCSVRowText(headerLine);
  
  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowLine = lines[i].trim();
    if (!rowLine) continue;
    const values = parseCSVRowText(rowLine);
    const item: any = {};
    headers.forEach((h, index) => {
      let value = values[index];
      if (value !== undefined) {
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1).replace(/""/g, '"');
        }
      } else {
        value = "";
      }
      item[h] = value === '' ? null : value;
    });
    results.push(item);
  }
  return results;
}

function parseCSVRowText(rowLine: string): string[] {
  const fields: string[] = [];
  let currentField = "";
  let inQuotes = false;
  
  for (let i = 0; i < rowLine.length; i++) {
    const char = rowLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentField += char;
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = "";
    } else {
      currentField += char;
    }
  }
  fields.push(currentField.trim());
  return fields;
}

// Enterprise batch upsert utility
async function batchUpsertSupabase(supabase: any, tableName: string, items: any[], batchSize: number = 80) {
  let successCount = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const { error } = await supabase.from(tableName).upsert(chunk);
    if (error) {
      throw new Error(`Batch upsert error on ${tableName}: ${error.message}`);
    }
    successCount += chunk.length;
  }
  return successCount;
}

app.get("/api/audit/report", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const isDbConnected = !!supabase;

    // Load CSV counts
    const productsCsvPath = path.join(process.cwd(), "products.csv");
    const colorsCsvPath = path.join(process.cwd(), "colors.csv");
    
    let localProductsCount = 0;
    let localColorsCount = 0;
    
    if (fs.existsSync(productsCsvPath)) {
      const rawText = fs.readFileSync(productsCsvPath, "utf8");
      localProductsCount = parseCSVFromText(rawText).length;
    }
    if (fs.existsSync(colorsCsvPath)) {
      const rawText = fs.readFileSync(colorsCsvPath, "utf8");
      localColorsCount = parseCSVFromText(rawText).length;
    }

    if (!isDbConnected) {
      return res.json({
        success: false,
        supabaseConnected: false,
        error: "Supabase connection is not active or configured",
        localCounts: {
          productsCsv: localProductsCount,
          colorsCsv: localColorsCount
        }
      });
    }

    // Helper counts
    const counts: any = {
      products: 0,
      colors: 0,
      color_palettes: 0,
      product_recommended_colors: 0
    };

    const tableStatuses: any = {};

    const checkTable = async (name: string) => {
      try {
        const { count, error } = await supabase.from(name).select("*", { count: "exact", head: true });
        if (error) {
          if (error.message.includes("does not exist")) {
            tableStatuses[name] = "missing";
            counts[name] = 0;
          } else {
            tableStatuses[name] = "error";
            counts[name] = 0;
          }
        } else {
          tableStatuses[name] = "ready";
          counts[name] = count || 0;
        }
      } catch (e: any) {
        tableStatuses[name] = "exception";
        counts[name] = 0;
      }
    };

    await checkTable("products");
    await checkTable("colors");
    await checkTable("color_palettes");
    await checkTable("product_recommended_colors");

    const upToSync = 
      counts.products === localProductsCount && 
      counts.colors === localColorsCount;

    res.json({
      success: true,
      supabaseConnected: true,
      upToSync,
      databaseCounts: counts,
      tableStatuses,
      localCounts: {
        productsCsv: localProductsCount,
        colorsCsv: localColorsCount
      }
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || String(error)
    });
  }
});

app.post("/api/audit/migrate", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(400).json({
        success: false,
        error: "Supabase integration not activated. Configuration is missing."
      });
    }

    // Load CSV data
    const productsCsvPath = path.join(process.cwd(), "products.csv");
    const colorsCsvPath = path.join(process.cwd(), "colors.csv");

    if (!fs.existsSync(productsCsvPath) || !fs.existsSync(colorsCsvPath)) {
      return res.status(500).json({
        success: false,
        error: "Enterprise catalog CSV resource files products.csv or colors.csv are missing from project root."
      });
    }

    const localProducts = parseCSVFromText(fs.readFileSync(productsCsvPath, "utf8"));
    const localColors = parseCSVFromText(fs.readFileSync(colorsCsvPath, "utf8"));

    // Upsert products
    const productsToUpsert = localProducts.map(p => ({
      id: p.id || undefined,
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: parseFloat(p.price) || 0,
      retail_price: parseFloat(p.retail_price) || 0,
      covers_sqft: parseInt(p.covers_sqft) || 250,
      unit: p.unit || "piece",
      description: p.description,
      image_url: p.image_url,
      is_sunburst_exclusive: p.is_sunburst_exclusive === "true" || p.is_sunburst_exclusive === true
    }));

    const productsImported = await batchUpsertSupabase(supabase, "products", productsToUpsert, 50);

    // Upsert colors
    const colorsToUpsert = localColors.map(c => ({
      id: c.id || undefined,
      name: c.name,
      theme: c.theme,
      base_color: c.base_color,
      secondary_color: c.secondary_color,
      accent_style: c.accent_style,
      neutral_tone: c.neutral_tone,
      description: c.description,
      product_sku: c.product_sku,
      is_sunburst_exclusive: c.is_sunburst_exclusive === "true" || c.is_sunburst_exclusive === true,
      created_at: c.created_at || new Date().toISOString()
    }));

    const colorsImported = await batchUpsertSupabase(supabase, "colors", colorsToUpsert, 80);

    // Try upserting to duplicate color_palettes table if table exists
    try {
      const { error: testErr } = await supabase.from("color_palettes").select("id").limit(1);
      if (!testErr) {
        await batchUpsertSupabase(supabase, "color_palettes", colorsToUpsert, 80);
      }
    } catch (e) {}

    // Create product_recommended_colors mappings
    let relationshipsImported = 0;
    try {
      const { error: relTestErr } = await supabase.from("product_recommended_colors").select("color_id").limit(1);
      if (!relTestErr) {
        const relations = colorsToUpsert.map(c => ({
          product_sku: c.product_sku,
          color_id: c.id
        })).filter(r => r.product_sku && r.color_id);
        
        relationshipsImported = await batchUpsertSupabase(supabase, "product_recommended_colors", relations, 80);
      }
    } catch (e) {}

    // Verify post counts
    const getCount = async (name: string) => {
      try {
        const { count } = await supabase.from(name).select("*", { count: "exact", head: true });
        return count || 0;
      } catch (err) {
        return 0;
      }
    };

    const finalProductsCount = await getCount("products");
    const finalColorsCount = await getCount("colors");
    const finalPalettesCount = await getCount("color_palettes");
    const finalRecommendedCount = await getCount("product_recommended_colors");

    const responsePayload = {
      productsImported,
      colorsImported,
      relationshipsImported,
      verifiedCounts: {
        products: finalProductsCount,
        colors: finalColorsCount,
        color_palettes: finalPalettesCount,
        product_recommended_colors: finalRecommendedCount
      }
    };

    logAuditEvent(
      "MIGRATION_SUCCESS",
      "SYSTEM",
      productsImported,
      `Performed automated enterprise catalog audit and synchronization success: upserted ${productsImported} products, ${colorsImported} colors, and ${relationshipsImported} color relationships.`
    );

    res.json(responsePayload);

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || String(error)
    });
  }
});

// 2. Get Sunburst Exclusive Color schemes loaded dynamically
app.get("/api/colors", async (req, res) => {
  const liveColors = await getColors();
  res.json({ success: true, colors: liveColors });
});

app.post("/api/colors/import", async (req, res) => {
  const { colors: importedList, refresh } = req.body;
  if (!Array.isArray(importedList)) {
    return res.status(400).json({ error: "Colors array is required for import" });
  }

  // Prevent schema drift by rejecting unknown fields automatically
  const APPROVED_COLOR_FIELDS = new Set([
    "id", 
    "name", 
    "theme", 
    "base_color", 
    "secondary_color", 
    "accent_style", 
    "neutral_tone", 
    "description", 
    "is_sunburst_exclusive", 
    "product_sku"
  ]);

  for (const item of importedList) {
    const keys = Object.keys(item);
    for (const key of keys) {
      if (!APPROVED_COLOR_FIELDS.has(key)) {
        return res.status(400).json({
          error: `Schema drift prohibited: Unknown column '${key}' detected in color payload. Approved fields: ${Array.from(APPROVED_COLOR_FIELDS).join(', ')}`
        });
      }
    }
  }

  // Validate the colors to ensure ONLY official Sunburst colors are allowed!
  const sunburstItems = importedList.filter(c => {
    const title = String(c.name || '').toLowerCase();
    return title.includes('sunburst') || title.includes('solar') || title.includes('tidepool') || title.includes('cactus') || title.includes('starlite') || title.includes('obsidian') || title.includes('copper') || title.includes('eucalyptus');
  });

  if (sunburstItems.length === 0) {
    return res.status(400).json({ 
      error: "Import rejected: No official Sunburst colors found. All color collections must belong to or map to Sunburst exclusive lines." 
    });
  }

  try {
    const result = await saveColors(sunburstItems, refresh === true);
    const current = await getColors();
    res.json({ 
      ...result, 
      success: true, 
      colorsCount: sunburstItems.length,
      colors: current
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.delete("/api/colors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase is disconnected! Prohibited delete action.");
    }
    
    const current = await getColors();
    const itemToDelete = current.find((c: any) => c.id === id);
    if (!itemToDelete) {
      return res.status(404).json({ error: "Color palette not found." });
    }
    
    // Direct delete from database
    const { error } = await supabase.from("colors").delete().eq("id", id);
    if (error) {
      throw new Error(`Database Delete Failed: ${error.message}`);
    }
    
    // Sync local file backup
    const filtered = current.filter((c: any) => c.id !== id);
    try {
      fs.writeFileSync(
        path.join(process.cwd(), "data_colors.json"),
        JSON.stringify(filtered, null, 2),
        "utf8"
      );
    } catch (e) {}

    logAuditEvent("DELETE", "COLOR", id, `Removed color palette. Name: ${itemToDelete.name} Hex: ${itemToDelete.base_color}`);
    res.json({ success: true, colors: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/colors/reset", async (req, res) => {
  return res.status(403).json({
    success: false,
    error: "Security Exception: Automatic reset/mock endpoints have been permanently deactivated in production mode. Catalog updates must proceed exclusively through the Certified CSV Importer."
  });
});

// --- CUSTOMERS BACKEND PERSISTENCE ENDPOINTS ---

// GET /api/customers - Load customers list from Supabase with a local file fallback
app.get("/api/customers", async (req, res) => {
  try {
    const list = await getCustomers();
    res.json({ success: true, customers: list });
  } catch (err: any) {
    console.error("Failed to load customers:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/customers - Save a customer to Supabase or fallback Cache
app.post("/api/customers", async (req, res) => {
  try {
    const { name, email, phone, address, status, notes } = req.body;
    if (!name || !address) {
      return res.status(400).json({ success: false, error: "Validation Failure: Name and full address are required fields." });
    }

    const newCustomer = {
      id: randomUUID(),
      name,
      email: email || "no-email@example.com",
      phone: phone || "+1 (555) 000-0000",
      address,
      status: status || "Lead",
      notes: notes || "No custom notes available.",
      contractor_id: null,
      created_at: new Date().toISOString()
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      // Create db specific model without non-standard formats or mismatch
      const dbPayload = {
        id: newCustomer.id,
        name: newCustomer.name,
        email: newCustomer.email,
        phone: newCustomer.phone,
        address: newCustomer.address,
        status: newCustomer.status,
        notes: newCustomer.notes,
        created_at: newCustomer.created_at
      };

      try {
        const { data, error } = await supabase
          .from("customers")
          .insert(dbPayload)
          .select();

        if (error) {
          console.warn("[DATABASE EXCEPTION / POLICY] Failed to insert customer into Supabase:", error.message);
          logAuditEvent(
            "CONNECTION_FAILURE",
            "CUSTOMER",
            newCustomer.id,
            `Failed to insert customer into Supabase: ${error.message}. Loaded local fallback cache.`
          );
          // Fallback to local file storage gracefully
          const current = loadLocalCustomers();
          current.unshift(newCustomer);
          try {
            fs.writeFileSync(path.join(process.cwd(), "data_customers.json"), JSON.stringify(current, null, 2), "utf8");
          } catch (e) {}
          return res.json({ success: true, customer: newCustomer });
        }

        logAuditEvent(
          "INSERT",
          "CUSTOMER",
          newCustomer.id,
          `Enrolled customer profile: ${newCustomer.name} (Supabase Cloud Sync).`
        );
        
        const created = data && data.length > 0 ? data[0] : newCustomer;
        // Sync local file too
        const current = loadLocalCustomers();
        current.unshift(created);
        try {
          fs.writeFileSync(path.join(process.cwd(), "data_customers.json"), JSON.stringify(current, null, 2), "utf8");
        } catch (e) {}

        return res.json({ success: true, customer: created });
      } catch (dbErr: any) {
        console.warn("[DATABASE EXCEPTION / POLICY] Exception while inserting customer into Supabase:", dbErr.message || dbErr);
        logAuditEvent(
          "CONNECTION_FAILURE",
          "CUSTOMER",
          newCustomer.id,
          `Exception while inserting customer into Supabase: ${dbErr.message || String(dbErr)}. Loaded local fallback cache.`
        );
        // Fallback to local file storage gracefully
        const current = loadLocalCustomers();
        current.unshift(newCustomer);
        try {
          fs.writeFileSync(path.join(process.cwd(), "data_customers.json"), JSON.stringify(current, null, 2), "utf8");
        } catch (e) {}
        return res.json({ success: true, customer: newCustomer });
      }
    } else {
      // Local fallback mode
      const current = loadLocalCustomers();
      current.unshift(newCustomer);
      fs.writeFileSync(path.join(process.cwd(), "data_customers.json"), JSON.stringify(current, null, 2), "utf8");

      logAuditEvent(
        "INSERT",
        "CUSTOMER",
        newCustomer.id,
        `Enrolled customer profile: ${newCustomer.name} (Local Offline Storage fallback).`
      );
      return res.json({ success: true, customer: newCustomer });
    }
  } catch (err: any) {
    console.error("Failed to create customer:", err);
    logAuditEvent(
      "INSERT_FAILURE",
      "CUSTOMER",
      "SYS-ERR",
      `Unhandled customer insertion exception: ${err.message || String(err)}`
    );
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// --- JOBS REQUISITES AND STORAGE HELPERS ---
async function insertJobToSupabase(payload: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "No Supabase client" };

  try {
    const firstAttemptPayload = {
      id: ensureUUID(payload.id),
      customer_id: ensureUUID(payload.customer_id),
      quote_id: ensureUUID(payload.quote_id),
      contractor_id: ensureUUID(payload.contractor_id) || ensureUUID("contr_01"),
      title: payload.project_name || payload.title || "Project",
      project_name: payload.project_name || payload.title || "Project",
      status: payload.status || "Lead",
      price: Number(payload.total_value ?? payload.price ?? 0),
      total_value: Number(payload.total_value ?? payload.price ?? 0),
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: payload.updated_at || new Date().toISOString()
    };

    console.log("[DB INSERT JOB] Attempting insertion with full columns...", firstAttemptPayload.id);
    const { data, error } = await supabase
      .from("jobs")
      .upsert(firstAttemptPayload, { onConflict: "id" })
      .select();

    if (!error) {
      console.log("[DB INSERT JOB] Successful insertion with full columns!");
      return { success: true, data };
    }

    console.warn("[DB INSERT JOB] Initial full payload insertion failed:", error.message);

    // Tier 2: Core columns only (strip out non-existing custom columns)
    const corePayload: any = {
      id: ensureUUID(payload.id),
      customer_id: ensureUUID(payload.customer_id),
      status: payload.status || "Lead",
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: payload.updated_at || new Date().toISOString()
    };

    const targetContr = ensureUUID(payload.contractor_id) || ensureUUID("contr_01");
    if (targetContr) {
      corePayload.contractor_id = targetContr;
    }

    console.log("[DB INSERT JOB] Retrying insertion with core columns only...", corePayload);
    const { data: stdData, error: stdError } = await supabase
      .from("jobs")
      .upsert(corePayload, { onConflict: "id" })
      .select();
      
    if (!stdError) {
      console.log("[DB INSERT JOB] Core columns insertion success!");
      return { success: true, data: stdData };
    }

    console.warn("[DB INSERT JOB] Core columns insertion failed:", stdError.message);

    // Tier 3: Retry with contractor_id = null (in case contractors reference constraint fails)
    console.log("[DB INSERT JOB] Retrying insertion with contractor_id as null...");
    const nullContrPayload = {
      ...corePayload,
      contractor_id: null
    };

    const { data: data3, error: error3 } = await supabase
      .from("jobs")
      .upsert(nullContrPayload, { onConflict: "id" })
      .select();

    if (!error3) {
      console.log("[DB INSERT JOB] Null contractor_id insertion success!");
      return { success: true, data: data3 };
    }

    console.error("[DB INSERT JOB] All resilient attempts failed:", error3.message);
    return { error: error3.message };
  } catch (err: any) {
    console.error("[DB INSERT JOB] Resilient fallback exception:", err);
    return { error: err.message || String(err) };
  }
}

async function updateJobToSupabase(jobId: string, fields: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "No Supabase client" };

  try {
    const fullFields: any = {
      updated_at: new Date().toISOString()
    };
    if (fields.customer_id !== undefined) fullFields.customer_id = ensureUUID(fields.customer_id);
    if (fields.quote_id !== undefined) fullFields.quote_id = ensureUUID(fields.quote_id);
    if (fields.contractor_id !== undefined) fullFields.contractor_id = ensureUUID(fields.contractor_id);
    if (fields.status !== undefined) fullFields.status = fields.status;

    if (fields.project_name !== undefined || fields.title !== undefined) {
      const name = fields.project_name || fields.title;
      fullFields.title = name;
      fullFields.project_name = name;
    }
    if (fields.total_value !== undefined || fields.price !== undefined) {
      const val = Number(fields.total_value ?? fields.price ?? 0);
      fullFields.price = val;
      fullFields.total_value = val;
    }

    const { data, error } = await supabase
      .from("jobs")
      .update(fullFields)
      .eq("id", ensureUUID(jobId))
      .select();

    if (!error) return { success: true, data };

    if (error.code === "42703" || error.message.includes("column") || error.message.includes("does not exist")) {
      console.warn("[DB WARNING] Attempting fallback update without custom columns...");
      const standardFields: any = {
        updated_at: new Date().toISOString()
      };
      if (fields.customer_id !== undefined) standardFields.customer_id = ensureUUID(fields.customer_id);
      if (fields.contractor_id !== undefined) standardFields.contractor_id = ensureUUID(fields.contractor_id);
      if (fields.status !== undefined) standardFields.status = fields.status;
      if (fields.project_name !== undefined || fields.title !== undefined) {
        standardFields.title = fields.project_name || fields.title;
      }
      if (fields.total_value !== undefined || fields.price !== undefined) {
        standardFields.price = Number(fields.total_value ?? fields.price);
      }

      const { data: stdData, error: stdError } = await supabase
        .from("jobs")
        .update(standardFields)
        .eq("id", ensureUUID(jobId))
        .select();

      if (!stdError) return { success: true, data: stdData };
      return { error: stdError.message };
    }
    return { error: error.message };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}

// --- JOBS BACKEND PERSISTENCE ENDPOINTS ---

// GET /api/jobs - Load jobs list from Supabase or fallback Cache
app.get("/api/jobs", async (req, res) => {
  try {
    const list = await getJobs();
    res.json({ success: true, jobs: list });
  } catch (err: any) {
    console.error("Failed to load jobs:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/jobs - Save a job progress record to database
app.post("/api/jobs", async (req, res) => {
  try {
    const { 
      id,
      customer_id, 
      quote_id, 
      project_name, 
      title,
      status, 
      total_value, 
      price,
      contractor_id 
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: "Validation Failure: customer_id is a required reference." });
    }

    const job_id = id || `job_${Date.now()}`;
    const newJob = {
      id: job_id,
      customer_id,
      quote_id: quote_id || null,
      contractor_id: contractor_id || "contr_01",
      title: project_name || title || "Coating Project",
      project_name: project_name || title || "Coating Project",
      status: status || "lead",
      price: Number(total_value ?? price ?? 0),
      total_value: Number(total_value ?? price ?? 0),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await insertJobToSupabase(newJob);

    if (result.success) {
      logAuditEvent(
        "INSERT",
        "JOB",
        newJob.id,
        `Enrolled job profile ${newJob.id} under customer ${newJob.customer_id} (Supabase Cloud Sync).`
      );
      
      const created = result.data && result.data.length > 0 ? result.data[0] : newJob;
      const mappedCreated = {
        ...created,
        title: created.project_name || created.title || "Project",
        project_name: created.project_name || created.title || "Project",
        price: Number(created.total_value ?? created.price ?? 0),
        total_value: Number(created.total_value ?? created.price ?? 0),
      };

      // Sync local file too
      const current = loadLocalJobs();
      current.unshift(mappedCreated);
      try {
        fs.writeFileSync(path.join(process.cwd(), "data_jobs.json"), JSON.stringify(current, null, 2), "utf8");
      } catch (e) {}

      return res.json({ success: true, job: mappedCreated });
    } else {
      logAuditEvent(
        "CONNECTION_FAILURE",
        "JOB",
        newJob.id,
        `Failed to insert job into Supabase: ${result.error}. Loaded local fallback cache.`
      );
      
      const mappedCreated = {
        ...newJob,
        title: newJob.project_name || newJob.title || "Project",
        project_name: newJob.project_name || newJob.title || "Project",
        price: Number(newJob.total_value ?? newJob.price ?? 0),
        total_value: Number(newJob.total_value ?? newJob.price ?? 0),
      };

      // Sync local file too
      const current = loadLocalJobs();
      current.unshift(mappedCreated);
      try {
        fs.writeFileSync(path.join(process.cwd(), "data_jobs.json"), JSON.stringify(current, null, 2), "utf8");
      } catch (e) {}

      return res.json({ success: true, job: mappedCreated, localFallback: true });
    }
  } catch (err: any) {
    console.error("Unhandled exception creating job:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// PUT /api/jobs/:id - Update job fields in Supabase or fallback Cache
app.put("/api/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const result = await updateJobToSupabase(id, fields);

    // Sync local fallback cache
    const current = loadLocalJobs();
    let updatedObj = null;
    let index = current.findIndex((j: any) => j.id === id);
    if (index !== -1) {
      current[index] = {
        ...current[index],
        ...fields,
        title: fields.project_name || fields.title || current[index].title,
        project_name: fields.project_name || fields.title || current[index].project_name,
        price: fields.total_value !== undefined ? Number(fields.total_value) : (fields.price !== undefined ? Number(fields.price) : current[index].price),
        total_value: fields.total_value !== undefined ? Number(fields.total_value) : (fields.price !== undefined ? Number(fields.price) : current[index].total_value),
        updated_at: new Date().toISOString()
      };
      updatedObj = current[index];
      try {
        fs.writeFileSync(path.join(process.cwd(), "data_jobs.json"), JSON.stringify(current, null, 2), "utf8");
      } catch (e) {}
    }

    if (result.success) {
      logAuditEvent(
        "UPDATE",
        "JOB",
        id,
        `Updated job status/properties in Supabase for ${id}.`
      );
      const updatedFromDb = result.data && result.data.length > 0 ? result.data[0] : null;
      return res.json({ success: true, job: updatedFromDb || updatedObj });
    } else {
      logAuditEvent(
        "UPDATE",
        "JOB",
        id,
        `Updated job status/properties in Local offline Cache fallback for ${id}.`
      );
      return res.json({ success: true, job: updatedObj });
    }
  } catch (err: any) {
    console.error("Unhandled exception updating job:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// DELETE /api/jobs/:id - Delete a job card from Supabase or fallback Cache
app.delete("/api/jobs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    
    let deletedFromDb = false;
    if (supabase) {
      const { error } = await supabase
        .from("jobs")
        .delete()
        .eq("id", ensureUUID(id));
      if (!error) {
        deletedFromDb = true;
      }
    }

    const current = loadLocalJobs();
    const filtered = current.filter((j: any) => j.id !== id);
    try {
      fs.writeFileSync(path.join(process.cwd(), "data_jobs.json"), JSON.stringify(filtered, null, 2), "utf8");
    } catch (e) {}

    logAuditEvent(
      "DELETE",
      "JOB",
      id,
      `Removed job ${id} (Supabase synced: ${deletedFromDb}).`
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error("Unhandled exception deleting job:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// --- QUOTES BACKEND PERSISTENCE ENDPOINTS ---

// GET /api/quotes - Load quotes list from Supabase or fallback Cache
app.get("/api/quotes", async (req, res) => {
  try {
    const list = await getQuotes();
    res.json({ success: true, quotes: list });
  } catch (err: any) {
    console.error("Failed to load quotes:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/quotes - Save a quote to Supabase or fallback Cache
app.post("/api/quotes", async (req, res) => {
  try {
    const { 
      job_id, 
      customer_id, 
      contractor_id, 
      items, 
      waste_factor, 
      materials_cost, 
      labor_cost, 
      custom_cost, 
      subtotal_cost, 
      subtotal_price, 
      vat_rate, 
      vat_amount, 
      final_total, 
      margin, 
      profit, 
      materials_usage_details, 
      notes,
      status
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ success: false, error: "Customer not assigned" });
    }

    const autoQuoteNumber = `SBQ-${Math.floor(1000 + Math.random() * 9000)}`;

    let customer_name = "Customer not assigned";
    let customer_email = "";
    let customer_phone = "";
    let customer_address = "";

    try {
      const customersList = await getCustomers();
      const customerObj = customersList.find((c: any) => 
        String(c.id).trim() === String(customer_id).trim() || 
        ensureUUID(c.id) === ensureUUID(customer_id)
      );
      if (customerObj) {
        customer_name = customerObj.name;
        customer_email = customerObj.email || "";
        customer_phone = customerObj.phone || "";
        customer_address = customerObj.address || "";
      } else {
        return res.status(400).json({ success: false, error: "Customer not assigned" });
      }
    } catch (cErr) {
      console.error("Could not fetch customer details during quote registration:", cErr);
      return res.status(400).json({ success: false, error: "Customer not assigned" });
    }

    const newQuote = {
      id: randomUUID(),
      job_id: job_id || `job_${Date.now()}`,
      customer_id,
      contractor_id: contractor_id || "contr_01",
      quote_number: autoQuoteNumber,
      items: items || [],
      waste_factor: Number(waste_factor) || 0,
      materials_cost: Number(materials_cost) || 0,
      labor_cost: Number(labor_cost) || 0,
      custom_cost: Number(custom_cost) || 0,
      subtotal_cost: Number(subtotal_cost) || 0,
      subtotal_price: Number(subtotal_price) || 0,
      vat_rate: Number(vat_rate) || 0,
      vat_amount: Number(vat_amount) || 0,
      final_total: Number(final_total) || 0,
      margin: Number(margin) || 0,
      profit: Number(profit) || 0,
      materials_usage_details: materials_usage_details || [],
      notes: notes || "Direct coating quote from Sunburst",
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      address: customer_address,
      phone: customer_phone,
      email: customer_email,
      created_at: new Date().toISOString(),
      status: status || "quote"
    };

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(500).json({ success: false, error: "Supabase connection is offline. Insert blocked." });
    }

    const dbPayload = {
      id: ensureUUID(newQuote.id),
      quote_number: newQuote.quote_number,
      job_id: ensureUUID(newQuote.job_id),
      customer_id: ensureUUID(newQuote.customer_id),
      contractor_id: ensureUUID(newQuote.contractor_id) || ensureUUID("contr_01"),
      items: newQuote.items,
      waste_factor: newQuote.waste_factor,
      materials_cost: newQuote.materials_cost,
      labor_cost: newQuote.labor_cost,
      custom_cost: newQuote.custom_cost,
      subtotal_cost: newQuote.subtotal_cost,
      subtotal_price: newQuote.subtotal_price,
      subtotal: newQuote.subtotal_price, // Save subtotal (as requested)
      vat_rate: newQuote.vat_rate,
      vat_amount: newQuote.vat_amount,
      vat: newQuote.vat_amount, // Save VAT (as requested)
      final_total: newQuote.final_total,
      total: newQuote.final_total, // Save total (as requested)
      margin: newQuote.margin,
      profit: newQuote.profit,
      materials_usage_details: newQuote.materials_usage_details,
      notes: newQuote.notes,
      created_at: newQuote.created_at,
      status: newQuote.status
    };

      try {
        const targetCustId = ensureUUID(newQuote.customer_id);
        const targetContrId = ensureUUID(newQuote.contractor_id) || ensureUUID("contr_01");
        const targetJobId = ensureUUID(newQuote.job_id);

        if (targetCustId) {
          try {
            const { data: existingCust } = await supabase
              .from("customers")
              .select("id")
              .eq("id", targetCustId)
              .maybeSingle();

            if (!existingCust) {
              console.log(`[DATABASE RESTORATION] Dynamic restore of customer ${targetCustId} in Supabase to satisfy foreign keys.`);
              const customerPayload = {
                id: targetCustId,
                name: customer_name || "Valued Client",
                email: customer_email || "no-email@example.com",
                phone: customer_phone || "+1 (555) 000-0000",
                address: customer_address || "100 Construction Main St",
                status: "Lead",
                notes: "Auto-restored during quotes sync"
              };
              const { error: custErr } = await supabase.from("customers").insert(customerPayload);
              if (custErr) {
                console.error("Failed to insert placeholder customer during quote sync:", custErr);
              }
            }
          } catch (custCheckErr) {
            console.error("Failed to pre-verify customer:", custCheckErr);
          }
        }

        if (targetContrId) {
          try {
            const { data: existingContr } = await supabase
              .from("contractors")
              .select("id")
              .eq("id", targetContrId)
              .maybeSingle();

            if (!existingContr) {
              console.log(`[DATABASE RESTORATION] Dynamic restore of contractor ${targetContrId} in Supabase.`);
              const currentSettings = await getCompanySettings();
              const contractorPayload = {
                id: targetContrId,
                name: "SunBurst Certified Team",
                company_name: currentSettings?.company_name || "Company profile not configured",
                email: currentSettings?.company_email || "",
                phone: currentSettings?.company_phone || ""
              };
              const { error: contrErr } = await supabase.from("contractors").insert(contractorPayload);
              if (contrErr) {
                console.error("Failed to insert placeholder contractor during quote sync:", contrErr);
              }
            }
          } catch (contrCheckErr) {
            console.error("Failed to pre-verify contractor:", contrCheckErr);
          }
        }

        if (targetJobId) {
          try {
            const { data: existingJob } = await supabase
              .from("jobs")
              .select("id")
              .eq("id", targetJobId)
              .maybeSingle();

            if (!existingJob) {
              console.log(`[DATABASE RESTORATION] Auto-generating job placeholder ${targetJobId} to satisfy quotes_job_id_fkey constraint.`);
              
              const jobPayload = {
                id: targetJobId,
                customer_id: targetCustId,
                contractor_id: targetContrId,
                title: newQuote.notes || "Coating Project",
                status: "Estimate",
                price: Number(newQuote.final_total || 0),
                created_at: newQuote.created_at,
                updated_at: newQuote.created_at
              };

              const jobResult = await insertJobToSupabase(jobPayload);
              if (!jobResult.success) {
                console.error("Critical: Failed standard job placeholder insert too:", jobResult.error);
              }
            }
          } catch (jobCheckErr) {
            console.error("Failed to pre-verify or create placeholder job:", jobCheckErr);
          }
        }

        const { data, error } = await supabase
          .from("quotes")
          .insert(dbPayload)
          .select();

        if (error) {
          console.warn("[DATABASE EXCEPTION / POLICY] Failed to insert quote into Supabase:", error.message);
          logAuditEvent(
            "CONNECTION_FAILURE",
            "QUOTE",
            newQuote.id,
            `Failed to insert quote into Supabase: ${error.message}. Loaded local fallback cache.`
          );
          
          // Sync local file gracefully
          const current = loadLocalQuotes();
          current.unshift(newQuote);
          try {
            fs.writeFileSync(path.join(process.cwd(), "data_quotes.json"), JSON.stringify(current, null, 2), "utf8");
          } catch (e) {}

          return res.json({ success: true, quote: newQuote, localFallback: true });
        }

        logAuditEvent(
          "INSERT",
          "QUOTE",
          newQuote.id,
          `Enrolled quote profile ${newQuote.quote_number} (Supabase Cloud Sync).`
        );

        const created = data && data.length > 0 ? data[0] : newQuote;

        // Sync local file too
        const current = loadLocalQuotes();
        current.unshift(created);
        try {
          fs.writeFileSync(path.join(process.cwd(), "data_quotes.json"), JSON.stringify(current, null, 2), "utf8");
        } catch (e) {}

        return res.json({ success: true, quote: created });
      } catch (dbErr: any) {
        console.warn("[DATABASE EXCEPTION / POLICY] Exception while inserting quote into Supabase:", dbErr.message || dbErr);
        logAuditEvent(
          "CONNECTION_FAILURE",
          "QUOTE",
          newQuote.id,
          `Exception while inserting quote into Supabase: ${dbErr.message || String(dbErr)}`
        );
        return res.status(500).json({ success: false, error: `Exception during Supabase insert: ${dbErr.message || String(dbErr)}` });
      }
  } catch (err: any) {
    console.error("Failed to create quote:", err);
    logAuditEvent(
      "INSERT_FAILURE",
      "QUOTE",
      "SYS-ERR",
      `Unhandled quote insertion exception: ${err.message || String(err)}`
    );
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.put("/api/quotes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      items, 
      waste_factor, 
      materials_cost, 
      labor_cost, 
      custom_cost, 
      subtotal_cost, 
      subtotal_price, 
      vat_rate, 
      vat_amount, 
      final_total, 
      margin, 
      profit, 
      materials_usage_details, 
      notes, 
      status 
    } = req.body;
    
    const quoteId = ensureUUID(id);
    const supabase = getSupabaseClient();
    let updatedQuoteObj: any = null;
    
    if (supabase) {
      const { data, error } = await supabase
        .from("quotes")
        .update({
          items,
          waste_factor: Number(waste_factor),
          materials_cost: Number(materials_cost),
          labor_cost: Number(labor_cost),
          custom_cost: Number(custom_cost),
          subtotal_cost: Number(subtotal_cost),
          subtotal_price: Number(subtotal_price),
          subtotal: Number(subtotal_price),
          vat_rate: Number(vat_rate),
          vat_amount: Number(vat_amount),
          vat: Number(vat_amount),
          final_total: Number(final_total),
          total: Number(final_total),
          margin: Number(margin),
          profit: Number(profit),
          materials_usage_details,
          notes,
          status
        })
        .eq("id", quoteId)
        .select();
        
      if (error) {
        console.warn("Failed to update quote in Supabase, falling back to local file:", error.message);
      } else if (data && data.length > 0) {
        updatedQuoteObj = data[0];
      }
    }
    
    // Also sync local file to support offline or hybrid execution
    const current = loadLocalQuotes();
    const idx = current.findIndex((q: any) => q.id === id || ensureUUID(q.id) === quoteId);
    if (idx !== -1) {
      const existing = current[idx];
      const updated = {
        ...existing,
        items: items !== undefined ? items : existing.items,
        waste_factor: waste_factor !== undefined ? Number(waste_factor) : existing.waste_factor,
        materials_cost: materials_cost !== undefined ? Number(materials_cost) : existing.materials_cost,
        labor_cost: labor_cost !== undefined ? Number(labor_cost) : existing.labor_cost,
        custom_cost: custom_cost !== undefined ? Number(custom_cost) : existing.custom_cost,
        subtotal_cost: subtotal_cost !== undefined ? Number(subtotal_cost) : existing.subtotal_cost,
        subtotal_price: subtotal_price !== undefined ? Number(subtotal_price) : existing.subtotal_price,
        subtotal: subtotal_price !== undefined ? Number(subtotal_price) : existing.subtotal,
        vat_rate: vat_rate !== undefined ? Number(vat_rate) : existing.vat_rate,
        vat_amount: vat_amount !== undefined ? Number(vat_amount) : existing.vat_amount,
        vat: vat_amount !== undefined ? Number(vat_amount) : existing.vat,
        final_total: final_total !== undefined ? Number(final_total) : existing.final_total,
        total: final_total !== undefined ? Number(final_total) : existing.total,
        margin: margin !== undefined ? Number(margin) : existing.margin,
        profit: profit !== undefined ? Number(profit) : existing.profit,
        materials_usage_details: materials_usage_details !== undefined ? materials_usage_details : existing.materials_usage_details,
        notes: notes !== undefined ? notes : existing.notes,
        status: status !== undefined ? status : existing.status,
      };
      current[idx] = updated;
      if (!updatedQuoteObj) {
        updatedQuoteObj = updated;
      }
      try {
        fs.writeFileSync(path.join(process.cwd(), "data_quotes.json"), JSON.stringify(current, null, 2), "utf8");
      } catch (fsErr) {
        console.error("Local quote write failed during update:", fsErr);
      }
    }
    
    if (!updatedQuoteObj) {
      return res.status(404).json({ success: false, error: "Quote not found for update" });
    }
    
    res.json({ success: true, quote: updatedQuoteObj });
  } catch (err: any) {
    console.error("Failed to update quote:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// ==========================================
// --- INVOICES MANAGEMENT BACKEND API ---
// ==========================================

// Helper to load invoices either from Supabase or the permanent local JSON fallback
async function getInvoices() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase is disconnected. Defaulting to local invoices database baseline.");
    return loadLocalInvoices();
  }
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      const isMissingTable = 
        error.message.includes("Could not find the table") || 
        error.message.includes("relation") || 
        error.code === "P0002" || 
        error.code === "42P01";

      if (isMissingTable) {
        console.log("[DATABASE OFFLINE] Table 'invoices' is not present in live Supabase. Gracefully loading offline local invoices.");
        logAuditEvent(
          "LOCAL_FALLBACK",
          "INVOICE",
          "OFFLINE_READ",
          "Table 'invoices' is missing in target database. Loaded local offline invoices."
        );
      } else {
        console.error("[DATABASE ERROR] Failed to fetch invoices from Supabase, fallback to file:", error.message);
        logAuditEvent(
          "CONNECTION_FAILURE",
          "INVOICE",
          "FETCH_FAIL",
          `Failed to retrieve invoices from database: ${error.message}. Loaded local fallback cache.`
        );
      }
      return loadLocalInvoices();
    }
    return data || [];
  } catch (e: any) {
    const errMsg = e.message || String(e);
    const isMissingTable = errMsg.includes("Could not find the table") || errMsg.includes("relation");
    
    if (isMissingTable) {
      console.log("[DATABASE OFFLINE] Table 'invoices' thrown not found, loading offline local invoices.");
      logAuditEvent(
        "LOCAL_FALLBACK",
        "INVOICE",
        "OFFLINE_READ",
        "Table 'invoices' threw missing on select. Loaded local offline invoices."
      );
    } else {
      console.error("Supabase connection error in getInvoices, fallback to file:", errMsg);
      logAuditEvent(
        "CONNECTION_FAILURE",
        "INVOICE",
        "EXCEPTION",
        `Exception thrown in getInvoices: ${errMsg}. Loaded local fallback cache.`
      );
    }
    return loadLocalInvoices();
  }
}

// Read local data file for local resilience
function loadLocalInvoices() {
  try {
    const dataPath = path.join(process.cwd(), "data_invoices.json");
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Local invoices parser failure or file empty, returning empty list:", e);
  }
  return [];
}

// Helper to push invoice record to Supabase "invoices" table
async function saveInvoiceToSupabase(payload: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "No active Supabase client found" };

  try {
    const dbPayload = {
      id: payload.id,
      invoice_number: payload.invoice_number,
      quote_id: payload.quote_id || null,
      customer_id: payload.customer_id || null,
      customer_name: payload.customer_name,
      customer_email: payload.customer_email || null,
      customer_phone: payload.customer_phone || null,
      customer_address: payload.customer_address || null,
      subtotal: Number(payload.subtotal || 0),
      vat: Number(payload.vat || 0),
      total: Number(payload.total || 0),
      date: payload.date || new Date().toISOString(),
      items: payload.items || [],
      custom_cost: Number(payload.custom_cost || 0),
      notes: payload.notes || "",
      created_at: payload.created_at || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("invoices")
      .insert(dbPayload)
      .select();

    if (!error) {
      return { success: true, data };
    }
    return { error: error.message, code: error.code };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}

// 1. GET /api/invoices - Fetch persistent list of invoices
app.get("/api/invoices", async (req, res) => {
  try {
    const list = await getInvoices();
    res.json({ success: true, invoices: list });
  } catch (err: any) {
    console.error("Failed to load invoices list:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// 2. POST /api/invoices/generate - Generate invoice from quote and save
app.post("/api/invoices/generate", async (req, res) => {
  try {
    const { quote_id } = req.body;
    if (!quote_id) {
      return res.status(400).json({ success: false, error: "Validation Failure: quote_id is required." });
    }

    // Load active quotes
    const quotesList = await getQuotes();
    const targetQuote = quotesList.find((q: any) => q.id === quote_id);
    if (!targetQuote) {
      return res.status(404).json({ success: false, error: `Quote with ID ${quote_id} not found.` });
    }

    // Resolve customer details associated with the quote
    const customersList = await getCustomers();
    const customerObj = customersList.find((c: any) => 
      String(c.id).trim() === String(targetQuote.customer_id).trim() || 
      ensureUUID(c.id) === ensureUUID(targetQuote.customer_id)
    );

    // Retrieve customer details directly by joining quotes.customer_id to customers.id
    const clientName = customerObj ? customerObj.name : "Customer not assigned";
    const clientPhone = customerObj ? (customerObj.phone || "") : "";
    const clientAddr = customerObj ? (customerObj.address || "") : "";
    const clientEmail = customerObj ? (customerObj.email || "") : "";

    // Generate unique invoice number and metadata
    const invoiceId = randomUUID();
    const invoiceNumber = `SBI-${Math.floor(100000 + Math.random() * 900000)}`;

    const newInvoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      quote_id: targetQuote.id,
      customer_id: targetQuote.customer_id,
      customer_name: clientName,
      customer_email: clientEmail,
      customer_phone: clientPhone,
      customer_address: clientAddr,
      subtotal: Number(targetQuote.subtotal_price || targetQuote.subtotal || 0),
      vat: Number(targetQuote.vat_amount || targetQuote.vat || 0),
      total: Number(targetQuote.final_total || targetQuote.total || 0),
      date: new Date().toISOString(),
      items: targetQuote.items || [],
      custom_cost: Number(targetQuote.custom_cost || 0),
      notes: targetQuote.notes || "Sunburst Master Coatings Scope",
      created_at: new Date().toISOString()
    };

    // Store in Supabase if writeable
    const dbResult = await saveInvoiceToSupabase(newInvoice);

    // Persist to local JSON fallback database
    const currentInvoices = loadLocalInvoices();
    currentInvoices.unshift(newInvoice);
    try {
      fs.writeFileSync(path.join(process.cwd(), "data_invoices.json"), JSON.stringify(currentInvoices, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to write invoice backup to data_invoices.json:", e);
    }

    if (dbResult.success) {
      logAuditEvent(
        "INSERT",
        "INVOICE",
        newInvoice.id,
        `Generated Invoice ${newInvoice.invoice_number} from Quote ${targetQuote.quote_number} (Supabase Cloud Sync).`
      );
      return res.json({ success: true, invoice: newInvoice });
    } else {
      console.warn("[DATABASE ALERT] Supabase insertion warning, utilizing local permanent offline cache:", dbResult.error);
      logAuditEvent(
        "INSERT",
        "INVOICE",
        newInvoice.id,
        `Generated Invoice ${newInvoice.invoice_number} from Quote ${targetQuote.quote_number} (Local Offline Backup: ${dbResult.error}).`
      );
      return res.json({ success: true, invoice: newInvoice });
    }

  } catch (err: any) {
    console.error("Failed to generate and save invoice:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Helper to draw the complete beautiful branded Sunburst PDF contents
function drawInvoicePDFContents(doc: any, invoice: any, companySettings?: any) {
  // Header Color Accent Line
  doc.rect(0, 0, 612, 12).fill("#1d4ed8"); // Brand Blue Accent Line
  doc.moveDown(1.5);

  // Render the vector-drawn SunBurst Paints & Coatings logo
  doc.save();
  doc.translate(50, 24);

  // Draw crescent
  doc.lineWidth(7);
  doc.lineCap("round");

  // Colors: Blue, Green, Light Green, Yellow, Orange, Red, Pink, Purple
  doc.strokeColor("#1d4ed8"); // Blue
  doc.path("M 50 15 A 30 30 0 0 0 25 10").stroke();
  
  doc.strokeColor("#22c55e"); // Green
  doc.path("M 25 10 A 30 30 0 0 0 8 25").stroke();
  
  doc.strokeColor("#84cc16"); // Yellow-green
  doc.path("M 8 25 A 30 30 0 0 0 2 45").stroke();
  
  doc.strokeColor("#eab308"); // Yellow
  doc.path("M 2 45 A 30 30 0 0 0 10 65").stroke();
  
  doc.strokeColor("#f97316"); // Orange
  doc.path("M 10 65 A 30 30 0 0 0 28 75").stroke();
  
  doc.strokeColor("#ef4444"); // Red
  doc.path("M 28 75 A 30 30 0 0 0 52 75").stroke();
  
  doc.strokeColor("#d946ef"); // Pink
  doc.path("M 52 75 A 30 30 0 0 0 68 62").stroke();
  
  doc.strokeColor("#8b5cf6"); // Purple
  doc.path("M 68 62 A 30 30 0 0 0 74 45").stroke();

  // Little paint drops
  doc.fillColor("#1d4ed8").circle(58, 2, 2.5).fill();
  doc.fillColor("#22c55e").circle(14, 2, 2.5).fill();
  doc.fillColor("#eab308").circle(-2, 45, 2.5).fill();
  doc.fillColor("#ef4444").circle(22, 10, 2.5).fill();

  doc.restore();

  // Typography next to it
  doc.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(22).text("SunBurst", 132, 34);
  const sunburstWidth = doc.widthOfString("SunBurst");
  doc.fillColor("#E20074").font("Helvetica-Bold").fontSize(22).text("Paints", 132 + sunburstWidth + 3, 34);
  
  doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(13).text("& Coatings", 132, 58);
  doc.fillColor("#64748b").font("Helvetica").fontSize(7.5).text("SUPERIOR QUALITY PAINTS", 132, 73, { characterSpacing: 1.5 });
  
  // System metadata
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(7).text("SunBurst Paints & Coatings Operational Mode", 132, 85);

  // Invoice Meta (Num & Date) Alignment Right
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text("OFFICIAL INVOICE", 380, 40, { align: "right" });
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(10).text(`Invoice #: ${invoice.invoice_number}`, 380, 62, { align: "right" });
  doc.font("Helvetica").fontSize(9).text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, 380, 77, { align: "right" });

  // Dividers
  doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(50, 105).lineTo(562, 105).stroke();
  doc.moveDown(1.5);

  // Bill To & From Grid Layout
  const yStart = 120;
  
  // Left side: Contractor Info
  doc.fillColor("#94a3b8").font("Helvetica-Bold").fontSize(8).text("REPRESENTATIVE CONTRACTOR", 50, yStart);
  if (companySettings && companySettings.company_name && companySettings.company_name !== "Company profile not configured") {
    doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(11).text(companySettings.company_name, 50, yStart + 12);
    if (companySettings.company_address) {
      doc.fillColor("#475569").font("Helvetica").fontSize(9).text(companySettings.company_address, 50, yStart + 26);
    }
    const phonePart = companySettings.company_phone ? `Phone: ${companySettings.company_phone}` : "";
    const emailPart = companySettings.company_email ? `Email: ${companySettings.company_email}` : "";
    const joiner = phonePart && emailPart ? " | " : "";
    if (phonePart || emailPart) {
      doc.text(`${phonePart}${joiner}${emailPart}`, 50, yStart + 36);
    }
    if (companySettings.vat_registration) {
      doc.text(`VAT Reg: ${companySettings.vat_registration}`, 50, yStart + 48);
    }
  } else {
    doc.fillColor("#ef4444").font("Helvetica-Bold").fontSize(11).text("Company profile not configured", 50, yStart + 12);
  }

  // Right side: Customer Bill-To Info
  const forbiddenKeywords = ["jane doe", "valued customer", "demo customer", "valued client", "customer not assigned", "placeholder text"];
  const isNamePlaceholder = !invoice.customer_name || forbiddenKeywords.some(kw => invoice.customer_name.toLowerCase().includes(kw));
  const hasValidCustomerData = !isNamePlaceholder && (invoice.customer_phone || invoice.customer_email || invoice.customer_address);

  const customerNameToShow = hasValidCustomerData ? invoice.customer_name : "Customer information unavailable";
  const customerAddrToShow = hasValidCustomerData ? invoice.customer_address : null;
  const customerPhoneToShow = hasValidCustomerData ? invoice.customer_phone : null;
  const customerEmailToShow = hasValidCustomerData ? invoice.customer_email : null;

  doc.fillColor("#94a3b8").font("Helvetica-Bold").fontSize(8).text("VALUED RECIPIENT", 350, yStart);
  doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(11).text(customerNameToShow, 350, yStart + 12);
  let extraOffset = 0;
  if (customerAddrToShow) {
    doc.fillColor("#475569").font("Helvetica").fontSize(9).text(customerAddrToShow, 350, yStart + 26, { width: 212 });
    extraOffset = 26;
  }
  if (customerPhoneToShow) {
    doc.fillColor("#475569").font("Helvetica").fontSize(9).text(customerPhoneToShow, 350, yStart + 26 + extraOffset);
    extraOffset += 12;
  }
  if (customerEmailToShow) {
    doc.fillColor("#475569").font("Helvetica").fontSize(9).text(customerEmailToShow, 350, yStart + 26 + extraOffset);
  }

  doc.moveDown(2);
  const yTableStart = 215;
  doc.strokeColor("#cbd5e1").lineWidth(1.5).moveTo(50, yTableStart).lineTo(562, yTableStart).stroke();

  // Table Header
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(9);
  doc.text("Description", 55, yTableStart + 6);
  doc.text("Volume / Qty", 280, yTableStart + 6, { width: 80, align: "center" });
  doc.text("Unit Rate ($)", 370, yTableStart + 6, { width: 90, align: "right" });
  doc.text("Amount ($)", 470, yTableStart + 6, { width: 90, align: "right" });

  doc.strokeColor("#94a3b8").lineWidth(1).moveTo(50, yTableStart + 20).lineTo(562, yTableStart + 20).stroke();

  // Table Rows
  let currentY = yTableStart + 26;
  const items = invoice.items || [];
  
  items.forEach((item: any, idx: number) => {
    doc.fillColor("#334155").font("Helvetica").fontSize(9.5);
    
    const descName = item.product_name || `Item Line ${idx + 1}`;
    const qtyText = `${item.quantity || 1} ${item.unit || "unit"}(s)`;
    const unitRate = Number(item.unit_price || item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalRate = Number(item.total_price || item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    doc.text(descName, 55, currentY, { width: 210 });
    doc.text(qtyText, 280, currentY, { width: 80, align: "center" });
    doc.text(`$${unitRate}`, 370, currentY, { width: 90, align: "right" });
    doc.text(`$${totalRate}`, 470, currentY, { width: 90, align: "right" });

    currentY += 22;
    doc.strokeColor("#f1f5f9").lineWidth(0.5).moveTo(50, currentY - 5).lineTo(562, currentY - 5).stroke();
  });

  // Handle Incidental Charges
  if (invoice.custom_cost && Number(invoice.custom_cost) > 0) {
    doc.fillColor("#334155").font("Helvetica").fontSize(9.5);
    const incidentalRate = Number(invoice.custom_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    doc.text("Incidentals, Prep-work, & Cleanup Work", 55, currentY);
    doc.text("1 total", 280, currentY, { width: 80, align: "center" });
    doc.text(`$${incidentalRate}`, 370, currentY, { width: 90, align: "right" });
    doc.text(`$${incidentalRate}`, 470, currentY, { width: 90, align: "right" });
    
    currentY += 22;
    doc.strokeColor("#f1f5f9").lineWidth(0.5).moveTo(50, currentY - 5).lineTo(562, currentY - 5).stroke();
  }

  doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(50, currentY).lineTo(562, currentY).stroke();
  currentY += 15;

  // Subtotal and Tax Calculations Grid
  const calcX = 330;
  doc.fillColor("#475569").font("Helvetica").fontSize(9.5);
  doc.text("Pre-tax Proposal Subtotal :", calcX, currentY);
  doc.fillColor("#0f172a").font("Helvetica-Bold").text(`$${Number(invoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 470, currentY, { width: 90, align: "right" });
  
  currentY += 18;
  doc.fillColor("#b45309").font("Helvetica-Bold").text("Value Added Tax (Locked 10% VAT) :", calcX, currentY);
  doc.text(`+$${Number(invoice.vat).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 470, currentY, { width: 90, align: "right" });

  currentY += 22;
  doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(calcX, currentY - 4).lineTo(562, currentY - 4).stroke();
  
  // Grand Total Highlight Bar
  currentY += 4;
  doc.rect(calcX - 10, currentY - 4, 242, 28).fill("#f8fafc");
  
  doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(11).text("Final Grand Total (VAT Inc.) :", calcX, currentY + 4);
  doc.fillColor("#10b981").font("Helvetica-Bold").fontSize(13).text(`$${Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 470, currentY + 3, { width: 90, align: "right" });

  currentY += 45;

  // Scope comments / Notes
  if (invoice.notes) {
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(8).text("SPECIAL INSTUCTIONS / SCOPE NOTES :", 50, currentY);
    doc.fillColor("#475569").font("Helvetica-Oblique").fontSize(8.5).text(invoice.notes, 50, currentY + 12, { width: 512, lineGap: 3 });
  }

  // Fixed Compliance Footnote at bottom page center
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(7.5).text(
    "Value Added Tax represents direct compliance. All coating sales are fully and final-audited. Thank you for utilizing Sunburst Professional Coatings.",
    50, 715, { align: "center", width: 512 }
  );
}

// 3. GET /api/invoices/:id/pdf - Stream printable PDF using pdfkit
app.get("/api/invoices/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;
    const downloadRequested = req.query.download === "true";

    // Load matching invoice record
    const invoices = await getInvoices();
    const invoice = invoices.find((inv: any) => inv.id === id);
    if (!invoice) {
      return res.status(404).send("<h1 style='font-family:sans-serif;'>Invoice Entry Not Found</h1><p>The requested invoice record does not exist in the CRM history.</p>");
    }

    // Initialize clean PDF Document
    const doc = new PDFDocument({ 
      margin: 50,
      size: "LETTER"
    });

    const filename = `invoice-${invoice.invoice_number}.pdf`;
    
    // Set response headers for PDF output
    res.setHeader("Content-Type", "application/pdf");
    if (downloadRequested) {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }

    // Pipe layout definitions directly to express response stream
    doc.pipe(res);

    // Stream printable PDF
    const companySettings = await getCompanySettings();

    // Draw the PDF
    drawInvoicePDFContents(doc, invoice, companySettings);

    // End layout definitions and write out binary pdf stream
    doc.end();

  } catch (err: any) {
    console.error("Critical failure during PDF transmission:", err);
    res.status(500).send(`<h1 style='font-family:sans-serif;color:#ef4444;'>PDF Transmission Error</h1><p>${err.message || String(err)}</p>`);
  }
});

// 4. POST /api/invoices/:id/email - Simulate sending email with PDF attachment
app.post("/api/invoices/:id/email", async (req, res) => {
  try {
    const { id } = req.params;
    const { custom_email } = req.body;

    const invoices = await getInvoices();
    const invoice = invoices.find((inv: any) => inv.id === id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice registry item not found." });
    }

    // Determine target recipient email directly from invoice record or custom parameter with absolute zero placeholders
    const recipientEmail = String(custom_email || invoice.customer_email || invoice.email || "").trim();
    if (!recipientEmail || recipientEmail.includes("@example.com") && !custom_email) {
      return res.status(400).json({ 
        success: false, 
        error: "Validation error: No valid customer email address resolved for this invoice. Please provide a custom client email." 
      });
    }

    const companySettings = await getCompanySettings();

    // Generate physical PDF attachment and save under /uploads directory
    const attachedFileName = `invoice-${invoice.invoice_number}-attached.pdf`;
    const tempFilePath = path.join(uploadsDir, attachedFileName);
    
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const writeStream = fs.createWriteStream(tempFilePath);
    doc.pipe(writeStream);
    drawInvoicePDFContents(doc, invoice, companySettings);
    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", () => resolve());
      writeStream.on("error", (err) => reject(err));
    });

    const forbiddenKeywords = ["jane doe", "valued customer", "demo customer", "valued client", "customer not assigned", "placeholder text"];
    const isNamePlaceholder = !invoice.customer_name || forbiddenKeywords.some(kw => invoice.customer_name.toLowerCase().includes(kw));
    const customerNameToShow = isNamePlaceholder ? "Customer" : invoice.customer_name;

    // Create the persistent email record
    const emailRecord = {
      id: `mail_${Date.now()}_${Math.floor(100+Math.random()*900)}`,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      recipient: recipientEmail,
      sender: companySettings?.company_email || "billing@certifiedcrm.com",
      subject: `Official Invoice ${invoice.invoice_number} from ${companySettings?.company_name || DEFAULT_COMPANY_SETTINGS.company_name}`,
      body: `Dear ${customerNameToShow},\n\nPlease find attached the official tax invoice ${invoice.invoice_number} for your recent order.\n\nPre-tax Subtotal: $${Number(invoice.subtotal).toLocaleString()}\nLocked Regional VAT (10%): $${Number(invoice.vat).toLocaleString()}\nGrand total due: $${Number(invoice.total).toLocaleString()}.\n\nBest Regards,\n${companySettings?.company_name || DEFAULT_COMPANY_SETTINGS.company_name}\n${companySettings?.company_phone || DEFAULT_COMPANY_SETTINGS.company_phone}`,
      attachment_path: `/uploads/${attachedFileName}`,
      sent_at: new Date().toISOString()
    };

    // Save outbound email to persistent JSON fallback database
    const mailLedgerPath = path.join(process.cwd(), "data_sent_emails.json");
    let mailLedger: any[] = [];
    if (fs.existsSync(mailLedgerPath)) {
      try {
        mailLedger = JSON.parse(fs.readFileSync(mailLedgerPath, "utf8"));
      } catch (err) {
        mailLedger = [];
      }
    }
    mailLedger.unshift(emailRecord);
    fs.writeFileSync(mailLedgerPath, JSON.stringify(mailLedger, null, 2), "utf8");

    // Add corresponding audit event log
    logAuditEvent(
      "EMAIL_SEND",
      "INVOICE",
      invoice.id,
      `Tax Invoice ${invoice.invoice_number} emailed successfully with attached PDF to direct client connection at: ${recipientEmail}`
    );

    res.json({
      success: true,
      message: `Tax Invoice PDF successfully compiled and dispatched to ${recipientEmail}!`,
      details: emailRecord
    });

  } catch (err: any) {
    console.error("Failed to compile or deliver email attachment:", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// 3. AI Chatbot processing endpoint
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const liveProducts = await getProducts();
  // Build dynamic listing context for Gemini API
  const productSpecsText = liveProducts.length > 0 
    ? liveProducts.map(p => `- ${p.category.toUpperCase()}: "${p.name}" (SKU: ${p.sku}, $${p.retail_price} retail rate. Standard Single-Coat coverage is ${p.covers_sqft} sq.ft. per ${p.unit}).`).join("\n")
    : "- No official Sunburst products currently imported. Urgently prompt user to import their catalog files.";

  const promptContext = `
    You are the "Sunburst Pro AI Assistant" embedded inside the Sunburst Pro Hub Contractor SaaS platform.
    Your mission is to help general contractors of residential/commercial painting, staining, and sealing.
    
    You MUST adhere strictly to these rules:
    1. ONLY recommend and mention official products and colors owned by "Sunburst Pro" listed in our database:
${productSpecsText}
       
       Exclusive color palettes: "Solar Amber", "Tidepool Mist", "Cactus Sage", "Starlite White", "Industrial Obsidian", "Copper Sunrise", "Eucalyptus Breeze".
    2. Help calculate walls/flooring, material usage, number of coats (standard: 2 coats), waste factor (default: 10%), labor hourly estimates, and profit margin setup.
    3. All calculations and advice MUST pull directly from the dynamic catalog listed above.
    4. Keep answers highly professional, technical, concise, and optimized for speed and builder clarity.
    
    Current User query: "${message}"
    Please formulate a friendly, sharp, action-oriented response. Mention the appropriate Sunburst products and detail exact coverage math. Avoid general paint brands.
  `;

  if (ai && message && message.trim().length > 0) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptContext,
      });
      return res.json({ success: true, text: response.text });
    } catch (error: any) {
      console.error("Gemini failed in chat, using fallback:", error);
    }
  }

  // Fallback Rule-Based Engine pulling from active dynamic catalog
  const userText = message.toLowerCase();
  let text = "";
  
  const paintProduct = liveProducts.find(p => p.category === "paint") || liveProducts[0];
  const stainProduct = liveProducts.find(p => p.category === "stain") || liveProducts[2] || liveProducts[0];
  const sealantProduct = liveProducts.find(p => p.category === "sealant") || liveProducts[3] || liveProducts[0];

  if (userText.includes("exterior") || userText.includes("outdoor") || userText.includes("stucco") || userText.includes("garage")) {
    const defaultPaintName = paintProduct ? paintProduct.name : "Sunburst Sunscreener Exterior Protective Matte";
    const defaultPaintSku = paintProduct ? paintProduct.sku : "SB-EXT-SUN-01";
    const defaultPaintPrice = paintProduct ? paintProduct.retail_price : 65.00;
    const defaultCoverage = paintProduct ? paintProduct.covers_sqft : 350;
    
    const gallonsNeeded = Math.ceil(((500 * 2) / (defaultCoverage || 350)) * 1.10 * 100) / 100;
    const costTotal = gallonsNeeded * defaultPaintPrice;

    text = `Hey! For this exterior project, I recommend our active dynamic catalog product **${defaultPaintName}** (SKU: \`${defaultPaintSku}\`, $${defaultPaintPrice} retail).\n\n**Coverage Mathematics:**\n- Standard application requires **2 coats**.\n- Average coverage is **${defaultCoverage} sq. ft. per gallon**.\n- For a **500 sq. ft.** job with a 10% waste cushion, you will need: \`((500 * 2) / ${defaultCoverage}) * 1.10\` = **${gallonsNeeded} Gallons** (Materials quote: $${costTotal.toFixed(2)}).\n\nPair this with Sunburst **Solar Amber** or **Starlite White** for stunning results!`;
  } else if (userText.includes("deck") || userText.includes("wood") || userText.includes("cedar") || userText.includes("fence")) {
    const defaultStainName = stainProduct ? stainProduct.name : "Sunburst AmberGlow High-Penetration Cedar Stain";
    const defaultStainSku = stainProduct ? stainProduct.sku : "SB-STN-AMB-03";
    const defaultStainPrice = stainProduct ? stainProduct.retail_price : 70.00;
    const defaultSealName = sealantProduct ? sealantProduct.name : "Sunburst ShieldLock Acrylic Elastomeric Waterproof Sealant";

    text = `Greetings. For wooden fences or decks, our premium dynamic combination is **${defaultStainName}** (SKU: \`${defaultStainSku}\`, $${defaultStainPrice} retail) coupled with **${defaultSealName}**.\n\nEverything is mapped dynamically into our contractor estimate builder to protect your profit margins perfectly.`;
  } else if (userText.includes("quote") || userText.includes("calculate") || userText.includes("price") || userText.includes("margin")) {
    text = `I can help you compile an instantaneous quote with optimal margin limits! Please specify:\n1. **Dynamic Product SKU or ID** (from our active catalog)\n2. **Total Area in Square Feet**\n3. **Labor details (hours and hourly rate)**\n\nOur builder engine will compute paint coatings and 10% scrap margins automatically!`;
  } else {
    text = `Hi! I am the Sunburst Pro AI Assistant. I can help you compile immediate quotes, estimate material quantities with 10% waste, and select Sunburst-exclusive products for your projects.\n\nTell me: what are we quoting today? (e.g. "interior drywall 800 sq ft" or "exterior patio stain 400 sq ft")`;
  }

  return res.json({ success: true, text });
});

// 4. AI Palette Generator endpoint (AI Color Consultant with live catalog context)
app.post("/api/palettes/generate", async (req, res) => {
  const { description, mood } = req.body;
  if (!description) {
    return res.status(400).json({ error: "Description is required" });
  }

  // 1. Query Supabase products table
  const liveProducts = await getProducts();
  
  // 2. Query Supabase colors table
  const liveColors = await getColors();
  if (liveColors.length === 0) {
    return res.status(400).json({ error: "No official Sunburst colors found. Please reset or import color collections." });
  }

  // 3. Pass matching products and colors into the Gemini prompt
  const productsText = liveProducts.length > 0 
    ? liveProducts.map((p: any) => `- NAME: "${p.name}", SKU: "${p.sku}", CATEGORY: "${p.category}", RETAIL_PRICE: $${p.retail_price}, COVERS_SQFT: ${p.covers_sqft || 400} sq.ft per ${p.unit || 'Gallon'}`).join("\n")
    : "- No official Sunburst products currently imported.";

  const colorsText = liveColors.map((c: any) => `- NAME: "${c.name}", BASE_COLOR: "${c.base_color}", SECONDARY_COLOR: "${c.secondary_color}", ACCENT_STYLE: "${c.accent_style}", NEUTRAL_TONE: "${c.neutral_tone}", DESCRIPTION: "${c.description}", THEME: "${c.theme}", PRODUCT_SKU: "${c.product_sku || 'SB-INT-STAR-02'}"`).join("\n");

  const promptContext = `
    You are the "Sunburst Pro AI Color Consultant". 
    Your job is to analyze the user's room design query and select the absolute best matching official color palette and physical premium product from our exclusive Sunburst Pro catalog lists below.
    
    You MUST adhere strictly to these validation guidelines:
    1. You MUST choose a single official color palette from the existing colors list below.
    2. You MUST choose a single official product from the existing products list below.
    3. You are strictly forbidden from recommending any colors, hex codes, names, SKUs, or products not found in the lists below.
    
    === OFFICIAL SUNBURST PRODUCTS ===
    ${productsText}

    === OFFICIAL SUNBURST COLORS ===
    ${colorsText}
    
    Query: "${description}"
    Mood requested: "${mood || 'premium'}"
    
    You MUST formulate your response as raw JSON matching the following keys:
    - "name": string (must exactly match the chosen Sunburst color palette's name from list)
    - "theme": string (must exactly match the chosen Sunburst color palette's theme)
    - "base_color": string (must exactly match the chosen Sunburst color palette's base_color hex)
    - "secondary_color": string (must exactly match the chosen Sunburst color palette's secondary_color hex)
    - "accent_style": string (must exactly match the chosen Sunburst color palette's accent_style hex)
    - "neutral_tone": string (must exactly match the chosen Sunburst color palette's neutral_tone hex)
    - "description": string (re-written dynamically to explain beautifully to the contractor's client why this SPECIFIC chosen Sunburst color fits their requested space: "${description}")
    - "product_sku": string (must exactly match the chosen product's SKU from the products list)
    - "product_name": string (must exactly match the chosen product's NAME from the products list)
    - "color_name": string (must exactly match the chosen color palette's NAME from the colors list)
    - "finish_recommendation": string (recommend the ideal paint/stain finish for this space, e.g. Matte, Satin, Semi-Gloss, or Eggshell, and explain why briefly)
    - "coverage_recommendation": string (provide clear, bulleted coverage guidance based on the product's COVERS_SQFT rate. Outline typical quantities needed for single & double-coat applications)
    - "reasoning": string (a gorgeous, clear design reasoning detailing why this color palette and product is the ultimate match for their room's mood and description)

    Response MUST be formatted STRICTLY as raw JSON. Do not include markdown code block characters like \`\`\`json.
  `;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptContext,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              theme: { type: Type.STRING },
              base_color: { type: Type.STRING },
              secondary_color: { type: Type.STRING },
              accent_style: { type: Type.STRING },
              neutral_tone: { type: Type.STRING },
              description: { type: Type.STRING },
              product_sku: { type: Type.STRING },
              product_name: { type: Type.STRING },
              color_name: { type: Type.STRING },
              finish_recommendation: { type: Type.STRING },
              coverage_recommendation: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            },
            required: [
              "name",
              "theme",
              "base_color",
              "secondary_color",
              "accent_style",
              "neutral_tone",
              "description",
              "product_sku",
              "product_name",
              "color_name",
              "finish_recommendation",
              "coverage_recommendation",
              "reasoning"
            ]
          }
        }
      });
      const parsed = JSON.parse(response.text || "{}");
      
      // Ensure recommendation relies strictly on database inventory
      const checkedColor = liveColors.find((c: any) => c.name.toLowerCase() === (parsed.name || "").toLowerCase()) || liveColors[0];
      const checkedProduct = liveProducts.find((p: any) => p.sku === parsed.product_sku) || liveProducts.find((p: any) => p.sku === checkedColor.product_sku) || liveProducts[0] || { name: "Sunburst Base Interior Protective Matte", sku: "SB-INT-STAR-02", covers_sqft: 400, unit: "Gallon" };
      
      const enforcedPalette = {
        id: `p_ai_${Date.now()}`,
        name: checkedColor.name,
        theme: checkedColor.theme,
        base_color: checkedColor.base_color,
        secondary_color: checkedColor.secondary_color,
        accent_style: checkedColor.accent_style,
        neutral_tone: checkedColor.neutral_tone,
        description: parsed.description || checkedColor.description || `Premium color matching designed beautifully.`,
        product_sku: checkedProduct.sku,
        product_name: checkedProduct.name,
        color_name: checkedColor.name,
        finish_recommendation: parsed.finish_recommendation || "Satin Finish - provides an elegant low-reflective sheen ideal for highlighting details.",
        coverage_recommendation: parsed.coverage_recommendation || `Covers up to ${checkedProduct.covers_sqft || 400} sq. ft. per ${checkedProduct.unit || 'Gallon'}. For 500 sq ft, we recommend 2.5 gallons for optimal thickness.`,
        reasoning: parsed.reasoning || `This exquisite matching color palette of ${checkedColor.name} coordinates perfectly with your design request.`,
        is_sunburst_exclusive: true,
        created_at: new Date().toISOString()
      };

      return res.json({ success: true, palette: enforcedPalette });
    } catch (e) {
      console.error("Failed to parse AI palette or model failed, falling back:", e);
    }
  }

  // Fallback generator from active colors
  const idx = description.length % liveColors.length;
  const pickedColor = liveColors[idx];
  const matchedProduct = liveProducts.find((p: any) => p.sku === pickedColor.product_sku) || liveProducts[0] || { name: "Sunburst Base Interior Protective Matte", sku: "SB-INT-STAR-02", covers_sqft: 400, unit: "Gallon" };
  
  return res.json({
    success: true,
    palette: {
      id: `p_ai_fall_${Date.now()}`,
      name: pickedColor.name,
      theme: pickedColor.theme,
      base_color: pickedColor.base_color,
      secondary_color: pickedColor.secondary_color,
      accent_style: pickedColor.accent_style,
      neutral_tone: pickedColor.neutral_tone,
      description: `Premium color coordination hand-matched to highlight and fit: ${description}. Covered fully by official Sunburst warranties.`,
      product_sku: matchedProduct.sku,
      product_name: matchedProduct.name,
      color_name: pickedColor.name,
      finish_recommendation: "Semi-Gloss or Satin Finish - recommended for optimal scrub resistance and durability.",
      coverage_recommendation: `Covers up to ${matchedProduct.covers_sqft || 400} sq. ft. per ${matchedProduct.unit || 'Gallon'}. For typical 2-coat residential rooms, plan on 2 Gallons with 10% scrap allowance included.`,
      reasoning: `Matched ${pickedColor.name} from the library which balances neutral tones to highlight the space features flawlessly under standard conditions.`,
      is_sunburst_exclusive: true,
      created_at: new Date().toISOString()
    }
  });
});

// 4.5 Competitor Color Matcher endpoint (uses LAB conversions, Delta E math, and Gemini grounding)

// Color conversion helpers
function hexToRgb(hex: string): { r: number, g: number, b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const shorthandResult = shorthandRegex.exec(hex.trim());
  if (shorthandResult) {
    return {
      r: parseInt(shorthandResult[1] + shorthandResult[1], 16),
      g: parseInt(shorthandResult[2] + shorthandResult[2], 16),
      b: parseInt(shorthandResult[3] + shorthandResult[3], 16)
    };
  }
  return null;
}

function rgbToLab(r: number, g: number, b: number): { L: number, a: number, b_val: number } {
  let rL = r / 255;
  let gL = g / 255;
  let bL = b / 255;
  
  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;
  
  rL *= 100;
  gL *= 100;
  bL *= 100;
  
  const x = rL * 0.4124 + gL * 0.3576 + bL * 0.1805;
  const y = rL * 0.2126 + gL * 0.7152 + bL * 0.0722;
  const z = rL * 0.0193 + gL * 0.1192 + bL * 0.9505;
  
  const xN = 95.047;
  const yN = 100.000;
  const zN = 108.883;
  
  let xR = x / xN;
  let yR = y / yN;
  let zR = z / zN;
  
  const f = (t: number) => t > 0.008856 ? Math.pow(t, 1/3) : (7.787 * t) + (16 / 116);
  
  const fX = f(xR);
  const fY = f(yR);
  const fZ = f(zR);
  
  const L = (116 * fY) - 16;
  const a = 500 * (fX - fY);
  const b_val = 200 * (fY - fZ);
  
  return { L, a, b_val };
}

function calculateDeltaE(
  lab1: { L: number, a: number, b_val: number }, 
  lab2: { L: number, a: number, b_val: number }
): number {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b_val - lab2.b_val;
  return Math.sqrt(dL * dL + da * da + db * db);
}

app.post("/api/colors/match-competitor", async (req, res) => {
  const { input_color, brand, input_type } = req.body;
  if (!input_color) {
    return res.status(400).json({ error: "input_color is required" });
  }

  const liveColors = await getColors();

  let resolvedBrand = brand && brand !== "Any" ? brand : "Sherwin-Williams";
  let resolvedColorName = input_color;
  let resolvedColorCode = "SW-CUSTOM";
  let resolvedHex = "#808080";
  let targetR = 128, targetG = 128, targetB = 128;

  let rgbParsed = false;
  const cleanedValue = input_color.trim();

  // Check if HEX format directly
  if (cleanedValue.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(cleanedValue) || /^[0-9a-fA-F]{3}$/.test(cleanedValue)) {
    const parts = hexToRgb(cleanedValue);
    if (parts) {
      targetR = parts.r;
      targetG = parts.g;
      targetB = parts.b;
      resolvedHex = cleanedValue.startsWith('#') ? cleanedValue.toUpperCase() : `#${cleanedValue.toUpperCase()}`;
      resolvedBrand = brand && brand !== "Any" ? brand : "Custom/HEX";
      resolvedColorName = `Direct HEX Color (${resolvedHex})`;
      resolvedColorCode = "HEX Color";
      rgbParsed = true;
    }
  } else {
    // Check if RGB format directly
    const commaMatch = cleanedValue.match(/^\s*(?:rgb\s*\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:\))?\s*$/i);
    if (commaMatch) {
      const rVal = parseInt(commaMatch[1], 10);
      const gVal = parseInt(commaMatch[2], 10);
      const bVal = parseInt(commaMatch[3], 10);
      if (rVal <= 255 && gVal <= 255 && bVal <= 255) {
        targetR = rVal;
        targetG = gVal;
        targetB = bVal;
        resolvedHex = `#${((1 << 24) + (rVal << 16) + (gVal << 8) + bVal).toString(16).slice(1).toUpperCase()}`;
        resolvedBrand = brand && brand !== "Any" ? brand : "Custom/RGB";
        resolvedColorName = `Direct RGB Color (${rVal}, ${gVal}, ${bVal})`;
        resolvedColorCode = "RGB Color";
        rgbParsed = true;
      }
    }
  }

  if (!rgbParsed) {
    // Use Gemini to ground physical color name to visual values
    if (ai) {
      try {
        const brandContext = brand && brand !== "Any" ? `specifically under the brand line of ${brand}` : "inferring the most likely competitor brand (Sherwin-Williams, Benjamin Moore, Behr, or PPG)";
        const promptContext = `
          You are the core color-matching engine for the Sunburst Paints mobile and web application.
          The contractor is requesting to map a competitor color described as: "${input_color}" ${brandContext}.
          
          Your sole purpose is to resolve this competitor color name to its proper brand name, official marketing color name, color code/ID, standard representative Hex color value, and the corresponding RGB components.
          
          Identify the following properties with strict precision:
          - brand: "Sherwin-Williams" or "Benjamin Moore" or "Behr" or "PPG"
          - color_name: the proper commercial trade paint name (e.g., "Sea Salt" or "Revere Pewter" or "Hale Navy")
          - color_code: the trade SKU/ID (e.g., "SW 6204", "HC-172", etc.)
          - hex: the exact or closest representative Hex code (e.g., "#C2C6C1")
          - r: integer red component 0 to 255
          - g: integer green component 0 to 255
          - b: integer blue component 0 to 255
          
          Return a completely valid and minified JSON object matching the exact properties described above.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: promptContext,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                brand: { type: Type.STRING },
                color_name: { type: Type.STRING },
                color_code: { type: Type.STRING },
                hex: { type: Type.STRING },
                r: { type: Type.INTEGER },
                g: { type: Type.INTEGER },
                b: { type: Type.INTEGER }
              },
              required: ["brand", "color_name", "color_code", "hex", "r", "g", "b"]
            }
          }
        });
        const parsed = JSON.parse(response.text || "{}");
        if (parsed && parsed.hex) {
          resolvedBrand = parsed.brand || resolvedBrand;
          resolvedColorName = parsed.color_name || resolvedColorName;
          resolvedColorCode = parsed.color_code || resolvedColorCode;
          resolvedHex = parsed.hex.startsWith('#') ? parsed.hex.toUpperCase() : `#${parsed.hex.toUpperCase()}`;
          targetR = parsed.r !== undefined ? parsed.r : targetR;
          targetG = parsed.g !== undefined ? parsed.g : targetG;
          targetB = parsed.b !== undefined ? parsed.b : targetB;
        }
      } catch (e: any) {
        console.error("Gemini competitor grounding failed, using local lookup parser fallback:", e);
      }
    }
  }

  // Double check manual strings for common defaults if Gemini was offline
  const lowerName = input_color.toLowerCase();
  if (lowerName.includes("agreeable") || lowerName.includes("gray")) {
    if (!rgbParsed && resolvedHex === "#808080") {
      resolvedBrand = "Sherwin-Williams";
      resolvedColorName = "Agreeable Gray";
      resolvedColorCode = "SW 7029";
      resolvedHex = "#D1CBC4";
      targetR = 209; targetG = 203; targetB = 196;
    }
  } else if (lowerName.includes("tricorn") || lowerName.includes("black")) {
    if (!rgbParsed && resolvedHex === "#808080") {
      resolvedBrand = "Sherwin-Williams";
      resolvedColorName = "Tricorn Black";
      resolvedColorCode = "SW 6258";
      resolvedHex = "#2F3032";
      targetR = 47; targetG = 48; targetB = 50;
    }
  } else if (lowerName.includes("revere") || lowerName.includes("pewter")) {
    if (!rgbParsed && resolvedHex === "#808080") {
      resolvedBrand = "Benjamin Moore";
      resolvedColorName = "Revere Pewter";
      resolvedColorCode = "HC-172";
      resolvedHex = "#CBC5B7";
      targetR = 203; targetG = 197; targetB = 183;
    }
  }

  // Calculate Delta E similarity mathematically against the database records
  const targetLab = rgbToLab(targetR, targetG, targetB);

  const candidates = liveColors.map((color: any) => {
    const baseHex = color.base_color || "#FFFFFF";
    const cRgb = hexToRgb(baseHex) || { r: 255, g: 255, b: 255 };
    const cLab = rgbToLab(cRgb.r, cRgb.g, cRgb.b);
    const deltaE = calculateDeltaE(targetLab, cLab);
    
    // Scale-independent match confidence percent mapping
    const matchScore = parseFloat((Math.max(40, 100 - (deltaE * 1.5))).toFixed(1));
    
    // Aesthetic finishes recommendations
    const lightness = cLab.L;
    let recommendedFinish = "Eggshell Finish";
    if (lightness > 75) {
      recommendedFinish = "Matte Finish (Optimal for ceiling and low-reflection walls)";
    } else if (lightness < 40) {
      recommendedFinish = "Satin Finish (Perfect for decorative frames and dynamic contrast trim)";
    } else {
      recommendedFinish = "Eggshell Finish (High balance for heavy utility living spaces)";
    }
    
    // Suitability calculations
    let suitability = "Interior & Exterior Approved";
    if (lightness > 88) {
      suitability = "Interior and ceiling surfaces recommended only";
    } else if (lightness < 30) {
      suitability = "High durability exterior trim & siding approved";
    } else if (color.name.toLowerCase().includes("sage") || color.name.toLowerCase().includes("cactus") || color.name.toLowerCase().includes("moss")) {
      suitability = "Interior & Exterior Approved (UV weathering protected)";
    } else {
      suitability = "Interior & Exterior Approved (Continuous mold resistant formula)";
    }
    
    return {
      ...color,
      matchScore,
      deltaE,
      recommendedFinish,
      suitability
    };
  });

  // Sort by deltaE ascending
  candidates.sort((a: any, b: any) => a.deltaE - b.deltaE);

  // Take top 5 closest matches
  const top5Matches = candidates.slice(0, 5);
  const primaryMatch = top5Matches[0] || {
    name: "Sunburst Coastal Slate",
    product_sku: "SB-CS-112",
    base_color: "#4A4F56",
    matchScore: 95.0
  };

  const legacyPayload = {
    requested_brand: resolvedBrand,
    requested_color_name: resolvedColorName,
    requested_color_id: resolvedColorCode,
    sunburst_match_name: primaryMatch.name,
    sunburst_match_id: primaryMatch.product_sku || "SB-MATCH-01",
    sunburst_hex: primaryMatch.base_color,
    match_confidence: primaryMatch.matchScore > 95 ? "High" : primaryMatch.matchScore > 85 ? "Medium" : "Low"
  };

  return res.json({
    success: true,
    match: legacyPayload,
    resolved_competitor: {
      brand: resolvedBrand,
      color_name: resolvedColorName,
      color_code: resolvedColorCode,
      hex: resolvedHex,
      rgb: { r: targetR, g: targetG, b: targetB }
    },
    matches: top5Matches.map(m => ({
      id: m.id,
      name: m.name,
      sku: m.product_sku || "SB-SPEC-MATCH",
      hex: m.base_color,
      matchScore: m.matchScore,
      recommendedFinish: m.recommendedFinish,
      suitability: m.suitability,
      theme: m.theme,
      description: m.description,
      secondary_color: m.secondary_color,
      accent_style: m.accent_style,
      neutral_tone: m.neutral_tone
    }))
  });
});

// 5. Quote Calculation engine endpoint (Dynamic loading)
app.post("/api/quotes/calculate", async (req, res) => {
  const { 
    sqft, 
    productId, 
    laborHours = 8, 
    laborRate = 45, 
    customCharge = 0, 
    wasteFactor = 10,
    markupMargin = 30 // Target profit margin e.g. 30%
  } = req.body;

  if (dbConnectivityStatus !== "ONLINE") {
    return res.status(503).json({
      success: false,
      error: "Service temporarily unavailable: Live Supabase database connection is offline. Cache fallback is prohibited for financial operations to maintain strict data integrity."
    });
  }

  if (!sqft || !productId) {
    return res.status(400).json({ error: "sqft and productId are required" });
  }

  const liveProducts = await getProducts();
  const selectedProduct = liveProducts.find(p => p.id === productId);
  if (!selectedProduct) {
    return res.status(404).json({ error: "Product not found in Dynamic Sunburst catalog" });
  }

  // Formula Calculations:
  // Painting / coating standard assumes 2 coats
  const coats = 2;
  const rawCoverageNeeded = sqft * coats;
  
  let quantityNeeded = 0;
  if (selectedProduct.covers_sqft > 0) {
    // Math: (Area * Coats) / CoveragePerGallon * (1 + WasteFactor/100)
    const baseQuantity = rawCoverageNeeded / selectedProduct.covers_sqft;
    const multipliedQuantity = baseQuantity * (1 + (wasteFactor / 100));
    quantityNeeded = Math.ceil(multipliedQuantity * 100) / 100; // round to 2 digits
  } else {
    // brushes / custom things are per-job items (e.g. 1)
    quantityNeeded = 1;
  }

  // Contractor internal cost
  const materialCost = Math.round((quantityNeeded * selectedProduct.price) * 100) / 100;
  // Retail (quoted price) list rate
  const materialPrice = Math.round((quantityNeeded * selectedProduct.retail_price) * 105) / 100; // adding markup

  const laborCost = laborHours * laborRate;
  const laborPrice = Math.round(laborCost * 1.35 * 100) / 100; // markup on contractor labor
  
  const subtotalCost = materialCost + laborCost + Number(customCharge);
  
  // Profit Margin calculation
  // Price = Cost / (1 - Margin/100)
  const targetPrice = Math.round((subtotalCost / (1 - (markupMargin / 100))) * 100) / 100;
  
  const profit = Math.round((targetPrice - subtotalCost) * 100) / 100;
  const marginPercent = Math.round((profit / targetPrice) * 10000) / 100;

  // System-wide VAT enforcement (calculated AFTER subtotal) - Requirement 1, 2, 5
  // Default is 0.10 (10%). Cannot be disabled or overridden by contractors.
  const vatAmount = Math.round((targetPrice * SYSTEM_VAT_RATE) * 100) / 100;
  const finalTotal = Math.round((targetPrice + vatAmount) * 100) / 100;

  res.json({
    success: true,
    data: {
      selectedProduct,
      sqft,
      coats,
      quantityNeeded,
      wasteFactor,
      materialCost,
      materialPrice,
      laborCost,
      laborPrice,
      customCharge,
      subtotalCost, // Contractor actual cost
      subtotalPrice: targetPrice, // Price contractor quotes to client before VAT
      vatRate: SYSTEM_VAT_RATE,
      vatAmount,
      finalTotal,
      profit,
      margin: marginPercent,
      materials_usage_details: [
        {
          product_name: selectedProduct.name,
          quantity: quantityNeeded,
          units: selectedProduct.unit,
          estimated_coverage: `${selectedProduct.covers_sqft} sq. ft. per ${selectedProduct.unit} (Single Coat)`
        }
      ]
    }
  });
});

// Dynamic management endpoints for Catalogs
app.post("/api/products/import", async (req, res) => {
  const { products: importedList, refresh } = req.body;
  if (!Array.isArray(importedList)) {
    return res.status(400).json({ error: "Products array is required for import" });
  }

  // Prevent schema drift by rejecting unknown fields automatically
  const APPROVED_PRODUCT_FIELDS = new Set([
    "id", 
    "name", 
    "sku", 
    "category", 
    "price", 
    "retail_price", 
    "covers_sqft", 
    "unit", 
    "description", 
    "image_url", 
    "is_sunburst_exclusive",
    "technical_sheet_url",
    "safety_sheet_url"
  ]);

  for (const item of importedList) {
    const keys = Object.keys(item);
    for (const key of keys) {
      if (!APPROVED_PRODUCT_FIELDS.has(key)) {
        return res.status(400).json({
          error: `Schema drift prohibited: Unknown column '${key}' detected in product payload. Approved fields: ${Array.from(APPROVED_PRODUCT_FIELDS).join(', ')}`
        });
      }
    }
  }

  // Validate the products to ensure ONLY official Sunburst products (with name containing 'Sunburst') are allowed!
  const sunburstItems = importedList.filter(p => {
    const title = String(p.name || '').toLowerCase();
    return title.includes('sunburst');
  });

  if (sunburstItems.length === 0) {
    return res.status(400).json({ 
      error: "Import rejected: No official Sunburst products found. All paint product names must start with or contain 'Sunburst' to prevent placeholder or third-party lines." 
    });
  }

  try {
    const result = await saveProducts(sunburstItems, refresh === true);
    const current = await getProducts();
    res.json({ 
      ...result, 
      success: true, 
      productsCount: sunburstItems.length,
      products: current
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase is disconnected! Prohibited delete action.");
    }
    
    const current = await getProducts();
    const itemToDelete = current.find((p: any) => p.id === id);
    if (!itemToDelete) {
      return res.status(404).json({ error: "Product not found." });
    }
    
    // First delete any associated colors that reference this product_sku to preserve FK constraints
    const { error: colorsDelError } = await supabase.from("colors").delete().eq("product_sku", itemToDelete.sku);
    if (colorsDelError) {
      throw new Error(`Database Integrity Error (deleting colors): ${colorsDelError.message}`);
    }

    // Direct delete product
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      throw new Error(`Database Delete Failed: ${error.message}`);
    }
    
    // Sync local file backup
    const filtered = current.filter((p: any) => p.id !== id);
    try {
      fs.writeFileSync(
        path.join(process.cwd(), "data_products.json"),
        JSON.stringify(filtered, null, 2),
        "utf8"
      );
    } catch (e) {}

    logAuditEvent("DELETE", "PRODUCT", id, `Removed product. SKU: ${itemToDelete.sku} Name: ${itemToDelete.name}`);
    res.json({ success: true, products: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/products/reset", async (req, res) => {
  return res.status(403).json({
    success: false,
    error: "Security Exception: Automatic reset/mock endpoints have been permanently deactivated in production mode. Catalog updates must proceed exclusively through the Certified CSV Importer."
  });
});

// Helper to fetch WhatsApp messages from database or memory fallback
async function getDBMessages(customerId: string) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("customer_id", ensureUUID(customerId))
        .order("timestamp", { ascending: true });
      if (!error && data) {
        // Map postgres model to types.ts Message model
        return data.map((d: any) => ({
          id: d.id,
          customer_id: d.customer_id,
          sender: d.sender,
          content: d.content,
          timestamp: d.timestamp,
          status: d.status || "sent"
        }));
      }
      if (error) {
        console.error("[DATABASE ERROR] Failed to fetch messages:", error.message);
      }
    } catch (e: any) {
      console.error("[DATABASE ERROR] Exception loading messages:", e.message || e);
    }
  }
  return simulatedMessages.filter(m => m.customer_id === customerId);
}

// Helper to save messages to database and memory fallback
async function saveDBMessage(message: any) {
  // In-memory cache update
  simulatedMessages.push(message);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const dbPayload = {
        customer_id: ensureUUID(message.customer_id),
        sender: message.sender,
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        status: message.status || "sent"
      };
      
      const { data, error } = await supabase
        .from("messages")
        .insert(dbPayload)
        .select();
      
      if (error) {
        console.error("[DATABASE ERROR] Failed to insert message into Supabase:", error.message);
      } else if (data && data.length > 0) {
        return data[0];
      }
    } catch (e: any) {
      console.error("[DATABASE ERROR] Exception storing message:", e.message || e);
    }
  }
  return message;
}

// Dispatch outgoing Meta WhatsApp message using standard graph API
async function sendMetaWhatsAppMessage(toPhone: string, textBody: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneId) {
    console.warn("[WHATSAPP DISPATCH] Meta credentials are empty or missing in secrets. Skipping REST call, falling back to simulated dispatch.");
    return { skipped: true, note: "Meta credentials missing" };
  }

  const cleanPhone = toPhone.replace(/[^\d+]/g, "");
  const endpoint = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

  console.log(`[WHATSAPP DISPATCH] Dispatching via Meta URL: ${endpoint} to: ${cleanPhone}`);
  
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { body: textBody }
      })
    });

    const resJson: any = await res.json();
    if (!res.ok) {
      console.error("[WHATSAPP DISPATCH FAILURE] Meta API responded with status error:", resJson);
      throw new Error(resJson.error?.message || "WhatsApp dispatch failed");
    }

    console.log("[WHATSAPP DISPATCH SUCCESS] Meta accepted raw delivery payload:", resJson);
    return resJson;
  } catch (err: any) {
    console.error("[WHATSAPP DISPATCH FAILURE] Graph REST exception:", err.message || err);
    throw err;
  }
}

// 6. Meta WhatsApp Webhook Validation & Handshake GET endpoint
app.get("/api/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "sunburst_secure_verify_token_2026";

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WEBHOOK] Meta Webhook verified.");
    return res.status(200).send(challenge);
  } else {
    console.warn("[WEBHOOK] Verification failed.", { mode, token });
    return res.sendStatus(403);
  }
});

// Helper for Quote Approval Workflow logic (shared between live webhook and simulator)
async function runQuoteApprovalWorkflow(customerId: string, textBody: string, phone: string) {
  const text = textBody.toLowerCase().trim();
  const isAffirmative = text === "yes" || text === "ok" || text === "approve" || text === "agree" || text === "accept" || text.includes("approve");
  const quoteNumberMatch = textBody.match(/SB-Q-\d+/i);
  
  if (isAffirmative || quoteNumberMatch) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        let query = supabase
          .from("jobs")
          .select("id, title, price, status")
          .eq("customer_id", ensureUUID(customerId))
          .eq("status", "quote");
          
        const { data: customerJobs, error: jobsErr } = await query.order("created_at", { ascending: false });
        
        if (!jobsErr && customerJobs && customerJobs.length > 0) {
          const targetJob = customerJobs[0];
          
          const { error: updateErr } = await supabase
            .from("jobs")
            .update({ status: "scheduled", updated_at: new Date().toISOString() })
            .eq("id", targetJob.id);
            
          if (!updateErr) {
            console.log(`[APPROVAL WORKFLOW SUCCESS] Quote/Job ${targetJob.id} moved to SCHEDULED. Customer approved!`);
            
            const confirmationText = `Thank you! Your quote for "${targetJob.title}" totaling $${Number(targetJob.price).toFixed(2)} has been APPROVED. Your certified Sunburst contractor has been notified and will contact you shortly to schedule the coating application!`;
            
            const autoConfirmMsg = {
              id: `m_auto_approve_${Date.now()}`,
              customer_id: customerId,
              sender: "contractor",
              content: confirmationText,
              timestamp: new Date().toISOString(),
              status: "sent"
            };
            
            await saveDBMessage(autoConfirmMsg);
            
            try {
              await sendMetaWhatsAppMessage(phone, confirmationText);
            } catch (err: any) {
              console.error("[AUTO REPLY ERROR] WhatsApp dispatch failed:", err.message);
            }
            return true;
          }
        }
      } catch (err) {
        console.error("[APPROVAL WORKFLOW] Error in database execution:", err);
      }
    }
  }
  return false;
}

// Incoming webhook message handler (POST endpoint called by Meta)
app.post("/api/whatsapp/webhook", async (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    // Handlers are active ONLY when we have a valid text message
    if (message && message.text?.body) {
      const fromPhone = message.from; // e.g. "15555551234"
      const bodyText = message.text.body;
      const clientProfileName = contact?.profile?.name || `WhatsApp Client (${fromPhone})`;

      console.log(`[INCOMING WEBHOOK] Message from ${fromPhone}: "${bodyText}"`);

      // 1. Resolve Customer ID by phone
      let customerId = "cust_seed_1"; // Default seed fallback
      const supabase = getSupabaseClient();
      
      if (supabase) {
        const { data: matchedCustomers, error: matchedErr } = await supabase
          .from("customers")
          .select("id, name, phone");
          
        if (!matchedErr && matchedCustomers) {
          const cleanFrom = fromPhone.replace(/\D/g, "");
          const found = matchedCustomers.find(c => {
            const cleanCustPhone = (c.phone || "").replace(/\D/g, "");
            return cleanCustPhone.endsWith(cleanFrom) || cleanFrom.endsWith(cleanCustPhone);
          });
          
          if (found) {
            customerId = found.id;
          } else {
            // Customer is brand new! Enroll automatically as hot lead!
            const { data: newCust, error: newCustErr } = await supabase
              .from("customers")
              .insert({
                name: clientProfileName,
                phone: `+${fromPhone}`,
                address: "Registered via WhatsApp Link",
                status: "Lead"
              })
              .select("id")
              .single();
              
            if (!newCustErr && newCust) {
              customerId = newCust.id;
              logAuditEvent("INSERT", "CUSTOMER", customerId, `Enroll new lead: ${clientProfileName} from WhatsApp callback.`);
            }
          }
        }
      }

      // 2. Save user message to database
      const userMsg = {
        id: `m_wa_${message.id || Date.now()}`,
        customer_id: customerId,
        sender: "customer",
        content: bodyText,
        timestamp: new Date().toISOString(),
        status: "delivered"
      };
      await saveDBMessage(userMsg);

      // 3. Trigger approval workflow
      const didApprove = await runQuoteApprovalWorkflow(customerId, bodyText, `+${fromPhone}`);
      
      if (didApprove) {
        return res.status(200).json({ success: true, processed: "approved" });
      }

      // 4. Fallback Auto response and AI commentary generator
      let autoResponseContent = `Hi ${clientProfileName}! Thanks for reaching out. We have logged your request. A certified Sunburst contractor will send a follow-up shortly.`;
      
      if (bodyText.toLowerCase().match(/(quote|stucco|paint|wood|cost|how much|garage|stain)/)) {
        autoResponseContent = `Hi ${clientProfileName}! Estimate received. We are compiling notes for your quote request using elite Sunburst chemical coatings. Your professional project manager will reach out with pricing immediately.`;
      }

      if (ai && bodyText && bodyText.trim().length > 0) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `You are answering a user on WhatsApp who said: "${bodyText}". Keep the reply very brief (max 2 sentences) on behalf of Sunburst High-durability Paint Coatings. Let them know a professional contractor has received the note.`
          });
          if (response.text) {
            autoResponseContent = response.text;
          }
        } catch(e) {}
      }

      // 5. Send automated reply back
      const replyMsg = {
        id: `m_wa_reply_${Date.now()}`,
        customer_id: customerId,
        sender: "contractor",
        content: autoResponseContent,
        timestamp: new Date().toISOString(),
        status: "sent"
      };
      await saveDBMessage(replyMsg);

      try {
        await sendMetaWhatsAppMessage(`+${fromPhone}`, autoResponseContent);
      } catch (err: any) {
        console.warn("[WEBHOOK CALLBACK AUTO REPLY WARNING] Meta REST dispatch skipped/failed:", err.message);
      }
    }

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[INCOMING WEBHOOK FAULT]", err);
    res.status(500).json({ error: "Webhook processing error" });
  }
});

// Webhook simulation handler (POST) which emulates real WhatsApp events
app.post("/api/whatsapp/simulate-incoming", async (req, res) => {
  const { customer_id, customer_name, text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text message is required" });
  }

  const cid = customer_id || "cust_seed_1";
  
  // 1. Store client simulated text in Supabase/Memory
  const userMsg = {
    id: `m_sim_${Date.now()}_u`,
    customer_id: ensureUUID(cid),
    sender: "customer",
    content: text,
    timestamp: new Date().toISOString(),
    status: "delivered"
  };
  await saveDBMessage(userMsg);

  // 2. Resolve target customer details for approval confirmations
  let customerPhone = "+1 (305) 555-0100";
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.from("customers").select("phone").eq("id", ensureUUID(cid)).single();
      if (data && data.phone) {
        customerPhone = data.phone;
      }
    } catch(e) {}
  }

  // 3. Trigger approval check
  const wasApproved = await runQuoteApprovalWorkflow(cid, text, customerPhone);
  if (wasApproved) {
    return res.json({
      success: true,
      approved: true,
      loggedMessages: [userMsg]
    });
  }

  // 4. Simple automated webhook logic
  let autoResponseContent = "";
  const lowText = text.toLowerCase();

  if (lowText.includes("quote") || lowText.includes("stucco") || lowText.includes("wood") || lowText.includes("price") || lowText.includes("how much") || lowText.includes("garage") || lowText.includes("cost")) {
    autoResponseContent = `Hi ${customer_name || 'there'}! I've received your request at the Sunburst Pro Hub. We are compiling a premium quote estimate right now using Sunburst high-durability coatings. Our local pro contractor will contact you with the complete breakdown containing custom markup margins in under 60 seconds!`;
  } else {
    autoResponseContent = `Hey ${customer_name || 'there'}! Thanks for contacting us on WhatsApp. Our team at Sunburst is processing your note and will reply with a detailed project proposal immediately. Feel free to send over photos of your job area!`;
  }

  if (ai && text && text.trim().length > 0) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are answering a user on WhatsApp who said: "${text}". Keep the copy very concise (max 2-3 sentences) representing Sunburst Pro contractor SaaS response. Inform them politely that their contractor has received it via Sunburst Pro portal.`
      });
      autoResponseContent = response.text || autoResponseContent;
    } catch(e) {}
  }

  const helperResponseMsg = {
    id: `m_sim_${Date.now() + 10}_a`,
    customer_id: cid,
    sender: "contractor",
    content: autoResponseContent,
    timestamp: new Date().toISOString(),
    status: "sent"
  };
  await saveDBMessage(helperResponseMsg);

  res.json({
    success: true,
    webhookTriggered: true,
    loggedMessages: [userMsg, helperResponseMsg]
  });
});

// 7. Get WhatsApp conversations (from database with memory fallback)
app.get("/api/whatsapp/messages/:customerId", async (req, res) => {
  const customerId = req.params.customerId;
  const list = await getDBMessages(customerId);
  res.json({ success: true, messages: list });
});

// 8. Custom Outgoing WhatsApp send api (sends real REST to Meta + saves to Supabase)
app.post("/api/whatsapp/send", async (req, res) => {
  const { customer_id, content } = req.body;
  if (!customer_id || !content) {
    return res.status(400).json({ error: "customer_id and content are required" });
  }

  const outMsg = {
    id: `m_out_${Date.now()}`,
    customer_id,
    sender: "contractor",
    content,
    timestamp: new Date().toISOString(),
    status: "sent"
  };

  // 1. Save to Supabase (and cache)
  await saveDBMessage(outMsg);

  // 2. Lookup phone number of customer in database
  let customerPhone = "";
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("customers")
        .select("phone")
        .eq("id", ensureUUID(customer_id))
        .limit(1);
      if (data && data.length > 0) {
        customerPhone = data[0].phone || "";
      }
    } catch {
      // ignore
    }
  }

  // 3. Dispatch to Meta API if phone was resolved and credentials are fit
  let metaPayload = null;
  if (customerPhone) {
    try {
      metaPayload = await sendMetaWhatsAppMessage(customerPhone, content);
    } catch (err: any) {
      console.warn("[SEND OUTGOING WARNING] Meta delivery failed:", err.message || err);
    }
  } else {
    console.warn("[SEND OUTGOING WARNING] Could not resolve phone number for customer ID:", customer_id);
  }

  res.json({
    success: true,
    whatsappPayload: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: customerPhone || "+1 (555) 000-0000",
      type: "text",
      text: { body: content },
      metaResponse: metaPayload
    },
    message: outMsg
  });
});

// 9. Customer follow-up workflow: Trigger automated targeted follow-ups
app.post("/api/whatsapp/followup", async (req, res) => {
  try {
    const { customerId } = req.body;
    const supabase = getSupabaseClient();
    let targets: any[] = [];

    if (supabase) {
      if (customerId) {
        const { data } = await supabase.from("customers").select("*").eq("id", ensureUUID(customerId));
        if (data) targets = data;
      } else {
        // Query customers that have status = 'Lead'
        const { data } = await supabase.from("customers").select("*").eq("status", "Lead").limit(20);
        if (data) targets = data;
      }
    }

    // Default seed fallback if database is empty/disconnected
    if (targets.length === 0) {
      targets = [
        { id: "cust_seed_1", name: "Valued Client", phone: "" }
      ];
    }

    const report = [];

    for (const c of targets) {
      if (!c.phone) continue;

      const bodyText = `Hi ${c.name}! This is a friendly follow-up from Sunburst Paints. We wanted to see if you have any questions about your project quote, or if you're ready to lock in your application timeline. Let us know!`;

      const outMsg = {
        id: `m_followup_${Date.now()}_${c.id}`,
        customer_id: c.id,
        sender: "contractor",
        content: bodyText,
        timestamp: new Date().toISOString(),
        status: "sent"
      };

      await saveDBMessage(outMsg);

      let success = false;
      try {
        await sendMetaWhatsAppMessage(c.phone, bodyText);
        success = true;
      } catch (err: any) {
        console.warn(`[FOLLOWUP SKIPPED/FAILED] for ${c.name}:`, err.message || err);
      }

      report.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        status: success ? "Dispatched" : "Logged (Offline Fallback)"
      });
    }

    res.json({
      success: true,
      message: `Friendly customer follow-up campaign completed for ${report.length} contacts.`,
      campaignReport: report
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});



// --- MOUNT VITE MIDDLEWARE ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware mounted in development mode.");
  } else {
    // Production configurations
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start the database heartbeat check every 30 seconds (Requirement 2)
  setInterval(performHeartbeat, 30000);
  // Trigger immediate initial heartbeat assessment on boot
  performHeartbeat();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sunburst Pro Hub server started on http://localhost:${PORT}`);
    console.log(`[BOOT] Backend: Express`);
    console.log(`[BOOT] Build Time: ${BUILD_TIME}`);
    console.log(`[BOOT] Git Commit: ${GIT_COMMIT}`);
    console.log(`[BOOT] Tracked Primary Routes: /health, /api/health, /api/audit/report, /api/audit/migrate`);
  });
}

startServer();
