// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
// Every action calls an ExportDesk method the page's own form also calls, so the
// assistant and the form follow one set of rules.
import { App } from "./script.js";
import { ExportDesk } from "./desk.js";

/**
 * Describes the export desk's operations as actions the agents can call.
 *
 * The runtime validates arguments against inputSchema before execute runs, and asks the
 * visitor to confirm the one "irreversible" action first.
 */
class SiteActions {
  /** A three-way screening answer. */
  static ANSWER = { type: "string", enum: ExportDesk.CHOICES.answers };

  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.readStateAction());
    actions.register(SiteActions.updateRouteAction());
    actions.register(SiteActions.updatePartiesAction());
    actions.register(SiteActions.setProductLineAction());
    actions.register(SiteActions.startNewShipmentAction());
  }

  /**
   * Describe the read action that returns the shipment and its requirements checklist.
   *
   * :return: The action definition.
   */
  static readStateAction() {
    return {
      name: "get_export_desk_state",
      description: "Read this page's current shipment, its version, totals, validation problems, what is still needed, and the requirements checklist: for each requirement its status (applies, not_applicable or unknown), the reason, missing inputs, evidence to keep, limitations and official source with link. Also lists the allowed values for each field and what this site cannot do. Call it before answering any question about requirements or the shipment, and again in each turn that needs it: the visitor can also edit the form.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.readState,
    };
  }

  /**
   * Return a fresh copy of the page state.
   *
   * :return: The page state as plain JSON data.
   */
  static readState() {
    return App.page.getState();
  }

  /**
   * Describe the write that changes route, trade terms and shipment-level screening answers.
   *
   * :return: The action definition.
   */
  static updateRouteAction() {
    const choices = ExportDesk.CHOICES;
    return {
      name: "update_route",
      description: "Call it only with details the visitor gave. Change route, trade terms and shipment-level screening answers on the visible form; send only the fields to change. Sea-only trade terms (FAS, FOB, CFR, CIF) are refused for other transport modes, so send mode and incoterm together when both change. Record a screening answer only when the visitor stated it; never guess one. Returns the new version and a checklist summary, or ok false with a reason.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          destinationCountry: { type: "string", enum: choices.countries.filter(SiteActions.notMalaysia), description: "Country the goods are shipped to." },
          mode: { type: "string", enum: choices.modes, description: "Transport mode." },
          incoterm: { type: "string", enum: choices.incoterms, description: "Incoterms 2020 trade term code." },
          namedPlace: { type: "string", maxLength: 200, description: "Named place for the trade term, such as a port." },
          currency: { type: "string", enum: choices.currencies, description: "Invoice currency." },
          productCategory: { type: "string", enum: choices.categories, description: "Product category." },
          departurePoint: { type: "string", maxLength: 200, description: "Place of departure in Malaysia." },
          arrivalPoint: { type: "string", maxLength: 200, description: "Place of arrival." },
          departureDate: { type: "string", format: "date", description: "Planned departure, YYYY-MM-DD." },
          arrivalDate: { type: "string", format: "date", description: "Planned arrival, YYYY-MM-DD. Not before departure." },
          preferentialTariff: { type: "boolean", description: "True when the visitor wants to claim the ASEAN (ATIGA) preferential tariff." },
          restrictedGoodsChecked: { ...SiteActions.ANSWER, description: "Has the visitor checked the goods against the Prohibition of Exports Order?" },
          strategicGoods: { ...SiteActions.ANSWER, description: "Could any item be a strategic item or have a controlled end-use?" },
          endUserKnown: { ...SiteActions.ANSWER, description: "Does the visitor know who the end-user is?" },
          plantOrAnimalMaterial: { ...SiteActions.ANSWER, description: "Does the shipment contain plant, animal or agricultural material?" },
        },
      },
      execute: SiteActions.updateRoute,
    };
  }

  /**
   * Say whether a country can be a destination. Exports leave Malaysia.
   *
   * :param country: A country name.
   * :return: True unless the country is Malaysia.
   */
  static notMalaysia(country) {
    return country !== "Malaysia";
  }

  /**
   * Change route fields through the desk.
   *
   * :param args: The validated fields.
   * :return: The desk's result, which becomes the tool receipt.
   */
  static updateRoute(args) {
    return App.page.updateRoute(args);
  }

  /**
   * Describe the write that changes exporter and buyer details.
   *
   * :return: The action definition.
   */
  static updatePartiesAction() {
    return {
      name: "update_parties",
      description: "Call it only with details the visitor gave. Change the exporter's company name or business registration number, or the buyer's company name or country, on the visible form. Returns the new version and a checklist summary, or ok false with a reason.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          exporter: {
            type: "object",
            additionalProperties: false,
            properties: {
              companyName: { type: "string", maxLength: 200, description: "Exporter company name." },
              registrationNumber: { type: "string", maxLength: 200, description: "Exporter business registration number." },
            },
          },
          buyer: {
            type: "object",
            additionalProperties: false,
            properties: {
              companyName: { type: "string", maxLength: 200, description: "Buyer company name." },
              country: { type: "string", enum: ExportDesk.CHOICES.countries, description: "Buyer country." },
            },
          },
        },
      },
      execute: SiteActions.updateParties,
    };
  }

  /**
   * Change party fields through the desk.
   *
   * :param args: The validated exporter and buyer fields.
   * :return: The desk's result.
   */
  static updateParties(args) {
    return App.page.updateParties(args);
  }

  /**
   * Describe the write that adds or changes one product line.
   *
   * :return: The action definition.
   */
  static setProductLineAction() {
    const choices = ExportDesk.CHOICES;
    return {
      name: "set_product_line",
      description: "Call it only with details the visitor gave. Add a product line or change one on the visible form. line starts at 1; use the number after the last line (from website_get_export_desk_state) to add a line. Send only the fields to change. The HS code is checked for syntax only (6 to 10 digits): never invent one, and never set hsConfirmed unless the visitor says Customs or an agent confirmed it. Weights and package counts are for the whole line. Returns the new version and a checklist summary, or ok false with a reason. Lines are removed with the page's Remove button, not here.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["line", "fields"],
        properties: {
          line: { type: "integer", minimum: 1, maximum: 50, description: "Product line number, starting at 1." },
          fields: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", maxLength: 200, description: "Product name." },
              description: { type: "string", maxLength: 1000, description: "Goods description." },
              hsCode: { type: "string", maxLength: 20, description: "HS code the visitor gave, 6 to 10 digits." },
              countryOfOrigin: { type: "string", enum: choices.countries, description: "Country of origin." },
              quantity: { type: "number", minimum: 0, description: "Quantity." },
              unit: { type: "string", enum: choices.units, description: "Unit of measure." },
              unitPrice: { type: "number", minimum: 0, description: "Price per unit in the invoice currency." },
              netWeight: { type: "number", minimum: 0, description: "Net weight of the whole line in kg." },
              grossWeight: { type: "number", minimum: 0, description: "Gross weight of the whole line in kg. Not less than net weight." },
              packageCount: { type: "integer", minimum: 1, description: "Number of packages for the whole line." },
              packageType: { type: "string", enum: choices.packageTypes, description: "Package type." },
              hsConfirmed: { type: "boolean", description: "True only when the visitor says the HS code was confirmed with Customs or an agent." },
              strategicItem: { ...SiteActions.ANSWER, description: "Is this line a strategic item?" },
              plantOrAnimalMaterial: { ...SiteActions.ANSWER, description: "Does this line contain plant or animal material?" },
            },
          },
        },
      },
      execute: SiteActions.setProductLine,
    };
  }

  /**
   * Add or change a product line through the desk.
   *
   * :param args: The validated line number and fields.
   * :return: The desk's result.
   */
  static setProductLine(args) {
    return App.page.setProductLine(args.line, args.fields);
  }

  /**
   * Describe the irreversible operation that discards the shipment.
   *
   * :return: The action definition.
   */
  static startNewShipmentAction() {
    return {
      name: "start_new_shipment",
      description: "Discard the whole current shipment and start again, empty or with the page's fictional example shipment. Call it only when the visitor asks to clear the form, start over or load the example. In the turn you call it, first call website_get_export_desk_state and pass its version as expectedVersion. The browser asks the visitor to confirm. A stale expectedVersion is refused. Returns the new version and a checklist summary.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["withExample", "expectedVersion"],
        properties: {
          withExample: { type: "boolean", description: "True to load the fictional example shipment, false for an empty form." },
          expectedVersion: { type: "integer", minimum: 0, description: "The version from website_get_export_desk_state in this turn." },
        },
      },
      execute: SiteActions.startNewShipment,
    };
  }

  /**
   * Discard the shipment through the same method the page's own buttons use.
   *
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The desk's result, or {ok: false, reason} when the version is stale.
   */
  static startNewShipment(args) {
    return App.page.startNew(args.withExample, args.expectedVersion);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
