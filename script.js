// The page: draws the shipment form and the requirements checklist, and sends every
// change through the same ExportDesk methods the agent actions use.
import { ExportDesk } from "./desk.js";

/**
 * The page object. site.js and site-actions.js import it to reach the desk.
 */
export class App {
  /**
   * The browser's storage, or null where it is blocked.
   *
   * :return: localStorage or null.
   */
  static storage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch (error) {
      return null;
    }
  }

  static page = new ExportDesk(this.storage());
}

/**
 * Draws the form and checklist from the desk's state and keeps them in step with it.
 */
class DeskView {
  static ANSWER_LABELS = { unknown: "Not answered", yes: "Yes", no: "No" };

  static STATUS_LABELS = { applies: "Applies", not_applicable: "Does not apply", unknown: "Cannot tell yet" };

  static ROUTE = [
    { key: "destinationCountry", label: "Destination country", choices: "destinations" },
    { key: "mode", label: "Transport mode", choices: "modes" },
    { key: "incoterm", label: "Trade term (Incoterms 2020)", choices: "incoterms" },
    { key: "namedPlace", label: "Named place for the trade term", hint: "For example the port or delivery address" },
    { key: "currency", label: "Invoice currency", choices: "currencies" },
    { key: "productCategory", label: "Product category", choices: "categories" },
    { key: "departurePoint", label: "Place of departure" },
    { key: "arrivalPoint", label: "Place of arrival" },
    { key: "departureDate", label: "Planned departure date", type: "date" },
    { key: "arrivalDate", label: "Planned arrival date", type: "date" },
    { key: "preferentialTariff", label: "Claim the ASEAN preferential tariff (ATIGA)", type: "checkbox" },
  ];

  static SCREENING = [
    { key: "restrictedGoodsChecked", label: "Have you checked the goods against the Prohibition of Exports Order?" },
    { key: "strategicGoods", label: "Could any item be a strategic item, or have a controlled end-use?" },
    { key: "endUserKnown", label: "Do you know who the end-user is?" },
    { key: "plantOrAnimalMaterial", label: "Does the shipment contain plant, animal or agricultural material?" },
  ];

  static PARTIES = [
    { group: "exporter", key: "companyName", label: "Exporter company name" },
    { group: "exporter", key: "registrationNumber", label: "Exporter business registration number" },
    { group: "buyer", key: "companyName", label: "Buyer company name" },
    { group: "buyer", key: "country", label: "Buyer country", choices: "countries", blank: "Select a country" },
  ];

  static PRODUCT = [
    { key: "name", label: "Product name", wide: true },
    { key: "hsCode", label: "HS code", hint: "6 to 10 digits" },
    { key: "countryOfOrigin", label: "Country of origin", choices: "countries" },
    { key: "quantity", label: "Quantity", type: "number" },
    { key: "unit", label: "Unit", choices: "units" },
    { key: "unitPrice", label: "Unit price", type: "number" },
    { key: "netWeight", label: "Net weight, whole line (kg)", type: "number" },
    { key: "grossWeight", label: "Gross weight, whole line (kg)", type: "number" },
    { key: "packageCount", label: "Number of packages", type: "number" },
    { key: "packageType", label: "Package type", choices: "packageTypes" },
    { key: "strategicItem", label: "Strategic item?", choices: "answers" },
    { key: "plantOrAnimalMaterial", label: "Plant or animal material?", choices: "answers" },
    { key: "hsConfirmed", label: "HS code confirmed with Customs or an agent", type: "checkbox", wide: true },
  ];

  /** Plain names for the field paths the rules engine reports as missing. */
  static PATH_LABELS = {
    "products": "At least one product line",
    "exporter.registrationNumber": "Exporter business registration number",
    "shipment.departurePoint": "Place of departure",
    "shipment.destinationCountry": "Destination country",
    "shipment.mode": "Transport mode",
    "shipment.screening.restrictedGoodsChecked": "Answer: checked against the Prohibition of Exports Order",
    "shipment.screening.strategicGoods": "Answer: could any item be a strategic item",
    "shipment.screening.endUserKnown": "Answer: end-user known (must be Yes to rule this out)",
    "shipment.screening.plantOrAnimalMaterial": "Answer: plant, animal or agricultural material",
    "products[].screening.strategicItem": "Strategic item answer on every product line",
    "products[].screening.plantOrAnimalMaterial": "Plant or animal material answer on every product line",
  };

