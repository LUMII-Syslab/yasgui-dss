
import yasgui from "@triply/yasgui"
import yasqe, { Hint, Token } from "@triply/yasqe";
import { AutocompletionToken, CompleterConfig } from "@triply/yasqe/build/ts/src/autocompleters/index.js";
import {
    DefaultDSSRequestProvider,
    DSSAutocompletionClient,
    DSSClient,
    NamespaceData,
    PropertyData,
    QueryBuilder,
    TripletStore,
    extractTriplePatternsFromQuery,
    suggestionComparator
} from "dss-client";
import { Completion, Editor } from "codemirror";

type YASQE = typeof yasgui.Yasgui.Yasqe | typeof yasqe.Yasqe;
type Yasqe = InstanceType<YASQE>;
type Triple = { subject: string, predicate: string, object: string };

export type EndpointData = { name: string, sparqlUrl: string, dbSchemaName: string };
/// Abort controller for ongoing autocompletion requests,
/// so that all requests can be cancelled when the autocompleter
/// is retriggered before the previous request(s) have completed.
let autocompleterAbortController: AbortController | null = null;
type AutocompletionData = {
    propertydata: { [IRIs: string]: PropertyData },
    tokenMap: { [tokens: string]: PropertyData | null },
    namespaceData?: NamespaceData[],
    token: AutocompletionToken | null,
};
let autocompletionData: AutocompletionData = {
    propertydata: {},
    tokenMap: {},
    namespaceData: [],
    token: null,
};


function constructClient(dssClient: DSSClient, queryContext: Triple[], dbSchemaName: string) {
    (dssClient.requestProvider as DefaultDSSRequestProvider).ontology = dbSchemaName;
    const tripleStore = new TripletStore();
    tripleStore.triplets = queryContext;
    const client = new DSSAutocompletionClient(tripleStore, dssClient);
    client.perRequestLimit = 600;
    return client;
}



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
export function preprocessIriForCompletion(yasqe: Yasqe, token: Token) {
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

export function postprocessIriCompletion(_yasqe: Yasqe, _: AutocompletionToken, suggestedString: string, namespaces: NamespaceData[] = []) {
    // console.log(`Token to complete: ${JSON.stringify(token)}, suggested string: ${suggestedString}`);

    // If the token is prefixable, convert the suggested string to prefixed form
    const prefixes = namespaces.map(ns => ([ns.name, ns.value] as [string, string]));

    const matchingPrefixEntry = prefixes.filter(([, uri]) => suggestedString.startsWith(uri));
    // Find the longest matching prefix to ensure the most specific prefix is used
    const sortedMatchingPrefixEntries = matchingPrefixEntry.sort((a, b) => b[1].length - a[1].length);
    if (sortedMatchingPrefixEntries.length > 0 && sortedMatchingPrefixEntries[0]) {
        const [matchingPrefix, matchingUri] = sortedMatchingPrefixEntries[0];
        suggestedString = matchingPrefix + ":" + suggestedString.substring(matchingUri.length);
    } else {
        suggestedString = `<${suggestedString}>`;
    }
    return suggestedString;
}

/**
 * Converts various sparql token forms to a normalized IRI form.
 * @param yasqe instance of the editor
 * @param iri IRI to preprocess
 * @returns Normalized IRI
 */
function preprocessIri(yasqe: Yasqe, iri: string) {
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
        if (iri.trim().endsWith(">")) {
            // <IRI> form
            return iri.substring(1, iri.length - 1);
        } else {
            // Incomplete <IRI form
            return iri.substring(1);
        }
    }
}
/* ----- End of copied functions ----- */

function preprocessTriplePattern(yasqe: Yasqe, triplePattern: Triple) {
    return {
        subject: preprocessIri(yasqe, triplePattern.subject),
        predicate: preprocessIri(yasqe, triplePattern.predicate),
        object: preprocessIri(yasqe, triplePattern.object),
    };
}


export const getProperties: ((dssClient: DSSClient, yasqeClass: YASQE, endpointData: EndpointData | null) => CompleterConfig["get"]) = (dssClient, yasqeClass, endpointData) => async (yasqe: Yasqe, token?: AutocompletionToken) => {
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
    const activeItem = endpointData;
    if (!activeItem) {
        console.error("No active endpoint selected for autocompletion.");
        return [];
    }
    console.log(`Current endpoint: ${activeItem?.name}`);

    const autocompletionClient = constructClient(dssClient, processedTriples, activeItem.dbSchemaName);
    const incomingBuilder = new QueryBuilder();
    incomingBuilder.usePPRels = true;
    let suggestions = await autocompletionClient.suggestProperties(currentTriple?.subject ?? null, currentTriple?.object ?? null, null, null);
    const namespaceData = await autocompletionClient.dssClient.getNamespaces();

    if (token) {
        suggestions = suggestions.sort(suggestionComparator(yasqe.getPrefixesFromQuery(), token.autocompletionString ?? "", namespaceData));
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
        namespaceData: await autocompletionClient.dssClient.getNamespaces(),
        token: token ?? null,
    }

    const suggestionValues = suggestions.map(s => s.value);
    console.log(`Found ${suggestionValues.length} property suggestions: ${suggestionValues}`);
    return suggestionValues;
}


