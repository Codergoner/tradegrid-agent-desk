// Shipment data model: validation, normalisation and decimal-safe totals.
// The server treats this module as authoritative; the browser reuses it for instant feedback.
import {
  ORIGIN_COUNTRY, COUNTRIES, CURRENCIES, TRANSPORT_MODES, INCOTERM_CODES, incotermAllowsMode,
  PRODUCT_CATEGORIES, PACKAGE_TYPES, ZERO_VALUE_REASONS, SCREENING_ANSWERS, LIMITS
} from './reference.js'

// Legacy named exports kept for the customs worksheet and older modules.
export const destinations = ['Singapore', 'Thailand', 'Indonesia', 'Vietnam', 'Philippines']
export const currencies = CURRENCIES
export const modes = TRANSPORT_MODES
export const incoterms = INCOTERM_CODES

export const emptyParty = () => ({ companyName: '', registrationNumber: '', address: '', country: '', contactPerson: '', email: '', phone: '' })
export const emptyProduct = () => ({
  name: '', description: '', sku: '', hsCode: '', countryOfOrigin: ORIGIN_COUNTRY, quantity: '', unit: 'pieces', unitPrice: '',
  netWeight: '', grossWeight: '', packageCount: '', packageType: 'Carton',
  screening: { hsConfirmed: false, strategicItem: 'unknown', plantOrAnimalMaterial: 'unknown' }
})
export const emptyShipment = () => ({
  reference: '', invoiceNumber: '',
  exporter: { ...emptyParty(), country: ORIGIN_COUNTRY },
  buyer: emptyParty(),
  consignee: { sameAsBuyer: true, ...emptyParty() },
  shipment: {
    originCountry: ORIGIN_COUNTRY, destinationCountry: 'Singapore', mode: 'Sea', incoterm: 'FOB', namedPlace: '', currency: 'USD',
    departureDate: '', arrivalDate: '', departurePoint: '', arrivalPoint: '', productCategory: 'General', preferentialTariff: false,
    paymentTerms: '', notes: '',
    screening: { strategicGoods: 'unknown', restrictedGoodsChecked: 'unknown', plantOrAnimalMaterial: 'unknown', endUserKnown: 'unknown' }
  },
  charges: [],
  zeroValueReason: '',
  products: [emptyProduct()]
})

// ---------- primitive checks ----------
const isString = value => typeof value === 'string'
const hasText = (value, max = LIMITS.text) => isString(value) && value.trim().length > 0 && value.length <= max
const okText = (value, max = LIMITS.text) => value === undefined || value === null || (isString(value) && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
const numeric = value => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value))
const provided = value => value !== undefined && value !== null && String(value).trim() !== ''
const validDate = value => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const precisionOk = (value, precision) => Number(Number(value).toFixed(precision)) === Number(value)
export const normalizeHsCode = value => String(value ?? '').replace(/[.\s-]/g, '')
export const hsCodeSyntaxOk = value => /^\d{6,10}$/.test(normalizeHsCode(value))

const PARTY_LABELS = { companyName: 'company name', registrationNumber: 'business registration number', address: 'address', country: 'country', contactPerson: 'contact person', email: 'email', phone: 'telephone' }

/**
 * Returns a list of issues. Structural issues make a record unsaveable (wrong types, ranges, enumerations,
 * impossible combinations). Completeness issues only block submission for review and document finalisation,
 * so drafts can be saved and resumed.
 * Each issue: { path, label, step, kind: 'structural' | 'completeness' }
 */
