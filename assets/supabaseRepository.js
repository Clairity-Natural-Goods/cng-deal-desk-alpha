/**
 * Supabase Entity Repository for CNG Deal Desk Alpha V2
 * 
 * Replaces the mock/localStorage __B44_DB__ implementation with production Supabase
 * PostgreSQL queries and real Supabase Auth.
 */

import { supabase } from "./supabaseClient.js";
import {
  saveOfflineTransaction,
  getOfflineTransaction,
  getAllOfflineTransactions,
  deleteOfflineTransaction,
  cacheCounterparties,
  getCachedParties,
} from "./offline/offlineStore.js";
import { syncEngine } from "./offline/syncEngine.js";
import { normalizeDealCreationPayload } from "./dealCreation.js";

// Counterparty normalization rules
export function normalizeCounterpartyName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

export function normalizeDistrict(district) {
  return String(district ?? "")
    .trim()
    .toLowerCase() || "unknown";
}

// Generate random ID consistent with existing Alpha V2 rec_* pattern
export function generateRecordId() {
  return "rec_" + Math.random().toString(36).substr(2, 9);
}

// Table mapping
const TABLE_MAP = {
  Party: "parties",
  Observation: "observations",
  Deal: "deals",
  DealEvent: "deal_events",
  User: "profiles",
  Transaction: "transactions",
  TransactionEvent: "transaction_events",
  DisclosureAuditLog: "disclosure_audit_logs",
};

