"use strict";


// import Yasqe from "@triply/yasqe";
import { Hint, HintList, type Yasqe as YASQE } from "@triply/yasqe";
import yasguiModule, { Yasgui as YASGUI } from "@triply/yasgui";
const Yasgui = yasguiModule as unknown as typeof YASGUI;
import { DSSClient, getEndpoints } from "dss-client";

import { CompleterConfig } from "@triply/yasqe/build/ts/src/autocompleters/index.js";

import { EndpointData, getClasses, getProperties, postprocessIriCompletion, postProcessPropertyHints, postProcessPropertySuggestion, preprocessIriForCompletion } from "./completers.js";

declare module "codemirror" {
    export interface Completion {
        hint?: (cm: CodeMirror.Editor, data?: HintList, completion?: Hint) => void;
    }
}


// CodeMirror is a class and a module simultaneously, so ignore the naming convention warning
// eslint-disable-next-line @typescript-eslint/naming-convention
import CodeMirror from "codemirror";


export let selectedEndpointData: EndpointData | null = null;

declare const dssUrl: string;

export let yasguiInstance: YASGUI | null = null;










const dssClient = new DSSClient(dssUrl);


function getCompleterSelect() {
    const value = document.getElementById("suggestion_select");
    return (value as HTMLOptionElement).value as "builtin" | "dasa";
}


export function setupYasqe(yasqeClass: typeof YASQE) {

    const defaultPropertyCompleter = yasqeClass.Autocompleters["property"]!;
    const defaultClassCompleter = yasqeClass.Autocompleters["class"]!;



    const propertyCompleter: CompleterConfig = {
        name: "dasa_properties",
        autoShow: true,
        get: async (y, t) => {
            return getCompleterSelect() == "dasa" ?
                await getProperties(dssClient, yasqeClass, selectedEndpointData)(y, t) :
                await defaultPropertyCompleter?.get(y, t)
        },
        bulk: false,
        isValidCompletionPosition: (_yasqe) => {
            if (getCompleterSelect() == "builtin") {
                return defaultPropertyCompleter.isValidCompletionPosition(_yasqe);
            }
            const yasqe = _yasqe as CodeMirror.Editor & YASQE;

            return yasqeClass.Autocompleters["property"]?.isValidCompletionPosition(yasqe) ?? false;
        },
        preProcessToken(yasqe, token) {
            if (getCompleterSelect() == "builtin") {
                if (defaultPropertyCompleter.preProcessToken) {
                    return defaultPropertyCompleter.preProcessToken(yasqe, token);
                } else {
                    return token;
                }
            }
            return preprocessIriForCompletion(yasqe, token);
        },
        postProcessSuggestion: (y, t, s) => {
            if (getCompleterSelect() == "builtin") {
                if (defaultPropertyCompleter.postProcessSuggestion) {
                    return defaultPropertyCompleter.postProcessSuggestion(y, t, s);
                }
                return s;
            } else {
                return postProcessPropertySuggestion(y, t, s);
            }
        },
        postprocessHints: (y, hs) => {
            if (getCompleterSelect() == "builtin") {
                if (defaultPropertyCompleter.postprocessHints) {
                    return defaultPropertyCompleter.postprocessHints(y, hs);
                }
                return hs;
            } else {
                return postProcessPropertyHints(y, hs);
            }
        }
    }

    const classCompleter: CompleterConfig = {
        name: "dasa_classes",
        autoShow: true,
        get: async (y, t) => {
            return getCompleterSelect() == "dasa" ?
                await getClasses(dssClient, yasqeClass, selectedEndpointData)(y, t) :
                await defaultClassCompleter.get(y, t);
        },
        bulk: false,
        isValidCompletionPosition: (yasqe) => {
            if (getCompleterSelect() == "builtin") {
                return defaultClassCompleter.isValidCompletionPosition(yasqe);
            }
            return yasqeClass.Autocompleters["class"]?.isValidCompletionPosition(yasqe) ?? false;
        },
        preProcessToken(yasqe, token) {
            if (getCompleterSelect() == "builtin") {
                if (defaultClassCompleter.preProcessToken) {
                    return defaultClassCompleter.preProcessToken(yasqe, token);
                } else {
                    return token;
                }
            }
            return preprocessIriForCompletion(yasqe, token);
        },
        postProcessSuggestion(yasqe, token, suggestedString) {
            if (getCompleterSelect() == "builtin") {
                if (defaultClassCompleter.postProcessSuggestion) {
                    return defaultClassCompleter.postProcessSuggestion(yasqe, token, suggestedString);
                }
                return suggestedString;
            }
            return postprocessIriCompletion(yasqe, token, suggestedString);
        }
    };
    yasqeClass.registerAutocompleter(propertyCompleter, true);
    yasqeClass.registerAutocompleter(classCompleter, true);
    const autocompleterSet = new Set(yasqeClass.defaults.autocompleters);
    autocompleterSet.delete("property");
    autocompleterSet.delete("class");
    yasqeClass.defaults.autocompleters = Array.from(autocompleterSet);
}
console.log("YASQE setup module loaded");

