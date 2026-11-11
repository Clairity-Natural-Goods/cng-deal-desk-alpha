/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — DEAL DECISION MATRIX v1
 *   Module: assets/matrix/DecisionMatrixModule.js
 *   Purpose: Interactive financial decision interface, automated calculation
 *            engine, real-time margin cards, and responsive data grid.
 * ==============================================================================
 */

import { i as reactExport, l as toESM, r as jsxRuntime, t as cn } from "../utils-fF95r_SJ.js";
import {
  COMMODITIES,
  HANDLING_BASIS,
  evaluateDealMatrix,
  validateMatrixInputs,
  formatCurrency,
  formatPercentage,
  parseFinancialInput,
} from "./financialEngine.js";
import {
  saveMatrixRecord,
  getAllMatrixRecords,
  getMatrixStats,
  generateMatrixReference,
  getCachedParties,
} from "../offline/offlineStore.js";
import { syncEngine } from "../offline/syncEngine.js";

const React = toESM(reactExport(), 1);
const { useState, useEffect, useMemo, useCallback } = React;
const { jsx, jsxs } = jsxRuntime();

const DISTRICTS = ["Amuru", "Gulu", "Lira", "Nwoya", "Oyam", "Kitgum", "Apac", "Dokolo", "Kole", "Pader"];

