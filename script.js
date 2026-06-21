const code_area = document.querySelector('#code textarea');
const input_area = document.querySelector('#input textarea');
const output_area = document.querySelector('#output pre');
const run_button = document.querySelector('#output button:nth-child(1)')
const stop_button = document.querySelector('#output button:nth-child(2)')
const save_browser = document.querySelector('#navbar nav a:nth-child(2)');
const save_file = document.querySelector('#navbar nav a:nth-child(3)');
const load_file = document.querySelector('#navbar nav a:nth-child(4)');
const file_input = document.getElementById('file_input');
const theme_switch = document.querySelector('#navbar nav a:nth-child(5)')

let stopped = false;

run_button.addEventListener('click', () => {
    stopped = false;
    const code = code_area.value;
    const input = input_area.value;
    
    try {
        const result = runGoa(code, input);
        output_area.textContent = result;
    } catch (e) {
        output_area.textContent = 'ERROR: ' + e.message;
    }
});

stop_button.addEventListener('click', () => {
    stopped = true;
});

save_browser.addEventListener('click', () => {
    const code = code_area.value;
    localStorage.setItem('goa_code', code);
    alert('Saved to browser!');
});

save_file.addEventListener('click', () => {
    const code = code_area.value;

    let filename = prompt("Enter a filename:", "program.goa");

    if (!filename) return;

    if (!filename.endsWith(".goa")) {
        filename += ".goa";
    }

    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
});

load_file.addEventListener('click', () => {
    file_input.click();
});

file_input.addEventListener('change', () => {
    const file = file_input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        code_area.value = reader.result;
    };
    reader.readAsText(file);
});

theme_switch.addEventListener("click", () => {
    document.body.classList.toggle("light");
});

function runGoa(code, input) {
    const lines = code.split('\n').map(l => l.split('#')[0].trim()).filter(l => l.length > 0);
    const start_index = lines.indexOf('START');
    const end_index = lines.lastIndexOf('END');

    if (start_index === -1 || end_index === - 1 || start_index >= end_index) {
        throw new Error('Program must have one START and one END.')
    }

    const program_lines = lines.slice(start_index + 1, end_index);

    const vars = {}
    const input_queue = input.split(/\s+/).filter(x => x.length).map(x => Number(x));
    let output = '';

    execute(program_lines, vars, input_queue, v => {
        output += v + '\n';
    });

    return output.trim();
}

function getInsideParens(line) {
    const start = line.indexOf('(');
    const end = line.lastIndexOf(')');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Missing parentheses in: ' + line);
    }

    return line.slice(start + 1, end).trim();
}

function split(text) {
    const args = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (c === '(') {
            depth++;
            current += c;
        } else if (c === ')') {
            depth--;
            current += c;
        } else if (c === ' ' && depth === 0) {
            if (current.trim().length > 0) {
                args.push(current.trim());
                current = '';
            }
        } else {
            current += c;
        }
    }

    if (current.trim().length > 0) {
        args.push(current.trim());
    }

    return args;
}

function collect(lines, start_index) {
    const block = [];
    let depth = 0;

    for (let i = start_index; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('IF') || line.startsWith('WHILE') || line.startsWith('REPEAT')) {
            depth++;
        }

        if (line === 'END') {
            if (depth === 0) {
                return { block, nextIndex: i };
            }
            depth--;
        } else {
            block.push(line);
        }
    }

    throw new Error('Missing END for block');
}