function createEntityRepository(entityName) {
  const tableName = TABLE_MAP[entityName] || entityName.toLowerCase();

  return {
    async filter(query = {}, options = {}) {
      // Special offline handling for Transaction
      if (entityName === "Transaction") {
        try {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            return await getAllOfflineTransactions();
          }
          // Merge remote and offline
          const list = await syncEngine.fetchCloudAndMerge();
          return list;
        } catch {
          return await getAllOfflineTransactions();
        }
      }

      let req = supabase.from(tableName).select("*");

      // Apply equality filters
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          req = req.eq(key, value);
        }
      }

      // Apply sorting
      if (options.sort) {
        const desc = options.sort.startsWith("-");
        const col = desc ? options.sort.slice(1) : options.sort;
        req = req.order(col, { ascending: !desc });
      } else {
        // Default sort by created_date desc if column exists
        if (["parties", "observations", "deals", "deal_events"].includes(tableName)) {
          req = req.order(tableName === "profiles" ? "created_at" : "created_date", { ascending: false });
        }
      }

      // Apply limit
      if (options.limit && Number.isFinite(options.limit)) {
        req = req.limit(options.limit);
      }

      const { data, error } = await req;
      if (error) {
        // Fallback for Party when offline
        if (entityName === "Party") {
          const cached = await getCachedParties();
          if (cached && cached.length > 0) return cached;
        }
        console.error(`Supabase filter query failed on ${tableName}:`, error);
        throw error;
      }

      // Cache counterparties for offline field use
      if (entityName === "Party" && Array.isArray(data)) {
        cacheCounterparties(data).catch(() => {});
      }

      return data || [];
    },

    async get(id) {
      if (!id) return null;

      // Special offline handling for Transaction
      if (entityName === "Transaction") {
        const local = await getOfflineTransaction(id);
        if (local) return local;
      }

      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error(`Supabase get query failed on ${tableName} for ID ${id}:`, error);
        throw error;
      }
      return data || null;
    },

    async create(payload = {}) {
      if (entityName === "Deal") {
        payload = normalizeDealCreationPayload(payload);
      }

      // Special offline handling for Transaction
      if (entityName === "Transaction") {
        const localRecord = await saveOfflineTransaction(payload);
        if (typeof navigator === "undefined" || navigator.onLine) {
          syncEngine.syncPendingTransactions().catch(() => {});
        }
        return localRecord;
      }

      const id = payload.id || generateRecordId();
      const now = new Date().toISOString();

      // Special duplicate protection for Party
      if (entityName === "Party") {
        if (!payload.name || !String(payload.name).trim()) {
          throw new Error("Party name is required.");
        }
        const normName = normalizeCounterpartyName(payload.name);
        const normDist = normalizeDistrict(payload.district);

        // Frontend pre-check against database
        const { data: existingParties } = await supabase
          .from("parties")
          .select("id, name, district");

        if (existingParties && existingParties.length > 0) {
          const match = existingParties.find(
            (p) =>
              normalizeCounterpartyName(p.name) === normName &&
              normalizeDistrict(p.district) === normDist
          );
          if (match) {
            const duplicateError = new Error("Counterparty with this name already exists in this district");
            duplicateError.status = 409;
            duplicateError.code = "DUPLICATE_COUNTERPARTY";
            duplicateError.error = "DUPLICATE_COUNTERPARTY";
            duplicateError.existingId = match.id;
            throw duplicateError;
          }
        }
      }

      // Sanitize fields and build record
      const record = {
        id,
        created_date: payload.created_date || now,
        updated_date: payload.updated_date || now,
        ...payload,
      };

      const { data, error } = await supabase
        .from(tableName)
        .insert(record)
        .select()
        .single();

      if (error) {
        // Handle PostgreSQL unique constraint violation (code 23505)
        if (entityName === "Party" && (error.code === "23505" || error.message?.includes("unique") || error.message?.includes("normalized"))) {
          const duplicateError = new Error("Counterparty with this name already exists in this district");
          duplicateError.status = 409;
          duplicateError.code = "DUPLICATE_COUNTERPARTY";
          duplicateError.error = "DUPLICATE_COUNTERPARTY";
          throw duplicateError;
        }
        console.error(`Supabase insert failed on ${tableName}:`, error);
        throw error;
      }

      return data;
    },

    async update(id, payload = {}) {
      if (!id) throw new Error("ID is required for update.");

      // Special offline handling for Transaction
      if (entityName === "Transaction") {
        const local = await saveOfflineTransaction({ client_id: id, ...payload });
        if (typeof navigator === "undefined" || navigator.onLine) {
          syncEngine.syncPendingTransactions().catch(() => {});
        }
        return local;
      }

      const now = new Date().toISOString();

      // Clean payload: remove id from update body
      const { id: _, ...cleanPayload } = payload;
      cleanPayload.updated_date = now;

      const { data, error } = await supabase
        .from(tableName)
        .update(cleanPayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (entityName === "Party" && (error.code === "23505" || error.message?.includes("unique"))) {
          const duplicateError = new Error("Counterparty with this name already exists in this district");
          duplicateError.status = 409;
          duplicateError.code = "DUPLICATE_COUNTERPARTY";
          duplicateError.error = "DUPLICATE_COUNTERPARTY";
          throw duplicateError;
        }
        console.error(`Supabase update failed on ${tableName} for ID ${id}:`, error);
        throw error;
      }

      return data;
    },

    async delete(id) {
      if (!id) throw new Error("ID is required for delete.");

      // Special offline handling for Transaction
      if (entityName === "Transaction") {
        await deleteOfflineTransaction(id);
        return { success: true };
      }

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", id);

      if (error) {
        console.error(`Supabase delete failed on ${tableName} for ID ${id}:`, error);
        throw error;
      }

      return { success: true };
    },

    async deleteMany(query = {}) {
      let req = supabase.from(tableName).delete();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          req = req.eq(key, value);
        }
      }
      const { error } = await req;
      if (error) {
        console.error(`Supabase deleteMany failed on ${tableName}:`, error);
        throw error;
      }
      return { success: true };
    },

    async bulkCreate(records = []) {
      if (!Array.isArray(records) || records.length === 0) return [];
      const now = new Date().toISOString();
      const sanitized = records.map((r) => ({
        id: r.id || generateRecordId(),
        created_date: r.created_date || now,
        updated_date: r.updated_date || now,
        ...r,
      }));

      const { data, error } = await supabase
        .from(tableName)
        .insert(sanitized)
        .select();

      if (error) {
        console.error(`Supabase bulkCreate failed on ${tableName}:`, error);
        throw error;
      }

      return data || [];
    },
  };
}

