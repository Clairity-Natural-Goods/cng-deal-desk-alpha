/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — IDENTITY DISCLOSURE CONTROLS & MASKING UTILITIES
 *   Module: assets/identityMasking.js
 *   Purpose: Enforces identity-disclosure restrictions across frontend views,
 *            tables, transaction details, and document/data exports.
 *            Protects buyer and supplier personal contact information while
 *            preserving business counterparty data for desk operations.
 * ==============================================================================
 */

/**
 * Permitted disclosure purposes
 */
export const DISCLOSURE_PURPOSES = {
  BANKING: "BANKING",
  OPERATIONAL: "OPERATIONAL",
};

/**
 * Roles authorized for each disclosure purpose
 */
export const DISCLOSURE_ROLE_MATRIX = {
  BANKING: ["admin", "finance", "compliance"],
  OPERATIONAL: ["admin", "operations", "field_officer", "operator"],
};

/**
 * Determine authoritative auth callback URL (strictly avoids localhost redirect)
 */
export function getAuthRedirectUrl(path = "/login") {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return `${origin}${path}`;
    }
  }
  return `https://cng-deal-desk-alpha-rose.vercel.app${path}`;
}

/**
 * Mask a person's full name.
 * Example: 'James Okello' -> 'J**** O****'
 */
export function maskPersonName(name) {
  if (!name || typeof name !== "string") return "—";
  const trimmed = name.trim();
  if (!trimmed) return "—";

  return trimmed
    .split(/\s+/)
    .map((part) => {
      if (part.length === 0) return "";
      const firstChar = part.charAt(0).toUpperCase();
      return `${firstChar}****`;
    })
    .join(" ");
}

/**
 * Mask a telephone number.
 * Example: '+256 772 123 456' -> '+256 7** *** 456'
 */
export function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== "string") return "—";
  const trimmed = phone.trim();
  if (!trimmed) return "—";

  // Clean characters to inspect digits
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) {
    return "****";
  }

  // Handle standard Uganda format (+256 or 07...)
  if (trimmed.startsWith("+256") || trimmed.startsWith("256")) {
    const last3 = digits.slice(-3);
    const opDigit = digits.length >= 4 ? digits.charAt(3) : "7";
    return `+256 ${opDigit}** *** ${last3}`;
  }

  if (trimmed.startsWith("07") || trimmed.startsWith("7")) {
    const last3 = digits.slice(-3);
    const opDigit = trimmed.startsWith("07") && digits.length >= 2 ? digits.charAt(1) : digits.charAt(0);
    return `+256 ${opDigit}** *** ${last3}`;
  }

  // Fallback generic phone masking
  const last3 = trimmed.slice(-3);
  return `+*** *** *** ${last3}`;
}

/**
 * Mask an email address.
 * Example: 'james@example.com' -> 'j****@example.com'
 */
export function maskEmailAddress(email) {
  if (!email || typeof email !== "string") return "—";
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) return "—";

  const [userPart, domainPart] = trimmed.split("@");
  if (!userPart || !domainPart) return "—";

  const firstChar = userPart.charAt(0).toLowerCase();
  return `${firstChar}****@${domainPart}`;
}

/**
 * Mask physical contact address.
 * Example: 'Plot 14, Main Street, Gulu' -> 'Contact address restricted'
 */
export function maskContactAddress(address) {
  if (!address || typeof address !== "string") return "Contact address restricted";
  return "Contact address restricted";
}

/**
 * Mask bank account number.
 * Example: '12345678901234' -> '**** **** 1234'
 */
export function maskBankAccount(account) {
  if (!account || typeof account !== "string") return "—";
  const trimmed = account.trim();
  if (!trimmed) return "—";

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) {
    return "**** **** ****";
  }
  const last4 = digits.slice(-4);
  return `**** **** ${last4}`;
}

/**
 * Check if a user's role permits disclosure for a given purpose.
 */
export function getDisclosurePermission(user, purpose) {
  if (!user || !user.role) return false;
  const userRole = String(user.role).toLowerCase();
  const allowedRoles = DISCLOSURE_ROLE_MATRIX[purpose];
  if (!allowedRoles) return false;
  return allowedRoles.includes(userRole);
}

/**
 * Mask party entity record by default unless explicit permission is granted.
 * Preserves business counterparty name and district for desk operations.
 */
export function maskParty(party, isAuthorized = false) {
  if (!party || typeof party !== "object") return party;
  if (isAuthorized) return { ...party };

  const masked = { ...party };

  if (masked.contact_person) {
    masked.contact_person = maskPersonName(masked.contact_person);
  }
  if (masked.contact_name) {
    masked.contact_name = maskPersonName(masked.contact_name);
  }
  if (masked.contact_channel) {
    if (masked.contact_channel.includes("@")) {
      masked.contact_channel = maskEmailAddress(masked.contact_channel);
    } else {
      masked.contact_channel = maskPhoneNumber(masked.contact_channel);
    }
  }
  if (masked.phone) {
    masked.phone = maskPhoneNumber(masked.phone);
  }
  if (masked.email) {
    masked.email = maskEmailAddress(masked.email);
  }
  if (masked.address) {
    masked.address = maskContactAddress(masked.address);
  }
  if (masked.bank_details || masked.bank_account) {
    masked.bank_details = maskBankAccount(masked.bank_details || masked.bank_account);
    masked.bank_account = masked.bank_details;
  }

  return masked;
}

/**
 * Mask an array of export records (parties, transactions, deals)
 * ensuring sensitive contact info is not exposed in CSV/JSON/PDF exports.
 */
export function maskExportRecords(records, isAuthorized = false) {
  if (!Array.isArray(records)) return [];
  if (isAuthorized) return records;

  return records.map((rec) => {
    if (!rec || typeof rec !== "object") return rec;
    const cloned = { ...rec };

    // If it's a party record
    if ("contact_person" in cloned || "contact_channel" in cloned || "phone" in cloned) {
      return maskParty(cloned, false);
    }

    // If it's a transaction record with buyer_requirements or supplier_verification
    if (cloned.buyer_requirements && typeof cloned.buyer_requirements === "object") {
      cloned.buyer_requirements = {
        ...cloned.buyer_requirements,
        contact_person: cloned.buyer_requirements.contact_person
          ? maskPersonName(cloned.buyer_requirements.contact_person)
          : undefined,
        contact_phone: cloned.buyer_requirements.contact_phone
          ? maskPhoneNumber(cloned.buyer_requirements.contact_phone)
          : undefined,
        contact_email: cloned.buyer_requirements.contact_email
          ? maskEmailAddress(cloned.buyer_requirements.contact_email)
          : undefined,
      };
    }

    if (cloned.supplier_verification && typeof cloned.supplier_verification === "object") {
      cloned.supplier_verification = {
        ...cloned.supplier_verification,
        contact_person: cloned.supplier_verification.contact_person
          ? maskPersonName(cloned.supplier_verification.contact_person)
          : undefined,
        contact_phone: cloned.supplier_verification.contact_phone
          ? maskPhoneNumber(cloned.supplier_verification.contact_phone)
          : undefined,
      };
    }

    return cloned;
  });
}
