// The export desk: one shipment record, its validation and its requirements checklist.
// No DOM and no network here, so the page, the agent actions and the Node tests share it.
import {
  COUNTRIES, CURRENCIES, TRANSPORT_MODES, INCOTERMS, PRODUCT_CATEGORIES, UNITS, PACKAGE_TYPES,
  SCREENING_ANSWERS, DESTINATION_COVERAGE, LIMITS,
} from "./shared/reference.js";
import {
  emptyShipment, emptyProduct, normalizeShipmentInput, structuralIssues, completenessIssues,
  shipmentTotals, lineTotal,
} from "./shared/shipment.js";
import { evaluateShipment, RULESET_VERSION, RULESET_REVIEWED, RULESET_NOTES } from "./shared/rules.js";

/**
 * Holds the shipment the visitor is preparing and answers questions about it.
 *
 * Every change goes through one method here, whether the visitor types in the form or an
 * agent calls a website_* tool. A change that would make the record invalid is refused
 * with {ok: false, reason, field} and nothing is stored.
 */
export class ExportDesk {
  /** Route and terms fields a caller may change. */
  static ROUTE_FIELDS = [
    "destinationCountry", "mode", "incoterm", "namedPlace", "currency", "departureDate",
    "arrivalDate", "departurePoint", "arrivalPoint", "productCategory", "preferentialTariff",
  ];

  /** Shipment-level screening questions. Each answer is "unknown", "yes" or "no". */
  static SCREENING_FIELDS = ["strategicGoods", "restrictedGoodsChecked", "plantOrAnimalMaterial", "endUserKnown"];

  /** Exporter and buyer fields a caller may change. */
  static PARTY_FIELDS = {
    exporter: ["companyName", "registrationNumber"],
    buyer: ["companyName", "country"],
  };

  /** Product line fields a caller may change. */
  static PRODUCT_FIELDS = [
    "name", "description", "hsCode", "countryOfOrigin", "quantity", "unit", "unitPrice",
    "netWeight", "grossWeight", "packageCount", "packageType",
  ];

  /** Per-line screening fields. hsConfirmed is true or false; the others are three-way. */
  static PRODUCT_SCREENING_FIELDS = ["hsConfirmed", "strategicItem", "plantOrAnimalMaterial"];

  /** What this site does not do. Agents repeat these instead of guessing. */
  static CANNOT_DO = [
    "It does not submit K2 or K8 customs declarations or talk to any customs system.",
    "It does not classify goods: an HS code is checked for syntax only (6 to 10 digits).",
    "It does not decide whether goods are strategic items, prohibited or restricted. The exporter records their own screening answers.",
    "It does not issue or apply for permits, Form D, certificates of origin or MAQIS certificates.",
    "It does not calculate duties, taxes or freight, and it is not legal advice.",
    "Destination import rules were reviewed for Singapore only. Thailand, Indonesia, Vietnam and the Philippines have handoff notes; any other destination needs manual review.",
    "It keeps one shipment in this browser only. Nothing is sent to a TradeGrid server and there are no accounts, uploads or PDF downloads on this page.",
  ];

  /** The key the shipment is saved under in the browser. */
  static STORAGE_KEY = "tradegrid-agent-desk:v1";

  /**
   * Create a desk, restoring a saved shipment when the store has one.
   *
   * :param store: An object with getItem and setItem, such as localStorage, or null.
   */
  constructor(store = null) {
    this.store = store;
    this.record = emptyShipment();
    this.version = 0;
    this.listeners = [];
    this.restore();
  }

  /**
   * Call a function after every stored change.
   *
   * :param listener: A function that takes no arguments.
   */
  onChange(listener) {
    this.listeners.push(listener);
  }

  /**
   * Read the saved shipment, ignoring anything missing or invalid.
   */
  restore() {
    try {
      const saved = this.store ? JSON.parse(this.store.getItem(ExportDesk.STORAGE_KEY) || "null") : null;
      if (saved && saved.record && structuralIssues(saved.record).length === 0) {
        this.record = normalizeShipmentInput(saved.record);
      }
    } catch (error) {
      // A private window or blocked storage: start with an empty shipment.
    }
  }

