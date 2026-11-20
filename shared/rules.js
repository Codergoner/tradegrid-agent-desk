// Deterministic, versioned rules engine. No UI, no AI, no network.
// Each rule answers: does it apply to this shipment ("applies" | "not_applicable" | "unknown"), why,
// and which inputs are missing. "unknown" never counts as a pass.
import { DESTINATION_COVERAGE, ASEAN_MEMBERS, ORIGIN_COUNTRY } from './reference.js'
import { hsCodeSyntaxOk, completenessIssues } from './shipment.js'

export const RULESET_VERSION = 'MY-EXPORT-2026.10.1'
export const RULESET_REVIEWED = '2026-10-27'
export const RULESET_NOTES = 'Malaysian export-side requirements re-verified against official pages on 2026-10-27. Destination import requirements are covered only for Singapore; other listed destinations carry importer handoff profiles that were not re-verified in this ruleset.'

export const PREVIOUS_RULESETS = [
  { version: 'MY-EXPORT-2026.07.2', reviewed: '2026-07-15', notes: 'Prototype checklist of nine fixed items. Replaced by three-way applicability rules and per-rule evidence records.' }
]

export const regulationSources = [
  { id: 'customs-export', agency: 'Royal Malaysian Customs Department', title: 'Prosedur Pengeksportan (export procedure: K2/K8 CUSDEC declaration, permit validation in SMK)', law: 'Customs Act 1967; Customs Regulations', url: 'https://www.customs.gov.my/ms/perniagaan/import-eksport/eksport/prosedur-pengeksportan', published: '2026-03-04', reviewed: '2026-10-27' },
  { id: 'customs-prohibition', agency: 'Royal Malaysian Customs Department / MITI', title: 'Customs (Prohibition of Exports) Order 2023', law: 'P.U. (A) 122/2023 and subsequent amendments', url: 'https://www.miti.gov.my/miti/resources/Approve%20Permit/PU(A)_122-_Perintah_Kastam_(Larangan_Mengenai_Eksport)_2023.pdf', published: '2023', reviewed: '2026-10-27', note: 'Check the latest amendment orders before relying on schedule contents.' },
  { id: 'strategic-trade', agency: 'Ministry of Investment, Trade and Industry (MITI)', title: 'Strategic Trade Act 2010 — permits, Strategic Items List 2025, End-Use Statement (Form 5), ePermit STA', law: 'Strategic Trade Act 2010 [Act 708]; Strategic Trade (Strategic Items) List 2025 (effective 2 June 2025)', url: 'https://www.miti.gov.my/index.php/pages/view/sta2010?mid=1129', published: '2026-10-09', reviewed: '2026-10-27' },
  { id: 'atiga-origin', agency: 'Ministry of Investment, Trade and Industry (MITI)', title: 'Preferential Certificate of Origin: ATIGA e-Form D via ePCO and ASEAN Single Window; ASEAN-Wide Self-Certification (Certified Exporter)', law: 'ASEAN Trade in Goods Agreement (ATIGA), Operational Certification Procedures', url: 'https://www.miti.gov.my/index.php/pages/view/pco', published: '2026', reviewed: '2026-10-27' },
  { id: 'maqis', agency: 'Department of Malaysian Quarantine and Inspection Services (MAQIS)', title: 'Malaysian Quarantine and Inspection Services Act 2011 and 2013 Regulations (exporter registration; permits, licences and certificates)', law: 'Act 728 and subsidiary regulations', url: 'https://www.maqis.gov.my/index.php/akta/', published: '2013', reviewed: '2026-10-27' },
  { id: 'matrade-docs', agency: 'Malaysia External Trade Development Corporation (MATRADE)', title: "Beginner's Guide to Exporting — logistics and documentation (commercial invoice, packing list, transport documents)", law: 'Practical guidance, not legislation', url: 'https://www.matrade.gov.my/documents/ebook/guide_exporting/16/', published: 'n/a', reviewed: '2026-10-27' },
  { id: 'sg-import-permit', agency: 'Singapore Customs', title: 'Obtain a Customs Import Permit (TradeNet, Declaring Agent, UEN and Customs Account)', law: 'Singapore Customs Act / Regulation of Imports and Exports Act', url: 'https://www.customs.gov.sg/doing-business/import-operations/import-procedures/obtain-a-customs-import-permit/', published: '2026-02-23', reviewed: '2026-10-27' },
  { id: 'icc-incoterms', agency: 'International Chamber of Commerce (ICC)', title: 'Incoterms® 2020 rules — transport-mode applicability of FAS, FOB, CFR, CIF', law: 'ICC Incoterms® 2020', url: 'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/', published: '2020-01-01', reviewed: '2026-10-27' }
]
const source = id => regulationSources.find(item => item.id === id)

