const code_area = document.querySelector('#code textarea');
const input_area = document.querySelector('#input textarea');
const output_area = document.querySelector('#output p');
const run_button = document.querySelector('#output button:nth-child(1)')
const stop_button = document.querySelector('#output button:nth-child(2)')
const save_browser = document.querySelector('#navbar nav a:nth-child(2)');
const save_file = document.querySelector('#navbar nav a:nth-child(3)');
const load_file = document.querySelector('#navbar nav a:nth-child(4)');
const file_input = document.getElementById('file_input');

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
            if (depth === 0) return {block, nextIndex: i};
            depth--; 
        }

        block.push(line);
    }

    throw new Error('Missing END for block')
}

function execute(lines, vars, input_queue, printFn) {
    for (let i = 0; i < lines.length; i++) {
        if (stopped) break;

        const line = lines[i];

        if (line.startsWith('SET')) {
            const inside = getInsideParens(line);
            const [name, ...rest] = inside.split(/\s+/);
            const value_expression = rest.join(' ');
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

            if (condition_value) {
                execute(ifBlock, vars, input_queue, printFn);
                while (i + 1 < lines.length && (lines[i + 1].startsWith('ELSE IF') || lines[i + 1] === 'ELSE')) {
                    const {nextIndex: skipTo} = collect(lines, i + 2);
                    i = skipTo;
                }
            } else {
                let handled = false;

                while (i + 1 < lines.length && lines[i + 1].startsWith('ELSE IF')) {
                    const else_if_line = lines[i + 1];
                    const cond = getInsideParens(else_if_line);
                    const val = evalCondition(cond, vars, input_queue);

                    const {block: elseIfBlock, nextIndex: skipTo} = collect(lines, i + 2);

                    if (val && !handled) {
                        execute(elseIfBlock, vars, input_queue, printFn);
                        handled = true;
                    }

                    i = skipTo;
                }
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

function evalExpression(expression, vars, input_queue) {
    expression = expression.trim();

    if (expression === 'INPUT') {
        if (input_queue.length === 0) {
            throw new Error('No more input available.');
        }
        return input_queue.shift();
    }

    if (/^-?\d+$/.test(expression)) {
        return Number(expression);
    }

    if (/^[a-zA-Z0-9]+$/.test(expression) && !expression.includes(" ")) {
        if (!(expression in vars)) {
            throw new Error('Undefined variable: ' + expression);
        }
        return vars[expression];
    }

    const function_match = expression.match(/^([A-Z]+)\s*\((.*)\)$/);
    if (function_match) {
        const func = function_match[1];
        const inside = function_match[2].trim();
        const parts = split(inside);
        if (parts.length !== 2) {
            throw new Error('Math function must have two arguments: ' + expression);
        }
        const left = evalExpression(parts[0], vars, input_queue);
        const right = evalExpression(parts[1], vars, input_queue);

        switch (func) {
            case 'ADD': return Math.round(left + right);
            case 'SUB': return Math.round(left - right);
            case 'MULT': return Math.round(left * right);
            case 'DIV': return Math.round(left / right);
            case 'EXP': return Math.round(left ** right);
            case 'BASE':
                if (right < 2 || right > 36) {
                    throw new Error("Base must be between 2 and 36");
                }
                return parseInt(left.toString(right));
            case 'ABS': return Math.abs(left);
            case 'MOD':
                if (right === 0) throw new Error("MOD by zero");
                return left % right;
            case 'RAND':
                const min = Math.min(left, right);
                const max = Math.max(left, right);
                return Math.floor(Math.random() * (max - min + 1)) + min;
            case 'MIN': return Math.min(left, right);
            case 'MAX': return Math.max(left, right);
            default:
                throw new Error("Unknown function: " + func);
        }
    }

    throw new Error('Cannot parse expression: ' + expression)
}

window.addEventListener('load', () => {
    const saved = localStorage.getItem('goa_code');
    if (saved) {
        code_area.value = saved;
    }
});

