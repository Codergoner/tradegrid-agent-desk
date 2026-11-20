// Reference data shared by the browser and the server.
// Everything here is deterministic configuration, not regulatory advice.

export const ORIGIN_COUNTRY = 'Malaysia'

// Destinations with a reviewed coverage tier. Any other country can still be recorded,
// but the rules engine flags it as "unsupported: manual review required".
export const DESTINATION_COVERAGE = {
  Singapore: { tier: 'reviewed', note: 'Import permit via TradeNet by the Singapore importer or Declaring Agent. Reviewed against Singapore Customs guidance.' },
  Thailand: { tier: 'handoff', note: 'Importer handoff profile only. Destination import requirements were recorded in September 2026 and must be confirmed with the importer or a licensed broker.' },
  Indonesia: { tier: 'handoff', note: 'Importer handoff profile only. Destination import requirements must be confirmed with the importer or a licensed broker.' },
  Vietnam: { tier: 'handoff', note: 'Importer handoff profile only. Destination import requirements must be confirmed with the importer or a licensed broker.' },
  Philippines: { tier: 'handoff', note: 'Importer handoff profile only. Destination import requirements must be confirmed with the importer or a licensed broker.' }
}
export const SUPPORTED_DESTINATIONS = Object.keys(DESTINATION_COVERAGE)
export const ASEAN_MEMBERS = ['Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines', 'Singapore', 'Thailand', 'Vietnam']

// ISO 3166 short names (English). Used for validation of destination and party countries.
export const COUNTRIES = ['Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Congo (Democratic Republic)', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Korea (North)', 'Korea (South)', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macao', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Türkiye', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe']

export const CURRENCIES = ['MYR', 'USD', 'SGD', 'THB', 'IDR', 'VND', 'PHP', 'EUR', 'GBP', 'AUD', 'JPY', 'CNY']
export const TRANSPORT_MODES = ['Air', 'Sea', 'Land', 'Courier']

// ICC Incoterms® 2020. FAS, FOB, CFR and CIF are defined for sea and inland waterway transport only;
// the other seven rules apply to any mode. Source: ICC, Incoterms® 2020 (https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/).
export const INCOTERMS = {
  EXW: { label: 'Ex Works', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  FCA: { label: 'Free Carrier', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  CPT: { label: 'Carriage Paid To', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  CIP: { label: 'Carriage and Insurance Paid To', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  DAP: { label: 'Delivered at Place', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  DPU: { label: 'Delivered at Place Unloaded', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  DDP: { label: 'Delivered Duty Paid', modes: ['Air', 'Sea', 'Land', 'Courier'] },
  FAS: { label: 'Free Alongside Ship', modes: ['Sea'] },
  FOB: { label: 'Free on Board', modes: ['Sea'] },
  CFR: { label: 'Cost and Freight', modes: ['Sea'] },
  CIF: { label: 'Cost, Insurance and Freight', modes: ['Sea'] }
}
export const INCOTERM_CODES = Object.keys(INCOTERMS)
export const incotermAllowsMode = (incoterm, mode) => Boolean(INCOTERMS[incoterm]?.modes.includes(mode))

export const PRODUCT_CATEGORIES = ['General', 'Food', 'Agriculture', 'Electronics', 'Textiles', 'Chemicals']
export const UNITS = ['pieces', 'sets', 'pairs', 'boxes', 'cartons', 'kg', 'g', 'litres', 'metres', 'square metres', 'cubic metres', 'tonnes', 'dozens', 'rolls', 'bags', 'drums', 'pallets']
export const PACKAGE_TYPES = ['Carton', 'Box', 'Crate', 'Pallet', 'Drum', 'Bag', 'Bale', 'Roll', 'Bundle', 'Container', 'Other']
export const ZERO_VALUE_REASONS = {
  sample: 'Commercial sample with no commercial value',
  warranty_replacement: 'Warranty or replacement goods',
  return: 'Returned goods',
  free_of_charge: 'Free-of-charge goods (promotional or gift)'
}

// Three-way screening answers used by the rules engine.
export const SCREENING_ANSWERS = ['unknown', 'yes', 'no']

export const SHIPMENT_STATUSES = ['draft', 'ready_for_review', 'changes_requested', 'approved', 'archived']
export const SHIPMENT_STATUS_LABELS = {
  draft: 'Draft',
  ready_for_review: 'Ready for internal review',
  changes_requested: 'Changes requested',
  approved: 'Document package approved',
  archived: 'Archived'
}

export const EVIDENCE_STATUSES = ['not_assessed', 'information_missing', 'action_required', 'evidence_uploaded', 'pending_review', 'verified', 'rejected', 'not_applicable']
export const EVIDENCE_STATUS_LABELS = {
  not_assessed: 'Not assessed',
  information_missing: 'Information missing',
  action_required: 'Action required',
  evidence_uploaded: 'Evidence uploaded',
  pending_review: 'Pending review',
  verified: 'Verified by reviewer',
  rejected: 'Rejected by reviewer',
  not_applicable: 'Not applicable'
}
// What the submitting user reports about the external world. Never presented as government verification.
export const REPORTED_STATES = ['not_started', 'in_progress', 'filed', 'issued', 'accepted', 'not_required']
export const REPORTED_STATE_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress / applied',
  filed: 'Filed (user-reported)',
  issued: 'Issued (user-reported)',
  accepted: 'Accepted by authority (user-reported)',
  not_required: 'Not required (user-reported)'
}

export const ROLES = ['admin', 'operations', 'reviewer', 'readonly']
export const ROLE_LABELS = { admin: 'Administrator', operations: 'Export operations', reviewer: 'Reviewer / manager', readonly: 'Read-only' }

export const DOCUMENT_TYPES = ['commercial-invoice', 'packing-list', 'shipment-summary']
export const DOCUMENT_TYPE_LABELS = { 'commercial-invoice': 'Commercial invoice', 'packing-list': 'Packing list', 'shipment-summary': 'Shipment summary' }

export const LIMITS = {
  text: 1000,
  shortText: 200,
  products: 50,
  charges: 20,
  quantity: 1e9,
  price: 1e9,
  weight: 1e9,
  packages: 1e9,
  lineValue: 1e12,
  uploadBytes: 5 * 1024 * 1024,
  jsonBytes: 512 * 1024
}
