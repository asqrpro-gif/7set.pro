import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Вычисляем абсолютный путь к корню проекта (на уровень выше от папки lib)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

// Жестко читаем .env по абсолютному пути
try {
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
    console.log('✅ Файл .env успешно прочитан по пути:', envPath);
  } else {
    console.error('❌ Файл .env НЕ НАЙДЕН по пути:', envPath);
  }
} catch (e) {
  console.error('❌ Ошибка чтения .env:', e.message);
}

// Очищаем ключ от любых кавычек, пробелов и спецсимволов
const rawKey = process.env.GEMINI_API_KEY || '';
const apiKey = rawKey.replace(/['"\s\r\n\u200B-\u200D\uFEFF]/g, '');

if (!apiKey) {
  console.error('❌ ОШИБКА: GEMINI_API_KEY пустой!');
} else {
  console.log('✅ Ключ ИИ подхвачен! Длина:', apiKey.length);
}

const ai = new GoogleGenAI({ apiKey: apiKey });

/**
 * Боевой вызов Gemini API
 */
export async function analyzeCarError(brand, model, code, baseDescription) {
  const prompt = `Ты — топовый автодиагност из СНГ и SEO-специалист. Твоя задача — расшифровать ошибку ${code} для автомобиля ${brand} ${model}.
СТРОГОЕ ПРАВИЛО 1 (Суть ошибки): Официальная техническая суть этого кода: '${baseDescription}'. Не придумывай ничего другого. Опирайся только на эту базу.
СТРОГОЕ ПРАВИЛО 2 (Уникальность и LSI): Пиши текст так, чтобы он был уникален именно для ${brand} ${model}. Упоминай типичные двигатели этой модели, "болячки" кузовов. Используй маркеры рынка СНГ: "СТО", "официалы", "разборка", "контрактная запчасть", "морозы".
СТРОГОЕ ПРАВИЛО 3 (Цены): Все цены строго в USD ($).

Формирование полей (используй Markdown):
- 'full_analysis_markdown': Опиши причины и симптомы. В конце этого поля ОБЯЗАТЕЛЬНО добавь заголовок "### Как не лохануться на СТО" и напиши 2-3 совета, как механики могут обмануть клиента при этой ошибке.
- 'diy_instructions': Инструкция по ремонту с двойными переносами строк.
- Остальные поля заполни коротко по старым правилам.

При генерации Markdown-текста используй для главных разделов заголовки второго уровня (##), а для подразделов — третьего (###). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать любые эмодзи.`;

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          summary: { type: 'string' },
          teaser_text: { type: 'string' },
          full_analysis_markdown: { type: 'string' },
          sto_protection_tips: { type: 'string' },
          drivability: { type: 'string' },
          diy_difficulty_text: { type: 'string' },
          diy_difficulty_score: { type: 'string' },
          diy_time: { type: 'string' },
          diy_tools: { type: 'string' },
          price_parts: { type: 'string' },
          price_labor: { type: 'string' },
          diy_instructions: { type: 'string' },
          seoTitle: { type: 'string' },
          seoDescription: { type: 'string' }
        },
        required: [
          'severity', 'summary', 'teaser_text', 'full_analysis_markdown',
          'sto_protection_tips', 'drivability', 'diy_difficulty_text',
          'diy_difficulty_score', 'diy_time', 'diy_tools', 'price_parts',
          'price_labor', 'diy_instructions', 'seoTitle', 'seoDescription'
        ]
      }
    }
  });

  return JSON.parse(response.text);
}