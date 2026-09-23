export type RuleKey =
  | "commodity_name"
  | "net_quantity"
  | "mrp"
  | "batch_lot_code"
  | "date_of_manufacture"
  | "date_of_expiry"
  | "manufacturer"
  | "consumer_care"
  | "fssai_license";

export interface RuleDetail {
  key: RuleKey;
  label: string;
  legalBasis: string;
  scope: "universal" | "food_only";
  summary: string;
  whatItMeans: string;
  whyItMatters: string;
  example: string;
  commonMistakes: string[];
}

export const RULES: Record<RuleKey, RuleDetail> = {
  commodity_name: {
    key: "commodity_name",
    label: "Common / Generic Name of Commodity",
    legalBasis: "LM Rule 6(1)(b); FSSAI Reg 5(1)",
    scope: "universal",
    summary:
      "Every pre-packaged commodity must declare the common or generic name of what's inside — not just the brand name.",
    whatItMeans:
      "Rule 6(1)(b) of the Legal Metrology (Packaged Commodities) Rules, 2011 requires the common/generic name of the commodity to appear on the package, separate from any trade name or brand name. FSSAI's Labelling Regulations impose a similar requirement specifically for food products.",
    whyItMatters:
      "A brand name alone doesn't tell a consumer what's actually inside the pack. The generic name does.",
    example: '"Parle-G" (brand) + "Glucose Biscuits" (generic name) — both should appear on the label.',
    commonMistakes: [
      "Only the brand/trade name is printed, with no generic descriptor",
      "Generic name printed in a tiny font compared to the brand logo",
    ],
  },
  net_quantity: {
    key: "net_quantity",
    label: "Net Quantity / Weight / Volume",
    legalBasis: "LM Rule 6(1)(c), Rule 12-13; FSSAI Reg 5(8)",
    scope: "universal",
    summary:
      "The net quantity — weight, volume, length, or count — must be declared in standard metric units.",
    whatItMeans:
      "Rules 12-13 govern how quantity must be expressed (grams/kilograms for weight, millilitres/litres for liquids, etc.) and roughly how it should be sized/positioned on the package's principal display panel.",
    whyItMatters:
      "Lets a buyer directly compare value across different pack sizes and competing brands.",
    example: '"Net Wt. 200g" printed clearly on the front panel.',
    commonMistakes: [
      "Quantity given only in a non-standard or ambiguous unit",
      "A number is printed with no unit at all",
    ],
  },
  mrp: {
    key: "mrp",
    label: "Maximum Retail Price (MRP)",
    legalBasis: "LM Rule 6(1)(e), Rule 2(m); FSSAI Reg 5(8)",
    scope: "universal",
    summary:
      "The Maximum Retail Price must be declared, and it must be inclusive of all taxes.",
    whatItMeans:
      "Rule 2(m) defines MRP as the ceiling price at which the commodity may be sold to the end consumer. Rule 6(1)(e) requires this be printed on the package itself, by the manufacturer/packer.",
    whyItMatters:
      "Stops a retailer from marking the price up beyond what's been declared as the legal ceiling.",
    example: '"MRP ₹20 (Incl. of all taxes)"',
    commonMistakes: [
      "Price shown without the 'inclusive of all taxes' qualifier",
      "MRP only present on a retailer-added sticker, not printed by the manufacturer",
    ],
  },
  batch_lot_code: {
    key: "batch_lot_code",
    label: "Batch / Lot / Code Number",
    legalBasis: "FSSAI Reg 5(9)",
    scope: "food_only",
    summary:
      "A batch, lot, or code number that lets a specific production run be traced.",
    whatItMeans:
      "FSSAI's labelling regulation 5(9) requires this so a recall or quality investigation can be traced back to a specific manufacturing run — it's a separate declaration from the manufacture/expiry dates.",
    whyItMatters:
      "Enables a targeted recall of one bad batch instead of pulling every unit of a product off shelves nationwide.",
    example: '"Batch No: B2404A"',
    commonMistakes: [
      "No batch code printed at all",
      "Code embossed or printed in a way that's very low-contrast and hard to read",
    ],
  },
  date_of_manufacture: {
    key: "date_of_manufacture",
    label: "Date of Manufacture / Packaging",
    legalBasis: "LM Rule 6(1)(d); FSSAI Reg 5(10)(a)",
    scope: "universal",
    summary:
      "The month and year (at minimum) the product was manufactured or packaged must be printed.",
    whatItMeans:
      "This is a distinct field from the expiry date — it declares when the item was made or packed, and Legal Metrology requires it across essentially all pre-packaged commodities, not just food.",
    whyItMatters:
      "Paired with a shelf-life period, this lets a consumer judge freshness, even on products with no separate best-before date.",
    example: '"Mfg: 03/2026" or "Pkd: MAR 2026"',
    commonMistakes: [
      "Only an expiry date is given, with no manufacture/packing date at all",
      "Date printed so small or embossed so lightly it's effectively unreadable",
    ],
  },
  date_of_expiry: {
    key: "date_of_expiry",
    label: "Expiry / Use By / Best Before Date",
    legalBasis: "FSSAI Reg 5(10)(a)",
    scope: "food_only",
    summary:
      '"Use by", "Best before", or an equivalent expiry declaration for food products.',
    whatItMeans:
      "FSSAI requires this for food/beverage items specifically. It can be an absolute date, or a shelf-life duration counted from the packaging date (e.g. 'Best before 9 months from packaging').",
    whyItMatters:
      "The core food-safety declaration — it tells a consumer the window in which the product is safe and/or at full quality.",
    example: '"Best Before 9 Months From Packaging" or "Use By: 09/2026"',
    commonMistakes: [
      "No expiry or best-before information at all",
      "Wording that doesn't make clear whether it's a hard safety expiry or just a quality marker",
    ],
  },
  manufacturer: {
    key: "manufacturer",
    label: "Manufacturer / Packer / Importer Name & Address",
    legalBasis: "LM Rule 6(1)(a), Rule 10; FSSAI Reg 5(6)(a)",
    scope: "universal",
    summary:
      "The full name and address of the manufacturer, packer, or importer.",
    whatItMeans:
      "Establishes legal accountability for what's inside the package. Rule 10 specifically addresses how this is declared when the manufacturer, packer, and marketer are different entities.",
    whyItMatters:
      "Gives consumers and regulators an actual, traceable party to hold accountable if something goes wrong.",
    example:
      '"Manufactured by: XYZ Foods Pvt Ltd, Plot 12, Industrial Area, Coimbatore - 641001"',
    commonMistakes: [
      "Only a marketing/brand company is named, with no manufacturer or packer distinction",
      "No physical address given, just a website",
    ],
  },
  consumer_care: {
    key: "consumer_care",
    label: "Consumer Care Contact (Name, Address, Phone/Email)",
    legalBasis: "LM Rule 6(2)",
    scope: "universal",
    summary:
      "A working contact route for consumer complaints or queries — a real phone number and/or email.",
    whatItMeans:
      "Rule 6(2) specifically requires this to be a real, reachable contact — the words 'Consumer Care' on their own, with no number or email behind them, don't satisfy it.",
    whyItMatters:
      "Gives a consumer actual recourse if a product is defective, mislabeled, or otherwise causes a problem.",
    example: '"Consumer Care: 1800-123-4567 / care@xyzfoods.com"',
    commonMistakes: [
      "'Consumer Care' is printed with no phone number or email next to it",
      "Only a general company website is given, with no direct contact route",
    ],
  },
  fssai_license: {
    key: "fssai_license",
    label: "14-Digit FSSAI License Number",
    legalBasis: "FSSAI Reg 5(7)",
    scope: "food_only",
    summary:
      "The 14-digit FSSAI license or registration number, required on every food product.",
    whatItMeans:
      "Confirms the manufacturer or packer holds a valid Food Safety and Standards Authority of India license or registration to legally produce or sell that food product.",
    whyItMatters:
      "A verifiable identifier — a consumer or inspector can look it up on the FSSAI portal to confirm the license is real, current, and matches the declared manufacturer.",
    example: '"Lic. No. 12345678901234"',
    commonMistakes: [
      "A number is printed but isn't actually 14 digits (typo or truncated)",
      "No FSSAI number printed at all on a food product",
    ],
  },
};