function execute(lines, vars, input_queue, printFn) {
    for (let i = 0; i < lines.length; i++) {
        if (stopped) break;

        const line = lines[i];

        if (line.startsWith('SET')) {
            const inside = getInsideParens(line);
            const parts = split(inside);
            const name = parts[0];
            const value_expression = parts[1];
            vars[name] = evalExpression(value_expression, vars, input_queue);
        } else if (line.startsWith('RETURN')) {
            const inside = getInsideParens(line);
            const value = evalExpression(inside, vars, input_queue);
            printFn(value);
        } else if (line.startsWith('IF')) {
            const condition = getInsideParens(line);
            const condition_value = evalCondition(condition, vars, input_queue);

            const {block: ifBlock, nextIndex} = collect(lines, i + 1);
            i = nextIndex;

            let handled = false;

            if (condition_value) {
                execute(ifBlock, vars, input_queue, printFn);
                handled = true;
            }

            while (i + 1 < lines.length && lines[i + 1].startsWith('ELSE IF')) {
                const else_if_line = lines[i + 1];
                const cond = getInsideParens(else_if_line);
                const val = evalCondition(cond, vars, input_queue);

                const {block: elseIfBlock, nextIndex: skipTo} = collect(lines, i + 2);

                if (!handled && val) {
                    execute(elseIfBlock, vars, input_queue, printFn);
                    handled = true;
                }

                i = skipTo;
            }

            if (!handled && i + 1 < lines.length && lines[i + 1] === 'ELSE') {
                const {block: elseBlock, nextIndex} = collect(lines, i + 2);
                execute(elseBlock, vars, input_queue, printFn);
                i = nextIndex;
            }

        } else if (line.startsWith('WHILE')) {
            const condition = getInsideParens(line);

            const {block: whileBlock, nextIndex} = collect(lines, i + 1);

            while (evalCondition(condition, vars, input_queue)) {
                if (stopped) break;
                execute(whileBlock, vars, input_queue, printFn);
            }

            i = nextIndex;
        } else if (line.startsWith('REPEAT')) {
            const inside = getInsideParens(line);
            const times = evalExpression(inside, vars, input_queue);

            const {block: repeatBlock, nextIndex} = collect(lines, i + 1);

            for (let j = 0; j < times; j++) {
                if (stopped) break;
                execute(repeatBlock, vars, input_queue, printFn)
            }

            i = nextIndex;
        } else if (line.startsWith('ELSE IF')) {
            const { nextIndex } = collect(lines, i + 1);
            i = nextIndex;
        } else if (line === 'ELSE') {
            const { nextIndex } = collect(lines, i + 1);
            i = nextIndex;
        }
    }
}

function evalCondition(text, vars, input_queue) {
    const parts = text.split(/\s+/);
    const left = evalExpression(parts[0], vars, input_queue);
    const op = parts[1];
    const right = evalExpression(parts[2], vars, input_queue);

    switch (op) {
        case '<': return left < right;
        case '>': return left > right;
        case '=': return left === right;
        case '!=': return left !== right;
        default:
            throw new Error('Unknown comparator: ' + op);
    }
}

function tokenize(expression) {
    const tokens = [];
    let current = "";

    for (let i = 0; i < expression.length; i++) {
        const c = expression[i];

        if (c === '(' || c === ')') {
            if (current.trim().length > 0) {
                tokens.push(current.trim());
                current = "";
            }
            tokens.push(c);
        } else if (c === ' ') {
            if (current.trim().length > 0) {
                tokens.push(current.trim());
                current = "";
            }
        } else {
            current += c;
        }
    }

    if (current.trim().length > 0) {
        tokens.push(current.trim());
    }

    return tokens;
}

function parseExpressionTokens(tokens) {
    if (tokens.length === 0) {
        throw new Error("Empty expression");
    }

    const token = tokens.shift();

    if (/^-?\d+$/.test(token)) {
        return { type: "number", value: Number(token) };
    }

    if (token === "INPUT") {
        return { type: "input" };
    }

    if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(token) && tokens[0] !== "(") {
        return { type: "var", name: token };
    }

    if (/^[A-Z]+$/.test(token)) {
        const func = token;

        if (tokens.shift() !== "(") {
            throw new Error("Expected '(' after " + func);
        }

        const left = parseExpressionTokens(tokens);
        const right = parseExpressionTokens(tokens);

        if (tokens.shift() !== ")") {
            throw new Error("Expected ')' after arguments of " + func);
        }

        return { type: "func", func, left, right };
    }

    throw new Error("Unexpected token: " + token);
}

function evalExpression(expr, vars, input_queue) {
    const tokens = tokenize(expr);
    const ast = parseExpressionTokens(tokens);

    if (tokens.length !== 0) {
        throw new Error("Unexpected extra tokens");
    }

    return evalAST(ast, vars, input_queue);
}

function evalAST(node, vars, input_queue) {
    switch (node.type) {
        case "number":
            return node.value;

        case "input":
            if (input_queue.length === 0) {
                throw new Error("No more input available.");
            }
            return input_queue.shift();

        case "var":
            if (!(node.name in vars)) {
                throw new Error("Undefined variable: " + node.name);
            }
            return vars[node.name];

        case "func":
            const left = evalAST(node.left, vars, input_queue);
            const right = evalAST(node.right, vars, input_queue);

            switch (node.func) {
                case "ADD": return left + right;
                case "SUB": return left - right;
                case "MULT": return left * right;
                case "DIV": return Math.round(left / right);
                case "EXP": return left ** right;
                case "MOD": return left % right;
                case "MIN": return Math.min(left, right);
                case "MAX": return Math.max(left, right);
                case "BASE": return parseInt(left.toString(right));
                default:
                    throw new Error("Unknown function: " + node.func);
            }
    }
}


window.addEventListener('load', () => {
    const saved = localStorage.getItem('goa_code');
    if (saved) {
        code_area.value = saved;
    }
});

