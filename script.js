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

if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
}

theme_switch.addEventListener("click", () => {
    document.body.classList.toggle("light");

    if (document.body.classList.contains("light")) {
        localStorage.setItem("theme", "light");
    } else {
        localStorage.setItem("theme", "dark");
    }
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
    const input_queue = input.split(/\s+/).filter(x => x.length).map(x => {
        if (!/^-?(?:\d+|\d+\.\d+|\d+\.|\.\d+)$/.test(x)) {
            throw new Error("Invalid number: " + x);
        }

        return Number(x);
    });
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
            let j = i + 1;
            while (j < text.length && text[j] === ' ') j++;

            if (j < text.length && text[j] === '(') {
                current += c;
            } else {
                if (current.trim().length > 0) {
                    args.push(current.trim());
                    current = '';
                }
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
                return {block, nextIndex: i};
            }

            depth --;
            block.push(line);
            continue;
        }

        if (depth === 0 && (line === 'ELSE' || line.startsWith('ELSE IF'))) {
            return {block, nextIndex: i - 1};
        }

        block.push(line);
    }

    throw new Error('Missing END for block');
}

function formatValue(value) {
    if (value.type === "float") {
        if (Number.isInteger(value.value)) {
            return value.value.toFixed(1);
        }

        return String(value.value);
    }
    return String(value.value);
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
            printFn(formatValue(value));
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

                const {block: elseIfBlock, nextIndex: endPos} = collect(lines, i + 2);

                if (!handled && val) {
                    execute(elseIfBlock, vars, input_queue, printFn);
                    handled = true;
                }

                i = endPos;
            }

            if (i + 1 < lines.length && lines[i + 1] === 'ELSE') {
                const {block: elseBlock, nextIndex: elseEnd} = collect(lines, i + 2);

                if (!handled) {
                    execute(elseBlock, vars, input_queue, printFn);
                }

                i = elseEnd;
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

            if (times.type !== "int") {
                throw new Error("REPEAT requires INT count.")
            }

            const {block: repeatBlock, nextIndex} = collect(lines, i + 1);

            for (let j = 0; j < times.value; j++) {
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
    const match = text.match(/(.+?)\s*(<=|>=|!=|=|<|>)\s*(.+)/);

    if (!match) {
        throw new Error("Invalid condition: " + text);
    }

    const left = evalExpression(match[1].trim(), vars, input_queue);

    const op = match[2];

    const right = evalExpression(match[3].trim(), vars, input_queue);

    switch (op) {
        case '<': return left.value < right.value;
        case '>': return left.value > right.value;
        case '=': return left.value === right.value;
        case '!=': return left.value !== right.value;
        case '<=': return left.value <= right.value;
        case '>=': return left.value >= right.value;
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
        return {
            type: "literal",
            value_type: "int",
            value: Number(token)
        };
    }

    if (/^-?(?:\d+\.\d+|\d+\.|\.\d+)$/.test(token)) {
        return {
            type: "literal",
            value_type: "float",
            value: Number(token)
        };
    }

    if (token === "INPUT") {
        return {type: "input"};
    }

    if (token === "RANDSIGN") {
        return {type: "randsign"};
    }

    if (token === "PI") {
        return {
            type: "literal",
            value_type: "float",
            value: Math.PI
        };
    }

    if (token === "E") {
        return {
            type: "literal",
            value_type: "float",
            value: Math.E
        };
    }

    if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(token) && tokens[0] !== "(") {
        return {
            type: "var", 
            name: token
        };
    }

    if (/^[A-Z]+$/.test(token)) {
        const func = token;

        if (tokens.shift() !== "(") {
            throw new Error("Expected '(' after " + func);
        }

        const unary_functions = ["ABS", "TOINT", "TOFLOAT", "FACT", "SIN", "COS", "TAN", "ARCSIN", "ARCCOS", "ARCTAN", "FLOOR", "CEIL"];


        if (unary_functions.includes(func)) {
            const arg = parseExpressionTokens(tokens);

            if (tokens.shift() !== ")") {
                throw new Error("Expected ')' after " + func);
            }

            return {
                type: "func",
                func,
                arg
            };
        }

        const left = parseExpressionTokens(tokens);
        const right = parseExpressionTokens(tokens);

        if (tokens.shift() !== ")") {
            throw new Error("Expected ')' after arguments of " + func);
        }

        return {
            type: "func",
            func,
            left,
            right
        };
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

function promote(a, b) {
    if (a.type === "float" || b.type === "float") {
        return "float";
    }

    return "int";
}

function makeInt(value) {
    return {
        type: "int",
        value: Math.round(value)
    };
}

function makeFloat(value) {
    return {
        type: "float",
        value: value
    };
}

function evalAST(node, vars, input_queue) {
    switch (node.type) {
        case "literal":
            return {
                type: node.value_type,
                value: node.value
            };

        case "input":
            if (input_queue.length === 0) {
                throw new Error("No more input available.");
            }

            const value = input_queue.shift();

            if (Number.isInteger(value)) {
                return makeInt(value);
            }

            return makeFloat(value);

        case "randsign":
            return makeInt(
            Math.random() < 0.5 ? 1 : -1
        );

        case "var":
            if (!(node.name in vars)) {
                throw new Error("Undefined variable: " + node.name);
            }
            return vars[node.name];

        case "func":
            if (node.func === "TOINT") {
                const arg = evalAST(node.arg, vars, input_queue);
                return makeInt(arg.value);
            }

            if (node.func === "TOFLOAT") {
                const arg = evalAST(node.arg, vars, input_queue);
                return makeFloat(arg.value);
            }

            if (node.func === "ABS") {
                const arg = evalAST(node.arg, vars, input_queue);

                return {
                    type: arg.type,
                    value: Math.abs(arg.value)
                };
            }

            if (node.func === "FACT") {
                const arg = evalAST(node.arg, vars, input_queue);

                if (arg.type !== "int") {
                    throw new Error("FACT requires INT argument.");
                }

                if (arg.value < 0) {
                    throw new Error("FACT requires nonnegative argument.");
                }

                let result = 1;

                for (let i = 2; i <= arg.value; i++) {
                    result *= i;
                }

                return makeInt(result);
            }

            if (node.func === "FLOOR") {
                const arg = evalAST(node.arg, vars, input_queue);
                
                return makeInt(Math.floor(arg.value));
            }

            if (node.func === "CEIL") {
                const arg = evalAST(node.arg, vars, input_queue);

                return makeInt(Math.ceil(arg.value));
            }

            function radian(degrees) {
                return degrees * Math.PI / 180;
            }

            function degree(radians) {
                return radians * 180 / Math.PI;
            }

            if (node.func === "SIN") {
                const arg = evalAST(node.arg, vars, input_queue);

                return makeFloat(Math.sin(radian(arg.value)));
            }

            if (node.func === "COS") {
                const arg = evalAST(node.arg, vars, input_queue);

                return makeFloat(Math.cos(radian(arg.value)));
            }

            if (node.func === "TAN") {
                const arg = evalAST(node.arg, vars, input_queue);

                return makeFloat(Math.tan(radian(arg.value)));
            }

            if (node.func === "ARCSIN") {
                const arg = evalAST(node.arg, vars, input_queue);

                if (arg.value < -1 || arg.value > 1) {
                    throw new Error("ARCSIN requires an argument between -1 and 1.");
                }

                return makeFloat(degree(Math.asin(arg.value)));
            }

            if (node.func === "ARCCOS") {
                const arg = evalAST(node.arg, vars, input_queue);

                if (arg.value < -1 || arg.value > 1) {
                    throw new Error("ARCCOS requires an argument between -1 and 1.");
                }

                return makeFloat(degree(Math.acos(arg.value)));
            }

            if (node.func === "ARCTAN") {
                const arg = evalAST(node.arg, vars, input_queue);

                return makeFloat(degree(Math.atan(arg.value)));
            }

            const left = evalAST(node.left, vars, input_queue);
            const right = evalAST(node.right, vars, input_queue);

            switch (node.func) {
                case "ADD":
                    return {
                        type: promote(left, right),
                        value: left.value + right.value
                    };
                case "SUB":
                    return {
                        type: promote(left, right),
                        value: left.value - right.value
                    };
                case "MULT":
                    return {
                        type: promote(left, right),
                        value: left.value * right.value
                    };
                case "DIV":
                    return makeInt(left.value / right.value);
                case "FDIV":
                    return makeFloat(left.value / right.value);
                case "EXP":
                    if (right.value < 0) {
                        throw new Error("EXP exponent cannot be negative.");
                    }
                    return {
                        type: promote(left, right), 
                        value: left.value ** right.value
                    };
                case "ROOT":
                    if (right.value <= 0) {
                        throw new Error("ROOT power must be greater than 0.");
                    }
                    if (left.value < 0 && right.value % 2 === 0) {
                        throw new Error("Cannot take an even root of a negative number.");
                    }
                    const result = left.value ** (1 / right.value);
                    if (Number.isInteger(result)) {
                        return makeInt(result);
                    }
                    return makeFloat(result);
                case "MOD":
                    return makeInt(left.value % right.value);
                case "MIN":
                    return left.value < right.value ? left : right;
                case "MAX":
                    return left.value > right.value ? left : right;
                case "BASE":
                    if (left.type !== "int") {
                        throw new Error("BASE requires INT as first argument.");
                    }
                    if (right.type !== "int") {
                        throw new Error("BASE requires INT as second argument.")
                    }
                    if (right.value < 2 || right.value > 10) {
                        throw new Error(
                            "BASE supports bases 2 through 10 only."
                        );
                    }
                    return makeInt(Number(left.value.toString(right.value)));
                // case "ABS":
                //     return {
                //         type: left.type,
                //         value: Math.abs(left.value)
                //     };
                case "RAND":
                    if (left.type !== "int") {
                        throw new Error("RAND requires INT as first argument.");
                    }
                    if (right.type !== "int") {
                        throw new Error("RAND requires INT as second argument.");
                    }
                    if (left.value > right.value) {
                        throw new Error("RAND requires the first value to be smaller than the second value.");
                    }
                    return {
                        type: "int",
                        value: Math.floor(Math.random() * (right.value - left.value + 1)) + left.value
                    };
                case "RANDFLOAT":
                    if (left.value > right.value) {
                        throw new Error("RANDFLOAT requires the first value to be smaller than the second value.");
                    }
                    return {
                        type: "float",
                        value: Math.random() * (right.value - left.value) + left.value
                    };
                // case "RANDSIGN":
                //     return {
                //         type: "int",
                //         value: Math.random() < 0.5 ? 1 : -1
                //     };
                case "LOG":
                    if (left.value <= 0) {
                        throw new Error("LOG requires an argument larger than 0.");
                    }
                    if (right.value <= 0) {
                        throw new Error("LOG requires a base larger than 0.");
                    }
                    if (right.value === 1) {
                        throw new Error("LOG base cannot be 1.")
                    }
                    return {
                        type: "float",
                        value: Math.log(left.value) / Math.log(right.value)
                    };
                case "RANGE":
                    return {
                        type: promote(left, right),
                        value: Math.abs(left.value - right.value)
                    };
                case "GCD":
                    if (left.type !== "int") {
                        throw new Error("GCD requires INT as first argument.");
                    }
                    if (right.type !== "int") {
                        throw new Error("GCD requires INT as second argument.");
                    }
                    let a = Math.abs(left.value);
                    let b = Math.abs(right.value);
                    while (b!== 0) {
                        const temporary = b;
                        b = a % b;
                        a = temporary;
                    }
                    return makeInt(a);
                case "LCM":
                    if (left.type !== "int") {
                        throw new Error("LCM requires INT as first argument.");
                    }
                    if (right.type !== "int") {
                        throw new Error("LCM requires INT as second argument.")
                    }
                    let c = Math.abs(left.value);
                    let d = Math.abs(right.value);
                    const gcd = (c, d) => d === 0 ? c : gcd(d, c % d);
                    const lcm = (c, d) => Math.abs(c * d) / gcd(c, d);
                    return makeInt(lcm(c, d));
                // case "FACT":
                //     if (left.type !== "int") {
                //         throw new Error("FACT requires an INT argument.");
                //     }
                //     if (left.value < 0) {
                //         throw new Error("FACT requires a nonnegative argument.");
                //     }
                //     function factorial(n) {
                //         if (n === 0 || n === 1) return 1;
                //         return n * factorial(n - 1);
                //     }
                //     return {
                //         type: "int",
                //         value: factorial(left.value)
                //     };
                case "ROUND":
                    if (right.type !== "int") {
                        throw new Error("ROUND requires INT as second argument.");
                    }
                    if (right.value < 0) {
                        throw new Error("ROUND second argument cannot be negative.");
                    }
                    const factor = 10 ** right.value;
                    const rounded = Math.round(left.value * factor) / factor;
                    if (right.value === 0) {
                        return makeInt(rounded);
                    }
                    return makeFloat(rounded);
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

