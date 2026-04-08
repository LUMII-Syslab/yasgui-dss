"use strict";


// import Yasqe from "@triply/yasqe";
import { type Token, type Yasqe as YASQE } from "@triply/yasqe";
import yasguiModule, { Yasgui as YASGUI } from "@triply/yasgui";
const Yasgui = yasguiModule as unknown as typeof YASGUI;
import { DSSAutocompletionClient, TripletStore, DSSClient, getEndpoints, intersectSuggestions, NamespaceData, PropertyData } from "dss-client";

import { extractTriplePatternsFromQuery } from "./queryLexer.js";
import { AutocompletionToken, CompleterConfig } from "@triply/yasqe/build/ts/src/autocompleters/index.js";

type Triple = { subject: string, predicate: string, object: string };
type EndpointData = { displayName: string, sparqlUrl: string, dbSchemaName: string };

declare const dssUrl: string;

export let yasguiInstance: YASGUI | null = null;
export let selectedEndpointData: EndpointData | null = null;
/// Abort controller for ongoing autocompletion requests,
/// so that all requests can be cancelled when the autocompleter
/// is retriggered before the previous request(s) have completed.
let autocompleterAbortController: AbortController | null = null;
type AutocompletionData = {
    propertydata: { [IRIs: string]: PropertyData },
    tokenMap: { [tokens: string]: PropertyData | null },
};
let autocompletionData: AutocompletionData = {
    propertydata: {},
    tokenMap: {},

};



/* 
Copied pre/post process functions from YASGUI
Copy of the MIT License from YASGUI for these functions
------------------------------------------------------------
The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 * Converts rdf:type to http://.../type and converts <http://...> to http://...
 * Stores additional info such as the used namespace and prefix in the token object
 */
export function preprocessIriForCompletion(yasqe: YASQE, token: Token) {
    const processedToken: AutocompletionToken = token;
    const queryPrefixes = yasqe.getPrefixesFromQuery();
    const stringToPreprocess = token.string;

    const getPreviousNonWsToken = (startCh: number) => {
        const line = yasqe.getDoc().getCursor().line;
        let ch = Math.max(startCh - 1, 0);
        let prevToken: Token = yasqe.getTokenAt({ line, ch }) as Token;
        while (prevToken && prevToken.type === "ws" && prevToken.start > 0) {
            ch = Math.max(prevToken.start - 1, 0);
            prevToken = yasqe.getTokenAt({ line, ch }) as Token;
        }
        return prevToken;
    };

    if (stringToPreprocess.indexOf("<") < 0) {
        const prefixSeparatorIndex = stringToPreprocess.indexOf(":");
        if (prefixSeparatorIndex >= 0) {
            processedToken.tokenPrefix = stringToPreprocess.substring(0, prefixSeparatorIndex + 1);
        } else {
            const prevToken = getPreviousNonWsToken(processedToken.start);
            if (prevToken && prevToken.string.endsWith(":")) {
                processedToken.tokenPrefix = prevToken.string;
                processedToken.from = { ch: prevToken.start };
            } else if (prevToken && prevToken.string === ":") {
                const prevPrevToken = getPreviousNonWsToken(prevToken.start);
                if (prevPrevToken) {
                    processedToken.tokenPrefix = prevPrevToken.string + ":";
                    processedToken.from = { ch: prevPrevToken.start };
                }
            }
        }

        if (processedToken.tokenPrefix && queryPrefixes[processedToken.tokenPrefix.slice(0, -1)] != null) {
            processedToken.tokenPrefixUri = queryPrefixes[processedToken.tokenPrefix.slice(0, -1)]!;
        }
    }

    processedToken.autocompletionString = stringToPreprocess.trim();
    if (stringToPreprocess.indexOf("<") < 0 && stringToPreprocess.indexOf(":") > -1) {
        // hmm, the token is prefixed. We still need the complete uri for autocompletions. generate this!
        for (const prefix in queryPrefixes) {
            if (processedToken.tokenPrefix === prefix + ":") {
                processedToken.autocompletionString = queryPrefixes[prefix]!;
                processedToken.autocompletionString += stringToPreprocess.substring(prefix.length + 1);
                break;
            }
        }
    } else if (stringToPreprocess.indexOf("<") < 0 && processedToken.tokenPrefixUri) {
        processedToken.autocompletionString = processedToken.tokenPrefixUri + stringToPreprocess;
    }

    if (processedToken.autocompletionString.indexOf("<") == 0)
        processedToken.autocompletionString = processedToken.autocompletionString.substring(1);
    if (processedToken.autocompletionString.indexOf(">", processedToken.autocompletionString.length - 1) > 0)
        processedToken.autocompletionString = processedToken.autocompletionString.substring(0, processedToken.autocompletionString.length - 1);
    return processedToken;
}

