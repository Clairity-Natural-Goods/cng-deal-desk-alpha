import { i as loadReact, l as getDefaultExport, r as jsxRuntime } from "./utils-fF95r_SJ.js";
import {
  a as SelectValue,
  i as SelectTrigger,
  n as SelectContent,
  o as Input,
  r as SelectItem,
  t as Select,
} from "./select-B2jg6JWW.js";
import { t as EmptyState } from "./EmptyState-CCMewG1s.js";
import { t as AccessNotice } from "./AccessNotice-BfaxLiRn.js";
import {
  S as useNavigate,
  b as useToast,
  r as createLucideIcon,
  x as Link,
} from "./index-A159RRyL.js";
import { t as Button } from "./button-C0BH7B6h.js";
import { t as PageHeader } from "./PageHeader-BnBlK87q.js";
import {
  c as STAGE_DESCRIPTIONS,
  g as formatStage,
  h as formatCurrency,
  o as GATES,
  p as getDealEconomics,
  w as getGateProgress,
} from "./desk-CXHNcONN.js";
import { t as useRecords } from "./useRecords-CUB6kMxs.js";
import { normalizeDealCreationPayload } from "./dealCreation.js";

const PlusIcon = createLucideIcon("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }],
]);

const jsx = jsxRuntime();
const React = getDefaultExport(loadReact(), 1);

const DB = globalThis.__B44_DB__ || {
  auth: { isAuthenticated: async () => false, me: async () => null },
  entities: new Proxy({}, {
    get: () => ({
      filter: async () => [],
      get: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({}),
    }),
  }),
  integrations: { Core: { UploadFile: async () => ({ file_url: "" }) } },
};

function DealsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = React.useState(false);
  const [dealName, setDealName] = React.useState("");
  const [commodity, setCommodity] = React.useState("Maize");
  const [proofQuantity, setProofQuantity] = React.useState("20");
  const [buyerId, setBuyerId] = React.useState("none");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const dealsQuery = useRecords(() => DB.entities.Deal.filter({}, { sort: "-updated_date", limit: 200 }), []);
  const partiesQuery = useRecords(() => DB.entities.Party.filter({}, { limit: 200 }), []);

  if (dealsQuery.denied && partiesQuery.denied) {
    return jsx.jsxs("div", {
      children: [
        jsx.jsx(PageHeader, { eyebrow: "Deals", title: "Commodity Deals" }),
        jsx.jsx(AccessNotice, { what: "Deals" }),
      ],
    });
  }

  const buyers = partiesQuery.items.filter((p) => p.role === "Buyer");

  async function handleCreateDeal(e) {
    e.preventDefault();
    if (!dealName.trim()) {
      toast({ variant: "destructive", title: "Validation Error", description: "Deal name is required." });
      return;
    }

    const qty = Number(proofQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ variant: "destructive", title: "Validation Error", description: "Proof quantity must be greater than zero." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = normalizeDealCreationPayload({
        name: dealName.trim(),
        commodity,
        proof_quantity_tonnes: qty,
        buyer_id: buyerId === "none" ? null : buyerId,
        stage: 0,
        evidence: Array(GATES.length).fill("OPEN"),
        per_tonne_fee: 30000,
        minimum_fee: 25000,
        commissioned: false,
        cost_field: 0,
        cost_testing: 0,
        cost_transport: 0,
        cost_other: 0,
        staff_hours: 0,
        staff_cost_per_hour: 6000,
        working_days: 0,
        approval_status: "Not requested",
        payment_status: "Not invoiced",
        classification: "Not classified",
      });

      const newDeal = await DB.entities.Deal.create(payload);

      await DB.entities.DealEvent.create({
        deal_id: newDeal.id,
        label: "Deal created",
        detail: `Created deal "${dealName.trim()}" for ${commodity} (${qty} MT).`,
      });

      toast({
        title: "Deal Created Successfully",
        description: `Reference: ${newDeal.id}. Navigating to underwriting detail.`,
      });

      navigate(`/deals/${newDeal.id}`);
    } catch (err) {
      console.error("Failed to create deal:", err);
      toast({
        variant: "destructive",
        title: "Failed to create deal",
        description: err.message || "An error occurred while creating the deal.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const getPartyName = (id) => {
    if (!id) return "Not matched";
    const match = partiesQuery.items.find((p) => p.id === id);
    return match ? match.name : "Not matched";
  };

  return jsx.jsxs("div", {
    children: [
      jsx.jsx(PageHeader, {
        eyebrow: "Deals",
        title: "Commodity deals",
        description: "Every active, delivered and reconciled deal on the desk. Each stage is gated by evidence directly verified by staff.",
        actions: jsx.jsxs(Button, {
          onClick: () => setIsCreating(!isCreating),
          children: [
            jsx.jsx(PlusIcon, { className: "mr-2 h-4 w-4" }),
            isCreating ? "Cancel" : "New deal",
          ],
        }),
      }),

      isCreating &&
        jsx.jsxs("form", {
          onSubmit: handleCreateDeal,
          className: "panel p-5 mb-6 space-y-4 max-w-xl shadow-sm border border-border/80 bg-card rounded-xl",
          children: [
            jsx.jsx("h2", { className: "text-lg font-semibold text-foreground", children: "Create a new deal" }),
            jsx.jsxs("div", {
              children: [
                jsx.jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Deal name or reference *" }),
                jsx.jsx(Input, {
                  value: dealName,
                  onChange: (e) => setDealName(e.target.value),
                  placeholder: "e.g. Lira Miller - 20t Maize Batch #12",
                  required: true,
                }),
              ],
            }),
            jsx.jsxs("div", {
              className: "grid gap-3 sm:grid-cols-3",
              children: [
                jsx.jsxs("div", {
                  children: [
                    jsx.jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Commodity *" }),
                    jsx.jsxs(Select, {
                      value: commodity,
                      onValueChange: setCommodity,
                      children: [
                        jsx.jsx(SelectTrigger, { children: jsx.jsx(SelectValue, {}) }),
                        jsx.jsx(SelectContent, {
                          children: ["Maize", "Beans", "Soybeans", "Sorghum", "Rice", "Cassava"].map((c) =>
                            jsx.jsx(SelectItem, { value: c, children: c }, c)
                          ),
                        }),
                      ],
                    }),
                  ],
                }),
                jsx.jsxs("div", {
                  children: [
                    jsx.jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Proof Quantity (MT) *" }),
                    jsx.jsx(Input, {
                      type: "number",
                      min: "0.1",
                      step: "0.1",
                      value: proofQuantity,
                      onChange: (e) => setProofQuantity(e.target.value),
                      placeholder: "e.g. 20",
                      required: true,
                    }),
                  ],
                }),
                jsx.jsxs("div", {
                  children: [
                    jsx.jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Buyer (Registry)" }),
                    jsx.jsxs(Select, {
                      value: buyerId,
                      onValueChange: setBuyerId,
                      children: [
                        jsx.jsx(SelectTrigger, { children: jsx.jsx(SelectValue, { placeholder: "Select buyer" }) }),
                        jsx.jsxs(SelectContent, {
                          children: [
                            jsx.jsx(SelectItem, { value: "none", children: "Set later" }),
                            buyers.map((b) =>
                              jsx.jsxs(SelectItem, { value: b.id, children: [b.name, " (", b.district, ")"] }, b.id)
                            ),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            jsx.jsx(Button, {
              type: "submit",
              disabled: isSubmitting,
              children: isSubmitting ? "Creating Deal..." : "Create and open",
            }),
          ],
        }),

      dealsQuery.loading
        ? jsx.jsx("p", { className: "text-sm text-muted-foreground", children: "Loading deals..." })
        : dealsQuery.items.length === 0
        ? jsx.jsx(EmptyState, {
            title: "No deals on the desk",
            body: "Start by registering counterparties and capturing observations, then create a deal to match them.",
          })
        : jsx.jsx("div", {
            className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
            children: dealsQuery.items.map((deal) => {
              const econ = getDealEconomics(deal);
              const gateProgress = getGateProgress(deal);
              const stageNum = formatStage(deal.stage);
              return jsx.jsxs(
                Link,
                {
                  to: `/deals/${deal.id}`,
                  className: "panel p-4 hover:border-primary transition-colors flex flex-col justify-between rounded-xl border border-border/80 bg-card",
                  children: [
                    jsx.jsxs("div", {
                      children: [
                        jsx.jsxs("div", {
                          className: "flex items-start justify-between gap-2",
                          children: [
                            jsx.jsx("h3", { className: "font-semibold text-base leading-snug text-foreground", children: deal.name }),
                            jsx.jsxs("span", {
                              className: "shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium",
                              children: ["Stage ", stageNum],
                            }),
                          ],
                        }),
                        jsx.jsxs("div", {
                          className: "text-xs text-muted-foreground mt-1",
                          children: [deal.commodity || "Maize", " · ", STAGE_DESCRIPTIONS[stageNum]],
                        }),
                        jsx.jsxs("div", {
                          className: "mt-4 space-y-1 text-xs",
                          children: [
                            jsx.jsxs("div", {
                              className: "flex justify-between",
                              children: [
                                jsx.jsx("span", { className: "text-muted-foreground", children: "Buyer:" }),
                                jsx.jsx("span", { className: "font-medium text-foreground", children: getPartyName(deal.buyer_id) }),
                              ],
                            }),
                            jsx.jsxs("div", {
                              className: "flex justify-between",
                              children: [
                                jsx.jsx("span", { className: "text-muted-foreground", children: "Supplier:" }),
                                jsx.jsx("span", { className: "font-medium text-foreground", children: getPartyName(deal.supplier_id) }),
                              ],
                            }),
                            jsx.jsxs("div", {
                              className: "flex justify-between",
                              children: [
                                jsx.jsx("span", { className: "text-muted-foreground", children: "Proof Quantity:" }),
                                jsx.jsx("span", { className: "font-mono font-medium text-foreground", children: `${deal.proof_quantity_tonnes || 0} MT` }),
                              ],
                            }),
                            jsx.jsxs("div", {
                              className: "flex justify-between",
                              children: [
                                jsx.jsx("span", { className: "text-muted-foreground", children: "Evidence gate:" }),
                                jsx.jsxs("span", {
                                  className: "font-medium tnum text-foreground",
                                  children: [gateProgress, " / ", GATES.length, " verified"],
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                    jsx.jsxs("div", {
                      className: "mt-4 pt-3 border-t border-border/70 flex justify-between items-center text-xs",
                      children: [
                        jsx.jsx("span", { className: "text-muted-foreground", children: "Delivery contrib:" }),
                        jsx.jsx("span", {
                          className:
                            econ.deliveryContribution < 0
                              ? "text-destructive font-semibold tnum font-mono"
                              : "text-emerald-700 dark:text-emerald-400 font-semibold tnum font-mono",
                          children: formatCurrency(econ.deliveryContribution),
                        }),
                      ],
                    }),
                  ],
                },
                deal.id
              );
            }),
          }),
    ],
  });
}

export { DealsPage as default };