export const postProcessPropertySuggestion: NonNullable<CompleterConfig["postProcessSuggestion"]> = (yasqe, token, suggestedString) => {
    const completedString = postprocessIriCompletion(yasqe, token, suggestedString, autocompletionData.namespaceData);
    autocompletionData.tokenMap[completedString] = autocompletionData.propertydata[suggestedString] ?? null;
    return completedString;
}

function addPrefix(cm: Editor, prefixName: string, uri: string) {
    // Find first prefix
    const firstPrefixRegex = /^PREFIX\s+\w*:\s*<[^>]*>\s*$/im;
    const firstPrefixMatch = cm.getValue().match(firstPrefixRegex);
    const position = cm.posFromIndex(firstPrefixMatch?.index ?? 0);

    cm.replaceRange(`PREFIX ${prefixName}: <${uri}>\n`, position);
}

function subsequenceHighlighter(sub: string, str: string) {
    const result: [string, boolean][] = [];
    let subIndex = 0;
    for (let i = 0; i < str.length; i++) {
        if (subIndex < sub.length && str[i]!.toLocaleLowerCase() === sub[subIndex]!.toLocaleLowerCase()) {
            result.push([str[i]!, true]);
            subIndex++;
        } else {
            result.push([str[i]!, false]);
        }
    }
    return result;
}

function highlightSequenceToHtml(highlightedSequence: [string, boolean][]) {
    const span = document.createElement("span");
    for (const [char, isHighlighted] of highlightedSequence) {
        const charSpan = document.createElement("span");
        charSpan.textContent = char;
        if (isHighlighted) {
            charSpan.classList.add("highlighted");
        }
        span.appendChild(charSpan);
    }
    return span;
}

export const postProcessPropertyHints: NonNullable<CompleterConfig["postprocessHints"]> = (_yasqe, hints) => {
    const hintsWithCompletionCallback = hints as (Hint & Completion)[];
    for (const hint of hintsWithCompletionCallback) {
        hint.hint = (cm, data, hint) => {
            console.log("Completion callback triggered with hint:", hint, "and data:", data);
            const cursor = cm.getCursor();
            if (!hint) {
                console.error("No hint provided for completion callback");
            }
            function getText(completion: Hint | string) {
                if (typeof completion == "string") return completion;
                else return completion.text;
            }
            cm.replaceRange(getText(hint ?? ""), hint?.from ?? data?.from ?? cursor,
                hint?.to ?? data?.to ?? cursor, "complete");
            if (!hint) {
                return;
            }
            const prefixes = _yasqe.getPrefixesFromQuery();
            // If the completion's prefix isn't in query prefixes, add it
            const prefix = Object.entries(prefixes).find(([prefix,]) => hint.text.startsWith(prefix));
            if (!prefix) {
                const dssPrefixes = autocompletionData.namespaceData?.map(ns => ([ns.name, ns.value] as [string, string])) ?? [];
                const matchingDssPrefix = dssPrefixes.find(([prefix,]) => hint.text.startsWith(`${prefix}:`));

                if (matchingDssPrefix) {
                    addPrefix(cm, matchingDssPrefix[0], matchingDssPrefix[1]);
                }
            }
        };

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
                if (autocompletionData.token) {
                    const highlightedSequence = subsequenceHighlighter(autocompletionData.token.autocompletionString ?? "", prefixFormText);
                    const highlightedHtml = highlightSequenceToHtml(highlightedSequence);
                    displaySpan.appendChild(highlightedHtml);
                } else {
                    displaySpan.textContent = withDisplay;
                }
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
};


export const getClasses: ((dssClient: DSSClient, yasqeClass: YASQE, endpointData: EndpointData | null) => CompleterConfig["get"]) = (dssClient, yasqeClass, endpointData) => async (yasqe, token?) => {
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


    const activeItem = endpointData;

    if (!activeItem) {
        console.error("No active endpoint selected for autocompletion.");
        return [];
    }

    console.log(`Current endpoint: ${activeItem?.dbSchemaName}`);

    const autocompletionClient = constructClient(dssClient, processedTriples, activeItem?.dbSchemaName);


    let suggestions = await autocompletionClient.suggestClasses(currentTriple?.subject ?? "", autocompleterAbortController.signal);

    if (token?.tokenPrefixUri !== undefined) {
        const prefixUri = token.tokenPrefixUri;
        suggestions = suggestions.filter(s => s.value.startsWith(prefixUri));
    }
    console.log(`Class suggestions: ${suggestions}`);

    const namespaceData = await autocompletionClient.dssClient.getNamespaces();

    if (token) {
        suggestions = suggestions.sort(suggestionComparator(yasqe.getPrefixesFromQuery(), token.autocompletionString ?? "", namespaceData));
    }

    if (suggestions.length === 0) {
        // If no suggestions are returned, fall back to generic class suggestions
        console.log("Falling back to generic class suggestions");
        const genericSuggestions = await yasqeClass.Autocompleters["class"]?.get(yasqe, token);
        return genericSuggestions || [];
    }
    console.log(`Found ${suggestions.length} class suggestions: ${suggestions.map(s => s.value)}`);
    return suggestions.map(s => s.value);
};
