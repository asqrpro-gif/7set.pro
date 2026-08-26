import 'dotenv/config';

async function test() {
    const cleanKey = process.env.GEMINI_API_KEY.trim();
    const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;
    
    const promptSeo = `Напиши короткую статью про ошибку P0182 (Honda CR-V). Верни JSON с полем test.`;
    
    console.log('Sending test request...');
    const startTime = Date.now();
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptSeo }] }],
                generationConfig: {
                    temperature: 0.3,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'OBJECT',
                        properties: { test: { type: 'STRING' } }
                    }
                }
            }),
            signal: AbortSignal.timeout(10000) // 10s timeout
        });
        const text = await response.text();
        console.log(`Time taken: ${(Date.now() - startTime) / 1000}s`);
        console.log('Response:', text);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
