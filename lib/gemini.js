import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

// 1. Обычная загрузка для Ларагона
dotenv.config();

// 2. Страховка для Ubuntu/PM2: точечное чтение файла .env с сервера
try {
  if (fs.existsSync('/var/www/7set/.env')) {
    const envConfig = dotenv.parse(fs.readFileSync('/var/www/7set/.env', 'utf-8'));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
  }
} catch (e) {
  console.error('Ошибка чтения .env на сервере:', e.message);
}

// ЖЕСТКАЯ ОЧИСТКА: срезаем невидимые пробелы и символы \r от Windows
const rawKey = process.env.GEMINI_API_KEY || '';
const apiKey = rawKey.trim();

if (!apiKey) {
  console.error('❌ ОШИБКА: Ключ GEMINI_API_KEY не задан в файле .env');
} else {
  console.log('✅ Ключ ИИ успешно загружен, длина:', apiKey.length);
}

// Инициализируем новый клиент уже с идеально чистым ключом
const ai = new GoogleGenAI({ apiKey: apiKey });

/**
 * Боевой вызов Gemini API через новую библиотеку
 */
export async function analyzeCarError(brand, model, code, baseDescription) {
  const prompt = `Ты — топовый автодиагност из СНГ и SEO-специалист. Твоя задача — расшифровать ошибку ${code} для автомобиля ${brand} ${model}.
СТРОГОЕ ПРАВИЛО 1 (Суть ошибки): Официальная техническая суть этого кода: '${baseDescription}'. Не придумывай ничего другого. Опирайся только на эту базу.
СТРОГОЕ ПРАВИЛО 2 (Уникальность и LSI): Пиши текст так, чтобы он был уникален именно для ${brand} ${model}. Упоминай типичные двигатели этой модели, "болячки" кузовов. Используй маркеры рынка СНГ: "СТО", "официалы", "разборка", "контрактная запчасть", "морозы".
СТРОГОЕ ПРАВИЛО 3 (Цены): Все цены строго в USD ($).

Формирование полей (используй Markdown):
- 'full_analysis_markdown': Опиши причины и симптомы. В конце этого поля ОБЯЗАТЕЛЬНО добавь заголовок "### Как не лохануться на СТО" и напиши 2-3 совета, как механики могут обмануть клиента при этой ошибке (например, "предложат вырезать катализатор, хотя дело в лямбде").
- 'diy_instructions': Инструкция по ремонту с двойными переносами строк.
- Остальные поля (summary, price_parts и т.д.) заполни коротко по старым правилам.

При генерации Markdown-текста используй для главных разделов заголовки второго уровня (##), а для подразделов — третьего (###). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать любые эмодзи (смайлики) в тексте и заголовках. Используй только строгий технический Markdown-формат без визуального мусора.`;

  // Используем стабильную версию
  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
    config: {
      temperature: 0.2, // Меньше креативности, больше точности
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            description: 'Уровень опасности: low, medium, high, critical'
          },
          summary: {
            type: 'string',
            description: 'Краткое резюме проблемы в одно предложение.'
          },
          teaser_text: {
            type: 'string',
            description: 'Понятное объяснение для водителя простыми словами.'
          },
          full_analysis_markdown: {
            type: 'string',
            description: 'Подробный технический разбор в формате Markdown (причины, проверка, последствия).'
          },
          sto_protection_tips: {
            type: 'string',
            description: 'Совет водителю: как вести себя на СТО, чтобы не обманули.'
          },
          drivability: {
            type: 'string',
            description: 'Статус безопасности дальнейшей поездки. Допустимые значения: safe, caution, tow. safe = Можно ехать. caution = Своим ходом до СТО. tow = Только эвакуатор.'
          },
          diy_difficulty_text: {
            type: 'string',
            description: 'Текстовая сложность (например: Легко, Средне, Сложно)'
          },
          diy_difficulty_score: {
            type: 'string',
            description: 'Оценка сложности от 1 до 10 (например: "5")'
          },
          diy_time: {
            type: 'string',
            description: 'Примерное время ремонта (например: "2 часа")'
          },
          diy_tools: {
            type: 'string',
            description: 'Необходимые инструменты для ремонта'
          },
          price_parts: {
            type: 'string',
            description: 'Сервис международный. Все примерные цены указывай ТОЛЬКО В ДОЛЛАРАХ США (USD). Пиши коротко, без лишних слов. Пример: $50 - $80.'
          },
          price_labor: {
            type: 'string',
            description: 'Сервис международный. Все примерные цены указывай ТОЛЬКО В ДОЛЛАРАХ США (USD). Пиши коротко, без лишних слов. Пример: $50 - $80.'
          },
          diy_instructions: {
            type: 'string',
            description: 'Пошаговая инструкция по самостоятельному ремонту'
          },
          seoTitle: {
            type: 'string',
            description: 'SEO заголовок (строго до 60 символов). Формат: "Ошибка [Код] [Марка] [Модель]: [Краткая суть поломки]". Пример: "Ошибка P1008 Toyota Camry: сбой датчика распредвала".'
          },
          seoDescription: {
            type: 'string',
            description: 'SEO описание (строго до 160 символов). Должно раскрывать суть проблемы простым языком и содержать призыв к действию.'
          }
        },
        required: [
          'severity',
          'summary',
          'teaser_text',
          'full_analysis_markdown',
          'sto_protection_tips',
          'drivability',
          'diy_difficulty_text',
          'diy_difficulty_score',
          'diy_time',
          'diy_tools',
          'price_parts',
          'price_labor',
          'diy_instructions',
          'seoTitle',
          'seoDescription'
        ]
      }
    }
  });

  // Новая библиотека сразу возвращает чистый JSON-текст по нашей схеме
  return JSON.parse(response.text);
}