import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
const REPORT_FILE = path.join(__dirname, 'links_report.json');

// Regex для поиска Markdown ссылок вида [text](url)
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

async function run() {
    console.log(`[${new Date().toLocaleString()}] Запуск Радара (Сироты & 404)...`);

    const reports = await prisma.diagnosticReport.findMany({
        select: {
            id: true,
            brand: true,
            model: true,
            code: true,
            full_analysis_markdown: true,
            pro_tips_md: true,
            tools_table_md: true,
            oem_parts_table_md: true,
            related_obd_codes: true,
            created_at: true
        }
    });

    console.log(`Загружено карточек из базы: ${reports.length}`);

    // Множество всех существующих URL
    const validUrls = new Map();
    reports.forEach(r => {
        const url = `/catalog/${r.brand.toLowerCase()}/${r.model.toLowerCase()}/${r.code.toLowerCase()}`;
        validUrls.set(url, r.id);
    });

    const brokenLinks = []; // { id, title, text, url, field }
    const inboundCounts = new Map(); // url -> count

    reports.forEach(r => {
        const url = `/catalog/${r.brand.toLowerCase()}/${r.model.toLowerCase()}/${r.code.toLowerCase()}`;
        inboundCounts.set(url, 0);
    });

    for (const report of reports) {
        const title = `${report.brand} ${report.model} ${report.code}`;
        const fieldsToCheck = [
            { name: 'full_analysis_markdown', content: report.full_analysis_markdown },
            { name: 'pro_tips_md', content: report.pro_tips_md },
            { name: 'tools_table_md', content: report.tools_table_md },
            { name: 'oem_parts_table_md', content: report.oem_parts_table_md }
        ];

        for (const field of fieldsToCheck) {
            if (!field.content) continue;
            
            let match;
            linkRegex.lastIndex = 0; // Сбрасываем индекс перед каждым полем
            while ((match = linkRegex.exec(field.content)) !== null) {
                const text = match[1];
                let rawUrl = match[2].trim();
                let url = rawUrl;

                // Игнорируем внешние ссылки, не относящиеся к сайту
                if (url.startsWith('http') && !url.includes('7set.pro')) continue;

                // Нормализуем URL
                if (url.startsWith('https://7set.pro') || url.startsWith('http://7set.pro')) {
                    url = url.replace(/^https?:\/\/7set\.pro/, '');
                }
                
                // Нас интересуют ссылки на карточки (catalog/brand/model/code)
                if (url.startsWith('/catalog/')) {
                    try {
                        url = decodeURIComponent(url);
                    } catch (e) {}

                    const parts = url.split('/').filter(Boolean);
                    if (parts.length >= 4) { // catalog, brand, model, code
                        const normalizedUrl = `/catalog/${parts[1].toLowerCase()}/${parts[2].toLowerCase()}/${parts[3].toLowerCase()}`;
                        
                        if (validUrls.has(normalizedUrl)) {
                            // Ссылка живая, увеличиваем счетчик входящих ссылок на эту карточку
                            inboundCounts.set(normalizedUrl, (inboundCounts.get(normalizedUrl) || 0) + 1);
                        } else {
                            // Битая ссылка
                            brokenLinks.push({
                                id: report.id,
                                title: title,
                                text: text,
                                url: rawUrl, // сохраняем сырой урл для точного удаления в тексте
                                field: field.name
                            });
                        }
                    }
                }
            }
        }

        // Проверяем блок related_obd_codes
        if (report.related_obd_codes) {
            let related = [];
            try {
                if (typeof report.related_obd_codes === 'string') {
                    related = JSON.parse(report.related_obd_codes);
                } else if (Array.isArray(report.related_obd_codes)) {
                    related = report.related_obd_codes;
                }
            } catch (e) {}

            for (const rel of related) {
                let codeStr = null;
                if (typeof rel === 'string') {
                    codeStr = rel;
                } else if (rel && typeof rel === 'object' && rel.code) {
                    codeStr = rel.code;
                }

                if (codeStr) {
                    const normalizedUrl = `/catalog/${report.brand.toLowerCase()}/${report.model.toLowerCase()}/${codeStr.toLowerCase()}`;
                    if (validUrls.has(normalizedUrl)) {
                        inboundCounts.set(normalizedUrl, (inboundCounts.get(normalizedUrl) || 0) + 1);
                    }
                }
            }
        }
    }

    // Ищем сирот
    const orphans = [];
    reports.forEach(r => {
        // Мы ищем сирот среди опубликованных карточек (или всех, но лучше всех, так как они должны обрастать ссылками до публикации тоже)
        const url = `/catalog/${r.brand.toLowerCase()}/${r.model.toLowerCase()}/${r.code.toLowerCase()}`;
        if (inboundCounts.get(url) === 0) {
            orphans.push({
                id: r.id,
                brand: r.brand,
                model: r.model,
                code: r.code,
                created_at: r.created_at
            });
        }
    });

    console.log(`Найдено битых ссылок: ${brokenLinks.length}`);
    console.log(`Найдено страниц-сирот: ${orphans.length}`);

    const reportData = {
        last_scan: new Date().toISOString(),
        brokenLinks: brokenLinks,
        orphans: orphans
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf-8');
    console.log(`[${new Date().toLocaleString()}] Сканирование завершено. Результаты сохранены.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
