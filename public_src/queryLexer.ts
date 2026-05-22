
type Token = { position: number } & (
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
    { type: "EXISTS", value: string } |
    { type: "NOT_EXISTS", value: string } |
    { type: "OPTIONAL", value: string } |
    { type: "UNION", value: string }


);

type Position = { line: number, ch: number };

function tokenize(query: string): Token[] {
    const tokens: Token[] = [];

    const originalQuery = query; // Keep the original query for position calculations

    while (query.length > 0) {
        query = query.trimStart();
        if (query.startsWith("PREFIX")) {
            tokens.push({ type: "PREFIX", value: "PREFIX", position: originalQuery.length - query.length });
            query = query.slice(6);
            continue;
        }
        if (query.startsWith("SELECT")) {
            tokens.push({ type: "SELECT", value: "SELECT", position: originalQuery.length - query.length });
            query = query.slice(6);
            continue;
        }
        if (query.startsWith("WHERE")) {
            tokens.push({ type: "WHERE", value: "WHERE", position: originalQuery.length - query.length });
            query = query.slice(5);
            continue;
        }
        if (query.startsWith("{")) {
            tokens.push({ type: "LBRACE", value: "{", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("}")) {
            tokens.push({ type: "RBRACE", value: "}", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(".")) {
            tokens.push({ type: "DOT", value: ".", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(";")) {
            tokens.push({ type: "SEMICOLON", value: ";", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(",")) {
            tokens.push({ type: "COMMA", value: ",", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("(")) {
            tokens.push({ type: "LPAREN", value: "(", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith(")")) {
            tokens.push({ type: "RPAREN", value: ")", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("[")) {
            tokens.push({ type: "LSQUARE", value: "[", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("]")) {
            tokens.push({ type: "RSQUARE", value: "]", position: originalQuery.length - query.length });
            query = query.slice(1);
            continue;
        }
        if (query.startsWith("_:")) {
            const blankNodeMatch = query.match(/^(_:\w+)/);
            if (blankNodeMatch != null) {
                const blankNode = blankNodeMatch[0];
                tokens.push({ type: "BLANK_NODE", value: blankNode, position: originalQuery.length - query.length });
                query = query.slice(blankNode.length);
                continue;
            }
        }
        if (query.startsWith("#")) {
            const newlineIndex = query.indexOf("\n");
            const comment = newlineIndex === -1 ? query : query.slice(0, newlineIndex);
            tokens.push({ type: "COMMENT", value: comment, position: originalQuery.length - query.length });
            query = newlineIndex === -1 ? "" : query.slice(newlineIndex);
            continue;
        }
        const varMatch = query.match(/^(\?[A-Za-z_][A-Za-z0-9_\u00B7]*)/);
        if (varMatch != null) {
            const varName = varMatch[0];
            tokens.push({ type: "VAR", value: varName, position: originalQuery.length - query.length });
            query = query.slice(varName.length);
            continue;
        }

        const iriMatch = query.match(/^<([^>\s]*)>?/);
        if (iriMatch != null) {
            const iri = iriMatch[0];
            tokens.push({ type: "IRI", value: iri, position: originalQuery.length - query.length });
            query = query.slice(iri.length);
            continue;
        }

        const otherMatch = query.match(/^(\S[^\s;.\]]*)/);
        if (otherMatch != null) {
            const other = otherMatch[0];
            tokens.push({ type: "OTHER", value: other, position: originalQuery.length - query.length });
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


export function extractTriplePatternsFromQuery(query: string, position: Position): [{ subject: string, predicate: string, object: string }[], { subject: string, predicate: string, object: string } | null] {
    const tokens = tokenize(query);
    const cursorIndex = positionToIndex(query, position);
    const nextToken = tokens.findIndex(token => token.position > cursorIndex);
    const tokenIndex = nextToken == -1 ? tokens.length - 1 : nextToken - 1;

    // organize into stack of nested patterns based on braces
    const stack: Token[][] = [[]];
    for (let i = 0; i <= tokenIndex; i++) {
        const token = tokens[i]!;
        if (token.type === "LBRACE") {
            stack.push([]);
        }
        stack[stack.length - 1]?.push(token);
        if (token.type === "RBRACE") {
            stack.pop();
        }
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

    const cutStack = [stack[stack.length - 1] ?? []];
    const cutStackIndex = cutStack[0]!.length;

    for (let i = tokenIndex + 1; i < tokens.length; i++) {
        const token = tokens[i]!;
        if (token.type === "LBRACE") {
            cutStack.push([]);
        }
        cutStack[cutStack.length - 1]?.push(token);
        if (token.type === "RBRACE") {
            if (cutStack.length === 1) {
                break;
            }
            cutStack.pop();
        }
    }

    const localTokens = cutStack.flat();
    // localTokens.forEach(token => console.log(`${token.type}: ${token.value} at position ${token.position}`));

    // Try match subject-predicate-object patterns in localTokens
    const patterns: { subject: string, predicate: string, object: string }[] = [];
    let patternWithCurrentlyEditedToken: { subject: string, predicate: string, object: string } | null = null;

    const blankNodeMapping: Record<string, string> = {};

    const stateStack: {
        subject: string | null,
        predicate: string | null,
        object: string | null,
        state: "subject" | "predicate" | "object" | "post_object",
        currentIterated: boolean
    }[] = [];
    stateStack.push({ subject: null, predicate: null, object: null, state: "subject", currentIterated: false });
    // let subject: string | null = null;
    // let predicate: string | null = null;
    // let object: string | null = null;
    // const state: "subject" | "predicate" | "object" = "subject";
    // let currentIterated = false;
    for (const [index, token] of localTokens.entries()) {

        if (index === cutStackIndex) {
            stateStack[stateStack.length - 1]!.currentIterated = true;
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
                if (stateStack[stateStack.length - 1]!.currentIterated) {
                    patternWithCurrentlyEditedToken = {
                        subject: subject ?? "",
                        predicate: predicate ?? "",
                        object: object ?? ""
                    };
                    stateStack[stateStack.length - 1]!.currentIterated = false;
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
                blankNodeName = uniqueVariableGenerator.next().value;
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
            const newBlankNode = uniqueVariableGenerator.next().value;
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
            stateStack.push({ subject: newBlankNode, predicate: null, object: null, state: "predicate", currentIterated: false });
        }
        if (token.type === "RSQUARE") {
            const subject = stateStack[stateStack.length - 1]?.subject ?? null;
            const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
            const object = stateStack[stateStack.length - 1]?.object ?? null;
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (stateStack[stateStack.length - 1]!.currentIterated) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.currentIterated = false;
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
            if (stateStack[stateStack.length - 1]!.currentIterated) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.currentIterated = false;
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
            if (stateStack[stateStack.length - 1]!.currentIterated) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.currentIterated = false;
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
            if (stateStack[stateStack.length - 1]!.currentIterated) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                stateStack[stateStack.length - 1]!.currentIterated = false;
            }
            stateStack[stateStack.length - 1]!.object = null;
            stateStack[stateStack.length - 1]!.state = "object";
        }
    }
const subject = stateStack[stateStack.length - 1]?.subject ?? null;
    const predicate = stateStack[stateStack.length - 1]?.predicate ?? null;
    const object = stateStack[stateStack.length - 1]?.object ?? null;
    patterns.push({ subject: subject ?? "", predicate: predicate ?? "", object: object ?? "" });
    if (stateStack[stateStack.length - 1]!.currentIterated) {
        patternWithCurrentlyEditedToken = { subject: subject ?? "", predicate: predicate ?? "", object: object ?? "" };
    }

    const completePatterns = patterns.filter(pattern => pattern.subject && pattern.predicate && pattern.object);

    if (patternWithCurrentlyEditedToken) {
        const index = completePatterns.findIndex(pattern => pattern.subject === patternWithCurrentlyEditedToken!.subject && pattern.predicate === patternWithCurrentlyEditedToken!.predicate && pattern.object === patternWithCurrentlyEditedToken!.object);
        if (index !== -1) {
            completePatterns.splice(index, 1);
        }

} else {
        patternWithCurrentlyEditedToken = {
            subject: subject ?? "",
            predicate: predicate ?? "",
            object: object ?? ""
        };
    }

    return [completePatterns, patternWithCurrentlyEditedToken];
}
