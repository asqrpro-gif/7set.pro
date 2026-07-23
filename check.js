import dotenv from 'dotenv';
dotenv.config();

async function checkModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log("✅ Доступные модели для генерации текста:");
        data.models.forEach(model => {
            // Фильтруем только те, что подходят для нашего кода (generateContent)
            if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
                // Убираем системный префикс 'models/', оставляем чистое имя
                console.log(`➡️ ${model.name.replace('models/', '')}`);
            }
        });
    } catch (error) {
        console.error("❌ Ошибка при получении списка:", error);
    }
}

checkModels();