export default function DecisionMatrixModule() {
  const [currentUser, setCurrentUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [parties, setParties] = useState([]);
  const [activeTab, setActiveTab] = useState("grid"); // 'grid' | 'entry'
  const [gridFilter, setGridFilter] = useState("all"); // 'all' | 'positive' | 'negative' | 'review' | 'drafts'
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({ total: 0, drafts: 0, awaitingReview: 0, positiveMargin: 0, negativeMargin: 0, incomplete: 0 });
  const [syncState, setSyncState] = useState(syncEngine.getState());

  // Form State
  const initialFormState = {
    client_id: null,
    reference: "",
    commodity: "Maize",
    volume: "30",
    volume_unit: "MT",
    base_price: "1150",
    price_unit: "UGX/KG",
    transport_cost: "750000",
    handling_cogs: "150000",
    handling_basis: HANDLING_BASIS.TOTAL,
    buyer_name: "",
    supplier_name: "",
    district: "Amuru",
    status: "Draft",
    notes: "",
  };

  const [formData, setFormData] = useState(initialFormState);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Show temporary toast alert
  const showToast = useCallback((msg, type = "success") => {
    setToast({ text: msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Subscribe to sync state
  useEffect(() => {
    const unsub = syncEngine.subscribe((state) => setSyncState(state));
    return () => unsub();
  }, []);

  // Load User, Parties & Matrix Records
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = globalThis.__B44_DB__;
      if (db?.auth?.me) {
        const u = await db.auth.me();
        setCurrentUser(u);
      }

      // Load cached parties
      try {
        const cachedP = await getCachedParties();
        if (cachedP && cachedP.length > 0) {
          setParties(cachedP);
        } else if (db?.entities?.Party) {
          const remoteP = await db.entities.Party.filter({}, { limit: 100 });
          setParties(remoteP || []);
        }
      } catch (err) {
        console.warn("Party load notice:", err);
      }

      // Load Matrix records
      const allRecords = await getAllMatrixRecords();
      setRecords(allRecords);

      const st = await getMatrixStats();
      setStats(st);
    } catch (err) {
      console.warn("Matrix load error:", err);
      showToast("Could not load stored records. Using local state.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-Time Financial Calculations Engine Output
  const financialResult = useMemo(() => {
    return evaluateDealMatrix({
      commodity: formData.commodity,
      volume: formData.volume,
      volumeUnit: formData.volume_unit,
      basePrice: formData.base_price,
      priceUnit: formData.price_unit,
      transportCost: formData.transport_cost,
      handlingCogs: formData.handling_cogs,
      handlingBasis: formData.handling_basis,
    });
  }, [
    formData.commodity,
    formData.volume,
    formData.volume_unit,
    formData.base_price,
    formData.price_unit,
    formData.transport_cost,
    formData.handling_cogs,
    formData.handling_basis,
  ]);

  // Filtered Matrix Records for Grid
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Tab filter
      if (gridFilter === "positive" && (r.net_margin === null || r.net_margin <= 0)) return false;
      if (gridFilter === "negative" && (r.net_margin === null || r.net_margin >= 0)) return false;
      if (gridFilter === "review" && r.status !== "Awaiting Review" && r.status !== "SubmittedForReview") return false;
      if (gridFilter === "drafts" && r.status !== "Draft") return false;

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const refMatch = (r.reference || "").toLowerCase().includes(q);
        const commMatch = (r.commodity || "").toLowerCase().includes(q);
        const buyerMatch = (r.buyer_name || "").toLowerCase().includes(q);
        const supplierMatch = (r.supplier_name || "").toLowerCase().includes(q);
        return refMatch || commMatch || buyerMatch || supplierMatch;
      }
      return true;
    });
  }, [records, gridFilter, searchQuery]);

  // Open Form for New Entry
  const handleOpenNewEntry = () => {
    setFormData({
      ...initialFormState,
      reference: generateMatrixReference(),
      created_by_name: currentUser?.name || "Deal Desk Analyst",
    });
    setValidationErrors({});
    setActiveTab("entry");
  };

  // Open Form to Edit Existing Record
  const handleEditRecord = (rec) => {
    setFormData({
      client_id: rec.client_id,
      reference: rec.reference,
      commodity: rec.commodity || "Maize",
      volume: String(rec.volume !== undefined ? rec.volume : ""),
      volume_unit: rec.volume_unit || "MT",
      base_price: String(rec.base_price !== undefined ? rec.base_price : ""),
      price_unit: rec.price_unit || "UGX/KG",
      transport_cost: String(rec.transport_cost !== undefined ? rec.transport_cost : ""),
      handling_cogs: String(rec.handling_cogs !== undefined ? rec.handling_cogs : ""),
      handling_basis: rec.handling_basis || HANDLING_BASIS.TOTAL,
      buyer_name: rec.buyer_name || "",
      supplier_name: rec.supplier_name || "",
      district: rec.district || "Amuru",
      status: rec.status || "Draft",
      notes: rec.notes || "",
    });
    setValidationErrors({});
    setActiveTab("entry");
  };

  // Save Record (Draft or Submitted)
  const handleSave = async (targetStatus = "Draft") => {
    // Validate inputs
    const { isValid, errors } = validateMatrixInputs({
      commodity: formData.commodity,
      volume: formData.volume,
      basePrice: formData.base_price,
      transportCost: formData.transport_cost,
      handlingCogs: formData.handling_cogs,
    });

    if (!isValid) {
      setValidationErrors(errors);
      showToast("Please resolve the validation errors highlighted below.", "error");
      return;
    }

    setValidationErrors({});
    setIsSaving(true);

    try {
      const recordPayload = {
        client_id: formData.client_id || undefined,
        reference: formData.reference || generateMatrixReference(),
        commodity: formData.commodity,
        volume: Number(formData.volume),
        volume_unit: formData.volume_unit,
        base_price: Number(formData.base_price),
        price_unit: formData.price_unit,
        transport_cost: Number(formData.transport_cost) || 0,
        handling_cogs: Number(formData.handling_cogs) || 0,
        handling_basis: formData.handling_basis,
        gross_revenue: financialResult.grossRevenue,
        total_costs: financialResult.totalCosts,
        net_margin: financialResult.netMargin,
        margin_percentage: financialResult.marginPercentage,
        status: targetStatus,
        buyer_name: formData.buyer_name,
        supplier_name: formData.supplier_name,
        district: formData.district,
        notes: formData.notes,
      };

      await saveMatrixRecord(recordPayload, currentUser);
      showToast(`Transaction ${recordPayload.reference} saved successfully as ${targetStatus}.`, "success");
      await loadData();
      setActiveTab("grid");
    } catch (err) {
      console.error("Save matrix error:", err);
      showToast(`Save error: ${err.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Render Viability Status Badge
  const renderViabilityBadge = (status, pct) => {
    if (status === "STRONG_MARGIN") {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
        children: `Strong Margin (${formatPercentage(pct)})`,
      });
    }
    if (status === "VIABLE_MARGIN") {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300",
        children: `Viable (${formatPercentage(pct)})`,
      });
    }
    if (status === "NEGATIVE_MARGIN") {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300",
        children: `Loss-Making (${formatPercentage(pct)})`,
      });
    }
    if (status === "BREAK_EVEN") {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300",
        children: "Break-Even (0.00%)",
      });
    }
    return jsx("span", {
      className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300",
      children: "Incomplete Inputs",
    });
  };

  return jsxs("div", {
    className: "p-4 md:p-6 max-w-7xl mx-auto space-y-6 font-sans text-slate-900 dark:text-slate-100",
    children: [
      // Floating Toast
      toast &&
        jsx("div", {
          className: cn(
            "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl border text-sm max-w-md transition-all font-medium",
            toast.type === "error" ? "bg-rose-50 text-rose-900 border-rose-300" : "bg-emerald-50 text-emerald-900 border-emerald-300"
          ),
          children: toast.text,
        }),

      // Header Banner
      jsxs("header", {
        className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800",
        children: [
          jsxs("div", {
            children: [
              jsx("div", {
                className: "text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400",
                children: "CNG Deal Desk • Financial Underwriting",
              }),
              jsx("h1", {
                className: "text-2xl md:text-3xl font-black tracking-tight mt-1",
                children: "Deal Decision Matrix v1",
              }),
              jsx("p", {
                className: "text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl",
                children: "Automated Gross Revenue, Total Costs, Net Margin, and Cost-Basis Underwriting Engine. Replaces guesswork with decimal-safe financial analytics.",
              }),
            ],
          }),

          // Action & Connectivity Box
          jsxs("div", {
            className: "flex flex-wrap items-center gap-2",
            children: [
              // Connection badge
              jsxs("span", {
                className: cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border",
                  syncState.isOnline ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-amber-50 text-amber-800 border-amber-300"
                ),
                children: [
                  jsx("span", { className: cn("w-2 h-2 rounded-full", syncState.isOnline ? "bg-emerald-500" : "bg-amber-500 animate-pulse") }),
                  syncState.isOnline ? "Online" : "Offline Storage Active",
                ],
              }),

              // New Entry Button
              jsx("button", {
                type: "button",
                onClick: handleOpenNewEntry,
                className: "px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition-all",
                children: "+ New Matrix Entry",
              }),
            ],
          }),
        ],
      }),

      // Matrix Overview Summary Cards
      jsxs("section", {
        className: "grid grid-cols-2 md:grid-cols-6 gap-3",
        children: [
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide", children: "Total Records" }),
              jsx("div", { className: "text-2xl font-black mt-1", children: stats.total }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-slate-500 uppercase tracking-wide", children: "Drafts" }),
              jsx("div", { className: "text-2xl font-black text-slate-700 dark:text-slate-300 mt-1", children: stats.drafts }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-purple-600 uppercase tracking-wide", children: "Awaiting Review" }),
              jsx("div", { className: "text-2xl font-black text-purple-600 mt-1", children: stats.awaitingReview }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-emerald-600 uppercase tracking-wide", children: "Positive Margin" }),
              jsx("div", { className: "text-2xl font-black text-emerald-600 mt-1", children: stats.positiveMargin }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-rose-600 uppercase tracking-wide", children: "Negative Margin" }),
              jsx("div", { className: "text-2xl font-black text-rose-600 mt-1", children: stats.negativeMargin }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-amber-600 uppercase tracking-wide", children: "Incomplete" }),
              jsx("div", { className: "text-2xl font-black text-amber-600 mt-1", children: stats.incomplete }),
            ],
          }),
        ],
      }),

      // TAB NAVIGATION (Overview Grid vs New Entry)
      jsxs("div", {
        className: "flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2",
        children: [
          jsx("button", {
            type: "button",
            onClick: () => setActiveTab("grid"),
            className: cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all",
              activeTab === "grid" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            ),
            children: "Matrix Financial Grid",
          }),
          jsx("button", {
            type: "button",
            onClick: () => setActiveTab("entry"),
            className: cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all",
              activeTab === "entry" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            ),
            children: formData.client_id ? `Edit: ${formData.reference}` : "New Financial Entry",
          }),
        ],
      }),

      // VIEW 1: NEW FINANCIAL ENTRY & REAL-TIME RESULT CARDS
      activeTab === "entry"
        ? jsxs("div", {
            className: "grid grid-cols-1 lg:grid-cols-3 gap-6",
            children: [
              // Left 2 Columns: Financial Entry Form
              jsxs("div", {
                className: "lg:col-span-2 space-y-6",
                children: [
                  jsxs("div", {
                    className: "p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5",
                    children: [
                      jsxs("div", {
                        className: "border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center",
                        children: [
                          jsxs("div", {
                            children: [
                              jsx("h2", { className: "text-lg font-bold", children: "Financial Parameters Entry" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "All 5 mandatory commercial fields update calculations instantaneously." }),
                            ],
                          }),
                          jsx("span", { className: "font-mono text-xs font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded", children: formData.reference }),
                        ],
                      }),

                      // The 5 Mandatory Fields Grid
                      jsxs("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                        children: [
                          // Field A: Commodity
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "A. Commodity *" }),
                              jsx("select", {
                                value: formData.commodity,
                                onChange: (e) => setFormData({ ...formData, commodity: e.target.value }),
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                children: COMMODITIES.map((c) =>
                                  jsx("option", { value: c.name, children: `${c.name} (${c.category})` }, c.name)
                                ),
                              }),
                              validationErrors.commodity && jsx("p", { className: "text-rose-600 text-[11px]", children: validationErrors.commodity }),
                            ],
                          }),

                          // Field B: Volume & Unit
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "B. Volume *" }),
                              jsxs("div", {
                                className: "flex gap-2",
                                children: [
                                  jsx("input", {
                                    type: "number",
                                    step: "0.1",
                                    min: "0",
                                    value: formData.volume,
                                    onChange: (e) => setFormData({ ...formData, volume: e.target.value }),
                                    placeholder: "e.g. 30",
                                    className: cn(
                                      "w-full p-2.5 rounded-xl border bg-transparent font-normal",
                                      validationErrors.volume ? "border-rose-500" : "border-slate-300 dark:border-slate-700"
                                    ),
                                  }),
                                  jsx("select", {
                                    value: formData.volume_unit,
                                    onChange: (e) => setFormData({ ...formData, volume_unit: e.target.value }),
                                    className: "w-24 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-bold",
                                    children: [
                                      jsx("option", { value: "MT", children: "MT" }),
                                      jsx("option", { value: "KG", children: "KG" }),
                                    ],
                                  }),
                                ],
                              }),
                              validationErrors.volume && jsx("p", { className: "text-rose-600 text-[11px]", children: validationErrors.volume }),
                            ],
                          }),

                          // Field C: Base Price
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "C. Base Price (UGX) *" }),
                              jsxs("div", {
                                className: "flex gap-2",
                                children: [
                                  jsx("input", {
                                    type: "number",
                                    step: "1",
                                    min: "0",
                                    value: formData.base_price,
                                    onChange: (e) => setFormData({ ...formData, base_price: e.target.value }),
                                    placeholder: "e.g. 1150",
                                    className: cn(
                                      "w-full p-2.5 rounded-xl border bg-transparent font-normal",
                                      validationErrors.basePrice ? "border-rose-500" : "border-slate-300 dark:border-slate-700"
                                    ),
                                  }),
                                  jsx("select", {
                                    value: formData.price_unit,
                                    onChange: (e) => setFormData({ ...formData, price_unit: e.target.value }),
                                    className: "w-32 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-bold",
                                    children: [
                                      jsx("option", { value: "UGX/KG", children: "UGX / KG" }),
                                      jsx("option", { value: "UGX/MT", children: "UGX / MT" }),
                                    ],
                                  }),
                                ],
                              }),
                              validationErrors.basePrice && jsx("p", { className: "text-rose-600 text-[11px]", children: validationErrors.basePrice }),
                            ],
                          }),

                          // Field D: Transport Cost
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "D. Total Transport Cost (UGX) *" }),
                              jsx("input", {
                                type: "number",
                                step: "1000",
                                min: "0",
                                value: formData.transport_cost,
                                onChange: (e) => setFormData({ ...formData, transport_cost: e.target.value }),
                                placeholder: "e.g. 750000",
                                className: cn(
                                  "w-full p-2.5 rounded-xl border bg-transparent font-normal",
                                  validationErrors.transportCost ? "border-rose-500" : "border-slate-300 dark:border-slate-700"
                                ),
                              }),
                              validationErrors.transportCost && jsx("p", { className: "text-rose-600 text-[11px]", children: validationErrors.transportCost }),
                            ],
                          }),

                          // Field E: Handling COGS & Cost Basis Selector
                          jsxs("div", {
                            className: "md:col-span-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3",
                            children: [
                              jsxs("div", {
                                className: "flex justify-between items-center",
                                children: [
                                  jsx("label", { className: "font-bold text-slate-800 dark:text-slate-200", children: "E. Handling COGS & Explicit Cost Basis *" }),
                                  jsx("span", { className: "text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold", children: "Configurable Basis" }),
                                ],
                              }),
                              jsxs("div", {
                                className: "grid grid-cols-1 md:grid-cols-2 gap-3",
                                children: [
                                  jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      jsx("span", { className: "text-[11px] text-slate-500", children: "Handling Amount (UGX)" }),
                                      jsx("input", {
                                        type: "number",
                                        step: "100",
                                        min: "0",
                                        value: formData.handling_cogs,
                                        onChange: (e) => setFormData({ ...formData, handling_cogs: e.target.value }),
                                        placeholder: "e.g. 150000 or 25000",
                                        className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      jsx("span", { className: "text-[11px] text-slate-500", children: "Calculation Basis" }),
                                      jsx("select", {
                                        value: formData.handling_basis,
                                        onChange: (e) => setFormData({ ...formData, handling_basis: e.target.value }),
                                        className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold",
                                        children: [
                                          jsx("option", { value: HANDLING_BASIS.TOTAL, children: "Total Transaction Cost (Flat UGX)" }),
                                          jsx("option", { value: HANDLING_BASIS.PER_MT, children: "Per Metric Tonne (UGX per MT)" }),
                                          jsx("option", { value: HANDLING_BASIS.PER_KG, children: "Per Kilogram (UGX per KG)" }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                              jsx("p", {
                                className: "text-[11px] text-slate-500",
                                children: formData.handling_basis === HANDLING_BASIS.TOTAL
                                  ? "Flat handling cost applied once across the entire transaction."
                                  : `Per-unit handling cost: Total handling cost = Volume (${formData.volume || 0} ${formData.volume_unit}) × Rate.`,
                              }),
                            ],
                          }),

                          // Optional: Counterparties & Corridor
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { children: "Buyer Counterparty" }),
                              jsx("input", {
                                type: "text",
                                value: formData.buyer_name,
                                onChange: (e) => setFormData({ ...formData, buyer_name: e.target.value }),
                                placeholder: "e.g. Gulu Grain Millers Ltd",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { children: "Supplier / Farmer Cooperative" }),
                              jsx("input", {
                                type: "text",
                                value: formData.supplier_name,
                                onChange: (e) => setFormData({ ...formData, supplier_name: e.target.value }),
                                placeholder: "e.g. Amuru Farmers Co-op",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { children: "Corridor District" }),
                              jsx("select", {
                                value: formData.district,
                                onChange: (e) => setFormData({ ...formData, district: e.target.value }),
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                children: DISTRICTS.map((d) => jsx("option", { value: d, children: d }, d)),
                              }),
                            ],
                          }),
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { children: "Commercial Notes" }),
                              jsx("input", {
                                type: "text",
                                value: formData.notes,
                                onChange: (e) => setFormData({ ...formData, notes: e.target.value }),
                                placeholder: "Payment tranches, weighbridge clauses...",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),
                        ],
                      }),

                      // Form Buttons
                      jsxs("div", {
                        className: "flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800",
                        children: [
                          jsx("button", {
                            type: "button",
                            onClick: () => setActiveTab("grid"),
                            className: "px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                            children: "Cancel / Back to Grid",
                          }),
                          jsxs("div", {
                            className: "flex gap-2",
                            children: [
                              jsx("button", {
                                type: "button",
                                onClick: () => handleSave("Draft"),
                                disabled: isSaving,
                                className: "px-4 py-2 text-xs font-bold rounded-xl border border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40",
                                children: isSaving ? "Saving..." : "Save as Draft",
                              }),
                              jsx("button", {
                                type: "button",
                                onClick: () => handleSave("Awaiting Review"),
                                disabled: isSaving,
                                className: "px-5 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md transition-all",
                                children: isSaving ? "Submitting..." : "Submit for Deal Desk Review",
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),

              // Right 1 Column: Real-Time Calculated Result Cards
              jsxs("div", {
                className: "space-y-4",
                children: [
                  jsx("div", {
                    className: "text-xs font-bold uppercase tracking-wider text-slate-500",
                    children: "Calculated Financial Summary",
                  }),

                  // 1. Gross Revenue Card
                  jsxs("div", {
                    className: "p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1",
                    children: [
                      jsx("div", { className: "text-[11px] font-bold uppercase text-slate-500", children: "1. Gross Revenue" }),
                      jsx("div", { className: "text-2xl font-black text-slate-900 dark:text-slate-100", children: formatCurrency(financialResult.grossRevenue) }),
                      jsx("div", {
                        className: "text-[11px] text-slate-400 font-mono",
                        children: `${formData.volume || 0} ${formData.volume_unit} @ ${formatCurrency(formData.base_price)}/${formData.price_unit.includes("MT") ? "MT" : "kg"}`,
                      }),
                    ],
                  }),

                  // 2. Total Costs Card
                  jsxs("div", {
                    className: "p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1",
                    children: [
                      jsx("div", { className: "text-[11px] font-bold uppercase text-slate-500", children: "2. Total Costs" }),
                      jsx("div", { className: "text-2xl font-black text-slate-800 dark:text-slate-200", children: formatCurrency(financialResult.totalCosts) }),
                      jsxs("div", {
                        className: "text-[11px] text-slate-400",
                        children: [
                          "Transport: ",
                          formatCurrency(formData.transport_cost),
                          " • Handling: ",
                          formatCurrency(formData.handling_cogs),
                          " (",
                          formData.handling_basis,
                          ")",
                        ],
                      }),
                    ],
                  }),

                  // 3. Net Margin Card
                  jsxs("div", {
                    className: cn(
                      "p-4 rounded-2xl border shadow-sm space-y-1 transition-all",
                      financialResult.netMargin === null
                        ? "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        : financialResult.netMargin > 0
                        ? "bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800"
                        : "bg-rose-50/80 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800"
                    ),
                    children: [
                      jsx("div", {
                        className: cn(
                          "text-[11px] font-bold uppercase",
                          financialResult.netMargin > 0 ? "text-emerald-800 dark:text-emerald-300" : financialResult.netMargin < 0 ? "text-rose-800 dark:text-rose-300" : "text-slate-500"
                        ),
                        children: "3. Net Margin",
                      }),
                      jsx("div", {
                        className: cn(
                          "text-2xl font-extrabold",
                          financialResult.netMargin > 0 ? "text-emerald-700 dark:text-emerald-300" : financialResult.netMargin < 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-slate-300"
                        ),
                        children: formatCurrency(financialResult.netMargin),
                      }),
                      jsx("div", {
                        className: "text-[11px] text-slate-500",
                        children: "Gross Revenue − Total Costs",
                      }),
                    ],
                  }),

                  // 4. Margin Percentage Card
                  jsxs("div", {
                    className: "p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2",
                    children: [
                      jsx("div", { className: "text-[11px] font-bold uppercase text-slate-500", children: "4. Margin Percentage" }),
                      jsx("div", { className: "text-2xl font-black", children: formatPercentage(financialResult.marginPercentage) }),
                      jsx("div", {
                        children: renderViabilityBadge(financialResult.commercialStatus, financialResult.marginPercentage),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          })
        : // VIEW 2: FINANCIAL DATA GRID (TABLE)
          jsxs("div", {
            className: "space-y-4",
            children: [
              // Search & Filter Bar
              jsxs("div", {
                className: "flex flex-col sm:flex-row items-center justify-between gap-3",
                children: [
                  jsxs("div", {
                    className: "flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 w-full sm:w-auto text-xs",
                    children: [
                      [
                        { id: "all", label: `All (${records.length})` },
                        { id: "positive", label: `Positive Margin (${stats.positiveMargin})` },
                        { id: "negative", label: `Negative Margin (${stats.negativeMargin})` },
                        { id: "review", label: `Review (${stats.awaitingReview})` },
                        { id: "drafts", label: `Drafts (${stats.drafts})` },
                      ].map((t) =>
                        jsx(
                          "button",
                          {
                            key: t.id,
                            type: "button",
                            onClick: () => setGridFilter(t.id),
                            className: cn(
                              "px-3 py-1.5 rounded-lg font-semibold transition-all",
                              gridFilter === t.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                            ),
                            children: t.label,
                          },
                          t.id
                        )
                      ),
                    ],
                  }),

                  // Search box
                  jsx("input", {
                    type: "text",
                    placeholder: "Search reference, commodity, party...",
                    value: searchQuery,
                    onChange: (e) => setSearchQuery(e.target.value),
                    className: "w-full sm:w-72 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-emerald-600",
                  }),
                ],
              }),

              // Data Table
              isLoading
                ? jsx("div", { className: "py-20 text-center text-sm text-slate-500", children: "Loading Decision Matrix records…" })
                : filteredRecords.length === 0
                ? jsxs("div", {
                    className: "py-16 text-center border border-dashed rounded-2xl border-slate-300 dark:border-slate-800 space-y-3",
                    children: [
                      jsx("p", { className: "text-sm text-slate-500", children: "No matrix financial records found matching this view." }),
                      jsx("button", {
                        type: "button",
                        onClick: handleOpenNewEntry,
                        className: "px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white",
                        children: "Create First Transaction",
                      }),
                    ],
                  })
                : jsx("div", {
                    className: "overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                    children: jsxs("table", {
                      className: "w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800",
                      children: [
                        jsx("thead", {
                          className: "bg-slate-50 dark:bg-slate-800/50 font-bold uppercase tracking-wider text-[11px] text-slate-500",
                          children: jsxs("tr", {
                            children: [
                              jsx("th", { className: "p-3.5", children: "Reference" }),
                              jsx("th", { className: "p-3.5", children: "Commodity" }),
                              jsx("th", { className: "p-3.5", children: "Volume" }),
                              jsx("th", { className: "p-3.5", children: "Base Price" }),
                              jsx("th", { className: "p-3.5", children: "Transport Cost" }),
                              jsx("th", { className: "p-3.5", children: "Handling COGS" }),
                              jsx("th", { className: "p-3.5", children: "Gross Revenue" }),
                              jsx("th", { className: "p-3.5", children: "Net Margin" }),
                              jsx("th", { className: "p-3.5", children: "Margin %" }),
                              jsx("th", { className: "p-3.5", children: "Status" }),
                              jsx("th", { className: "p-3.5 text-right", children: "Action" }),
                            ],
                          }),
                        }),
                        jsx("tbody", {
                          className: "divide-y divide-slate-100 dark:divide-slate-800",
                          children: filteredRecords.map((r) => {
                            const isPositive = r.net_margin !== null && r.net_margin > 0;
                            const isNegative = r.net_margin !== null && r.net_margin < 0;
                            return jsxs(
                              "tr",
                              {
                                className: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors",
                                children: [
                                  jsxs("td", {
                                    className: "p-3.5 font-mono font-bold text-slate-900 dark:text-slate-100",
                                    children: [
                                      r.reference,
                                      r.buyer_name ? jsxs("div", { className: "text-[10px] font-sans font-normal text-slate-400 truncate max-w-[120px]", children: ["To: ", r.buyer_name] }) : null,
                                    ],
                                  }),
                                  jsx("td", { className: "p-3.5 font-medium", children: r.commodity }),
                                  jsx("td", { className: "p-3.5 font-mono", children: `${r.volume} ${r.volume_unit || "MT"}` }),
                                  jsx("td", { className: "p-3.5 font-mono", children: formatCurrency(r.base_price) }),
                                  jsx("td", { className: "p-3.5 font-mono", children: formatCurrency(r.transport_cost) }),
                                  jsxs("td", {
                                    className: "p-3.5 font-mono",
                                    children: [
                                      formatCurrency(r.handling_cogs),
                                      jsx("span", {
                                        className: "ml-1 text-[10px] text-slate-400",
                                        children: r.handling_basis === "TOTAL" ? "(flat)" : `(${r.handling_basis.toLowerCase().replace("_", "/")})`,
                                      }),
                                    ],
                                  }),
                                  jsx("td", { className: "p-3.5 font-mono font-bold", children: formatCurrency(r.gross_revenue) }),
                                  jsx("td", {
                                    className: cn(
                                      "p-3.5 font-mono font-bold",
                                      isPositive ? "text-emerald-600 dark:text-emerald-400" : isNegative ? "text-rose-600 dark:text-rose-400" : "text-slate-500"
                                    ),
                                    children: formatCurrency(r.net_margin),
                                  }),
                                  jsx("td", {
                                    className: cn(
                                      "p-3.5 font-mono font-bold",
                                      isPositive ? "text-emerald-600" : isNegative ? "text-rose-600" : "text-slate-500"
                                    ),
                                    children: formatPercentage(r.margin_percentage),
                                  }),
                                  jsx("td", {
                                    className: "p-3.5",
                                    children: jsx("span", {
                                      className: cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase",
                                        r.status === "Approved"
                                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                                          : r.status === "Awaiting Review"
                                          ? "bg-purple-50 text-purple-800 border border-purple-300"
                                          : "bg-slate-100 text-slate-700 border border-slate-300"
                                      ),
                                      children: r.status,
                                    }),
                                  }),
                                  jsx("td", {
                                    className: "p-3.5 text-right",
                                    children: jsx("button", {
                                      type: "button",
                                      onClick: () => handleEditRecord(r),
                                      className: "px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 transition-all",
                                      children: "Open →",
                                    }),
                                  }),
                                ],
                              },
                              r.client_id || r.reference
                            );
                          }),
                        }),
                      ],
                    }),
                  }),
            ],
          }),
    ],
  });
}