export function postprocessIriCompletion(_yasqe: YASQE, token: AutocompletionToken, suggestedString: string) {
    // console.log(`Token to complete: ${JSON.stringify(token)}, suggested string: ${suggestedString}`);

    // If the token is prefixable, convert the suggested string to prefixed form
    const prefixes = _yasqe.getPrefixesFromQuery();
    const matchingPrefix = Object.keys(prefixes).find(prefix => suggestedString.startsWith(prefixes[prefix]!));
    if (matchingPrefix !== undefined) {
        const prefixedSuggestedString = matchingPrefix + ":" + suggestedString.substring(prefixes[matchingPrefix]!.length);
        return prefixedSuggestedString;
    }


    if (token.tokenPrefix && token.autocompletionString && token.tokenPrefixUri) {
        suggestedString = token.tokenPrefix + suggestedString.substring(token.tokenPrefixUri.length);
    } else {
        suggestedString = "<" + suggestedString + ">";
    }
    return suggestedString;
}

/**
 * Converts various sparql token forms to a normalized IRI form.
 * @param yasqe instance of the editor
 * @param iri IRI to preprocess
 * @returns Normalized IRI
 */
function preprocessIri(yasqe: YASQE, iri: string) {
    const queryPrefixes = yasqe.getPrefixesFromQuery();
    if (iri.indexOf("<") < 0) {
        // prefix form
        const prefixSeparatorIndex = iri.indexOf(":");
        if (prefixSeparatorIndex >= 0) {
            const prefix = iri.substring(0, prefixSeparatorIndex);
            if (queryPrefixes[prefix] != null) {
                return queryPrefixes[prefix] + iri.substring(prefixSeparatorIndex + 1);
            }
        }
        console.warn(`Could not preprocess IRI ${iri} to full URI form. Returning as is.`);
        return iri;
    } else {
        // <IRI> form
        return iri.substring(1, iri.length - 1);
    }
}

function preprocessTriplePattern(yasqe: YASQE, triplePattern: Triple) {
    return {
        subject: preprocessIri(yasqe, triplePattern.subject),
        predicate: preprocessIri(yasqe, triplePattern.predicate),
        object: preprocessIri(yasqe, triplePattern.object),
    };
}


const dssClient = new DSSClient(dssUrl);

function constructClient(queryContext: Triple[], ontologies: string) {
    const tripleStore = new TripletStore();
    tripleStore.triplets = queryContext;
    dssClient.ontology = ontologies;
    const client = new DSSAutocompletionClient(tripleStore, dssClient);
    client.perRequestLimit = 600;
    return client;

}

/**
 * Tries to convert a full IRI to its short form using available prefixes.
 * @param yasqe 
 * @param iri 
 * @returns Short form of the IRI if a matching prefix is found, otherwise null
 */
function tryIriToShortForm(yasqe: YASQE, iri: string) {
    const queryPrefixes = yasqe.getPrefixesFromQuery();
    const matchingPrefix = Object.keys(queryPrefixes).find(prefix => iri.startsWith(queryPrefixes[prefix]!));
    if (matchingPrefix !== undefined) {
        return matchingPrefix + ":" + iri.substring(queryPrefixes[matchingPrefix]!.length);
    }
    return null;
}

/**
 * Checks if `sub` is a subsequence of `str`, meaning all characters of `sub` appear in `str` in the same order, but not necessarily contiguously.
 * @param sub The potential subsequence to check
 * @param str The string to check against
 * @returns True if `sub` is a subsequence of `str`, false otherwise
 */
function isSubsequence(sub: string, str: string) {
    let subIndex = 0;
    for (let i = 0; i < str.length && subIndex < sub.length; i++) {
        if (str[i] === sub[subIndex]) {
            subIndex++;
        }
    }
    return subIndex === sub.length;
}