function verifyEndpointData(endpointData: unknown): endpointData is EndpointData {
    return typeof endpointData === "object" &&
        endpointData !== null &&
        "display_name" in endpointData &&
        "sparql_url" in endpointData &&
        "db_schema_name" in endpointData &&
        typeof endpointData.display_name === "string" &&
        typeof endpointData.sparql_url === "string" &&
        typeof endpointData.db_schema_name === "string";
}

function selectEndpoint(endpointData: EndpointData, yasgui: YASGUI) {
    const activeTab = yasgui.getTab();
    if (!activeTab) {
        console.error("Could not find active YASGUI tab for updating endpoint.");
        return;
    }

    activeTab.setEndpoint(endpointData.sparqlUrl);
    console.log(`Endpoint changed to ${endpointData.sparqlUrl}`);

    selectedEndpointData = endpointData;
}


function setupEndpointSelector(endpoints: EndpointData[], yasgui: YASGUI) {
    const endpointSelect = document.getElementById("endpoint_select") as HTMLSelectElement;
    // Clear loading option
    endpointSelect.innerHTML = "";
    endpoints.forEach(endpoint => {
        const option = document.createElement("option");
        option.value = endpoint.sparqlUrl;
        option.text = `${endpoint.displayName} (${endpoint.sparqlUrl})`;
        option.dataset["endpoint"] = JSON.stringify(endpoint);
        endpointSelect.appendChild(option);
    });

    endpointSelect.addEventListener("change", () => {
        const selectedEndpoint =
            endpointSelect.options[endpointSelect.selectedIndex];
        const endpointData = JSON.parse(selectedEndpoint?.dataset["endpoint"] ?? "null");
        if (!verifyEndpointData(endpointData)) {
            console.error("Selected endpoint data is invalid:", endpointData);
            return;
        }

        selectEndpoint(endpointData, yasgui);
    });

    const initialEndpoint = endpoints[0];
    if (initialEndpoint) {
        selectEndpoint(initialEndpoint, yasgui);
    } else {
        console.warn("No endpoints available to select.");
    }

}


function initYasgui() {
    setupYasqe(Yasgui.Yasqe);
    const abortController = new AbortController();

    const yasgui = (async () => {
        const endpointsData = await getEndpoints(dssUrl, abortController.signal);
        const endpoints: EndpointData[] = endpointsData.map(endpoint => ({
            dbSchemaName: endpoint.db_schema_name,
            displayName: endpoint.display_name,
            sparqlUrl: endpoint.sparql_url,
        }));
        console.log("Fetched endpoints:", endpoints);

        const yasgui: YASGUI = new Yasgui(
            document.getElementById("yasgui")!, {
            endpointCatalogueOptions: {
                getData: () => endpoints.map(endpoint => ({
                    endpoint: endpoint.sparqlUrl,
                    internal: endpoint
                })),
                keys: [],
                renderItem: (data, source) => {
                    const endpointData = data.value as { endpoint: string, internal: EndpointData };
                    source.innerHTML = endpointData.internal.displayName;
                },
            },
        });
        setupEndpointSelector(endpoints, yasgui);

        if (yasguiInstance !== null) {
            // autocompleterAbortController?.abort("YASGUI instance is being replaced");
            yasguiInstance.destroy();
        }
        yasguiInstance = yasgui;

        return yasgui;
    })();

    yasgui.then(() => {
        console.log("YASGUI initialized successfully.");
    }).catch(error => {
        console.error("Error initializing YASGUI:", error);
    });
}

// init YASGUI when the container is available, otherwise wait and retry for a certain amount of time
(async () => {
    for (let i = 0; i < 10; i++) {
        if (document.getElementById("yasgui") != null) {
            console.log("Setting up YASGUI");
            initYasgui();
            return;
        }
        console.log("Waiting for YASGUI container to be available...");
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.error("YASGUI container not found after waiting.");
})();