  /**
   * Save the shipment in the browser. The page works without storage.
   */
  save() {
    try {
      if (this.store) {
        this.store.setItem(ExportDesk.STORAGE_KEY, JSON.stringify({ record: this.record }));
      }
    } catch (error) {
      // Storage is a convenience only.
    }
  }

  /**
   * Apply a change to a copy of the record and keep it only if it adds no validation error.
   *
   * :param change: A function that edits the copy it is given. It may return a refusal.
   * :return: {ok: true, version, summary} or {ok: false, reason, field}.
   */
  commit(change) {
    const candidate = structuredClone(this.record);
    const refusal = change(candidate);
    if (refusal) {
      return { ok: false, ...refusal };
    }
    const known = new Set(structuralIssues(this.record).map(ExportDesk.issueKey));
    const added = structuralIssues(candidate).filter(issue => !known.has(ExportDesk.issueKey(issue)));
    if (added.length) {
      return { ok: false, reason: added[0].label, field: added[0].path };
    }
    this.record = normalizeShipmentInput(candidate);
    this.version += 1;
    this.save();
    for (const listener of this.listeners) {
      listener();
    }
    return { ok: true, version: this.version, summary: this.summary() };
  }

  /**
   * Identify a validation issue, so new issues can be told from old ones.
   *
   * :param issue: An issue from structuralIssues.
   * :return: A string key.
   */
  static issueKey(issue) {
    return `${issue.path}|${issue.label}`;
  }

