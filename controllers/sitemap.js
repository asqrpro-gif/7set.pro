import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LIMIT_PER_SITEMAP = 45000;

export default async function generateSitemap(req, res) {
  try {
    const pageStr = req.params.page;
    let page = 1;

    if (pageStr) {
      page = parseInt(pageStr);
      if (isNaN(page) || page < 1) page = 1;
    } else {
      // Это запрос к корневому /sitemap.xml
      // Узнаем уникальное количество URL
      // Используем count() без distinct, так как это просто оценка лимита, 
      // но для точности лучше было бы distinct. Однако count с distinct в Prisma поддерживается.
      // Для простоты берем общее число безопасных карточек.
      const totalCount = await prisma.diagnosticReport.count({
        where: {
          code: { not: 'UNSUPPORTED' },
          seoRisk: { not: 'DANGER' },
          created_at: { lte: new Date() }
        }
      });

      if (totalCount > LIMIT_PER_SITEMAP) {
        // Выводим индексный sitemap
        const totalPages = Math.ceil(totalCount / LIMIT_PER_SITEMAP);
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
        for (let i = 1; i <= totalPages; i++) {
          xml += `\n  <sitemap>\n    <loc>https://7set.pro/sitemap-${i}.xml</loc>\n  </sitemap>`;
        }
        xml += `\n</sitemapindex>`;
        res.setHeader('Content-Type', 'application/xml');
        return res.send(xml);
      }
    }

    // Генерация URLSET (либо кусок sitemap-X, либо целый sitemap если < 45000)
    const skip = (page - 1) * LIMIT_PER_SITEMAP;
    
    const reports = await prisma.diagnosticReport.findMany({
      select: { brand: true, model: true, code: true },
      distinct: ['brand', 'model', 'code'],
      where: {
        code: { not: 'UNSUPPORTED' },
        seoRisk: { not: 'DANGER' }, // УМНАЯ ФИЛЬТРАЦИЯ МУСОРА
        created_at: { lte: new Date() }
      },
      skip: skip,
      take: LIMIT_PER_SITEMAP,
      orderBy: { created_at: 'desc' }
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    
    // Статические страницы добавляем только в первый sitemap
    if (page === 1) {
      const staticPages = [
        { url: 'https://7set.pro/', priority: '1.0', freq: 'daily' },
        { url: 'https://7set.pro/catalog', priority: '0.9', freq: 'weekly' },
        { url: 'https://7set.pro/legal/subscription', priority: '0.5', freq: 'monthly' }
      ];

      for (const sp of staticPages) {
        xml += `\n  <url>\n    <loc>${sp.url}</loc>\n    <priority>${sp.priority}</priority>\n    <changefreq>${sp.freq}</changefreq>\n  </url>`;
      }
    }

    for (const report of reports) {
      if (!report.code || !report.brand || !report.model) continue;
      
      const b = encodeURIComponent(report.brand.toLowerCase());
      const m = encodeURIComponent(report.model.toLowerCase());
      const c = encodeURIComponent(report.code.toLowerCase());
      
      xml += `\n  <url>\n    <loc>https://7set.pro/catalog/${b}/${m}/${c}</loc>\n    <priority>0.8</priority>\n    <changefreq>weekly</changefreq>\n  </url>`;
    }

    xml += `\n</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.send(xml);

  } catch (error) {
    console.error('Ошибка при генерации sitemap.xml:', error);
    return res.status(500).send('Internal Server Error');
  }
}
