/**
 * Боевой вызов Gemini API через защищенный прокси Cloudflare Worker
 */
export async function analyzeCarError(brand, model, code, baseDescription) {
  // Вставь сюда URL твоего Cloudflare Worker
  const WORKER_URL = 'https://carcode-proxy.твое-имя.workers.dev';

  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      brand,
      model,
      code,
      baseDescription
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Cloudflare Worker Error: ${JSON.stringify(data.error || data)}`);
  }

  // Извлекаем текст ответа Google, который прокси успешно получил и переслал
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Получен пустой ответ от ИИ через прокси');
  }

  return JSON.parse(textContent);
}