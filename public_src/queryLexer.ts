
type Token = { position: number, cursorHere: boolean } & (
    { type: "PREFIX", value: string } |
    { type: "IRI", value: string } |
    { type: "SELECT", value: string } |
    { type: "WHERE", value: string } |
    { type: "VAR", value: string } |
    { type: "LBRACE", value: string } |
    { type: "RBRACE", value: string } |
    { type: "DOT", value: string } |
    { type: "SEMICOLON", value: string } |
    { type: "COMMA", value: string } |
    { type: "OTHER", value: string } |
    { type: "LPAREN", value: string } |
    { type: "RPAREN", value: string } |
    { type: "COMMENT", value: string } |
    { type: "LSQUARE", value: string } |
    { type: "RSQUARE", value: string } |
    { type: "BLANK_NODE", value: string } |
    { type: "FILTER", value: string } |
    { type: "FILTER_EXISTS", value: string } |
    { type: "FILTER_NOT_EXISTS", value: string } |
    { type: "OPTIONAL", value: string } |
    { type: "UNION", value: string } |
    { type: "GRAPH", value: string } |
    { type: "SERVICE", value: string } |
    { type: "SILENT", value: string } |
    { type: "MINUS", value: string }
);

type Position = { line: number, ch: number };

function tokenize(query: string): Token[] {
    const tokens: Token[] = [];

    const originalQuery = query; // Keep the original query for position calculations

    while (query.length > 0) {
        query = query.trimStart();
        if (query.startsWith("PREFIX")) {
            tokens.push({ type: "PREFIX", value: "PREFIX", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(6);
            continue;
        }
        if (query.startsWith("SELECT")) {
            tokens.push({ type: "SELECT", value: "SELECT", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(6);
            continue;
        }
        if (query.startsWith("WHERE")) {
            tokens.push({ type: "WHERE", value: "WHERE", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(5);
            continue;
        }
        if (query.startsWith("{")) {
            tokens.push({ type: "LBRACE", value: "{", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("}")) {
            tokens.push({ type: "RBRACE", value: "}", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(".")) {
            tokens.push({ type: "DOT", value: ".", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(";")) {
            tokens.push({ type: "SEMICOLON", value: ";", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(",")) {
            tokens.push({ type: "COMMA", value: ",", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("(")) {
            tokens.push({ type: "LPAREN", value: "(", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(")")) {
            tokens.push({ type: "RPAREN", value: ")", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("[")) {
            tokens.push({ type: "LSQUARE", value: "[", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("]")) {
            tokens.push({ type: "RSQUARE", value: "]", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(1);
            continue;
        }
        if (query.toUpperCase().startsWith("FILTER EXISTS")) {
            tokens.push({ type: "FILTER_EXISTS", value: "FILTER EXISTS", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice("FILTER EXISTS".length);
            continue;
        }
        if (query.toUpperCase().startsWith("FILTER NOT EXISTS")) {
            tokens.push({ type: "FILTER_NOT_EXISTS", value: "FILTER NOT EXISTS", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice("FILTER NOT EXISTS".length);
            continue;
        }
        if (query.toUpperCase().startsWith("FILTER")) {
            tokens.push({ type: "FILTER", value: "FILTER", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice("FILTER".length);
            continue;
        }
        if (query.toUpperCase().startsWith("OPTIONAL")) {
            tokens.push({ type: "OPTIONAL", value: "OPTIONAL", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(8);
            continue;
        }
        if (query.toUpperCase().startsWith("UNION")) {
            tokens.push({ type: "UNION", value: "UNION", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(5);
            continue;
        }
        if (query.toUpperCase().startsWith("GRAPH")) {
            tokens.push({ type: "GRAPH", value: "GRAPH", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(5);
            continue;
        }
        if (query.toUpperCase().startsWith("SERVICE")) {
            tokens.push({ type: "SERVICE", value: "SERVICE", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(7);
            continue;
        }
        if (query.toUpperCase().startsWith("SILENT")) {
            tokens.push({ type: "SILENT", value: "SILENT", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(6);
            continue;
        }
        if (query.toUpperCase().startsWith("MINUS")) {
            tokens.push({ type: "MINUS", value: "MINUS", position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(5);
            continue;
        }
        if (query.startsWith("_:")) {
            const blankNodeMatch = query.match(/^(_:\w+)/);
            if (blankNodeMatch != null) {
                const blankNode = blankNodeMatch[0];
                tokens.push({ type: "BLANK_NODE", value: blankNode, position: originalQuery.length - query.length, cursorHere: false });
                query = query.slice(blankNode.length);
                continue;
            }
        }
        if (query.startsWith("#")) {
            const newlineIndex = query.indexOf("\n");
            const comment = newlineIndex === -1 ? query : query.slice(0, newlineIndex);
            tokens.push({ type: "COMMENT", value: comment, position: originalQuery.length - query.length, cursorHere: false });
            query = newlineIndex === -1 ? "" : query.slice(newlineIndex);
            continue;
        }
        const varMatch = query.match(/^(\?[A-Za-z_][A-Za-z0-9_\u00B7]*)/);
        if (varMatch != null) {
            const varName = varMatch[0];
            tokens.push({ type: "VAR", value: varName, position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(varName.length);
            continue;
        }

        const iriMatch = query.match(/^<([^>\s]*)>?/);
        if (iriMatch != null) {
            const iri = iriMatch[0];
            tokens.push({ type: "IRI", value: iri, position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(iri.length);
            continue;
        }

        const otherMatch = query.match(/^(\S[^\s;.\]()]*)/);
        if (otherMatch != null) {
            const other = otherMatch[0];
            tokens.push({ type: "OTHER", value: other, position: originalQuery.length - query.length, cursorHere: false });
            query = query.slice(other.length);
            continue;
        }

    }
    return tokens;
}

function positionToIndex(query: string, position: Position): number {
    const lines = query.split("\n");
    let index = 0;
    for (let i = 0; i < position.line; i++) {
        index += (lines[i]?.length ?? 0) + 1; // +1 for the newline character
    }
    index += position.ch;
    return index;
}

function findMatchingClosingBrace(tokens: Token[]) {
    let depth = 0;
    for (const [index, token] of tokens.entries()) {
        if (token.type === "LBRACE") {
            depth++;
        } else if (token.type === "RBRACE") {
            depth--;
            if (depth === -1) {
                return index;
            }
        }
    }
    return -1; // Not found
}

function findMatchingClosingParenthesis(tokens: Token[]) {
    let depth = 0;
    for (const [index, token] of tokens.entries()) {
        if (token.type === "LPAREN") {
            depth++;
        } else if (token.type === "RPAREN") {
            depth--;
            if (depth === -1) {
                return index;
            }
        }
    }
    return -1; // Not found
}

/**Returns a tuple of 1) the local scope triple patterns and 2) all immediate inner scopes that provide restriction.
*  Restrictive scope types: EXISTS, GROUP, GRAPH
*  Non-restrictive and ignored scope types: OPTIONAL, UNION, SERVICE, NOT EXISTS, Subqueries
*/
function separateScopes(tokens: Token[]): [Token[], Token[][]] {
    const localScopeTokens: Token[] = [];
    const restrictiveInnerScopes: Token[][] = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        // Skip FILTERs
        if (token.type === "FILTER") {
            if (tokens[i + 1]?.type === "LPAREN") {
                const closingIndex = findMatchingClosingParenthesis(tokens.slice(i + 2));
                i = i + 2 + closingIndex; // jump to the closing parenthesis
            }
            else if (tokens[i + 1]?.type === "OTHER" && tokens[i + 2]?.type === "LPAREN") {
                const closingIndex = findMatchingClosingParenthesis(tokens.slice(i + 3));
                i = i + 3 + closingIndex; // jump to the closing parenthesis
            }
            continue;
        }
        // Skip tokens of non-restrictive scopes
        if (token.type === "OPTIONAL" || token.type === "UNION" || token.type === "FILTER_NOT_EXISTS" || token.type === "MINUS") {
            if (tokens[i + 1]?.type === "LBRACE") {
                const closingIndex = findMatchingClosingBrace(tokens.slice(i + 2));
                i = i + 2 + closingIndex; // jump to the closing brace
            }
            // Continue so this token is ignored as well
            continue;
        }
        if (token.type === "SERVICE") {
            if (tokens[i + 2]?.type === "LBRACE") {
                const closingIndex = findMatchingClosingBrace(tokens.slice(i + 3));
                i = i + 3 + closingIndex; // jump to the closing brace
            }
            else if (tokens[i + 1]?.type == "SILENT" && tokens[i + 3]?.type === "LBRACE") {
                const closingIndex = findMatchingClosingBrace(tokens.slice(i + 4));
                i = i + 4 + closingIndex; // jump to the closing brace
            }
            continue;
        }
        if (token.type === "GRAPH") {
            if (tokens[i + 2]?.type === "LBRACE") {
                const closingIndex = findMatchingClosingBrace(tokens.slice(i + 3));
                if (closingIndex === -1) {
                    restrictiveInnerScopes.push(tokens.slice(i + 3)); // push the rest of the tokens as a fallback
                    break;
                }
                const innerTokens = tokens.slice(i + 3, i + 3 + closingIndex);
                restrictiveInnerScopes.push(innerTokens);
                i = i + 3 + closingIndex; // jump to the closing brace
            }
        } else if (token.type === "LBRACE") {
            // Possible matches: Subquery, UNION, GROUP
            const closingIndex = findMatchingClosingBrace(tokens.slice(i + 1));
            if (closingIndex === -1) {
                restrictiveInnerScopes.push(tokens.slice(i + 1)); // push the rest of the tokens as a fallback
                break;
            }
            const innerTokens = tokens.slice(i + 1, i + 1 + closingIndex);
            // If the following token is UNION or SELECT, it's a UNION scope or a subquery, otherwise it's either or a group
            if (tokens[i + 2 + closingIndex]?.type !== "UNION" && innerTokens[0]?.type !== "SELECT") {
                restrictiveInnerScopes.push(innerTokens);
            }
            i = i + closingIndex + 1; // jump to the closing brace
        }
        else if (token.type === "FILTER_EXISTS" && tokens[i + 1]?.type === "LBRACE") {
            // EXISTS scope
            const closingIndex = findMatchingClosingBrace(tokens.slice(i + 2));
            if (closingIndex === -1) {
                restrictiveInnerScopes.push(tokens.slice(i + 2, i + 2 + closingIndex)); // push the rest of the tokens as a fallback
                break;
            }
            const innerTokens = tokens.slice(i + 2, i + 2 + closingIndex);
            restrictiveInnerScopes.push(innerTokens);
            i = i + 2 + closingIndex; // jump to the closing brace
        }
        else {
            localScopeTokens.push(token);
        }
    }
    return [localScopeTokens, restrictiveInnerScopes];
}
function extractTriplePatterns(tokens: Token[], variableGenerator: Generator<string, never, void>): [{ subject: string, predicate: string, object: string }[], { subject: string, predicate: string, object: string } | null] {
    const patterns: { subject: string, predicate: string, object: string }[] = [];

    const scopes = separateScopes(tokens);

    const [localScopeTokens, restrictiveInnerScopes] = scopes;
    const innerScopePatterns = restrictiveInnerScopes.map(scopeTokens => extractTriplePatterns(scopeTokens, variableGenerator));
    let editedTokenPattern = innerScopePatterns.find(([, editedTokenPattern]) => editedTokenPattern !== null)?.[1] ?? null;

    const [localScopePatterns, localEditedTokenPattern] = extractTriplesFromScope(localScopeTokens, variableGenerator);
    if (editedTokenPattern === null) { editedTokenPattern = localEditedTokenPattern; }

    patterns.push(...localScopePatterns, ...innerScopePatterns.flatMap(([patterns]) => patterns));

    return [patterns, editedTokenPattern];
}

function extractTriplesFromScope(localTokens: Token[], variableGenerator: Generator<string, never, void>): [{ subject: string, predicate: string, object: string }[], { subject: string, predicate: string, object: string } | null] {
    // Try match subject-predicate-object patterns in localTokens
    const patterns: { subject: string, predicate: string, object: string }[] = [];
    let patternWithCurrentlyEditedToken: { subject: string, predicate: string, object: string } | null = null;

    const blankNodeMapping: Record<string, string> = {};

    const stateStack: {
        subject: string | null,
        predicate: string | null,
        object: string | null,
        state: "subject" | "predicate" | "object" | "post_object",
        cursorInTriple: boolean
    }[] = [];
    stateStack.push({ subject: null, predicate: null, object: null, state: "subject", cursorInTriple: false });

    for (const token of localTokens) {

        if (token.cursorHere) {
            stateStack[stateStack.length - 1]!.cursorInTriple = true;
        }
        if (token.type === "COMMENT") {
            continue; // skip comments as the state machine should not care.
        }
        if (token.type === "VAR" || token.type === "IRI" || token.type === "OTHER") {
            if (stateStack[stateStack.length - 1]?.state === "post_object") {
                const subject = stateStack[stateStack.length - 1]?.subject ?? null;
                const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
                const object = stateStack[stateStack.length - 1]?.object ?? null;
                if (subject && predicate && object) {
                    patterns.push({ subject, predicate, object });

                }
                if (stateStack[stateStack.length - 1]!.cursorInTriple) {
                    patternWithCurrentlyEditedToken = {
                        subject: subject ?? "",
                        predicate: predicate ?? "",
                        object: object ?? ""
                    };
                    stateStack[stateStack.length - 1]!.cursorInTriple = false;
                }
                stateStack[stateStack.length - 1]!.subject = null;
                stateStack[stateStack.length - 1]!.predicate = null;
                stateStack[stateStack.length - 1]!.object = null;
                stateStack[stateStack.length - 1]!.state = "subject";
            }

            if (stateStack[stateStack.length - 1]?.state === "subject") {
                stateStack[stateStack.length - 1]!.subject = token.value;
                stateStack[stateStack.length - 1]!.state = "predicate";
            } else if (stateStack[stateStack.length - 1]?.state === "predicate") {
                stateStack[stateStack.length - 1]!.predicate = token.value;
                stateStack[stateStack.length - 1]!.state = "object";
            } else if (stateStack[stateStack.length - 1]?.state === "object") {
                stateStack[stateStack.length - 1]!.object = token.value;
                stateStack[stateStack.length - 1]!.state = "post_object";

            }
        }
        if (token.type === "BLANK_NODE") {
            let blankNodeName = blankNodeMapping[token.value];
            if (!blankNodeName) {
                blankNodeName = variableGenerator.next().value;
                blankNodeMapping[token.value] = blankNodeName;
            }
            if (stateStack[stateStack.length - 1]?.state === "subject") {
                stateStack[stateStack.length - 1]!.subject = blankNodeName;
                stateStack[stateStack.length - 1]!.state = "predicate";
            } else if (stateStack[stateStack.length - 1]?.state === "predicate") {
                stateStack[stateStack.length - 1]!.predicate = blankNodeName;
                stateStack[stateStack.length - 1]!.state = "object";
            } else if (stateStack[stateStack.length - 1]?.state === "object") {
                stateStack[stateStack.length - 1]!.object = blankNodeName;
            }
        }
        if (token.type === "LSQUARE") {
            const newBlankNode = variableGenerator.next().value;
            const state = stateStack[stateStack.length - 1]?.state ?? "subject";
            if (state === "subject") {
                stateStack[stateStack.length - 1]!.subject = newBlankNode;
                stateStack[stateStack.length - 1]!.state = "predicate";
            } else if (state === "predicate") {
                stateStack[stateStack.length - 1]!.predicate = newBlankNode;
                stateStack[stateStack.length - 1]!.state = "object";
            }
            else if (state === "object") {
                stateStack[stateStack.length - 1]!.object = newBlankNode;
                stateStack[stateStack.length - 1]!.state = "subject";
            }
            stateStack.push({ subject: newBlankNode, predicate: null, object: null, state: "predicate", cursorInTriple: false });
        }
        if (token.type === "RSQUARE") {
            const subject = stateStack[stateStack.length - 1]?.subject ?? null;
            const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
            const object = stateStack[stateStack.length - 1]?.object ?? null;
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (stateStack[stateStack.length - 1]!.cursorInTriple) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.cursorInTriple = false;
            }
            stateStack[stateStack.length - 1]!.subject = null;
            stateStack[stateStack.length - 1]!.predicate = null;
            stateStack[stateStack.length - 1]!.object = null;
            stateStack[stateStack.length - 1]!.state = "subject";
            stateStack.pop();
        }
        if (token.type === "DOT") {
            const subject = stateStack[stateStack.length - 1]?.subject ?? null;
            const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
            const object = stateStack[stateStack.length - 1]?.object ?? null;
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (stateStack[stateStack.length - 1]!.cursorInTriple) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.cursorInTriple = false;
            }
            stateStack[stateStack.length - 1]!.subject = null;
            stateStack[stateStack.length - 1]!.predicate = null;
            stateStack[stateStack.length - 1]!.object = null;
            stateStack[stateStack.length - 1]!.state = "subject";
        }
        else if (token.type === "SEMICOLON") {
            const subject = stateStack[stateStack.length - 1]?.subject ?? null;
            const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
            const object = stateStack[stateStack.length - 1]?.object ?? null;
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (stateStack[stateStack.length - 1]!.cursorInTriple) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.cursorInTriple = false;
            }
            stateStack[stateStack.length - 1]!.predicate = null;
            stateStack[stateStack.length - 1]!.object = null;
            stateStack[stateStack.length - 1]!.state = "predicate";
        }
        else if (token.type === "COMMA") {
            const subject = stateStack[stateStack.length - 1]?.subject ?? null;
            const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
            const object = stateStack[stateStack.length - 1]?.object ?? null;
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (stateStack[stateStack.length - 1]!.cursorInTriple) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.cursorInTriple = false;
            }
            stateStack[stateStack.length - 1]!.object = null;
            stateStack[stateStack.length - 1]!.state = "object";
        }
    }
    const subject = stateStack[stateStack.length - 1]?.subject ?? null;
    const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
    const object = stateStack[stateStack.length - 1]?.object ?? null;
    patterns.push({ subject: subject ?? "", predicate: predicate ?? "", object: object ?? "" });
    if (stateStack[stateStack.length - 1]!.cursorInTriple) {
        patternWithCurrentlyEditedToken = { subject: subject ?? "", predicate: predicate ?? "", object: object ?? "" };
    }

    const completePatterns = patterns.filter(pattern => pattern.subject && pattern.predicate && pattern.object);

    if (patternWithCurrentlyEditedToken) {
        const index = completePatterns.findIndex(pattern => pattern.subject === patternWithCurrentlyEditedToken!.subject && pattern.predicate === patternWithCurrentlyEditedToken!.predicate && pattern.object === patternWithCurrentlyEditedToken!.object);
        if (index !== -1) {
            completePatterns.splice(index, 1);
        }

    }

    return [completePatterns, patternWithCurrentlyEditedToken];
}

export function extractTriplePatternsFromQuery(query: string, position: Position): [{ subject: string, predicate: string, object: string }[], { subject: string, predicate: string, object: string } | null] {
    const tokens = tokenize(query);
    const cursorIndex = positionToIndex(query, position);
    const nextToken = tokens.findIndex(token => token.position > cursorIndex);
    const tokenIndex = nextToken == -1 ? tokens.length - 1 : nextToken - 1;
    if (tokenIndex >= 0 && tokenIndex < tokens.length) {
        tokens[tokenIndex]!.cursorHere = true;
    }
    const uniqueVariableGenerator = (function* () {
        let counter = 100;
        while (true) {
            if (tokens.some(token => (token.type === "VAR" || token.type === "OTHER") && token.value === `?var${counter}`)) {
                counter++;
                continue;
            }
            yield `?var${counter++}`;
        }
    })();
    // Find first select above cursor where cursor is inside the following braces
    const selectIndices = tokens.map((token, index) => token.type === "SELECT" ? index : -1).filter(index => index !== -1);
    let relevantTokens = tokens;
    for (const selectIndex of selectIndices.reverse()) {
        const openingBraceIndex = tokens.findIndex((token, index) => index > selectIndex && index < tokenIndex && token.type === "LBRACE");
        if (openingBraceIndex === -1) {
            continue;
        }
        const closingBraceIndex = findMatchingClosingBrace(tokens.slice(openingBraceIndex + 1));
        if (closingBraceIndex === -1) {
            continue;
        }
        if (tokenIndex > openingBraceIndex && tokenIndex < openingBraceIndex + 1 + closingBraceIndex) {
            relevantTokens = tokens.slice(openingBraceIndex + 1, openingBraceIndex + 1 + closingBraceIndex);
            break;
        }
    }

    return extractTriplePatterns(relevantTokens, uniqueVariableGenerator);
}
