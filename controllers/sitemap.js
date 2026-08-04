import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function generateSitemap(req, res) {
  try {
    // Получаем все уникальные коды из базы. 
    // select: { code: true } позволяет не тянуть лишние данные.
    // distinct: ['code'] на случай, если есть дубликаты кодов (если нужно).
    const reports = await prisma.diagnosticReport.findMany({
      select: {
        code: true
      },
      distinct: ['code'],
      where: {
        // Убедимся, что не тянем пустые коды или служебные 'UNSUPPORTED', если они есть
        code: {
          not: 'UNSUPPORTED'
        },
        created_at: {
          lte: new Date()
        }
      }
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Главная страница -->
  <url>
    <loc>https://7set.pro/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>`;

    // Добавляем страницы для каждого кода
    for (const report of reports) {
      if (!report.code) continue;
      const lowerCode = report.code.toLowerCase();
      xml += `
  <url>
    <loc>https://7set.pro/obd2/${lowerCode}</loc>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>`;
    }

    xml += `\n</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.send(xml);

  } catch (error) {
    console.error('Ошибка при генерации sitemap.xml:', error);
    return res.status(500).send('Internal Server Error');
  }
}