function suggestionComparator(yasqe: YASQE, token: AutocompletionToken, namespaceData: NamespaceData[]) {
    return (a: { value: string, count: number }, b: { value: string, count: number }) => {
        // prioritize suggestions where token is a subsequence of the suggestion
        const tokenString = token.autocompletionString || "";
        const aShortForm = tryIriToShortForm(yasqe, a.value) || a.value;
        const bShortForm = tryIriToShortForm(yasqe, b.value) || b.value;
        const aIsSubsequence = isSubsequence(tokenString, a.value) || isSubsequence(tokenString, aShortForm);
        const bIsSubsequence = isSubsequence(tokenString, b.value) || isSubsequence(tokenString, bShortForm);
        if (aIsSubsequence && !bIsSubsequence) return -1;
        if (!aIsSubsequence && bIsSubsequence) return 1;
        // Then prioritize namespaces where basic order sequence is lower (higher relevance)
        const priorityA = namespaceData.find(v => a.value.startsWith(v.value))?.basic_order_level ?? Number.POSITIVE_INFINITY;
        const priorityB = namespaceData.find(v => b.value.startsWith(v.value))?.basic_order_level ?? Number.POSITIVE_INFINITY;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // Then by count as tiebreaker (descending - highest count first)
        return b.count - a.count;
    };
}