  /**
   * Refuse keys the caller may not set.
   *
   * :param fields: The object the caller sent.
   * :param allowed: The keys it may contain.
   * :return: A refusal, or null when every key is allowed.
   */
  static unknownKey(fields, allowed) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return { reason: "Send the fields to change as an object.", field: "" };
    }
    const extra = Object.keys(fields).find(key => !allowed.includes(key));
    return extra ? { reason: `"${extra}" is not a field this form has.`, field: extra } : null;
  }

  /**
   * Change route, terms and shipment-level screening answers.
   *
   * :param fields: Any of ROUTE_FIELDS and SCREENING_FIELDS with their new values.
   * :return: The commit result.
   */
  updateRoute(fields) {
    const allowed = [...ExportDesk.ROUTE_FIELDS, ...ExportDesk.SCREENING_FIELDS];
    return this.commit(candidate => {
      const refusal = ExportDesk.unknownKey(fields, allowed);
      if (refusal) {
        return refusal;
      }
      for (const [key, value] of Object.entries(fields)) {
        if (ExportDesk.SCREENING_FIELDS.includes(key)) {
          candidate.shipment.screening[key] = value;
        } else {
          candidate.shipment[key] = value;
        }
      }
      return null;
    });
  }

  /**
   * Change exporter and buyer details.
   *
   * :param parties: {exporter: {...}, buyer: {...}} with any of PARTY_FIELDS.
   * :return: The commit result.
   */
  updateParties(parties) {
    return this.commit(candidate => {
      const refusal = ExportDesk.unknownKey(parties, Object.keys(ExportDesk.PARTY_FIELDS));
      if (refusal) {
        return refusal;
      }
      for (const [group, fields] of Object.entries(parties)) {
        const inner = ExportDesk.unknownKey(fields, ExportDesk.PARTY_FIELDS[group]);
        if (inner) {
          return inner;
        }
        Object.assign(candidate[group], fields);
      }
      return null;
    });
  }

  /**
   * Add a product line or change an existing one.
   *
   * :param line: The line number, starting at 1. Use the next number to add a line.
   * :param fields: Any of PRODUCT_FIELDS and PRODUCT_SCREENING_FIELDS.
   * :return: The commit result.
   */
  setProductLine(line, fields) {
    const allowed = [...ExportDesk.PRODUCT_FIELDS, ...ExportDesk.PRODUCT_SCREENING_FIELDS];
    return this.commit(candidate => {
      const count = candidate.products.length;
      if (!Number.isInteger(line) || line < 1 || line > count + 1) {
        return { reason: `Line must be between 1 and ${count + 1}. There are ${count} product lines.`, field: "line" };
      }
      if (line === count + 1 && count >= LIMITS.products) {
        return { reason: `A shipment can have at most ${LIMITS.products} product lines.`, field: "line" };
      }
      const refusal = ExportDesk.unknownKey(fields, allowed);
      if (refusal) {
        return refusal;
      }
      if (line === count + 1) {
        candidate.products.push(emptyProduct());
      }
      const product = candidate.products[line - 1];
      for (const [key, value] of Object.entries(fields)) {
        if (ExportDesk.PRODUCT_SCREENING_FIELDS.includes(key)) {
          product.screening[key] = value;
        } else {
          product[key] = value;
        }
      }
      return null;
    });
  }

  /**
   * Remove a product line. The last remaining line is emptied instead.
   *
   * :param line: The line number, starting at 1.
   * :return: The commit result.
   */
  removeProductLine(line) {
    return this.commit(candidate => {
      if (!Number.isInteger(line) || line < 1 || line > candidate.products.length) {
        return { reason: `There is no product line ${line}.`, field: "line" };
      }
      candidate.products.splice(line - 1, 1);
      if (candidate.products.length === 0) {
        candidate.products.push(emptyProduct());
      }
      return null;
    });
  }

  /**
   * Say what starting a new shipment would discard. Changes nothing.
   *
   * :return: {ok: true, discards} with a short description of the current shipment.
   */
  checkStartNew() {
    const named = this.record.products.filter(product => product.name).map(product => product.name);
    return {
      ok: true,
      discards: {
        destination: this.record.shipment.destinationCountry,
        exporter: this.record.exporter.companyName || "(not entered)",
        buyer: this.record.buyer.companyName || "(not entered)",
        productLines: named.length ? named.join(", ") : "(none named)",
      },
    };
  }

  /**
   * Discard the current shipment and start again. This cannot be undone.
   *
   * :param withExample: True to load the fictional example shipment, false for an empty form.
   * :param expectedVersion: The version the caller last read, or undefined to skip the check.
   * :return: The commit result. A caller with a stale version is refused.
   */
  startNew(withExample, expectedVersion) {
    return this.commit(candidate => {
      if (expectedVersion !== undefined && expectedVersion !== this.version) {
        return { reason: "The shipment changed after you read it. Read the state again before discarding it.", field: "expectedVersion" };
      }
      const next = withExample === true ? ExportDesk.exampleShipment() : emptyShipment();
      for (const key of Object.keys(candidate)) {
        delete candidate[key];
      }
      Object.assign(candidate, next);
      return null;
    });
  }

  /**
   * A fictional shipment for demonstrations. Company names and numbers are invented.
   *
   * :return: A shipment record.
   */
  static exampleShipment() {
    const record = emptyShipment();
    record.reference = "EXAMPLE-0001";
    Object.assign(record.exporter, { companyName: "Seri Rasa Foods Sdn. Bhd. (fictional)", registrationNumber: "EXAMPLE-REG-0001" });
    Object.assign(record.buyer, { companyName: "Lion City Pantry Pte. Ltd. (fictional)", country: "Singapore" });
    Object.assign(record.shipment, {
      destinationCountry: "Singapore", mode: "Sea", incoterm: "FOB", namedPlace: "Port Klang", currency: "USD",
      departurePoint: "Port Klang", arrivalPoint: "Singapore", productCategory: "Food", preferentialTariff: true,
    });
    record.shipment.screening.restrictedGoodsChecked = "yes";
    record.products = [{
      ...emptyProduct(),
      name: "Sambal chilli paste, 250 g jars", description: "Cooked chilli paste in glass jars", hsCode: "210390",
      quantity: "1200", unit: "pieces", unitPrice: "2.40", netWeight: "300", grossWeight: "420", packageCount: "50",
      packageType: "Carton",
    }];
    return record;
  }

  /**
   * Count the checklist by outcome, for a short reply after a change.
   *
   * :return: Counts and the inputs still missing.
   */
  summary() {
    const evaluation = evaluateShipment(this.record);
    const count = outcome => evaluation.results.filter(result => result.applicability === outcome).length;
    return {
      requirementsThatApply: count("applies"),
      requirementsNotApplicable: count("not_applicable"),
      requirementsUndetermined: count("unknown"),
      inputsStillMissing: [...new Set(evaluation.results.flatMap(result => result.missing))],
    };
  }

  /**
   * Everything about the current shipment, as plain data: the entries, totals, validation
   * problems, the requirements checklist with its sources, and what the site cannot do.
   *
   * :return: The state the page shows and the agents read.
   */
  getState() {
    const record = this.record;
    const evaluation = evaluateShipment(record);
    const s = record.shipment;
    return {
      site: {
        name: "TradeGrid Agent Desk",
        purpose: "Helps Malaysian SME exporters see which export requirements apply to one shipment and what is still missing.",
        cannotDo: ExportDesk.CANNOT_DO,
        ruleset: { version: RULESET_VERSION, reviewed: RULESET_REVIEWED, notes: RULESET_NOTES },
      },
      version: this.version,
      shipment: {
        reference: record.reference,
        route: Object.fromEntries(ExportDesk.ROUTE_FIELDS.map(key => [key, s[key]])),
        screening: { ...s.screening },
        exporter: Object.fromEntries(ExportDesk.PARTY_FIELDS.exporter.map(key => [key, record.exporter[key]])),
        buyer: Object.fromEntries(ExportDesk.PARTY_FIELDS.buyer.map(key => [key, record.buyer[key]])),
        products: record.products.map((product, index) => ({
          line: index + 1,
          ...Object.fromEntries(ExportDesk.PRODUCT_FIELDS.map(key => [key, product[key]])),
          ...product.screening,
          lineTotal: Number.isNaN(lineTotal(product)) ? null : lineTotal(product),
        })),
      },
      totals: ExportDesk.cleanTotals(shipmentTotals(record), s.currency),
      validationProblems: structuralIssues(record).map(issue => ({ field: issue.path, problem: issue.label })),
      informationStillNeeded: completenessIssues(record).map(issue => ({ field: issue.path, needed: issue.label })),
      coverage: evaluation.coverage,
      requirements: evaluation.results.map(result => ({
        ruleId: result.ruleId,
        title: result.title,
        severity: result.severity,
        status: result.applicability,
        reason: result.reason,
        missingInputs: result.missing,
        evidenceExpected: result.evidence.label,
        evidenceKind: result.evidence.kind,
        notes: result.notes,
        limitations: result.limitations,
        source: result.source ? {
          agency: result.source.agency, title: result.source.title, url: result.source.url, reviewed: result.source.reviewed,
        } : null,
      })),
      options: {
        transportModes: TRANSPORT_MODES,
        tradeTerms: Object.fromEntries(Object.entries(INCOTERMS).map(([code, term]) => [code, { name: term.label, modes: term.modes }])),
        productCategories: PRODUCT_CATEGORIES,
        currencies: CURRENCIES,
        screeningAnswers: SCREENING_ANSWERS,
        destinationsWithNotes: Object.fromEntries(Object.entries(DESTINATION_COVERAGE).map(([country, tier]) => [country, tier.tier])),
      },
    };
  }

  /**
   * Replace totals that cannot be computed yet with null, and name the currency.
   *
   * :param totals: The result of shipmentTotals.
   * :param currency: The shipment currency.
   * :return: Totals as plain JSON data.
   */
  static cleanTotals(totals, currency) {
    const clean = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number.isNaN(value) ? null : value]));
    return { currency, goods: clean.goods, invoice: clean.invoice, packages: clean.packages, netWeightKg: clean.net, grossWeightKg: clean.gross };
  }

  /** Lists the form uses for its drop-downs. */
  static CHOICES = {
    countries: COUNTRIES, currencies: CURRENCIES, modes: TRANSPORT_MODES, incoterms: Object.keys(INCOTERMS),
    categories: PRODUCT_CATEGORIES, units: UNITS, packageTypes: PACKAGE_TYPES, answers: SCREENING_ANSWERS,
  };
}
