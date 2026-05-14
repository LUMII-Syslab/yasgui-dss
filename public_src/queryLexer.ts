
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
    { type: "RPAREN", value: string });

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
        const varMatch = query.match(/^(\?\w+)/);
        if (varMatch != null) {
            const varName = varMatch[0];
            tokens.push({ type: "VAR", value: varName, position: originalQuery.length - query.length });
            query = query.slice(varName.length);
            continue;
        }

        const iriMatch = query.match(/^<([^>]*)>/);
        if (iriMatch != null) {
            const iri = iriMatch[0];
            tokens.push({ type: "IRI", value: iri, position: originalQuery.length - query.length });
            query = query.slice(iri.length);
            continue;
        }

        const otherMatch = query.match(/^(\S[^\s;.]*)/);
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
        index += (lines[i]?.length ?? 0 + 1); // +1 for the newline character
    }
    index += position.ch;
    return index;
}


export function extractTriplePatternsFromQuery(query: string, position: Position): [{ subject: string, predicate: string, object: string }[], { subject: string, predicate: string, object: string } | null] {
    const tokens = tokenize(query);
    const cursorIndex = positionToIndex(query, position);
    const tokenIndex = tokens.findIndex(token => token.position > cursorIndex) - 1;

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
    localTokens.forEach(token => console.log(`${token.type}: ${token.value} at position ${token.position}`));

    // Try match subject-predicate-object patterns in localTokens
    const patterns: { subject: string, predicate: string, object: string }[] = [];
    let patternWithCurrentlyEditedToken: { subject: string, predicate: string, object: string } | null = null;

    let subject: string | null = null;
    let predicate: string | null = null;
    let object: string | null = null;
    let state: "subject" | "predicate" | "object" = "subject";
    let currentIterated = false;
    for (const [index, token] of localTokens.entries()) {
        if (index === cutStackIndex) {
            currentIterated = true;
        }
        if (token.type === "VAR" || token.type === "IRI" || token.type === "OTHER") {
            if (state === "subject") {
                subject = token.value;
                state = "predicate";
            } else if (state === "predicate") {
                predicate = token.value;
                state = "object";
            } else if (state === "object") {
                object = token.value;
            }
        }
        if (token.type === "DOT") {
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (currentIterated) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };

                currentIterated = false;
            }
            subject = null;
            predicate = null;
            object = null;
            state = "subject";
        }
        else if (token.type === "SEMICOLON") {
            if (subject && predicate && object) {
                patterns.push({ subject, predicate, object });

            }
            if (currentIterated) {
                patternWithCurrentlyEditedToken = {
                    subject: subject ?? "",
                    predicate: predicate ?? "",
                    object: object ?? ""
                };
                currentIterated = false;
            }
            predicate = null;
            object = null;
            state = "predicate";
        }
    }

    patterns.push({ subject: subject ?? "", predicate: predicate ?? "", object: object ?? "" });
    if (currentIterated) {
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
