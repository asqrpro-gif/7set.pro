import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'db', 'cache_errors');

/**
 * Модуль управления файловым кэшем ИИ-диагностики
 */
export const ErrorCache = {
  /**
   * Преобразует марку, модель и код в безопасное имя файла (slug)
   * Пример: "Geely", "Monjaro", "P0301" -> "geely-monjaro-p0301.json"
   */
  makeSlug(brand, model, code) {
    const cleanBrand = brand.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const cleanModel = model.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    return `${cleanBrand}-${cleanModel}-${cleanCode}`;
  },

  /**
   * Чтение кэшированного ответа по ошибке
   */
  async get(brand, model, code) {
    try {
      const slug = this.makeSlug(brand, model, code);
      const filePath = path.join(CACHE_DIR, `${slug}.json`);
      
      const data = await fs.readFile(filePath, 'utf-8');
      const cache = JSON.parse(data);
      
      // Увеличиваем счетчик просмотров для аналитики
      cache.views_count = (cache.views_count || 0) + 1;
      await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf-8');
      
      return cache;
    } catch {
      return null; // Файл не найден — нужен запрос к ИИ
    }
  },

  /**
   * Сохранение нового ответа от ИИ в кэш
   */
  async set(brand, model, code, aiData) {
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      
      const slug = this.makeSlug(brand, model, code);
      const filePath = path.join(CACHE_DIR, `${slug}.json`);

      const cacheEntry = {
        slug,
        brand,
        model,
        code: code.toUpperCase(),
        severity: aiData.severity || 'medium', // low | medium | high | critical
        summary: aiData.summary,
        teaser_text: aiData.teaser_text, // Первые 20% для SEO / Пейволла
        full_analysis_markdown: aiData.full_analysis_markdown, // Остальные 80%
        sto_protection_tips: aiData.sto_protection_tips, // Как не дать обмануть себя на СТО
        views_count: 1,
        created_at: Date.now()
      };

      await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
      return cacheEntry;
    } catch (error) {
      console.error('Ошибка сохранения кэша ИИ:', error);
      throw error;
    }
  }
};