  /**
   * Build the page for a desk.
   *
   * :param desk: The ExportDesk to show.
   */
  constructor(desk) {
    this.desk = desk;
    this.status = document.querySelector("#form-status");
    this.choices = {
      ...ExportDesk.CHOICES,
      destinations: ExportDesk.CHOICES.countries.filter(country => country !== "Malaysia"),
    };
    this.buildFields(document.querySelector("#route-fields"), DeskView.ROUTE, this.changeRoute.bind(this));
    this.buildFields(document.querySelector("#screening-fields"), DeskView.SCREENING.map(field => ({ ...field, choices: "answers" })), this.changeRoute.bind(this));
    this.buildFields(document.querySelector("#party-fields"), DeskView.PARTIES, this.changeParty.bind(this));
    document.querySelector("#add-line").addEventListener("click", this.addLine.bind(this));
    document.querySelector("#load-example").addEventListener("click", this.askStartNew.bind(this, true));
    document.querySelector("#start-new").addEventListener("click", this.askStartNew.bind(this, false));
    desk.onChange(this.render.bind(this));
    this.render();
  }

  /**
   * Create an element with attributes and children.
   *
   * :param tag: The tag name.
   * :param attributes: Properties to set, such as className or textContent.
   * :param children: Child nodes or strings.
   * :return: The element.
   */
  static el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "dataset") {
        Object.assign(node.dataset, value);
      } else {
        node[key] = value;
      }
    }
    node.append(...children);
    return node;
  }

  /**
   * Show the label for a drop-down value.
   *
   * :param list: The name of the choice list.
   * :param value: The stored value.
   * :return: The text to show.
   */
  static choiceLabel(list, value) {
    return list === "answers" ? DeskView.ANSWER_LABELS[value] : value;
  }

  /**
   * Create the control for one field.
   *
   * :param field: The field description.
   * :param id: The control's id.
   * :return: The input or select element.
   */
  control(field, id) {
    if (field.choices) {
      const select = DeskView.el("select", { id });
      if (field.blank) {
        select.append(DeskView.el("option", { value: "", textContent: field.blank }));
      }
      for (const value of this.choices[field.choices]) {
        select.append(DeskView.el("option", { value, textContent: DeskView.choiceLabel(field.choices, value) }));
      }
      return select;
    }
    const input = DeskView.el("input", { id, type: field.type || "text" });
    if (field.type === "number") {
      input.min = "0";
      input.step = "any";
      input.inputMode = "decimal";
    }
    if (field.hint) {
      input.placeholder = field.hint;
    }
    return input;
  }

  /**
   * Add labelled controls to a container and call the handler when one changes.
   *
   * :param container: The element that receives the fields.
   * :param fields: The field descriptions.
   * :param handler: Called with the field and its control on change.
   * :param prefix: A prefix that keeps ids unique.
   */
  buildFields(container, fields, handler, prefix = "") {
    for (const field of fields) {
      const id = `f-${prefix}${field.group ? `${field.group}-` : ""}${field.key}`;
      const control = this.control(field, id);
      control.dataset.key = field.key;
      if (field.group) {
        control.dataset.group = field.group;
      }
      control.addEventListener("change", handler.bind(null, field, control));
      const label = DeskView.el("label", { htmlFor: id, textContent: field.label });
      const wrap = DeskView.el("div", { className: `field${field.type === "checkbox" ? " field-check" : ""}${field.wide ? " field-wide" : ""}` });
      if (field.type === "checkbox") {
        wrap.append(control, label);
      } else {
        wrap.append(label, control);
      }
      container.append(wrap);
    }
  }

  /**
   * Read a control's value in the form the desk expects.
   *
   * :param control: An input or select element.
   * :return: A boolean for checkboxes, otherwise the text.
   */
  static valueOf(control) {
    return control.type === "checkbox" ? control.checked : control.value;
  }

  /**
   * Report the result of a change in the status line, and redraw after a refusal so the
   * form shows what is stored.
   *
   * :param result: The desk's commit result.
   */
  report(result) {
    if (result.ok) {
      const summary = result.summary;
      this.status.className = "status";
      this.status.textContent = `Saved. Requirements that apply: ${summary.requirementsThatApply}. Cannot be decided yet: ${summary.requirementsUndetermined}.`;
    } else {
      this.status.className = "status status-problem";
      this.status.textContent = `Not saved: ${result.reason}`;
      this.render();
    }
  }

  /**
   * Store a changed route, terms or screening field.
   *
   * :param field: The field description.
   * :param control: The control that changed.
   */
  changeRoute(field, control) {
    this.report(this.desk.updateRoute({ [field.key]: DeskView.valueOf(control) }));
  }

  /**
   * Store a changed exporter or buyer field.
   *
   * :param field: The field description.
   * :param control: The control that changed.
   */
  changeParty(field, control) {
    this.report(this.desk.updateParties({ [field.group]: { [field.key]: DeskView.valueOf(control) } }));
  }

  /**
   * Store a changed product field.
   *
   * :param line: The product line number, starting at 1.
   * :param field: The field description.
   * :param control: The control that changed.
   */
  changeProduct(line, field, control) {
    this.report(this.desk.setProductLine(line, { [field.key]: DeskView.valueOf(control) }));
  }

  /**
   * Add an empty product line.
   */
  addLine() {
    this.report(this.desk.setProductLine(this.desk.record.products.length + 1, {}));
  }

  /**
   * Remove a product line.
   *
   * :param line: The product line number, starting at 1.
   */
  removeLine(line) {
    this.report(this.desk.removeProductLine(line));
  }

  /**
   * Ask before discarding the shipment, then start a new one.
   *
   * :param withExample: True to load the fictional example.
   */
  askStartNew(withExample) {
    const check = this.desk.checkStartNew();
    const dialog = DeskView.el("dialog", { className: "assistant-review" });
    dialog.setAttribute("aria-labelledby", "discard-title");
    const heading = DeskView.el("h2", { id: "discard-title", tabIndex: -1, autofocus: true, textContent: withExample ? "Replace this shipment with the example?" : "Clear this shipment?" });
    const sentence = DeskView.el("p", { textContent: "The entries below will be discarded. This cannot be undone." });
    const list = DeskView.el("dl");
    for (const [label, value] of Object.entries(DeskView.discardDetails(check.discards))) {
      list.append(DeskView.el("dt", { textContent: label }), DeskView.el("dd", { textContent: value }));
    }
    const confirm = DeskView.el("button", { textContent: withExample ? "Load the example" : "Clear the shipment" });
    confirm.addEventListener("click", dialog.close.bind(dialog, "confirm"));
    const decline = DeskView.el("button", { className: "assistant-decline", textContent: "Keep this shipment" });
    decline.addEventListener("click", dialog.close.bind(dialog, "decline"));
    dialog.addEventListener("close", this.finishStartNew.bind(this, dialog, withExample));
    dialog.append(heading, sentence, list, confirm, decline);
    document.body.append(dialog);
    dialog.showModal();
  }

  /**
   * Label what a new shipment would discard.
   *
   * :param discards: The desk's description of the current shipment.
   * :return: Details by label.
   */
  static discardDetails(discards) {
    return {
      "Destination": discards.destination,
      "Exporter": discards.exporter,
      "Buyer": discards.buyer,
      "Product lines": discards.productLines,
    };
  }

  /**
   * Close the discard dialog and act on the visitor's choice.
   *
   * :param dialog: The dialog that closed.
   * :param withExample: True to load the fictional example.
   */
  finishStartNew(dialog, withExample) {
    dialog.remove();
    if (dialog.returnValue === "confirm") {
      this.report(this.desk.startNew(withExample));
    }
  }

  /**
   * Put a stored value into a control, unless the visitor is typing in it.
   *
   * :param control: The input or select element.
   * :param value: The stored value.
   */
  static fill(control, value) {
    if (control.type === "checkbox") {
      control.checked = value === true;
    } else if (control.value !== String(value ?? "")) {
      control.value = String(value ?? "");
    }
  }

  /**
   * Redraw the form values, the product lines, the totals and the checklist.
   */
  render() {
    const state = this.desk.getState();
    for (const control of document.querySelectorAll("#route-fields [data-key]")) {
      DeskView.fill(control, state.shipment.route[control.dataset.key]);
    }
    for (const control of document.querySelectorAll("#screening-fields [data-key]")) {
      DeskView.fill(control, state.shipment.screening[control.dataset.key]);
    }
    for (const control of document.querySelectorAll("#party-fields [data-key]")) {
      DeskView.fill(control, state.shipment[control.dataset.group][control.dataset.key]);
    }
    this.renderProducts(state.shipment.products);
    this.renderTotals(state);
    this.renderChecklist(state);
  }

  /**
   * Draw the product lines. Lines are rebuilt only when their number changes, so a
   * visitor tabbing through a line keeps their place.
   *
   * :param products: The product lines from the state.
   */
  renderProducts(products) {
    const container = document.querySelector("#product-lines");
    if (container.children.length !== products.length) {
      container.replaceChildren();
      for (const product of products) {
        const fieldset = DeskView.el("fieldset", { className: "product" });
        fieldset.append(DeskView.el("legend", { textContent: `Product line ${product.line}` }));
        const grid = DeskView.el("div", { className: "fields" });
        this.buildFields(grid, DeskView.PRODUCT, this.changeProduct.bind(this, product.line), `p${product.line}-`);
        const remove = DeskView.el("button", { type: "button", className: "button-plain", textContent: `Remove line ${product.line}` });
        remove.addEventListener("click", this.removeLine.bind(this, product.line));
        fieldset.append(grid, DeskView.el("p", { className: "line-total" }), remove);
        container.append(fieldset);
      }
    }
    products.forEach((product, index) => {
      const fieldset = container.children[index];
      for (const control of fieldset.querySelectorAll("[data-key]")) {
        DeskView.fill(control, product[control.dataset.key]);
      }
      fieldset.querySelector(".line-total").textContent = product.lineTotal === null ? "Line value: enter quantity and unit price" : `Line value: ${DeskView.money(product.lineTotal)}`;
    });
  }

  /**
   * Format an amount with two decimals.
   *
   * :param amount: A number.
   * :return: The formatted text.
   */
  static money(amount) {
    return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Draw the shipment totals.
   *
   * :param state: The desk state.
   */
  renderTotals(state) {
    const totals = state.totals;
    const parts = [
      ["Goods value", totals.goods === null ? "not complete" : `${totals.currency} ${DeskView.money(totals.goods)}`],
      ["Packages", totals.packages === null ? "not complete" : String(totals.packages)],
      ["Net weight", totals.netWeightKg === null ? "not complete" : `${totals.netWeightKg} kg`],
      ["Gross weight", totals.grossWeightKg === null ? "not complete" : `${totals.grossWeightKg} kg`],
    ];
    const list = document.querySelector("#totals");
    list.replaceChildren();
    for (const [label, value] of parts) {
      // Each pair sits in its own div, so the pairs wrap as units on a narrow screen.
      list.append(DeskView.el("div", {}, DeskView.el("dt", { textContent: label }), DeskView.el("dd", { textContent: value })));
    }
  }

  /**
   * Give a field path from the rules engine a plain name.
   *
   * :param path: A path such as "products[0].hsCode".
   * :return: The name to show.
   */
  static pathLabel(path) {
    if (DeskView.PATH_LABELS[path]) {
      return DeskView.PATH_LABELS[path];
    }
    const product = path.match(/^products\[(\d+)\]\.(\w+)$/);
    if (product) {
      const field = DeskView.PRODUCT.find(item => item.key === product[2]);
      return `Product line ${Number(product[1]) + 1}: ${field ? field.label : product[2]}`;
    }
    return path;
  }

  /**
   * Draw the requirements checklist from the rules engine's results.
   *
   * :param state: The desk state.
   */
  renderChecklist(state) {
    document.querySelector("#ruleset").textContent = `Ruleset ${state.site.ruleset.version}, reviewed ${state.site.ruleset.reviewed}. ${state.coverage.note}`;
    const count = status => state.requirements.filter(item => item.status === status).length;
    document.querySelector("#checklist-summary").textContent = `Apply: ${count("applies")}. Cannot be decided yet: ${count("unknown")}. Do not apply: ${count("not_applicable")}.`;
    const list = document.querySelector("#checklist");
    list.replaceChildren();
    const order = { applies: 0, unknown: 1, not_applicable: 2 };
    const sorted = [...state.requirements].sort((a, b) => order[a.status] - order[b.status]);
    for (const item of sorted) {
      const card = DeskView.el("li", { className: `requirement requirement-${item.status}` });
      const head = DeskView.el("div", { className: "requirement-head" },
        DeskView.el("h3", { textContent: item.title }),
        DeskView.el("span", { className: "badge", textContent: DeskView.STATUS_LABELS[item.status] }),
      );
      card.append(head, DeskView.el("p", { textContent: item.reason }));
      if (item.missingInputs.length) {
        const missing = DeskView.el("ul", { className: "missing" });
        for (const path of item.missingInputs) {
          missing.append(DeskView.el("li", { textContent: DeskView.pathLabel(path) }));
        }
        card.append(DeskView.el("p", { className: "label", textContent: "Still needed on this form" }), missing);
      }
      if (item.status !== "not_applicable") {
        const more = DeskView.el("details", {},
          DeskView.el("summary", { textContent: "Evidence, limits and source" }),
          DeskView.el("p", {}, DeskView.el("strong", { textContent: "Evidence to keep: " }), item.evidenceExpected),
          DeskView.el("p", {}, DeskView.el("strong", { textContent: "What this page cannot check: " }), item.limitations),
        );
        if (item.source) {
          const link = DeskView.el("a", { href: item.source.url, target: "_blank", rel: "noopener noreferrer", textContent: item.source.title });
          more.append(DeskView.el("p", {}, DeskView.el("strong", { textContent: `Source (${item.source.agency}, reviewed ${item.source.reviewed}): ` }), link));
        }
        card.append(more);
      }
      list.append(card);
    }
  }
}

// Draw the page only in a browser. Node tests import this file for App alone.
if (typeof document !== "undefined") {
  App.view = new DeskView(App.page);
}
