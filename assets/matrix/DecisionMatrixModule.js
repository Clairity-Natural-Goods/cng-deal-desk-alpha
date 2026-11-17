/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — DEAL DECISION MATRIX v1
 *   Module: assets/matrix/DecisionMatrixModule.js
 *   Purpose: Interactive financial decision interface, automated 5-section
 *            underwriting engine, real-time margin cards, buyer delivered-cost
 *            coverage, CNG retained service economics, 10-point READY gating,
 *            and responsive data grid.
 * ==============================================================================
 */

import { i as reactExport, l as toESM, r as jsxRuntime, t as cn } from "../utils-fF95r_SJ.js";
import {
  COMMODITIES,
  HANDLING_BASIS,
  COVERAGE_STATUS,
  FEE_ACCEPTANCE,
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
const LANES = [
  "Northern Corridor (Gulu - Lira)",
  "Amuru - Gulu Regional Trunk",
  "Nwoya - Kampala Commercial Lane",
  "Lira - Soroti Eastern Route",
  "Kitgum - Gulu Feeder Highway",
  "Apac - Lira Agro-Transit",
];

export default function DecisionMatrixModule() {
  const [currentUser, setCurrentUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [parties, setParties] = useState([]);
  const [activeTab, setActiveTab] = useState("grid"); // 'grid' | 'entry' | 'detail'
  const [gridFilter, setGridFilter] = useState("all"); // 'all' | 'positive' | 'negative' | 'review' | 'ready' | 'drafts'
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({ total: 0, drafts: 0, awaitingReview: 0, positiveMargin: 0, negativeMargin: 0, incomplete: 0, ready: 0 });
  const [syncState, setSyncState] = useState(syncEngine.getState());

  // Form State with All 5 Sections Supported
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
    buyer_agreed_price: "1350",
    is_buyer_agreed: true,
    buyer_name: "",
    supplier_name: "",
    district: "Amuru",
    lane: "Northern Corridor (Gulu - Lira)",
    status: "Draft",
    notes: "",
    // CNG Service Economics
    proposed_service_fee: "500000",
    is_fee_accepted: true,
    service_fee_evidence: "PO-2026-CNG-01 Terms Accepted",
    operating_cost: "120000",
    // 10-Point Operational Readiness checklist state
    buyer_verified: true,
    supplier_verified: true,
    specs_defined: true,
    volume_confirmed: true,
    pricing_locked: true,
    transport_confirmed: true,
    docs_attached: true,
    supervisory_approved: false,
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

      // 1. Load Matrix records locally for immediate display (survives hard refresh)
      let allRecords = await getAllMatrixRecords();
      setRecords(allRecords);

      // 2. Reconcile with remote Supabase transactions if online
      if (typeof navigator === "undefined" || navigator.onLine) {
        await syncEngine.fetchCloudAndMerge();
        allRecords = await getAllMatrixRecords();
        setRecords(allRecords);
      }

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
      buyerPricePerKg: formData.buyer_agreed_price,
      isBuyerAgreed: formData.is_buyer_agreed,
      serviceFees: formData.proposed_service_fee ? [
        {
          id: "fee_cng_desk_1",
          category: "Quality Assay & Escrow Facilitation",
          amount: formData.proposed_service_fee,
          payer: "Buyer",
          acceptanceStatus: formData.is_fee_accepted ? FEE_ACCEPTANCE.ACCEPTED : FEE_ACCEPTANCE.PROPOSED,
          acceptanceEvidence: formData.service_fee_evidence || "Commercial Agreement",
          relatedCost: formData.operating_cost || 0,
        }
      ] : [],
      serviceOperatingCosts: {
        costField: formData.operating_cost || 0,
        overheadPct: 15,
      },
      lane: formData.lane,
      userRole: currentUser?.role || "user",
      buyerTermsEvidenced: formData.is_buyer_agreed && Boolean(formData.buyer_name || formData.buyer_agreed_price),
      supplierVerified: formData.supplier_verified,
      logisticsWorkable: formData.transport_confirmed,
      paymentApproved: true,
      feeAcceptanceDocumented: formData.is_fee_accepted,
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
    formData.buyer_agreed_price,
    formData.is_buyer_agreed,
    formData.buyer_name,
    formData.proposed_service_fee,
    formData.is_fee_accepted,
    formData.service_fee_evidence,
    formData.operating_cost,
    formData.lane,
    formData.supplier_verified,
    formData.transport_confirmed,
    currentUser?.role,
  ]);

  // Filtered Matrix Records for Grid
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Tab filter
      if (gridFilter === "positive" && (r.net_margin === null || r.net_margin <= 0)) return false;
      if (gridFilter === "negative" && (r.net_margin === null || r.net_margin >= 0)) return false;
      if (gridFilter === "review" && r.status !== "Awaiting Review" && r.status !== "SubmittedForReview") return false;
      if (gridFilter === "ready" && r.ready_status !== "READY" && r.status !== "Approved" && r.status !== "Ready") return false;
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
      created_by_name: currentUser?.name || currentUser?.email || "Deal Desk Analyst",
    });
    setValidationErrors({});
    setActiveTab("entry");
  };

  // Open Form to Edit or Inspect Existing Record
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
      buyer_agreed_price: String(rec.buyer_agreed_price !== undefined ? rec.buyer_agreed_price : "1350"),
      is_buyer_agreed: rec.is_buyer_agreed !== undefined ? Boolean(rec.is_buyer_agreed) : true,
      buyer_name: rec.buyer_name || "",
      supplier_name: rec.supplier_name || "",
      district: rec.district || "Amuru",
      lane: rec.lane || "Northern Corridor (Gulu - Lira)",
      status: rec.status || "Draft",
      notes: rec.notes || "",
      proposed_service_fee: String(rec.proposed_service_fee !== undefined ? rec.proposed_service_fee : "500000"),
      is_fee_accepted: rec.is_fee_accepted !== undefined ? Boolean(rec.is_fee_accepted) : true,
      service_fee_evidence: rec.service_fee_evidence || "Commercial Contract",
      operating_cost: String(rec.operating_cost !== undefined ? rec.operating_cost : "120000"),
      buyer_verified: rec.buyer_verified !== undefined ? Boolean(rec.buyer_verified) : true,
      supplier_verified: rec.supplier_verified !== undefined ? Boolean(rec.supplier_verified) : true,
      specs_defined: rec.specs_defined !== undefined ? Boolean(rec.specs_defined) : true,
      volume_confirmed: rec.volume_confirmed !== undefined ? Boolean(rec.volume_confirmed) : true,
      pricing_locked: rec.pricing_locked !== undefined ? Boolean(rec.pricing_locked) : true,
      transport_confirmed: rec.transport_confirmed !== undefined ? Boolean(rec.transport_confirmed) : true,
      docs_attached: rec.docs_attached !== undefined ? Boolean(rec.docs_attached) : true,
      supervisory_approved: rec.status === "Approved" || Boolean(rec.supervisory_approved),
    });
    setValidationErrors({});
    setActiveTab("entry");
  };

  // Save Record (Draft, Submitted, or Approved)
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
      showToast("Please resolve the required cost and parameter errors.", "error");
      return;
    }

    // Check READY status constraints if promoting to Approved/READY
    if (targetStatus === "Approved" && !financialResult.readyReadiness.isReady) {
      showToast(`Cannot approve: ${financialResult.readyReadiness.blockers[0]}`, "error");
      return;
    }

    setValidationErrors({});
    setIsSaving(true);

    try {
      const isReadyForExecution = financialResult.readyReadiness.isReady;
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
        ready_status: isReadyForExecution ? "READY" : "BLOCKED",
        ready_blockers: financialResult.readyReadiness.blockers,
        buyer_agreed_price: Number(formData.buyer_agreed_price) || 0,
        is_buyer_agreed: formData.is_buyer_agreed,
        buyer_coverage_status: financialResult.buyerCoverage?.status,
        buyer_coverage_diff: financialResult.buyerCoverage?.difference,
        buyer_coverage_pct: financialResult.buyerCoverage?.coveragePercentage,
        delivered_cost: financialResult.buyerCoverage?.deliveredCost,
        proposed_service_fee: Number(formData.proposed_service_fee) || 0,
        is_fee_accepted: formData.is_fee_accepted,
        service_fee_evidence: formData.service_fee_evidence,
        cng_retained_contribution: financialResult.cngServiceEconomics?.retainedContribution,
        buyer_name: formData.buyer_name,
        supplier_name: formData.supplier_name,
        district: formData.district,
        lane: formData.lane,
        notes: formData.notes,
        buyer_verified: formData.buyer_verified,
        supplier_verified: formData.supplier_verified,
        specs_defined: formData.specs_defined,
        volume_confirmed: formData.volume_confirmed,
        pricing_locked: formData.pricing_locked,
        transport_confirmed: formData.transport_confirmed,
        docs_attached: formData.docs_attached,
        supervisory_approved: targetStatus === "Approved" || formData.supervisory_approved,
      };

      await saveMatrixRecord(recordPayload, currentUser);
      showToast(`Transaction ${recordPayload.reference} saved successfully as ${targetStatus}.`, "success");
      await loadData();
      if (syncState.isOnline) {
        syncEngine.syncPendingTransactions().then(() => loadData()).catch(() => {});
      }
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

  // Render Buyer Coverage Badge
  const renderCoverageBadge = (coverage) => {
    if (!coverage) return null;
    if (coverage.status === COVERAGE_STATUS.COVERED) {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
        children: `Delivered Cost Covered (${coverage.coveragePercentage}%)`,
      });
    }
    if (coverage.status === COVERAGE_STATUS.NOT_COVERED) {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300",
        children: `Delivered Cost Shortfall (${coverage.coveragePercentage}%)`,
      });
    }
    if (coverage.status === COVERAGE_STATUS.INCOMPLETE) {
      return jsx("span", {
        className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300",
        children: "Incomplete — Costs Missing",
      });
    }
    return jsx("span", {
      className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300",
      children: "Awaiting Buyer Terms",
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
            toast.type === "error" ? "bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200" : "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200"
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
                children: "CNG Deal Desk • Financial Underwriting & Operational Readiness",
              }),
              jsx("h1", {
                className: "text-2xl md:text-3xl font-black tracking-tight mt-1",
                children: "Deal Decision Matrix v1",
              }),
              jsx("p", {
                className: "text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl",
                children: "Automated Gross Revenue, Total Costs, Net Margin, Buyer Coverage, CNG Retained Service Economics, and 10-Point Readiness Gating Engine.",
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
                  syncState.isOnline ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-800 border-amber-300"
                ),
                children: [
                  jsx("span", { className: cn("w-2 h-2 rounded-full", syncState.isOnline ? "bg-emerald-500" : "bg-amber-500 animate-pulse") }),
                  syncState.isOnline ? "Production Database Online" : "Offline Storage Active",
                ],
              }),

              // New Entry Button
              jsx("button", {
                type: "button",
                onClick: handleOpenNewEntry,
                className: "px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition-all",
                children: "+ New Matrix Underwriting",
              }),
            ],
          }),
        ],
      }),

      // Summary Metric Cards
      jsxs("section", {
        className: "grid grid-cols-2 md:grid-cols-6 gap-3",
        children: [
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide", children: "Total Deals" }),
              jsx("div", { className: "text-2xl font-black text-slate-900 dark:text-white mt-1", children: stats.total }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide", children: "Drafts" }),
              jsx("div", { className: "text-2xl font-black text-slate-900 dark:text-slate-100 mt-1", children: stats.drafts }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide", children: "Awaiting Review" }),
              jsx("div", { className: "text-2xl font-black text-blue-600 dark:text-blue-400 mt-1", children: stats.awaitingReview }),
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
              jsx("div", { className: "text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide", children: "Ready for Execution" }),
              jsx("div", { className: "text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1", children: stats.ready || 0 }),
            ],
          }),
          jsxs("div", {
            className: "p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
            children: [
              jsx("div", { className: "text-[11px] font-bold text-rose-600 uppercase tracking-wide", children: "Negative Margin" }),
              jsx("div", { className: "text-2xl font-black text-rose-600 mt-1", children: stats.negativeMargin }),
            ],
          }),
        ],
      }),

      // TAB NAVIGATION (Overview Grid vs Parameter Entry)
      jsxs("div", {
        className: "flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2",
        children: [
          jsx("button", {
            type: "button",
            onClick: () => setActiveTab("grid"),
            className: cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all border shadow-xs",
              activeTab === "grid"
                ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-sm"
                : "bg-white text-slate-900 border-slate-300 hover:bg-slate-100 hover:text-black dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700"
            ),
            children: "Matrix Financial Grid",
          }),
          jsx("button", {
            type: "button",
            onClick: () => setActiveTab("entry"),
            className: cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all border shadow-xs",
              activeTab === "entry"
                ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-sm"
                : "bg-white text-slate-900 border-slate-300 hover:bg-slate-100 hover:text-black dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700"
            ),
            children: formData.client_id ? `Review / Underwrite: ${formData.reference}` : "New Financial Entry",
          }),
        ],
      }),

      // VIEW 1: 5-SECTION FINANCIAL PARAMETERS & REAL-TIME RESULT CARDS
      activeTab === "entry"
        ? jsxs("div", {
            className: "grid grid-cols-1 lg:grid-cols-3 gap-6",
            children: [
              // Left 2 Columns: 5-Section Underwriting Form
              jsxs("div", {
                className: "lg:col-span-2 space-y-6",
                children: [
                  // Missing Cost Alert Defense Banner
                  (financialResult.costClassification?.transport?.isMissing || financialResult.costClassification?.handling?.isMissing) &&
                    jsxs("div", {
                      className: "p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3 shadow-sm",
                      children: [
                        jsx("span", { className: "text-lg", children: "⚠️" }),
                        jsxs("div", {
                          children: [
                            jsx("strong", { className: "font-bold block text-sm", children: "Missing Cost Defense Active" }),
                            jsx("span", {
                              children: "One or more required operational costs (Transport or Handling COGS) have not been entered. CNG Deal Desk strictly enforces full-cost underwriting and rejects silent zero substitution to ensure transaction solvency.",
                            }),
                          ],
                        }),
                      ],
                    }),

                  // SECTION A: TRANSACTION OVERVIEW
                  jsxs("div", {
                    className: "p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4",
                    children: [
                      jsxs("div", {
                        className: "border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center",
                        children: [
                          jsxs("div", {
                            children: [
                              jsx("span", { className: "text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest", children: "Section A" }),
                              jsx("h2", { className: "text-lg font-bold", children: "Transaction Overview & Corridor" }),
                            ],
                          }),
                          jsx("span", { className: "font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-md border", children: formData.reference }),
                        ],
                      }),

                      jsxs("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                        children: [
                          // Commodity
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Commodity *" }),
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

                          // Volume & Unit
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Volume *" }),
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

                          // Buyer Counterparty
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { className: "font-semibold", children: "Buyer Counterparty *" }),
                              jsx("input", {
                                type: "text",
                                value: formData.buyer_name,
                                onChange: (e) => setFormData({ ...formData, buyer_name: e.target.value }),
                                placeholder: "e.g. Gulu Grain Millers Consortium",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),

                          // Supplier Counterparty
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { className: "font-semibold", children: "Supplier / Farmer Cooperative *" }),
                              jsx("input", {
                                type: "text",
                                value: formData.supplier_name,
                                onChange: (e) => setFormData({ ...formData, supplier_name: e.target.value }),
                                placeholder: "e.g. Amuru United Farmers Co-op",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),

                          // Corridor Lane
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { className: "font-semibold", children: "Corridor / Lane *" }),
                              jsx("select", {
                                value: formData.lane,
                                onChange: (e) => setFormData({ ...formData, lane: e.target.value }),
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                children: LANES.map((l) => jsx("option", { value: l, children: l }, l)),
                              }),
                            ],
                          }),

                          // Primary District
                          jsxs("div", {
                            className: "space-y-1",
                            children: [
                              jsx("label", { className: "font-semibold", children: "Hub District" }),
                              jsx("select", {
                                value: formData.district,
                                onChange: (e) => setFormData({ ...formData, district: e.target.value }),
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                children: DISTRICTS.map((d) => jsx("option", { value: d, children: d }, d)),
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),

                  // SECTION B: BUYER TERMS & DELIVERED COST COVERAGE
                  jsxs("div", {
                    className: "p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4",
                    children: [
                      jsxs("div", {
                        className: "border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center",
                        children: [
                          jsxs("div", {
                            children: [
                              jsx("span", { className: "text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest", children: "Section B" }),
                              jsx("h2", { className: "text-lg font-bold", children: "Buyer Terms & Delivered Cost Coverage" }),
                            ],
                          }),
                          renderCoverageBadge(financialResult.buyerCoverage),
                        ],
                      }),

                      jsxs("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                        children: [
                          // Base Commodity Price
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Supplier Base Commodity Price (UGX) *" }),
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

                          // Buyer Agreed Price
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Agreed Buyer Purchase Price (UGX/KG) *" }),
                              jsx("input", {
                                type: "number",
                                step: "1",
                                min: "0",
                                value: formData.buyer_agreed_price,
                                onChange: (e) => setFormData({ ...formData, buyer_agreed_price: e.target.value }),
                                placeholder: "e.g. 1350",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                              jsx("p", { className: "text-[11px] text-slate-500", children: "Buyer commercial purchase rate locked in purchase agreement." }),
                            ],
                          }),

                          // Transport Cost
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Transport Cost (UGX) *" }),
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

                          // Buyer Terms Lock Checkbox
                          jsxs("div", {
                            className: "space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-center",
                            children: [
                              jsxs("label", {
                                className: "flex items-center gap-2 cursor-pointer font-semibold",
                                children: [
                                  jsx("input", {
                                    type: "checkbox",
                                    checked: formData.is_buyer_agreed,
                                    onChange: (e) => setFormData({ ...formData, is_buyer_agreed: e.target.checked }),
                                    className: "rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4",
                                  }),
                                  jsx("span", { children: "Buyer terms confirmed and signed" }),
                                ],
                              }),
                              jsx("p", { className: "text-[11px] text-slate-500", children: "Confirmed purchase order must be on record before READY transition." }),
                            ],
                          }),

                          // Handling COGS & Explicit Cost Basis Selector (Spans 2 cols)
                          jsxs("div", {
                            className: "md:col-span-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3",
                            children: [
                              jsxs("div", {
                                className: "flex justify-between items-center",
                                children: [
                                  jsx("label", { className: "font-bold text-slate-800 dark:text-slate-200", children: "Handling COGS & Explicit Cost Basis *" }),
                                  jsx("span", { className: "text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold", children: "1 MT = 1,000 KG Basis Conversion Active" }),
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
                              jsxs("div", {
                                className: "text-[11px] text-slate-600 dark:text-slate-400 flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700",
                                children: [
                                  jsx("span", {
                                    children: formData.handling_basis === HANDLING_BASIS.TOTAL
                                      ? "Flat handling cost applied once across the entire transaction."
                                      : `Per-unit handling cost: Total handling cost = Volume (${formData.volume || 0} ${formData.volume_unit}) × Rate.`,
                                  }),
                                  jsx("span", {
                                    className: "font-mono font-bold text-slate-800 dark:text-slate-200",
                                    children: `Effective Handling COGS: ${formatCurrency(financialResult.deliveredCost?.breakdown?.handlingCost || 0)}`,
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),

                      // Coverage Summary Box
                      financialResult.buyerCoverage &&
                        jsxs("div", {
                          className: "p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs",
                          children: [
                            jsxs("div", {
                              children: [
                                jsx("div", { className: "text-slate-600 dark:text-slate-300 font-semibold", children: "Buyer Purchase Total" }),
                                jsx("div", { className: "text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5", children: formatCurrency(financialResult.buyerCoverage.buyerAmount) }),
                              ],
                            }),
                            jsxs("div", {
                              children: [
                                jsx("div", { className: "text-slate-600 dark:text-slate-300 font-semibold", children: "Total Delivered Cost" }),
                                jsx("div", { className: "text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5", children: formatCurrency(financialResult.buyerCoverage.deliveredCost) }),
                              ],
                            }),
                            jsxs("div", {
                              children: [
                                jsx("div", { className: "text-slate-600 dark:text-slate-300 font-semibold", children: "Coverage Buffer" }),
                                jsx("div", {
                                  className: cn("text-base font-bold mt-0.5", financialResult.buyerCoverage.difference >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"),
                                  children: formatCurrency(financialResult.buyerCoverage.difference),
                                }),
                              ],
                            }),
                            jsxs("div", {
                              children: [
                                jsx("div", { className: "text-slate-600 dark:text-slate-300 font-semibold", children: "Coverage Ratio" }),
                                jsx("div", {
                                  className: cn("text-base font-bold mt-0.5", financialResult.buyerCoverage.isCovered ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"),
                                  children: `${financialResult.buyerCoverage.coveragePercentage || 0}%`,
                                }),
                              ],
                            }),
                          ],
                        }),
                    ],
                  }),

                  // SECTION C: CNG SERVICE ECONOMICS
                  jsxs("div", {
                    className: "p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4",
                    children: [
                      jsxs("div", {
                        className: "border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center",
                        children: [
                          jsxs("div", {
                            children: [
                              jsx("span", { className: "text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest", children: "Section C" }),
                              jsx("h2", { className: "text-lg font-bold", children: "CNG Service Economics & Retained Contribution" }),
                            ],
                          }),
                          jsx("span", {
                            className: cn(
                              "text-xs font-bold px-2.5 py-1 rounded-full border",
                              financialResult.cngServiceEconomics?.retainedContribution > 0 ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-800 border-amber-300"
                            ),
                            children: `Retained: ${formatCurrency(financialResult.cngServiceEconomics?.retainedContribution || 0)}`,
                          }),
                        ],
                      }),

                      financialResult.cngServiceEconomics?.hasDuplicateFees &&
                        jsxs("div", {
                          className: "p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2",
                          children: [
                            jsx("span", { className: "text-base", children: "⚠️" }),
                            jsx("span", { className: "font-semibold", children: financialResult.cngServiceEconomics?.duplicateWarning || "Duplicate fee entries detected and excluded from earned revenue." }),
                          ],
                        }),

                      jsxs("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                        children: [
                          // Proposed Service Fee
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Proposed CNG Service Fee (UGX) *" }),
                              jsx("input", {
                                type: "number",
                                step: "1000",
                                min: "0",
                                value: formData.proposed_service_fee,
                                onChange: (e) => setFormData({ ...formData, proposed_service_fee: e.target.value }),
                                placeholder: "e.g. 500000",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),

                          // Internal Service Operating Cost
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Internal CNG Operating Cost (UGX) *" }),
                              jsx("input", {
                                type: "number",
                                step: "1000",
                                min: "0",
                                value: formData.operating_cost,
                                onChange: (e) => setFormData({ ...formData, operating_cost: e.target.value }),
                                placeholder: "e.g. 120000",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),

                          // Fee Acceptance Evidence
                          jsxs("div", {
                            className: "space-y-1 font-semibold",
                            children: [
                              jsx("label", { children: "Fee Acceptance Evidence / Doc Reference *" }),
                              jsx("input", {
                                type: "text",
                                value: formData.service_fee_evidence,
                                onChange: (e) => setFormData({ ...formData, service_fee_evidence: e.target.value }),
                                placeholder: "e.g. Service Clause 4B Signed",
                                className: "w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),

                          // Acceptance Toggle
                          jsxs("div", {
                            className: "space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-center",
                            children: [
                              jsxs("label", {
                                className: "flex items-center gap-2 cursor-pointer font-semibold",
                                children: [
                                  jsx("input", {
                                    type: "checkbox",
                                    checked: formData.is_fee_accepted,
                                    onChange: (e) => setFormData({ ...formData, is_fee_accepted: e.target.checked }),
                                    className: "rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4",
                                  }),
                                  jsx("span", { children: "Service Fee Explicitly Accepted by Counterparty" }),
                                ],
                              }),
                              jsx("p", { className: "text-[11px] text-slate-500", children: "Unaccepted fees cannot be recognized as Earned Service Revenue." }),
                            ],
                          }),
                        ],
                      }),

                      // Line-Item Service Breakdown Table
                      jsxs("div", {
                        className: "overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 text-xs",
                        children: [
                          jsxs("table", {
                            className: "w-full text-left divide-y divide-slate-100 dark:divide-slate-800",
                            children: [
                              jsx("thead", {
                                className: "bg-slate-50 dark:bg-slate-800/70 font-semibold text-slate-700 dark:text-slate-300 uppercase text-[10px]",
                                children: jsxs("tr", {
                                  children: [
                                    jsx("th", { className: "p-2.5", children: "Component" }),
                                    jsx("th", { className: "p-2.5", children: "Gross Fee" }),
                                    jsx("th", { className: "p-2.5", children: "Operating Cost" }),
                                    jsx("th", { className: "p-2.5", children: "15% Overhead" }),
                                    jsx("th", { className: "p-2.5 text-right", children: "CNG Retained" }),
                                  ],
                                }),
                              }),
                              jsx("tbody", {
                                className: "divide-y divide-slate-100 dark:divide-slate-800 font-mono",
                                children: jsxs("tr", {
                                  children: [
                                    jsx("td", { className: "p-2.5 font-sans font-medium text-slate-800 dark:text-slate-200", children: "Quality Assay, Weighbridge & Settlement" }),
                                    jsx("td", { className: "p-2.5 text-slate-900 dark:text-slate-100 font-semibold", children: formatCurrency(financialResult.cngServiceEconomics?.earnedServiceRevenue || 0) }),
                                    jsx("td", { className: "p-2.5 text-slate-700 dark:text-slate-300 font-medium", children: formatCurrency(financialResult.cngServiceEconomics?.directServiceCosts || 0) }),
                                    jsx("td", { className: "p-2.5 text-slate-700 dark:text-slate-300 font-medium", children: formatCurrency(financialResult.cngServiceEconomics?.overheadAmount || 0) }),
                                    jsx("td", {
                                      className: cn("p-2.5 text-right font-bold", (financialResult.cngServiceEconomics?.retainedContribution || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"),
                                      children: formatCurrency(financialResult.cngServiceEconomics?.retainedContribution || 0),
                                    }),
                                  ],
                                }),
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),

                  // SECTION E: OPERATIONAL READINESS (10-POINT GATING)
                  jsxs("div", {
                    className: "p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4",
                    children: [
                      jsxs("div", {
                        className: "border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center",
                        children: [
                          jsxs("div", {
                            children: [
                              jsx("span", { className: "text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest", children: "Section E" }),
                              jsx("h2", { className: "text-lg font-bold", children: "Operational Readiness (10-Point Checklist)" }),
                            ],
                          }),
                          jsx("span", {
                            className: cn(
                              "text-xs font-bold px-3 py-1 rounded-full border tracking-wide",
                              financialResult.readyReadiness.isReady ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                            ),
                            children: financialResult.readyReadiness.isReady ? "READY FOR EXECUTION" : "EXECUTION BLOCKED",
                          }),
                        ],
                      }),

                      // Blocker List (if blocked)
                      financialResult.readyReadiness.blockers.length > 0 &&
                        jsxs("div", {
                          className: "p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2 text-xs",
                          children: [
                            jsx("div", { className: "font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider", children: "Active Blockers (Must resolve before READY status):" }),
                            jsxs("ul", {
                              className: "list-disc list-inside space-y-1 text-rose-700 dark:text-rose-300",
                              children: financialResult.readyReadiness.blockers.map((b, idx) => jsx("li", { children: b }, idx)),
                            }),
                          ],
                        }),

                      // The 10 Checklist Points
                      jsxs("div", {
                        className: "space-y-2 text-xs",
                        children: [
                          // 1. Costs Accounted
                          jsxs("div", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
                            children: [
                              jsx("span", { className: "font-medium", children: "1. All required costs entered (Transport, Handling, Base Price)" }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", !financialResult.costClassification?.transport?.isMissing && !financialResult.costClassification?.handling?.isMissing ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"),
                                children: !financialResult.costClassification?.transport?.isMissing && !financialResult.costClassification?.handling?.isMissing ? "Completed" : "Failed",
                              }),
                            ],
                          }),

                          // 2. Financial Valid
                          jsxs("div", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
                            children: [
                              jsx("span", { className: "font-medium", children: "2. Financial calculations valid and mathematically sound" }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", financialResult.isValid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"),
                                children: financialResult.isValid ? "Completed" : "Failed",
                              }),
                            ],
                          }),

                          // 3. Positive Net Contribution
                          jsxs("div", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
                            children: [
                              jsx("span", { className: "font-medium", children: "3. Positive Net Contribution (> 0 UGX)" }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", financialResult.netMargin > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"),
                                children: financialResult.netMargin > 0 ? "Completed" : "Failed",
                              }),
                            ],
                          }),

                          // 4. Buyer terms evidenced
                          jsxs("label", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer",
                            children: [
                              jsx("span", { className: "font-medium", children: "4. Buyer Terms Documented & Evidenced (Purchase Order / Contract)" }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", formData.is_buyer_agreed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"),
                                children: formData.is_buyer_agreed ? "Completed" : "Missing",
                              }),
                            ],
                          }),

                          // 5. Supplier verification
                          jsxs("label", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer",
                            children: [
                              jsxs("div", {
                                className: "flex items-center gap-2",
                                children: [
                                  jsx("input", {
                                    type: "checkbox",
                                    checked: formData.supplier_verified,
                                    onChange: (e) => setFormData({ ...formData, supplier_verified: e.target.checked }),
                                    className: "rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4",
                                  }),
                                  jsx("span", { className: "font-medium", children: "5. Supplier verification satisfied (Stock & moisture assay)" }),
                                ],
                              }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", formData.supplier_verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"),
                                children: formData.supplier_verified ? "Completed" : "Missing",
                              }),
                            ],
                          }),

                          // 6. Logistics workable
                          jsxs("label", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer",
                            children: [
                              jsxs("div", {
                                className: "flex items-center gap-2",
                                children: [
                                  jsx("input", {
                                    type: "checkbox",
                                    checked: formData.transport_confirmed,
                                    onChange: (e) => setFormData({ ...formData, transport_confirmed: e.target.checked }),
                                    className: "rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4",
                                  }),
                                  jsx("span", { className: "font-medium", children: "6. Logistics workable and carrier confirmed" }),
                                ],
                              }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", formData.transport_confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"),
                                children: formData.transport_confirmed ? "Completed" : "Missing",
                              }),
                            ],
                          }),

                          // 7. Payment arrangements
                          jsxs("div", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
                            children: [
                              jsx("span", { className: "font-medium", children: "7. Payment and settlement structure agreed" }),
                              jsx("span", { className: "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800", children: "Completed" }),
                            ],
                          }),

                          // 8. Service fee acceptance
                          jsxs("div", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
                            children: [
                              jsx("span", { className: "font-medium", children: "8. Agreed service fee acceptance documented with evidence" }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", formData.is_fee_accepted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"),
                                children: formData.is_fee_accepted ? "Completed" : "Missing",
                              }),
                            ],
                          }),

                          // 9. Operational lane complete
                          jsxs("div", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30",
                            children: [
                              jsxs("span", { className: "font-medium", children: ["9. Operational Corridor Lane defined (", formData.lane, ")"] }),
                              jsx("span", { className: "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800", children: "Completed" }),
                            ],
                          }),

                          // 10. Supervisory Approval
                          jsxs("label", {
                            className: "flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer",
                            children: [
                              jsxs("div", {
                                className: "flex items-center gap-2",
                                children: [
                                  jsx("input", {
                                    type: "checkbox",
                                    checked: formData.supervisory_approved,
                                    onChange: (e) => setFormData({ ...formData, supervisory_approved: e.target.checked }),
                                    className: "rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4",
                                  }),
                                  jsx("span", { className: "font-medium", children: "10. Desk Lead / Supervisory Approval Granted" }),
                                ],
                              }),
                              jsx("span", {
                                className: cn("px-2 py-0.5 rounded text-[10px] font-bold", formData.supervisory_approved ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"),
                                children: formData.supervisory_approved ? "Completed" : "Awaiting Approval",
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),

                  // Form Action Buttons
                  jsxs("div", {
                    className: "flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800",
                    children: [
                      jsx("button", {
                        type: "button",
                        onClick: () => setActiveTab("grid"),
                        className: "px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200",
                        children: "Cancel / Back to Grid",
                      }),
                      jsxs("div", {
                        className: "flex gap-2",
                        children: [
                          jsx("button", {
                            type: "button",
                            onClick: () => handleSave("Draft"),
                            disabled: isSaving,
                            className: "px-4 py-2 text-xs font-bold rounded-xl border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40",
                            children: isSaving ? "Saving..." : "Save as Draft",
                          }),
                          jsx("button", {
                            type: "button",
                            onClick: () => handleSave("Awaiting Review"),
                            disabled: isSaving,
                            className: "px-4 py-2 text-xs font-bold rounded-xl border border-blue-600 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40",
                            children: isSaving ? "Submitting..." : "Submit for Review",
                          }),
                          jsx("button", {
                            type: "button",
                            onClick: () => handleSave("Approved"),
                            disabled: isSaving,
                            className: "px-5 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md transition-all",
                            children: isSaving ? "Executing..." : "Approve & Mark READY",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),

              // Right 1 Column: SECTION D: FINANCIAL DECISION SUMMARY
              jsxs("div", {
                className: "space-y-4",
                children: [
                  jsx("div", {
                    className: "text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400",
                    children: "Section D: Financial Decision Cards",
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

                  // 2. Total Delivered Costs Card
                  jsxs("div", {
                    className: "p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1",
                    children: [
                      jsx("div", { className: "text-[11px] font-bold uppercase text-slate-500", children: "2. Total Delivered Costs" }),
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
                        children: "Gross Revenue − Total Delivered Costs",
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

                  // 5. CNG Retained Service Contribution Card
                  jsxs("div", {
                    className: "p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1",
                    children: [
                      jsx("div", { className: "text-[11px] font-bold uppercase text-slate-500", children: "5. CNG Retained Service Contribution" }),
                      jsx("div", {
                        className: cn("text-2xl font-black", (financialResult.cngServiceEconomics?.retainedContribution || 0) > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"),
                        children: formatCurrency(financialResult.cngServiceEconomics?.retainedContribution || 0),
                      }),
                      jsx("div", {
                        className: "text-[11px] text-slate-400",
                        children: "Earned Service Fees − (Direct Costs + 15% Overhead)",
                      }),
                    ],
                  }),

                  // 6. 10-Point Readiness Overview Card
                  jsxs("div", {
                    className: cn(
                      "p-4 rounded-2xl border shadow-sm space-y-2",
                      financialResult.readyReadiness.isReady ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    ),
                    children: [
                      jsx("div", { className: "text-[11px] font-bold uppercase text-slate-500", children: "6. Readiness Verification" }),
                      jsx("div", {
                        className: "text-lg font-bold",
                        children: financialResult.readyReadiness.isReady ? "All 10 Gates Satisfied" : `${financialResult.readyReadiness.blockers.length} Blockers Outstanding`,
                      }),
                      jsx("p", {
                        className: "text-xs text-slate-500",
                        children: financialResult.readyReadiness.isReady
                          ? "This deal satisfies all legal, financial, and operational criteria for immediate commercial execution."
                          : "Resolve outstanding items in Section E before executing trade.",
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
                        { id: "ready", label: `Ready (${stats.ready || 0})` },
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
                          className: "bg-slate-50 dark:bg-slate-800/70 font-bold uppercase tracking-wider text-[11px] text-slate-700 dark:text-slate-300",
                          children: jsxs("tr", {
                            children: [
                              jsx("th", { className: "p-3.5", children: "Reference & Counterparty" }),
                              jsx("th", { className: "p-3.5", children: "Commodity & Lane" }),
                              jsx("th", { className: "p-3.5", children: "Volume" }),
                              jsx("th", { className: "p-3.5", children: "Delivered Cost" }),
                              jsx("th", { className: "p-3.5", children: "Buyer Coverage" }),
                              jsx("th", { className: "p-3.5", children: "Net Margin" }),
                              jsx("th", { className: "p-3.5", children: "Margin %" }),
                              jsx("th", { className: "p-3.5", children: "CNG Retained" }),
                              jsx("th", { className: "p-3.5", children: "Status & Gating" }),
                              jsx("th", { className: "p-3.5 text-right", children: "Action" }),
                            ],
                          }),
                        }),
                        jsx("tbody", {
                          className: "divide-y divide-slate-100 dark:divide-slate-800",
                          children: filteredRecords.map((r) => {
                            const isPositive = r.net_margin !== null && r.net_margin > 0;
                            const isNegative = r.net_margin !== null && r.net_margin < 0;
                            const isReady = r.ready_status === "READY" && (!r.ready_blockers || r.ready_blockers.length === 0);
                            return jsxs(
                              "tr",
                              {
                                className: "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors",
                                children: [
                                  jsxs("td", {
                                    className: "p-3.5 font-mono font-bold text-slate-900 dark:text-slate-100",
                                    children: [
                                      r.reference,
                                      r.buyer_name ? jsxs("div", { className: "text-[10px] font-sans font-normal text-slate-500 dark:text-slate-400 truncate max-w-[140px]", children: ["To: ", r.buyer_name] }) : null,
                                    ],
                                  }),
                                  jsxs("td", {
                                    className: "p-3.5 font-medium text-slate-900 dark:text-slate-100",
                                    children: [
                                      r.commodity,
                                      r.lane ? jsxs("div", { className: "text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate max-w-[140px]", children: [r.lane] }) : null,
                                    ],
                                  }),
                                  jsx("td", { className: "p-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100", children: `${r.volume} ${r.volume_unit || "MT"}` }),
                                  jsx("td", { className: "p-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100", children: formatCurrency(r.delivered_cost || r.total_costs) }),
                                  jsx("td", {
                                    className: "p-3.5",
                                    children: r.buyer_coverage_status ? (
                                      jsx("span", {
                                        className: cn(
                                          "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide",
                                          r.buyer_coverage_status === "COVERED" ? "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800"
                                        ),
                                        children: r.buyer_coverage_status === "COVERED" ? `Covered (${r.buyer_coverage_pct || 100}%)` : `Shortfall (${r.buyer_coverage_pct || 0}%)`,
                                      })
                                    ) : (
                                      jsx("span", { className: "text-slate-400 text-[10px]", children: "—" })
                                    ),
                                  }),
                                  jsx("td", {
                                    className: cn(
                                      "p-3.5 font-mono font-bold",
                                      isPositive ? "text-emerald-600 dark:text-emerald-400" : isNegative ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"
                                    ),
                                    children: formatCurrency(r.net_margin),
                                  }),
                                  jsx("td", {
                                    className: cn(
                                      "p-3.5 font-mono font-bold",
                                      isPositive ? "text-emerald-600 dark:text-emerald-400" : isNegative ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"
                                    ),
                                    children: formatPercentage(r.margin_percentage),
                                  }),
                                  jsx("td", {
                                    className: "p-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100",
                                    children: formatCurrency(r.cng_retained_contribution || 0),
                                  }),
                                  jsxs("td", {
                                    className: "p-3.5 space-y-1",
                                    children: [
                                      jsx("span", {
                                        className: cn(
                                          "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase",
                                          r.status === "Approved"
                                            ? "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                                            : r.status === "Awaiting Review"
                                            ? "bg-blue-50 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                                            : "bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700"
                                        ),
                                        children: r.status,
                                      }),
                                      isReady &&
                                        jsx("div", {
                                          className: "text-[10px] font-bold text-emerald-600 dark:text-emerald-400",
                                          children: "● READY",
                                        }),
                                    ],
                                  }),
                                  jsx("td", {
                                    className: "p-3.5 text-right",
                                    children: jsx("button", {
                                      type: "button",
                                      onClick: () => handleEditRecord(r),
                                      className: "px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 transition-all",
                                      children: "Review →",
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