const APPLIES = (reason, missing = []) => ({ applicability: 'applies', reason, missing })
const NOT_APPLICABLE = (reason) => ({ applicability: 'not_applicable', reason, missing: [] })
const UNKNOWN = (reason, missing = []) => ({ applicability: 'unknown', reason, missing })

const anyProduct = (shipment, test) => (shipment.products || []).some(test)
const everyProduct = (shipment, test) => (shipment.products || []).length > 0 && shipment.products.every(test)
const screening = shipment => shipment.shipment?.screening || {}
const coverage = shipment => DESTINATION_COVERAGE[shipment.shipment?.destinationCountry]

/**
 * Rule shape:
 * id, title, jurisdiction, scope, severity ('critical'|'high'|'medium'|'info'), requiredInputs (field paths),
 * evidence: { kind: 'internal'|'screening'|'external_filing'|'external_permit'|'handoff'|'review', label, referenceLabel, expiry },
 * sourceId, effective, lastReviewed, notes, limitations, evaluate(shipment) → {applicability, reason, missing}
 */
export const rules = [
  {
    id: 'MY-COMMERCIAL-DOCUMENTS', title: 'Commercial invoice and packing list prepared internally', jurisdiction: 'Malaysia', scope: 'All exports',
    severity: 'high', requiredInputs: ['exporter', 'buyer', 'products', 'shipment.currency', 'shipment.incoterm'],
    evidence: { kind: 'internal', label: 'Finalised commercial invoice and packing list from this workspace', referenceLabel: 'Document version', expiry: false },
    sourceId: 'matrade-docs', effective: null, lastReviewed: RULESET_REVIEWED,
    notes: 'The commercial invoice and packing list are prepared from the stored shipment record and must be finalised at the current shipment revision. Status is derived automatically from the Documents tab; it cannot be marked verified by hand.',
    limitations: 'Internal preparation only. These documents are not customs declarations or certificates.',
    evaluate: () => APPLIES('Every export shipment needs an itemised commercial invoice and a packing list for the carrier, the buyer and the customs declaration.')
  },
  {
    id: 'MY-HS-CLASSIFICATION', title: 'HS code supplied and confirmed for every product line', jurisdiction: 'Malaysia', scope: 'All exports',
    severity: 'high', requiredInputs: ['products[].hsCode', 'products[].screening.hsConfirmed'],
    evidence: { kind: 'screening', label: 'Classification confirmed by the exporter (customs ruling or agent advice recommended)', referenceLabel: 'Customs ruling / agent reference (optional)', expiry: false },
    sourceId: 'customs-export', effective: null, lastReviewed: RULESET_REVIEWED,
    notes: 'TradeGrid checks HS code syntax only (6–10 digits). Authoritative classification is the responsibility of the exporter, a licensed customs agent or Royal Malaysian Customs. Malaysian tariff lines are 10 digits under the Customs Duties Order.',
    limitations: 'No automatic classification. A syntactically valid code is not a verified classification.',
    evaluate: shipment => {
      const products = shipment.products || []
      if (!products.length) return UNKNOWN('No product lines have been entered yet.', ['products'])
      const missing = products.map((p, i) => (!hsCodeSyntaxOk(p.hsCode) ? `products[${i}].hsCode` : null)).filter(Boolean)
      return APPLIES('The K2 declaration, origin claims and controlled-goods screening all depend on the HS classification of each line.', missing)
    }
  },
  {
    id: 'MY-CUSTOMS-K2-DECLARATION', title: 'Export declaration (Customs Form K2/K8) lodged electronically', jurisdiction: 'Malaysia', scope: 'All exports from Malaysia',
    severity: 'critical', requiredInputs: ['exporter.registrationNumber', 'products[].hsCode', 'shipment.departurePoint'],
    evidence: { kind: 'external_filing', label: 'CUSDEC K2/K8 declaration submitted by the exporter or appointed agent and accepted in the Customs system', referenceLabel: 'Declaration / registration number', expiry: false },
    sourceId: 'customs-export', effective: '2026-03-04', lastReviewed: RULESET_REVIEWED,
    notes: 'The exporter or the appointed shipping/forwarding agent lodges the K2 (or K8 for certain movements) as a CUSDEC in the Customs system (SMK). Where a permit applies, the permit number is declared and validated electronically before export.',
    limitations: 'TradeGrid records the user-reported filing outcome. It does not submit declarations or confirm acceptance with Customs.',
    evaluate: shipment => {
      const missing = []
      if (!shipment.exporter?.registrationNumber?.trim()) missing.push('exporter.registrationNumber')
      if (!shipment.shipment?.departurePoint?.trim()) missing.push('shipment.departurePoint')
      return APPLIES('Goods leaving Malaysia must be declared to Royal Malaysian Customs before export.', missing)
    }
  },
  {
    id: 'MY-PROHIBITED-RESTRICTED-SCREENING', title: 'Goods screened against the Customs (Prohibition of Exports) Order', jurisdiction: 'Malaysia', scope: 'All exports',
    severity: 'critical', requiredInputs: ['products[].hsCode', 'shipment.screening.restrictedGoodsChecked'],
    evidence: { kind: 'screening', label: 'Screening outcome recorded against the current Prohibition of Exports Order schedules (who checked, when, result)', referenceLabel: 'Permit / licence number if the goods are restricted', expiry: true },
    sourceId: 'customs-prohibition', effective: '2023', lastReviewed: RULESET_REVIEWED,
    notes: 'The Order lists goods whose export is absolutely prohibited, prohibited except under licence/permit, or prohibited except in the manner provided. The screening must use the HS code and goods description of each line.',
    limitations: 'TradeGrid does not contain the schedules and cannot determine whether a product is listed. The exporter records the outcome of their own screening.',
    evaluate: shipment => {
      const missing = (shipment.products || []).map((p, i) => (!hsCodeSyntaxOk(p.hsCode) ? `products[${i}].hsCode` : null)).filter(Boolean)
      const answer = screening(shipment).restrictedGoodsChecked
      if (answer === 'unknown' || answer === undefined) missing.push('shipment.screening.restrictedGoodsChecked')
      return APPLIES('Every export must be checked against the prohibited and restricted goods schedules before declaration.', missing)
    }
  },
  {
    id: 'MY-STA-STRATEGIC-ITEMS', title: 'Strategic Trade Act 2010 permit for strategic items or controlled end-use', jurisdiction: 'Malaysia', scope: 'Strategic items, related technology, restricted end-users or end-use',
    severity: 'critical', requiredInputs: ['shipment.screening.strategicGoods', 'shipment.screening.endUserKnown', 'products[].screening.strategicItem'],
    evidence: { kind: 'external_permit', label: 'MITI permit issued through ePermit STA (with End-Use Statement, Form 5) or documented determination that the goods are not strategic items', referenceLabel: 'Permit number', expiry: true },
    sourceId: 'strategic-trade', effective: '2025-06-02', lastReviewed: RULESET_REVIEWED,
    notes: 'Export, transhipment or transit of items on the Strategic Trade (Strategic Items) List 2025 requires a permit; transactions with restricted end-users need a special permit. Classification follows the item description, not the HS code. Catch-all: unlisted items need prior notification if the exporter knows or has reason to believe they may be used in a restricted activity.',
    limitations: 'TradeGrid cannot classify goods against the Strategic Items List. A "No" answer is the exporter\'s self-declaration and should be supported by a documented check.',
    evaluate: shipment => {
      const answer = screening(shipment).strategicGoods
      const lineYes = anyProduct(shipment, p => p.screening?.strategicItem === 'yes')
      const lineUnknown = anyProduct(shipment, p => !p.screening?.strategicItem || p.screening.strategicItem === 'unknown')
      if (answer === 'yes' || lineYes) return APPLIES('The exporter has indicated that one or more items may be strategic items or that the end-use/end-user is controlled.')
      if (answer === 'no' && !lineUnknown && screening(shipment).endUserKnown === 'yes') return NOT_APPLICABLE('Based on the exporter\'s screening answers: no product is a strategic item and the end-user is known. Keep the screening record on file.')
      const missing = []
      if (!answer || answer === 'unknown') missing.push('shipment.screening.strategicGoods')
      if (screening(shipment).endUserKnown !== 'yes') missing.push('shipment.screening.endUserKnown')
      if (lineUnknown) missing.push('products[].screening.strategicItem')
      return UNKNOWN('Strategic-item status cannot be determined from the information recorded. Screen every line against the Strategic Items List 2025 and confirm the end-user.', missing)
    }
  },
  {
    id: 'MY-ATIGA-PREFERENTIAL-ORIGIN', title: 'Preferential origin evidence for an ATIGA tariff claim', jurisdiction: 'Malaysia → ASEAN', scope: 'Shipments requesting ASEAN preferential tariff treatment',
    severity: 'high', requiredInputs: ['shipment.preferentialTariff', 'shipment.destinationCountry', 'products[].hsCode', 'products[].countryOfOrigin'],
    evidence: { kind: 'external_permit', label: 'ATIGA e-Form D approved through ePCO (Cost Analysis approved first) or an origin declaration by a MITI-registered Certified Exporter under AWSC', referenceLabel: 'e-Form D reference / Certified Exporter number', expiry: true },
    sourceId: 'atiga-origin', effective: null, lastReviewed: RULESET_REVIEWED,
    notes: 'Applications are made online through ePCO (DagangNet). The applicant first confirms the HS code, checks the tariff reduction schedule and obtains an approved Cost Analysis; the PCO application is based on the approved CA. e-Form D is transmitted to the importing member state through the ASEAN Single Window. Certified Exporters may instead declare origin on the invoice.',
    limitations: 'TradeGrid does not determine origin qualification or rules of origin. The importer\'s customs authority decides whether the claim is accepted.',
    evaluate: shipment => {
      if (!shipment.shipment?.preferentialTariff) return NOT_APPLICABLE('No preferential tariff treatment has been requested for this shipment.')
      const destination = shipment.shipment?.destinationCountry
      if (!destination) return UNKNOWN('Destination country is needed to decide which agreement applies.', ['shipment.destinationCountry'])
      if (!ASEAN_MEMBERS.includes(destination)) return UNKNOWN(`${destination} is not an ATIGA member state. Another agreement (for example RCEP or a bilateral FTA) may apply, but this ruleset does not cover it. Manual review required.`, [])
      const missing = (shipment.products || []).flatMap((p, i) => [!hsCodeSyntaxOk(p.hsCode) ? `products[${i}].hsCode` : null, !p.countryOfOrigin ? `products[${i}].countryOfOrigin` : null]).filter(Boolean)
      if (anyProduct(shipment, p => p.countryOfOrigin && p.countryOfOrigin !== ORIGIN_COUNTRY)) return UNKNOWN('At least one product line has a non-Malaysian country of origin. ATIGA origin for that line depends on cumulation rules; manual review required.', missing)
      return APPLIES(`An ATIGA preferential tariff claim in ${destination} needs valid origin evidence for each product line.`, missing)
    }
  },
  {
    id: 'MY-MAQIS-PLANT-ANIMAL', title: 'MAQIS permit, inspection or certificate for plant, animal or related products', jurisdiction: 'Malaysia', scope: 'Agricultural, plant, animal, fish and related food products',
    severity: 'critical', requiredInputs: ['shipment.productCategory', 'shipment.screening.plantOrAnimalMaterial', 'products[].screening.plantOrAnimalMaterial'],
    evidence: { kind: 'external_permit', label: 'MAQIS export permit, phytosanitary or health certificate, or documented MAQIS confirmation that none is required for these goods and destination', referenceLabel: 'Permit / certificate number', expiry: true },
    sourceId: 'maqis', effective: '2013', lastReviewed: RULESET_REVIEWED,
    notes: 'Under Act 728 and the 2013 Regulations, exporters of regulated plants, animals, carcasses, fish, agricultural produce and related products may need registration with MAQIS and an export permit, licence or certificate. Destination-country conditions (for example a phytosanitary certificate) are checked by MAQIS at export.',
    limitations: 'TradeGrid does not hold the schedules of regulated articles. The exporter must confirm with MAQIS which products and destinations are covered.',
    evaluate: shipment => {
      const category = shipment.shipment?.productCategory
      const answer = screening(shipment).plantOrAnimalMaterial
      const lineYes = anyProduct(shipment, p => p.screening?.plantOrAnimalMaterial === 'yes')
      if (category === 'Agriculture' || answer === 'yes' || lineYes) return APPLIES('Plant, animal or agricultural material is declared, so MAQIS requirements must be checked for these goods and the destination.')
      if (answer === 'no' && everyProduct(shipment, p => p.screening?.plantOrAnimalMaterial === 'no')) return NOT_APPLICABLE('Based on the exporter\'s screening answers: no line contains plant, animal or regulated agricultural material.')
      if (category === 'Food') return UNKNOWN('Food products may contain regulated plant or animal material. Answer the screening question for the shipment and each line.', ['shipment.screening.plantOrAnimalMaterial', 'products[].screening.plantOrAnimalMaterial'])
      if (!answer || answer === 'unknown') return UNKNOWN('Confirm whether any line contains plant, animal or regulated agricultural material.', ['shipment.screening.plantOrAnimalMaterial'])
      return NOT_APPLICABLE('The exporter has indicated that no plant or animal material is included; product-line answers were not all completed, so keep the screening record on file.')
    }
  },
  {
    id: 'MY-CHEMICALS-COVERAGE', title: 'Chemical products: additional controls not covered by this ruleset', jurisdiction: 'Malaysia', scope: 'Product category Chemicals',
    severity: 'high', requiredInputs: ['shipment.productCategory'],
    evidence: { kind: 'review', label: 'Reviewer confirmation that applicable chemical-specific controls (for example scheduled poisons, scheduled wastes, chemical weapons convention items) were checked with the responsible authority', referenceLabel: 'Authority reference (optional)', expiry: false },
    sourceId: 'customs-prohibition', effective: null, lastReviewed: RULESET_REVIEWED,
    notes: 'Chemicals can fall under several regimes beyond the Prohibition of Exports Order and the Strategic Trade Act. This ruleset does not enumerate them.',
    limitations: 'Coverage limitation. This rule exists so that chemical shipments are never shown as fully assessed by TradeGrid alone.',
    evaluate: shipment => (shipment.shipment?.productCategory === 'Chemicals' ? UNKNOWN('Chemical products are outside the verified coverage of this ruleset. A reviewer must confirm the applicable controls manually.') : NOT_APPLICABLE('Product category is not Chemicals.'))
  },
  {
    id: 'MY-TRANSPORT-DOCUMENT', title: 'Carrier transport document for the selected mode', jurisdiction: 'Malaysia', scope: 'All exports',
    severity: 'high', requiredInputs: ['shipment.mode'],
    evidence: { kind: 'external_filing', label: 'Carrier-issued transport document (Air Waybill, Bill of Lading or sea waybill, road consignment note, or courier waybill)', referenceLabel: 'AWB / B/L / consignment note number', expiry: false },
    sourceId: 'matrade-docs', effective: null, lastReviewed: RULESET_REVIEWED,
    notes: 'Air: Air Waybill. Sea: Bill of Lading or sea waybill. Land: road consignment note from the haulier. Courier: courier air waybill. The document is issued by the carrier or forwarder after booking.',
    limitations: 'TradeGrid records the reference the user enters; it does not book carriers or verify issuance.',
    evaluate: shipment => {
      const mode = shipment.shipment?.mode
      if (!mode) return UNKNOWN('Select the transport mode to identify the carrier document.', ['shipment.mode'])
      const label = { Air: 'an Air Waybill', Sea: 'a Bill of Lading or sea waybill', Land: 'a road consignment note', Courier: 'a courier air waybill' }[mode]
      return APPLIES(`${mode} freight requires ${label} issued by the carrier or forwarder.`)
    }
  },
  {
    id: 'DEST-IMPORT-REQUIREMENTS', title: 'Destination import requirements and importer handoff', jurisdiction: 'Destination country', scope: 'All destinations; coverage tier depends on the country',
    severity: 'high', requiredInputs: ['shipment.destinationCountry', 'buyer.companyName'],
    evidence: { kind: 'handoff', label: 'Importer or broker confirmation of destination import permit/clearance arrangements (user-reported handoff record)', referenceLabel: 'Import permit / declaration reference (if provided by the importer)', expiry: false },
    sourceId: 'sg-import-permit', effective: '2026-02-23', lastReviewed: RULESET_REVIEWED,
    notes: 'Singapore: the importer (or its appointed Declaring Agent) obtains a Customs Import Permit through TradeNet; it needs a UEN and an activated Singapore Customs Account. Other listed destinations carry importer handoff profiles only.',
    limitations: 'Only Singapore was verified for this ruleset. Thailand, Indonesia, Vietnam and the Philippines have handoff profiles that must be confirmed with the importer. Any other destination is unsupported and requires manual review.',
    evaluate: shipment => {
      const destination = shipment.shipment?.destinationCountry
      if (!destination) return UNKNOWN('Destination country is needed.', ['shipment.destinationCountry'])
      const tier = coverage(shipment)
      if (!tier) return UNKNOWN(`${destination} is outside the declared coverage of this ruleset. Record the shipment, but a reviewer must confirm the destination's import requirements manually before approval.`)
      if (tier.tier === 'reviewed') return APPLIES(`${destination}: ${tier.note}`)
      return APPLIES(`${destination}: ${tier.note}`)
    }
  }
]