export function createSupabaseDatabaseAdapter() {
  const entityCache = {};

  return {
    app: {
      async getPublicSettings() {
        try {
          const { data } = await supabase.from("app_settings").select("*");
          const settings = {};
          if (data) {
            for (const row of data) {
              settings[row.key] = row.value;
            }
          }
          return { id: "cng-deal-desk", public_settings: settings };
        } catch {
          return { id: "cng-deal-desk", public_settings: {} };
        }
      },
    },

    auth: {
      async isAuthenticated() {
        const { data: { session } } = await supabase.auth.getSession();
        return Boolean(session?.user);
      },

      async me() {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.user) return null;

        const user = session.user;
        try {
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          if (profile && !error) {
            return {
              id: profile.id,
              email: profile.email,
              username: profile.username,
              name: profile.name,
              role: profile.role,
              last_login: profile.last_login,
              is_active: profile.is_active,
            };
          }
        } catch {
          // Fall back to user metadata if profile not yet committed
        }

        return {
          id: user.id,
          email: user.email,
          username: user.user_metadata?.username || user.email?.split("@")[0] || "user",
          name: user.user_metadata?.name || user.email?.split("@")[0] || "Desk User",
          role: user.user_metadata?.role || "user",
          last_login: user.last_sign_in_at,
          is_active: true,
        };
      },

      async login(credentials) {
        if (!credentials.email || !credentials.password) {
          throw new Error("Email and password are required.");
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email.trim(),
          password: credentials.password,
        });

        if (error) {
          throw new Error(error.message || "Invalid email or password.");
        }

        // Record last login in profiles
        if (data?.user?.id) {
          await supabase
            .from("profiles")
            .update({ last_login: new Date().toISOString() })
            .eq("id", data.user.id);
        }

        return data.user;
      },

      async register(userData) {
        if (userData.password !== userData.confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: userData.email.trim(),
          password: userData.password,
          options: {
            data: {
              name: userData.name?.trim(),
              username: userData.username?.trim(),
              // Role is NOT self-assigned; database trigger sets role to 'user'
            },
          },
        });

        if (error) {
          throw new Error(error.message || "Could not complete registration.");
        }

        return data.user;
      },

      async logout() {
        await supabase.auth.signOut();
        window.location.assign("/login");
      },

      redirectToLogin() {
        if (!["/login", "/register"].includes(window.location.pathname)) {
          window.location.assign("/login");
        }
      },

      async deleteAccount() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return { success: false };
        const userId = session.user.id;

        // Mark user profile as inactive
        await supabase
          .from("profiles")
          .update({ is_active: false })
          .eq("id", userId);

        await supabase.auth.signOut();
        return { success: true };
      },
    },

    entities: new Proxy({}, {
      get(_, entityName) {
        if (!entityCache[entityName]) {
          entityCache[entityName] = createEntityRepository(entityName);
        }
        return entityCache[entityName];
      },
    }),

    offline: {
      saveOfflineTransaction,
      getOfflineTransaction,
      getAllOfflineTransactions,
      deleteOfflineTransaction,
      cacheCounterparties,
      getCachedParties,
    },

    syncEngine: syncEngine,

    identity: {
      requestIdentityDisclosure,
    },

    integrations: {
      Core: {
        async UploadFile(file) {
          try {
            const fileName = `${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage
              .from("evidence")
              .upload(fileName, file);

            if (error) throw error;
            const { data: urlData } = supabase.storage
              .from("evidence")
              .getPublicUrl(data.path);

            return { file_url: urlData.publicUrl };
          } catch (err) {
            console.warn("Evidence upload fell back to local URL:", err);
            return { file_url: URL.createObjectURL(file) };
          }
        },

        async CreateSignedDownloadUrl(filePath, expiresIn = 300) {
          try {
            const { data, error } = await supabase.storage
              .from("evidence")
              .createSignedUrl(filePath, expiresIn);
            if (error) throw error;
            return { signedUrl: data.signedUrl };
          } catch (err) {
            console.warn("Signed URL creation failed:", err);
            return { signedUrl: null, error: err.message };
          }
        },
      },
    },
  };
}

/**
 * Controlled identity disclosure caller.
 * Requests unmasked party contact info via backend RPC function or direct database verification.
 */
export async function requestIdentityDisclosure({
  partyId,
  transactionId = null,
  purpose = "OPERATIONAL",
  reason = "Operational logistics verification",
  user = null,
}) {
  if (!partyId) throw new Error("partyId is required for identity disclosure.");
  if (!reason || reason.trim().length < 5) {
    throw new Error("A business reason of at least 5 characters is required.");
  }

  // 0. Pre-validate permission against authoritative role matrix
  const allowedRoles = purpose === "BANKING"
    ? ["admin", "finance", "compliance"]
    : ["admin", "operations", "field_officer", "operator"];

  const userRole = user?.role || "user";
  const isAuthorized = allowedRoles.includes(userRole);

  if (!isAuthorized) {
    // Record denied attempt in audit log if client is active
    try {
      await supabase.from("disclosure_audit_logs").insert({
        transaction_id: transactionId,
        requesting_user_id: user?.id || null,
        subject_type: "COUNTERPARTY",
        disclosure_purpose: purpose,
        disclosed_fields: [],
        access_timestamp: new Date().toISOString(),
        access_result: "DENIED",
        reason: reason.trim(),
      });
    } catch {}

    throw new Error(`INSUFFICIENT_PERMISSIONS: Role "${userRole}" does not permit disclosure for purpose "${purpose}".`);
  }

  // 1. Attempt server-side Security Definer RPC
  try {
    const { data, error } = await supabase.rpc("request_identity_disclosure", {
      p_party_id: partyId,
      p_transaction_id: transactionId,
      p_purpose: purpose,
      p_reason: reason.trim(),
    });

    if (error) {
      if (error.message?.includes("INSUFFICIENT_PERMISSIONS")) {
        throw new Error(error.message);
      }
      // If RPC doesn't exist yet in local/testing env, fallback to direct query with audit insert
      console.warn("RPC request_identity_disclosure failed, attempting fallback:", error.message);
    } else if (data) {
      return data;
    }
  } catch (rpcErr) {
    if (rpcErr.message?.includes("INSUFFICIENT_PERMISSIONS")) {
      throw rpcErr;
    }
  }

  // 2. Client-side fallback with direct query
  const { data: party, error: partyError } = await supabase
    .from("parties")
    .select("*")
    .eq("id", partyId)
    .single();

  if (partyError || !party) {
    throw new Error(partyError?.message || "Party not found.");
  }

  const subjectType = party.role === "Buyer" ? "BUYER" : party.role === "Supplier" ? "SUPPLIER" : "COUNTERPARTY";

  // Log to disclosure_audit_logs
  await supabase
    .from("disclosure_audit_logs")
    .insert({
      transaction_id: transactionId,
      requesting_user_id: user?.id || null,
      subject_type: subjectType,
      disclosure_purpose: purpose,
      disclosed_fields: isAuthorized ? (purpose === "BANKING" ? ["contact_person", "bank_details"] : ["contact_person", "contact_channel", "district"]) : [],
      access_timestamp: new Date().toISOString(),
      access_result: isAuthorized ? "GRANTED" : "DENIED",
      reason: reason.trim(),
    })
    .catch((err) => console.warn("Failed to write disclosure audit log:", err));

  if (!isAuthorized) {
    throw new Error(`INSUFFICIENT_PERMISSIONS: Role "${userRole}" does not permit disclosure for purpose "${purpose}".`);
  }

  if (purpose === "BANKING") {
    return {
      party_id: party.id,
      name: party.name,
      contact_person: party.contact_person || "—",
      bank_details: party.bank_details || "—",
      purpose: "BANKING",
      disclosed_at: new Date().toISOString(),
    };
  }

  return {
    party_id: party.id,
    name: party.name,
    contact_person: party.contact_person || "—",
    contact_channel: party.contact_channel || "—",
    district: party.district || "—",
    purpose: "OPERATIONAL",
    disclosed_at: new Date().toISOString(),
  };
}

