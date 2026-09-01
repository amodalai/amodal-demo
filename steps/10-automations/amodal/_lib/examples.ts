export interface ExampleDoc {
  kind: string;
  name: string;
  status: "received" | "requested" | "missing";
  required: boolean;
  notes?: string;
}

export interface ExampleClaim {
  year: number;
  description: string;
  amount_usd: number;
  open?: boolean;
}

export interface Example {
  submission_id: string;
  applicant_name: string;
  business_type: string;
  state?: string;
  property_value_usd?: number | null;
  annual_revenue_usd?: number | null;
  broker_email?: string;
  docs?: ExampleDoc[];
  claims?: ExampleClaim[];
}

// Cascade Print Works' claim years are computed from the real clock at seed
// time so that exactly one claim sits in the true 3-year window whenever the
// demo runs. The case exists to show the window coming from `claims_stats`,
// not from the model's stale sense of what year it is.
const THIS_YEAR = new Date().getFullYear();

export const EXAMPLES: Example[] = [
  {
    submission_id: "sub_bistro_ember",
    applicant_name: "Bistro Ember LLC",
    business_type: "Full-service restaurant with a kitchen",
    state: "OR",
    property_value_usd: 1_800_000,
    annual_revenue_usd: 2_400_000,
    broker_email: "dana@harborbrokers.example",
    docs: [
      {
        kind: "application",
        name: "Business application",
        status: "received",
        required: true,
      },
      {
        kind: "property-details",
        name: "Building value + condition",
        status: "received",
        required: true,
      },
      {
        kind: "claims-history",
        name: "Past claims",
        status: "received",
        required: true,
      },
      {
        kind: "inspection",
        name: "Kitchen fire-safety inspection",
        status: "missing",
        required: true,
      },
      {
        kind: "other",
        name: "Cover note from applicant",
        status: "received",
        required: false,
        notes:
          "Family restaurant renewing after a kitchen fire last year. Owner says the fire-suppression system has since been serviced.",
      },
    ],
    claims: [
      {
        year: 2021,
        description: "Small kitchen fire, damaged hood and wiring",
        amount_usd: 38_000,
        open: false,
      },
      {
        year: 2024,
        description: "Grease fire in the kitchen",
        amount_usd: 142_000,
        open: false,
      },
    ],
  },
  {
    submission_id: "sub_summit_yoga",
    applicant_name: "Summit Yoga Studio",
    business_type: "Yoga / fitness studio, no cooking",
    state: "CO",
    property_value_usd: 450_000,
    annual_revenue_usd: 520_000,
    broker_email: "priya@summitlineins.example",
    docs: [
      {
        kind: "application",
        name: "Business application",
        status: "received",
        required: true,
      },
      {
        kind: "property-details",
        name: "Building value + condition",
        status: "received",
        required: true,
      },
      {
        kind: "claims-history",
        name: "Past claims",
        status: "received",
        required: true,
      },
      {
        kind: "photos",
        name: "Interior + exterior photos",
        status: "received",
        required: false,
      },
    ],
    claims: [],
  },
  {
    submission_id: "sub_northstar_storage",
    applicant_name: "Northstar Storage",
    business_type: "Self-storage facility, 320 units",
    state: "TX",
    property_value_usd: 6_500_000,
    annual_revenue_usd: 1_100_000,
    broker_email: "marcus@lonestarcoverage.example",
    docs: [
      {
        kind: "application",
        name: "Business application",
        status: "received",
        required: true,
      },
      {
        kind: "property-details",
        name: "Building value + condition",
        status: "received",
        required: true,
        notes:
          "Roof is 22 years old; building otherwise sound and well-managed. Located in a hail-prone region.",
      },
      {
        kind: "claims-history",
        name: "Past claims",
        status: "received",
        required: true,
      },
      {
        kind: "inspection",
        name: "Building inspection",
        status: "received",
        required: false,
      },
    ],
    claims: [
      {
        year: 2024,
        description: "Minor hail damage to roof",
        amount_usd: 28_000,
        open: false,
      },
    ],
  },
  {
    submission_id: "sub_cascade_printworks",
    applicant_name: "Cascade Print Works",
    business_type: "Commercial print shop, light workshop",
    state: "WA",
    property_value_usd: 1_200_000,
    annual_revenue_usd: 900_000,
    broker_email: "june@soundriskpartners.example",
    docs: [
      {
        kind: "application",
        name: "Business application",
        status: "received",
        required: true,
      },
      {
        kind: "property-details",
        name: "Building value + condition",
        status: "received",
        required: true,
        notes: "Single-story building in sound condition, owner-occupied.",
      },
      {
        kind: "claims-history",
        name: "Past claims",
        status: "received",
        required: true,
      },
    ],
    claims: [
      {
        year: THIS_YEAR - 4,
        description: "Burst pipe, water damage to a storage room",
        amount_usd: 21_000,
        open: false,
      },
      {
        year: THIS_YEAR - 3,
        description: "Windstorm damage to exterior signage",
        amount_usd: 9_000,
        open: false,
      },
      {
        year: THIS_YEAR - 2,
        description: "Theft of computer equipment after a break-in",
        amount_usd: 14_000,
        open: false,
      },
    ],
  },
  {
    submission_id: "sub_vacant_millworks",
    applicant_name: "Vacant Millworks Building",
    business_type: "Former workshop building, currently vacant",
    state: "PA",
    property_value_usd: 3_200_000,
    annual_revenue_usd: 0,
    broker_email: "lee@keystonerisk.example",
    docs: [
      {
        kind: "application",
        name: "Business application",
        status: "received",
        required: true,
      },
      {
        kind: "property-details",
        name: "Building value + condition",
        status: "received",
        required: true,
        notes:
          "Building is currently vacant, with no tenant or renovation planned.",
      },
      {
        kind: "claims-history",
        name: "Past claims",
        status: "requested",
        required: true,
      },
    ],
    claims: [],
  },
];