export const ruleById = id => rules.find(rule => rule.id === id)

/**
 * Evaluate every rule against a shipment record. Pure function.
 * Returns { version, reviewed, evaluatedAt, results:[{ruleId, title, severity, applicability, reason, missing, evidence, source}], coverage }
 */
export function evaluateShipment(shipment, { now = new Date() } = {}) {
  const results = rules.map(rule => {
    let outcome
    try { outcome = rule.evaluate(shipment) } catch (error) { outcome = UNKNOWN(`Rule could not be evaluated: ${error.message}`) }
    return {
      ruleId: rule.id, title: rule.title, severity: rule.severity, jurisdiction: rule.jurisdiction, scope: rule.scope,
      applicability: outcome.applicability, reason: outcome.reason, missing: outcome.missing || [],
      requiredInputs: rule.requiredInputs, evidence: rule.evidence, notes: rule.notes, limitations: rule.limitations,
      source: source(rule.sourceId), effective: rule.effective, lastReviewed: rule.lastReviewed
    }
  })
  const destination = shipment.shipment?.destinationCountry
  const tier = DESTINATION_COVERAGE[destination]?.tier || (destination ? 'unsupported' : 'unknown')
  const info = completenessIssues(shipment)
  return {
    version: RULESET_VERSION, reviewed: RULESET_REVIEWED, evaluatedAt: now.toISOString(),
    coverage: { destination: destination || null, tier, note: DESTINATION_COVERAGE[destination]?.note || (destination ? 'Unsupported destination: manual review required.' : 'Destination not yet selected.'), productCategory: shipment.shipment?.productCategory || null },
    information: { complete: info.length === 0, issues: info },
    results
  }
}

/** Human-readable diff between two evaluation snapshots (used when a shipment is re-assessed). */
export function explainEvaluationChanges(previous, next) {
  if (!previous) return []
  const changes = []
  if (previous.version !== next.version) changes.push({ type: 'ruleset', message: `Ruleset changed from ${previous.version} to ${next.version}.` })
  const before = new Map((previous.results || []).map(r => [r.ruleId, r]))
  for (const result of next.results) {
    const old = before.get(result.ruleId)
    if (!old) changes.push({ type: 'rule-added', ruleId: result.ruleId, message: `New rule ${result.ruleId} (${result.title}) is now evaluated: ${result.applicability}.` })
    else if (old.applicability !== result.applicability) changes.push({ type: 'applicability', ruleId: result.ruleId, message: `${result.title}: ${old.applicability} → ${result.applicability}.` })
    before.delete(result.ruleId)
  }
  for (const [ruleId, old] of before) changes.push({ type: 'rule-removed', ruleId, message: `Rule ${ruleId} (${old.title}) is no longer part of the ruleset.` })
  return changes
}