export function shipmentIssues(value, { level = 'structural' } = {}) {
  const d = value && typeof value === 'object' ? value : {}
  const issues = []
  const structural = (path, label, step) => issues.push({ path, label, step, kind: 'structural' })
  const completeness = (path, label, step) => { if (level === 'complete') issues.push({ path, label, step, kind: 'completeness' }) }

  for (const key of ['reference', 'invoiceNumber']) {
    if (d[key] !== undefined && d[key] !== null && (!isString(d[key]) || d[key].length > 100 || /[\u0000-\u001f\u007f]/.test(d[key]))) structural(key, `Invalid ${key === 'reference' ? 'shipment reference' : 'invoice reference'}.`, 'route')
  }

  // ----- parties -----
  const parties = [['exporter', 'exporter', ['companyName', 'registrationNumber', 'address', 'country', 'contactPerson', 'email']], ['buyer', 'buyer', ['companyName', 'address', 'country', 'contactPerson', 'email']]]
  const consignee = d.consignee && typeof d.consignee === 'object' ? d.consignee : { sameAsBuyer: true }
  if (consignee.sameAsBuyer !== undefined && typeof consignee.sameAsBuyer !== 'boolean') structural('consignee.sameAsBuyer', 'Invalid consignee setting.', 'buyer')
  if (consignee.sameAsBuyer === false) parties.push(['consignee', 'buyer', ['companyName', 'address', 'country', 'contactPerson']])
  for (const [group, step, required] of parties) {
    const party = d[group] && typeof d[group] === 'object' ? d[group] : {}
    for (const key of ['companyName', 'registrationNumber', 'address', 'country', 'contactPerson', 'email', 'phone']) {
      const max = ['phone', 'registrationNumber', 'email', 'contactPerson', 'country'].includes(key) ? LIMITS.shortText : LIMITS.text
      if (!okText(party[key], max)) structural(`${group}.${key}`, `Keep ${group} ${PARTY_LABELS[key]} within ${max} characters.`, step)
    }
    if (provided(party.country) && !COUNTRIES.includes(party.country)) structural(`${group}.country`, `Select a recognised country for the ${group}.`, step)
    if (provided(party.email) && !validEmail(party.email)) structural(`${group}.email`, `Enter a valid ${group} email address.`, step)
    for (const key of required) if (!hasText(party[key], LIMITS.text)) completeness(`${group}.${key}`, `Enter the ${group} ${PARTY_LABELS[key]}.`, step)
  }
  if (provided(d.exporter?.country) && d.exporter.country !== ORIGIN_COUNTRY) structural('exporter.country', `The exporter must be located in ${ORIGIN_COUNTRY} for this workflow.`, 'exporter')

  // ----- route and terms -----
  const s = d.shipment && typeof d.shipment === 'object' ? d.shipment : {}
  if (provided(s.originCountry) && s.originCountry !== ORIGIN_COUNTRY) structural('shipment.originCountry', `Only exports from ${ORIGIN_COUNTRY} are supported.`, 'route')
  if (!provided(s.originCountry)) completeness('shipment.originCountry', 'Select the exporting country.', 'route')
  if (provided(s.destinationCountry) && !COUNTRIES.includes(s.destinationCountry)) structural('shipment.destinationCountry', 'Select a recognised destination country.', 'route')
  if (provided(s.destinationCountry) && s.destinationCountry === ORIGIN_COUNTRY) structural('shipment.destinationCountry', 'The destination must differ from the exporting country.', 'route')
  if (!provided(s.destinationCountry)) completeness('shipment.destinationCountry', 'Select the destination country.', 'route')
  for (const [key, allowed, label] of [['mode', TRANSPORT_MODES, 'transport mode'], ['incoterm', INCOTERM_CODES, 'trade term'], ['currency', CURRENCIES, 'currency'], ['productCategory', PRODUCT_CATEGORIES, 'product category']]) {
    if (provided(s[key]) && !allowed.includes(s[key])) structural(`shipment.${key}`, `Select a supported ${label}.`, 'route')
    else if (!provided(s[key])) completeness(`shipment.${key}`, `Select the ${label}.`, 'route')
  }
  if (provided(s.mode) && provided(s.incoterm) && TRANSPORT_MODES.includes(s.mode) && INCOTERM_CODES.includes(s.incoterm) && !incotermAllowsMode(s.incoterm, s.mode)) {
    structural('shipment.incoterm', `${s.incoterm} is defined for sea and inland-waterway transport only (ICC Incoterms® 2020). Choose FCA, CPT, CIP, DAP, DPU, DDP or EXW for ${s.mode.toLowerCase()} shipments.`, 'route')
  }
  for (const key of ['departureDate', 'arrivalDate']) {
    if (provided(s[key]) && !validDate(s[key])) structural(`shipment.${key}`, `Enter a valid ${key === 'departureDate' ? 'planned departure' : 'planned arrival'} date (YYYY-MM-DD).`, 'route')
    else if (!provided(s[key])) completeness(`shipment.${key}`, `Enter the planned ${key === 'departureDate' ? 'departure' : 'arrival'} date.`, 'route')
  }
  if (validDate(s.departureDate) && validDate(s.arrivalDate) && s.arrivalDate < s.departureDate) structural('shipment.arrivalDate', 'Planned arrival cannot be before planned departure.', 'route')
  for (const key of ['namedPlace', 'departurePoint', 'arrivalPoint', 'paymentTerms']) if (!okText(s[key], LIMITS.shortText)) structural(`shipment.${key}`, `Keep ${key} within ${LIMITS.shortText} characters.`, 'route')
  if (!okText(s.notes, LIMITS.text)) structural('shipment.notes', 'Keep notes within 1,000 characters.', 'route')
  if (!hasText(s.namedPlace, LIMITS.shortText)) completeness('shipment.namedPlace', 'Enter the named place for the trade term (for example the port or delivery address).', 'route')
  if (s.preferentialTariff !== undefined && typeof s.preferentialTariff !== 'boolean') structural('shipment.preferentialTariff', 'Invalid preferential-treatment setting.', 'route')
  const screening = s.screening && typeof s.screening === 'object' ? s.screening : {}
  for (const key of ['strategicGoods', 'restrictedGoodsChecked', 'plantOrAnimalMaterial', 'endUserKnown']) {
    if (screening[key] !== undefined && !SCREENING_ANSWERS.includes(screening[key])) structural(`shipment.screening.${key}`, 'Invalid screening answer.', 'route')
  }

  // ----- charges and zero-value goods -----
  const charges = Array.isArray(d.charges) ? d.charges : (d.charges === undefined ? [] : null)
  if (charges === null || charges.length > LIMITS.charges) structural('charges', `Charges must be a list of at most ${LIMITS.charges} entries.`, 'products')
  else charges.forEach((charge, i) => {
    if (!hasText(charge?.description, LIMITS.shortText)) structural(`charges[${i}].description`, `Charge ${i + 1}: enter a description.`, 'products')
    if (!numeric(charge?.amount) || Math.abs(Number(charge.amount)) > LIMITS.price || !precisionOk(charge.amount, 2)) structural(`charges[${i}].amount`, `Charge ${i + 1}: enter a finite amount with up to 2 decimal places.`, 'products')
  })
  if (d.zeroValueReason !== undefined && d.zeroValueReason !== '' && d.zeroValueReason !== null && !Object.keys(ZERO_VALUE_REASONS).includes(d.zeroValueReason)) structural('zeroValueReason', 'Select a supported reason for zero-value goods.', 'products')

  // ----- product lines -----
  const products = Array.isArray(d.products) ? d.products : null
  if (products === null || products.length > LIMITS.products) structural('products', `Add between 1 and ${LIMITS.products} product lines.`, 'products')
  else if (products.length === 0) completeness('products', 'Add at least one product line.', 'products')
  let hasZeroValueLine = false
  for (const [i, p] of (products || []).entries()) {
    const prefix = `products[${i}]`, name = `Product ${i + 1}`
    if (!p || typeof p !== 'object') { structural(prefix, `${name}: invalid product line.`, 'products'); continue }
    for (const [key, max] of [['name', LIMITS.shortText], ['description', LIMITS.text], ['sku', 100], ['countryOfOrigin', 100], ['unit', 50], ['hsCode', 20]]) if (!okText(p[key], max)) structural(`${prefix}.${key}`, `${name}: keep ${key} within ${max} characters.`, 'products')
    for (const key of ['name', 'description']) if (!hasText(p[key], key === 'name' ? LIMITS.shortText : LIMITS.text)) completeness(`${prefix}.${key}`, `${name}: enter a meaningful ${key}.`, 'products')
    if (!hasText(p.unit, 50)) completeness(`${prefix}.unit`, `${name}: enter the unit of measure.`, 'products')
    if (provided(p.countryOfOrigin) && !COUNTRIES.includes(p.countryOfOrigin)) structural(`${prefix}.countryOfOrigin`, `${name}: select a recognised country of origin.`, 'products')
    if (!provided(p.countryOfOrigin)) completeness(`${prefix}.countryOfOrigin`, `${name}: enter the country of origin.`, 'products')
    if (provided(p.packageType) && !PACKAGE_TYPES.includes(p.packageType)) structural(`${prefix}.packageType`, `${name}: select a supported package type.`, 'products')
    if (provided(p.hsCode) && !hsCodeSyntaxOk(p.hsCode)) structural(`${prefix}.hsCode`, `${name}: HS code must contain 6–10 digits (dots and spaces allowed). This is a syntax check only, not a classification.`, 'products')
    if (!provided(p.hsCode)) completeness(`${prefix}.hsCode`, `${name}: enter the HS code (confirm the classification with Customs or your agent).`, 'products')

    const numbers = [['quantity', 'quantity', 3, LIMITS.quantity, true], ['unitPrice', 'unit price', 2, LIMITS.price, false], ['netWeight', 'net weight', 3, LIMITS.weight, true], ['grossWeight', 'gross weight', 3, LIMITS.weight, true], ['packageCount', 'package count', 0, LIMITS.packages, true]]
    for (const [key, label, precision, max, mustBePositive] of numbers) {
      if (!provided(p[key])) { completeness(`${prefix}.${key}`, `${name}: enter the ${label}.`, 'products'); continue }
      if (!numeric(p[key])) { structural(`${prefix}.${key}`, `${name}: ${label} must be a number.`, 'products'); continue }
      const n = Number(p[key])
      if (n < 0) structural(`${prefix}.${key}`, `${name}: ${label} cannot be negative.`, 'products')
      else if (mustBePositive && n === 0) structural(`${prefix}.${key}`, `${name}: ${label} must be greater than zero.`, 'products')
      else if (n > max) structural(`${prefix}.${key}`, `${name}: ${label} cannot exceed ${max.toLocaleString('en-US')}.`, 'products')
      else if (!precisionOk(n, precision)) structural(`${prefix}.${key}`, precision === 0 ? `${name}: ${label} must be a whole number.` : `${name}: ${label} supports up to ${precision} decimal places.`, 'products')
    }
    if (numeric(p.unitPrice) && Number(p.unitPrice) === 0) hasZeroValueLine = true
    if (numeric(p.grossWeight) && numeric(p.netWeight) && Number(p.grossWeight) < Number(p.netWeight)) structural(`${prefix}.grossWeight`, `${name}: gross weight cannot be less than net weight.`, 'products')
    if (numeric(p.quantity) && numeric(p.unitPrice) && Number(p.quantity) * Number(p.unitPrice) > LIMITS.lineValue) structural(`${prefix}.unitPrice`, `${name}: line value cannot exceed 1 trillion.`, 'products')
    const ps = p.screening && typeof p.screening === 'object' ? p.screening : {}
    if (ps.hsConfirmed !== undefined && typeof ps.hsConfirmed !== 'boolean') structural(`${prefix}.screening.hsConfirmed`, `${name}: invalid HS confirmation.`, 'products')
    for (const key of ['strategicItem', 'plantOrAnimalMaterial']) if (ps[key] !== undefined && !SCREENING_ANSWERS.includes(ps[key])) structural(`${prefix}.screening.${key}`, `${name}: invalid screening answer.`, 'products')
  }
  if (hasZeroValueLine && !Object.keys(ZERO_VALUE_REASONS).includes(d.zeroValueReason)) structural('zeroValueReason', 'Zero-value goods need an explicit reason (sample, warranty replacement, return or free-of-charge).', 'products')
  return issues
}

