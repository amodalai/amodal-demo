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