export function setupYasqe(yasqeClass: typeof YASQE) {
    const propertyCompleter: CompleterConfig = {
        name: "dasa_properties",
        autoShow: true,
        get: async (yasqe, token?) => {
            if (autocompleterAbortController) {
                autocompleterAbortController.abort("New autocompletion request triggered");
            }
            autocompleterAbortController = new AbortController();
            const cursor = yasqe.getCursor();
            console.log(`Cursor position: line ${cursor.line}, ch ${cursor.ch}`);

            const triplePatterns = extractTriplePatternsFromQuery(yasqe.getValue(), cursor);
            console.log(triplePatterns);

            const processedTriples = triplePatterns[0].map(tp => preprocessTriplePattern(yasqe, tp));
            const currentTriple = triplePatterns[1] ? preprocessTriplePattern(yasqe, triplePatterns[1]) : null;

            const activeItem = selectedEndpointData;
            if (!activeItem) {
                console.error("No active endpoint selected for autocompletion.");
                return [];
            }
            console.log(`Current endpoint: ${activeItem?.displayName}`);

            const autocompletionClient = constructClient(processedTriples, activeItem?.dbSchemaName);

            const outgoingSuggestions = await autocompletionClient.suggestOutgoingProperties(currentTriple?.subject ?? "", autocompleterAbortController.signal);
            const incomingSuggestions = await autocompletionClient.suggestIncomingProperties(currentTriple?.object ?? "", autocompleterAbortController.signal);
            let suggestions = [...intersectSuggestions(outgoingSuggestions, incomingSuggestions)];
            if (suggestions.length === 0) {
                if (outgoingSuggestions.length === 0) {
                    suggestions = incomingSuggestions;
                } else if (incomingSuggestions.length === 0) {
                    suggestions = outgoingSuggestions;
                } else {
                    suggestions = outgoingSuggestions.length < incomingSuggestions.length ? outgoingSuggestions : incomingSuggestions;
                }
            }

            const namespaceData = await autocompletionClient.dssClient.getNamespaces();

            if (token) {
                suggestions = suggestions.sort(suggestionComparator(yasqe, token, namespaceData));
            }

            if (suggestions.length === 0) {
                console.log("Falling back to generic property suggestions");
                const genericSuggestions = await yasqeClass.Autocompleters["property"]?.get(yasqe, token);
                return genericSuggestions || [];
            }

            autocompletionData = {
                propertydata: suggestions.reduce((acc, suggestion) => {
                    acc[suggestion.value] = suggestion;
                    return acc;
                }, {} as AutocompletionData["propertydata"]),
                tokenMap: {},
            }

            const suggestionValues = suggestions.map(s => s.value);
            return suggestionValues;
        },
        bulk: false,
        isValidCompletionPosition: (_yasqe) => {
            const yasqe = _yasqe as CodeMirror.Editor & YASQE;

            return yasqeClass.Autocompleters["property"]?.isValidCompletionPosition(yasqe) ?? false;
        },
        preProcessToken(yasqe, token) {
            return preprocessIriForCompletion(yasqe, token);
        },
        postProcessSuggestion(yasqe, token, suggestedString) {
            const completedString = postprocessIriCompletion(yasqe, token, suggestedString);
            autocompletionData.tokenMap[completedString] = autocompletionData.propertydata[suggestedString] ?? null;
            return completedString;
        },
        postprocessHints(yasqe, hints) {
            for (const hint of hints) {
                const completedString = hint.text;
                const propertyData = autocompletionData.tokenMap[completedString];
                if (propertyData) {
                    const prefixFormText = `${propertyData.prefix}:${propertyData.localName}`;
                    const withDisplay = propertyData.localName == propertyData.displayName ? `${prefixFormText}` : `${prefixFormText} (${propertyData.displayName})`;
                    const withIri = `${withDisplay}\t<${propertyData.value}>`;
                    hint.displayText = withIri;
                    hint.render = (el) => {
                        el.style.display = "flex";
                        el.style.alignItems = "center";
                        el.style.width = "100%";

                        const displaySpan = document.createElement("span");
                        displaySpan.textContent = withDisplay;
                        displaySpan.classList.add("iri-short");
                        el.appendChild(displaySpan);

                        const iriSpan = document.createElement("span");
                        iriSpan.textContent = `<${propertyData.value}>`;
                        iriSpan.classList.add("iri");
                        el.appendChild(iriSpan);


                    };
                }
            }
            return hints;
        },
    }

    const classCompleter: CompleterConfig = {
        name: "dasa_classes",
        autoShow: true,
        get: async (yasqe, token?) => {
            if (autocompleterAbortController) {
                autocompleterAbortController.abort("New autocompletion request triggered");
            }
            autocompleterAbortController = new AbortController();
            const cursor = yasqe.getCursor();
            console.log(`Cursor position: line ${cursor.line}, ch ${cursor.ch}`);

            const triplePatterns = extractTriplePatternsFromQuery(yasqe.getValue(), cursor);
            console.log(triplePatterns);

            const processedTriples = triplePatterns[0].map(tp => preprocessTriplePattern(yasqe, tp));
            const currentTriple = triplePatterns[1] ? preprocessTriplePattern(yasqe, triplePatterns[1]) : null;


            const activeItem = selectedEndpointData;

            if (!activeItem) {
                console.error("No active endpoint selected for autocompletion.");
                return [];
            }

            console.log(`Current endpoint: ${activeItem?.dbSchemaName}`);

            const autocompletionClient = constructClient(processedTriples, activeItem?.dbSchemaName);


            let suggestions = await autocompletionClient.suggestClasses(currentTriple?.subject ?? "", autocompleterAbortController.signal);

            if (token?.tokenPrefixUri !== undefined) {
                const prefixUri = token.tokenPrefixUri;
                suggestions = suggestions.filter(s => s.value.startsWith(prefixUri));
            }
            console.log(`Class suggestions: ${suggestions}`);

            const namespaceData = await autocompletionClient.dssClient.getNamespaces();

            if (token) {
                suggestions = suggestions.sort(suggestionComparator(yasqe, token, namespaceData));
            }

            if (suggestions.length === 0) {
                // If no suggestions are returned, fall back to generic class suggestions
                console.log("Falling back to generic class suggestions");
                const genericSuggestions = await yasqeClass.Autocompleters["class"]?.get(yasqe, token);
                return genericSuggestions || [];
            }
            return suggestions.map(s => s.value);
        },
        bulk: false,
        isValidCompletionPosition: (yasqe) => {
            return yasqeClass.Autocompleters["class"]?.isValidCompletionPosition(yasqe) ?? false;
        },
        preProcessToken(yasqe, token) {
            return preprocessIriForCompletion(yasqe, token);
        },
        postProcessSuggestion(yasqe, token, suggestedString) {
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
        option.dataset.endpoint = JSON.stringify(endpoint);
        endpointSelect.appendChild(option);
    });

    endpointSelect.addEventListener("change", () => {
        const selectedEndpoint =
            endpointSelect.options[endpointSelect.selectedIndex];
        const endpointData = JSON.parse(selectedEndpoint?.dataset.endpoint ?? "null");
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
            autocompleterAbortController?.abort("YASGUI instance is being replaced");
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