export const validateShipment = (data, options) => shipmentIssues(data, options).map(issue => issue.path)
export const structuralIssues = data => shipmentIssues(data, { level: 'structural' })
export const completenessIssues = data => shipmentIssues(data, { level: 'complete' }).filter(issue => issue.kind === 'completeness')

// ---------- decimal-safe arithmetic (scaled BigInt) ----------
const scaled = (value, precision) => {
  if (!numeric(value)) return null
  const n = Number(value)
  if (Math.abs(n) > LIMITS.lineValue || !precisionOk(n, precision)) return null
  const [whole, fraction = ''] = Math.abs(n).toFixed(precision).split('.')
  const digits = BigInt(whole + fraction)
  return n < 0 ? -digits : digits
}
const minorUnits = p => {
  const quantity = scaled(p?.quantity, 3), price = scaled(p?.unitPrice, 2)
  if (quantity === null || price === null || quantity < 0n || price < 0n) return null
  // quantity has 3 decimals, price has 2 → product has 5; round half-up to 2 decimals.
  return (quantity * price + 500n) / 1000n
}
const fromMinor = value => Number(value) / 100
export const lineTotal = p => { const value = minorUnits(p); return value === null ? NaN : fromMinor(value) }
export const goodsTotal = d => {
  let total = 0n
  for (const p of d?.products || []) { const value = minorUnits(p); if (value === null) return NaN; total += value }
  return fromMinor(total)
}
export const chargesTotal = d => {
  let total = 0n
  for (const charge of d?.charges || []) { const value = scaled(charge?.amount, 2); if (value === null) return NaN; total += value }
  return fromMinor(total)
}
export const invoiceTotal = d => {
  let total = 0n
  for (const p of d?.products || []) { const value = minorUnits(p); if (value === null) return NaN; total += value }
  for (const charge of d?.charges || []) { const value = scaled(charge?.amount, 2); if (value === null) return NaN; total += value }
  return fromMinor(total)
}
export const shipmentTotal = goodsTotal
// Weights and package counts are totals PER LINE, never per unit. Packing totals are exact scaled sums.
export const packingTotals = d => {
  const total = { packages: 0n, net: 0n, gross: 0n }
  for (const p of d?.products || []) {
    for (const [key, field, precision] of [['packages', 'packageCount', 0], ['net', 'netWeight', 3], ['gross', 'grossWeight', 3]]) {
      const value = scaled(p?.[field], precision)
      total[key] = value === null || total[key] === null || value < 0n ? null : total[key] + value
    }
  }
  const packages = total.packages === null ? NaN : Number(total.packages)
  return { packages, cartons: packages, net: total.net === null ? NaN : Number(total.net) / 1000, gross: total.gross === null ? NaN : Number(total.gross) / 1000 }
}
export const shipmentTotals = d => ({ goods: goodsTotal(d), charges: chargesTotal(d), invoice: invoiceTotal(d), ...packingTotals(d) })

