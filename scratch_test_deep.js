import { analyzeCarErrorDeep } from './lib/gemini_clean.js';

async function test() {
    console.log('Testing new analyzeCarErrorDeep...');
    try {
        const result = await analyzeCarErrorDeep('Toyota', 'RAV4', 'P0302', 'Пропуск зажигания в цилиндре 2');
        console.log('--- Result ---');
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Test failed:', e);
    }
    process.exit(0);
}

test();
