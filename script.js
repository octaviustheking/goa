const code_area = document.querySelector('#code textarea');
const input_area = document.querySelector('#input textarea');
const output_area = document.querySelector('#output p');
const run_button = document.querySelector('#output button')

run_button.addEventListener('click', () => {
    const code = code_area.value;
    const input = input_area.value;

});

function