// ---------- normalisation ----------
const trim = value => (typeof value === 'string' ? value.trim() : value)
const numberOrEmpty = value => (provided(value) && numeric(value) ? String(Number(value)) : '')
/** Produces a canonical copy with known keys only. Does not validate; call shipmentIssues first. */
export function normalizeShipmentInput(data) {
  const base = emptyShipment()
  const party = (source, template) => Object.fromEntries(Object.keys(template).map(key => [key, key === 'sameAsBuyer' ? (source?.[key] !== false) : (trim(source?.[key] ?? template[key]) ?? '')]))
  const s = data?.shipment || {}
  const screening = Object.fromEntries(Object.keys(base.shipment.screening).map(key => [key, s.screening?.[key] ?? 'unknown']))
  return {
    reference: trim(data?.reference ?? ''), invoiceNumber: trim(data?.invoiceNumber ?? ''),
    exporter: party(data?.exporter, base.exporter),
    buyer: party(data?.buyer, base.buyer),
    consignee: party(data?.consignee, base.consignee),
    shipment: {
      ...Object.fromEntries(Object.keys(base.shipment).filter(key => key !== 'screening' && key !== 'preferentialTariff').map(key => [key, trim(s[key] ?? base.shipment[key]) ?? ''])),
      preferentialTariff: s.preferentialTariff === true,
      screening
    },
    charges: (Array.isArray(data?.charges) ? data.charges : []).map(charge => ({ description: trim(charge?.description ?? ''), amount: numberOrEmpty(charge?.amount) })),
    zeroValueReason: trim(data?.zeroValueReason ?? '') || '',
    products: (Array.isArray(data?.products) ? data.products : []).map(product => {
      const template = emptyProduct()
      return {
        ...Object.fromEntries(['name', 'description', 'sku', 'countryOfOrigin', 'unit', 'packageType'].map(key => [key, trim(product?.[key] ?? template[key]) ?? ''])),
        hsCode: normalizeHsCode(product?.hsCode ?? ''),
        ...Object.fromEntries(['quantity', 'unitPrice', 'netWeight', 'grossWeight', 'packageCount'].map(key => [key, numberOrEmpty(product?.[key])])),
        screening: { hsConfirmed: product?.screening?.hsConfirmed === true, strategicItem: product?.screening?.strategicItem ?? 'unknown', plantOrAnimalMaterial: product?.screening?.plantOrAnimalMaterial ?? 'unknown' }
      }
    })
  }
}

// Fields whose change invalidates evaluations, evidence verification and approvals.
export const MATERIAL_FIELDS = ['exporter', 'buyer', 'consignee', 'products', 'charges', 'zeroValueReason', 'shipment']
export const materialFingerprint = data => JSON.stringify(Object.fromEntries(MATERIAL_FIELDS.map(key => [key, key === 'shipment' ? Object.fromEntries(Object.entries(data.shipment || {}).filter(([k]) => !['notes', 'paymentTerms'].includes(k))) : data[key]])))
