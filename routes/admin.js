import express from 'express';
import { PrismaClient } from '@prisma/client';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { calculateSeoScore } from '../lib/seo_scanner.js';
import { enrichSeoCard } from '../services/seoEnrichmentService.js';
import { enrichReportText } from '../lib/seoEnricher.js';
const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsPath = path.join(__dirname, '../scripts');
const STATE_FILE = path.join(scriptsPath, 'generation_state.json');
const REPORT_FILE = path.join(scriptsPath, 'bad_cards_report.json');
const META_REPORT_FILE = path.join(scriptsPath, 'bad_seo_meta.json');
const PING_FILE = path.join(scriptsPath, 'sitemap_ping.json');

// HTTP Basic Auth Middleware
const basicAuth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    const adminUser = process.env.SUPER_ADMIN_USER;
    const adminPass = process.env.SUPER_ADMIN_PASS;

    if (!adminUser || !adminPass) {
        return res.status(500).send('SUPER_ADMIN credentials are not configured in .env');
    }

    if (login && password && login === adminUser && password === adminPass) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="7Set Super Admin"');
    res.status(401).send('Требуется авторизация супер-администратора');
};

router.use(basicAuth);

// Process Management State
const activeProcesses = new Map();
const processLogs = new Map();

const getLogs = (scriptName) => processLogs.get(scriptName) || '';

const appendLog = (scriptName, data) => {
    let logs = processLogs.get(scriptName) || '';
    logs += data.toString();
    if (logs.length > 200000) {
        logs = logs.substring(logs.length - 200000);
    }
    processLogs.set(scriptName, logs);
};

// ==========================================
// 1. ДАШБОРД (ГЛАВНАЯ)
// ==========================================
router.get('/', async (req, res) => {
    try {
        // Читаем список файлов в папке scripts
        let scriptFiles = [];
        if (fs.existsSync(scriptsPath)) {
            scriptFiles = fs.readdirSync(scriptsPath).filter(f => f.endsWith('.js') && !['clean_test_cards.js', 'migrate_retroactive.js', 'clean_artifacts.js'].includes(f));
        }

        // Человекочитаемые названия скриптов
        const scriptNames = {
            'enrich_seo_batch.js': 'Массовое pSEO обогащение',
            'generate_seo_cards.js': 'Генерация карточек (ИИ)',
            'reset_seo.js': 'Сброс SEO оценок',
            'scan_seo.js': 'SEO Сканер и Поиск дублей',
            'deduplicate.js': 'Удаление дублей',
            'delete_bad_seo.js': 'Удаление мусорных карточек',
            'scan_links.js': 'Радар ссылок (Orphans/404)',
            'sync_links.js': 'Синхронизация ссылок (чистка 404)',
            'update_site.js': 'Обновление сайта (Git Pull)'
        };

        const scriptOrder = [
            'update_site.js',
            'enrich_seo_batch.js',
            'generate_seo_cards.js',
            'reset_seo.js',
            'scan_seo.js',
            'deduplicate.js',
            'delete_bad_seo.js',
            'sync_links.js'
        ];

        scriptFiles.sort((a, b) => {
            let indexA = scriptOrder.indexOf(a);
            let indexB = scriptOrder.indexOf(b);
            if (indexA === -1) indexA = 999;
            if (indexB === -1) indexB = 999;
            return indexA - indexB;
        });

        // Собираем статусы
        const scriptsStatus = scriptFiles.map(file => {
            let gitInfo = null;
            if (file === 'update_site.js') {
                try {
                    const repoPath = path.join(__dirname, '..');
                    const gitMsg = execSync('git log -1 --format="%s"', { encoding: 'utf-8', cwd: repoPath }).trim();
                    const gitDate = execSync('git log -1 --format="%cd" --date=format:"%d.%m.%Y %H:%M"', { encoding: 'utf-8', cwd: repoPath }).trim();
                    gitInfo = `${gitMsg} (${gitDate})`;
                } catch (e) {
                    console.error('Ошибка получения git info:', e.message);
                }
            }
            return {
                file: file,
                name: scriptNames[file] || file,
                running: activeProcesses.has(file),
                gitInfo: gitInfo
            };
        });

        // Собираем статистику для умного Sitemap
        let sitemapUrlCount = await prisma.diagnosticReport.count({
            where: {
                code: { not: 'UNSUPPORTED' },
                seoRisk: { not: 'DANGER' },
                created_at: { lte: new Date() }
            }
        });
        
        // Добавляем статические страницы (Главная, Каталог, Оферта)
        sitemapUrlCount += 3;

        let lastPing = null;
        try {
            if (fs.existsSync(PING_FILE)) {
                const pingData = JSON.parse(fs.readFileSync(PING_FILE, 'utf-8'));
                lastPing = pingData.date;
            }
        } catch (e) {}

        const sitemapStats = {
            urlCount: sitemapUrlCount,
            limit: 45000,
            lastPing: lastPing,
            isIndex: sitemapUrlCount > 45000,
            chunksCount: Math.ceil(sitemapUrlCount / 45000)
        };

        // Собираем стату для Радара перелинковки
        let linksStats = { orphansCount: 0, brokenLinksCount: 0, lastScan: null };
        const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
        try {
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const linksData = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                linksStats.orphansCount = Array.isArray(linksData.orphans) ? linksData.orphans.length : 0;
                linksStats.brokenLinksCount = Array.isArray(linksData.brokenLinks) ? linksData.brokenLinks.length : 0;

                if (linksData.last_scan) {
                    const scanDate = new Date(linksData.last_scan);
                    linksStats.lastScan = scanDate.toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                }
            }
        } catch (e) {
            console.error('Error reading links_report.json:', e);
        }

        res.render('admin_dashboard', {
            scripts: scriptsStatus,
            sitemapStats: sitemapStats,
            linksStats: linksStats
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка админ-панели");
    }
});

// API для статистики дашборда
router.get('/api/stats', async (req, res) => {
    try {
        const totalReports = await prisma.diagnosticReport.count();
        const publishedReports = await prisma.diagnosticReport.count({
            where: { created_at: { lte: new Date() } }
        });
        const scheduledReports = await prisma.diagnosticReport.count({
            where: { created_at: { gt: new Date() } }
        });

        let generatedToday = 0;
        try {
            if (fs.existsSync(STATE_FILE)) {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
                if (state.date === new Date().toDateString()) {
                    generatedToday = state.count;
                }
            }
        } catch (e) {}

        res.json({
            totalReports,
            publishedReports,
            scheduledReports,
            generatedToday
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// API для пинга Sitemap
router.post('/api/sitemap/ping', async (req, res) => {
    try {
        const sitemapUrl = encodeURIComponent('https://7set.pro/sitemap.xml');
        // Google отключил свой /ping endpoint в начале 2024 года (возвращает 404).
        // Поэтому мы пингуем Bing и Яндекс, которые всё ещё поддерживают этот метод.
        const bingUrl = `https://www.bing.com/ping?sitemap=${sitemapUrl}`;
        const yandexUrl = `https://webmaster.yandex.ru/ping?sitemap=${sitemapUrl}`;
        
        // Отправляем запросы (не дожидаясь ответа, чтобы не вешать интерфейс)
        fetch(bingUrl).catch(() => {});
        fetch(yandexUrl).catch(() => {});
        
        const dateStr = new Date().toLocaleString('ru-RU');
        fs.writeFileSync(PING_FILE, JSON.stringify({ date: dateStr }), 'utf-8');
        return res.json({ success: true, date: dateStr });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Ошибка при отправке запроса' });
    }
});


// ==========================================
// 2. УПРАВЛЕНИЕ СКРИПТАМИ (API)
// ==========================================
router.post('/api/scripts/start', (req, res) => {
    const { script } = req.body;
    if (!script) return res.status(400).json({ error: 'Укажите скрипт' });

    if (activeProcesses.has(script)) {
        return res.status(400).json({ error: 'Скрипт уже запущен' });
    }

    const scriptPath = path.join(scriptsPath, script);
    if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ error: 'Файл скрипта не найден' });
    }
    
    processLogs.set(script, `[${new Date().toLocaleString()}] ЗАПУСК СКРИПТА ${script}...\n`);
    
    const child = spawn('node', [scriptPath], {
        cwd: path.join(__dirname, '../') // запускаем из корня проекта
    });

    activeProcesses.set(script, child);

    child.stdout.on('data', (data) => appendLog(script, data));
    child.stderr.on('data', (data) => appendLog(script, data));

    child.on('close', (code) => {
        appendLog(script, `\n[${new Date().toLocaleString()}] ПРОЦЕСС ЗАВЕРШЕН С КОДОМ ${code}\n`);
        activeProcesses.delete(script);
    });

    child.on('error', (err) => {
        appendLog(script, `\n[ОШИБКА: ${err.message}]\n`);
        activeProcesses.delete(script);
    });

    res.json({ success: true, message: 'Скрипт запущен' });
});

router.post('/api/scripts/stop', (req, res) => {
    const { script } = req.body;
    const child = activeProcesses.get(script);
    if (child) {
        child.kill('SIGKILL');
        activeProcesses.delete(script);
        appendLog(script, `\n[${new Date().toLocaleString()}] ПРОЦЕСС ЖЕСТКО ОСТАНОВЛЕН АДМИНИСТРАТОРОМ (SIGKILL)\n`);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Скрипт не запущен' });
    }
});

router.get('/api/scripts/logs', (req, res) => {
    const script = req.query.script;
    res.json({ 
        running: activeProcesses.has(script),
        logs: getLogs(script)
    });
});



// ==========================================
// 4. ПОЛЬЗОВАТЕЛИ (ЗАГЛУШКА)
// ==========================================
router.get('/users', (req, res) => {
    res.render('admin_users');
});

// ==========================================
// 5. SEO ДЕТЕКТОР
// ==========================================
router.get('/seo-detector', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const take = parseInt(req.query.limit) || (req.cookies && parseInt(req.cookies.seo_table_limit)) || 25;
        const skip = (page - 1) * take;
        const riskFilter = req.query.risk;
        const showDuplicates = req.query.duplicates === 'true';
        const publishStatus = req.query.publish_status;
        const sortField = req.query.sort || 'seoScore';
        const sortOrder = req.query.order === 'desc' ? 'desc' : 'asc';

        const baseWhere = {};
        if (publishStatus === 'PUBLISHED') {
            baseWhere.created_at = { lte: new Date() };
        } else if (publishStatus === 'UNPUBLISHED') {
            baseWhere.created_at = { gt: new Date() };
        }

        const whereClause = { ...baseWhere };
        if (riskFilter && riskFilter !== 'ALL') {
            if (riskFilter === 'WARNING') {
                whereClause.seoRisk = { in: ['WARNING', 'DANGER'] };
            } else {
                whereClause.seoRisk = riskFilter;
            }
        }

        const duplicatesGrouped = await prisma.diagnosticReport.groupBy({
            by: ['brand', 'model', 'code'],
            having: {
                id: { _count: { gt: 1 } }
            },
            _count: { id: true }
        });

        const duplicatesCount = duplicatesGrouped.reduce((sum, d) => sum + d._count.id, 0);

        if (showDuplicates) {
            if (duplicatesGrouped.length > 0) {
                whereClause.OR = duplicatesGrouped.map(d => ({
                    brand: d.brand,
                    model: d.model,
                    code: d.code
                }));
            } else {
                // Если дубликатов нет, возвращаем пустой результат
                whereClause.id = 'none';
            }
        }

        // Получаем общее количество для пагинации
        const total = await prisma.diagnosticReport.count({ where: whereClause });
        
        // Получаем общую статистику для вкладок Risk (с учетом текущего publishStatus)
        const safeCount = await prisma.diagnosticReport.count({ where: { ...baseWhere, seoRisk: 'SAFE' } });
        const warningCount = await prisma.diagnosticReport.count({ where: { ...baseWhere, seoRisk: { in: ['WARNING', 'DANGER'] } } });
        const totalCount = await prisma.diagnosticReport.count({ where: baseWhere });

        // Базовое условие для подсчета статусов публикации (с учетом текущего riskFilter)
        const baseWhereForPublish = {};
        if (riskFilter && riskFilter !== 'ALL') {
            if (riskFilter === 'WARNING') baseWhereForPublish.seoRisk = { in: ['WARNING', 'DANGER'] };
            else baseWhereForPublish.seoRisk = riskFilter;
        }

        // Получаем статистику для вкладок Publish
        const publishedCount = await prisma.diagnosticReport.count({ where: { ...baseWhereForPublish, created_at: { lte: new Date() } } });
        const unpublishedCount = await prisma.diagnosticReport.count({ where: { ...baseWhereForPublish, created_at: { gt: new Date() } } });
        const totalPublishCount = await prisma.diagnosticReport.count({ where: baseWhereForPublish });

        let orderBy = [];
        if (sortField === 'seoScore') {
            orderBy.push({ seoScore: sortOrder });
        } else if (sortField === 'uniquenessScore') {
            orderBy.push({ uniquenessScore: sortOrder });
        } else if (sortField === 'seoRisk') {
            orderBy.push({ seoRisk: sortOrder });
        } else if (sortField === 'brand') {
            orderBy.push({ brand: sortOrder });
            orderBy.push({ model: sortOrder });
            orderBy.push({ code: sortOrder });
        } else if (sortField === 'created_at') {
            orderBy.push({ created_at: sortOrder });
        }
        
        if (sortField !== 'created_at') {
            orderBy.push({ created_at: 'desc' });
        }

        const reports = await prisma.diagnosticReport.findMany({
            where: whereClause,
            take,
            skip,
            orderBy: orderBy
        });

        // Статистика фонового сканирования
        const totalCards = await prisma.diagnosticReport.count();
        const unscannedCount = await prisma.diagnosticReport.count({ where: { seoScore: 0 } });
        const scannedCount = totalCards - unscannedCount;
        
        let lastScanTime = null;
        try {
            const scanStatePath = path.join(__dirname, '../scripts', 'last_scan_time.json');
            if (fs.existsSync(scanStatePath)) {
                const stateData = JSON.parse(fs.readFileSync(scanStatePath, 'utf-8'));
                lastScanTime = new Date(stateData.time).toLocaleString('ru-RU');
            }
        } catch (e) {
            console.error(e);
        }

        // Собираем стату для Радара перелинковки
        let linksStats = { lastScan: null };
        let orphans = [];
        let brokenLinks = [];
        let linkStatsObj = {
            total: 0,
            orphans: 0,
            drafts: 0,
            layout: 0,
            broken: 0
        };
        let linkPublishStats = {
            total: 0,
            published: 0,
            unpublished: 0
        };
        const linkPublishStatus = req.query.link_publish_status || '';
        const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
        try {
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const data = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                orphans = Array.isArray(data.orphans) ? data.orphans : [];
                
                // Преобразуем сирот в формат таблицы битых ссылок
                let mappedOrphans = orphans.map(o => ({
                    id: o.id,
                    title: `${o.brand} ${o.model} ${o.code}`,
                    text: 'На карточку не ведет ни одна ссылка (изолирована)',
                    url: 'СТРАНИЦА-СИРОТА',
                    field: 'Веб-архитектура',
                    created_at: o.created_at || new Date().toISOString()
                }));
                
                brokenLinks = (Array.isArray(data.brokenLinks) ? data.brokenLinks : []).concat(mappedOrphans);
                
                // Добавляем карточки с ошибками генерации из отчета scan_seo.js
                try {
                    if (fs.existsSync(REPORT_FILE)) {
                        const badCardsData = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
                        if (Array.isArray(badCardsData)) {
                            let mappedBadCards = badCardsData.map(c => ({
                                id: c.id,
                                title: `${c.brand} ${c.model} ${c.code}`,
                                text: c.reason || 'Ошибка генерации',
                                url: 'ОШИБКА ВЕРСТКИ',
                                field: 'Контент/SEO',
                                created_at: c.created_at || new Date().toISOString()
                            }));
                            brokenLinks = brokenLinks.concat(mappedBadCards);
                        }
                    }
                } catch (e) {
                    console.error('Ошибка чтения bad_cards_report.json', e);
                }
                
                // Подсчет статистики для фильтров (Тип)
                linkStatsObj.total = brokenLinks.length;
                brokenLinks.forEach(link => {
                    if (link.url === 'СТРАНИЦА-СИРОТА') linkStatsObj.orphans++;
                    else if (link.url === 'ССЫЛКА НА ЧЕРНОВИК') linkStatsObj.drafts++;
                    else if (['ОШИБКА ВЕРСТКИ', 'ОБОРВАННЫЙ ТЕКСТ', 'АРТЕФАКТ'].includes(link.url)) linkStatsObj.layout++;
                    else linkStatsObj.broken++;
                });

                // Подсчет статистики для фильтров (Статус публикации)
                linkPublishStats.total = brokenLinks.length;
                const now = new Date();
                brokenLinks.forEach(link => {
                    if (new Date(link.created_at || 0) <= now) linkPublishStats.published++;
                    else linkPublishStats.unpublished++;
                });

                // Фильтрация (Тип)
                const linkFilter = req.query.link_filter || 'ALL';
                if (linkFilter !== 'ALL') {
                    brokenLinks = brokenLinks.filter(link => {
                        if (linkFilter === 'ORPHANS') return link.url === 'СТРАНИЦА-СИРОТА';
                        if (linkFilter === 'DRAFTS') return link.url === 'ССЫЛКА НА ЧЕРНОВИК';
                        if (linkFilter === 'LAYOUT') return ['ОШИБКА ВЕРСТКИ', 'ОБОРВАННЫЙ ТЕКСТ', 'АРТЕФАКТ'].includes(link.url);
                        if (linkFilter === 'BROKEN') return !['СТРАНИЦА-СИРОТА', 'ССЫЛКА НА ЧЕРНОВИК', 'ОШИБКА ВЕРСТКИ', 'ОБОРВАННЫЙ ТЕКСТ', 'АРТЕФАКТ'].includes(link.url);
                        return true;
                    });
                }

                // Фильтрация (Статус публикации)
                if (linkPublishStatus) {
                    brokenLinks = brokenLinks.filter(link => {
                        const isPublished = new Date(link.created_at || 0) <= now;
                        if (linkPublishStatus === 'PUBLISHED') return isPublished;
                        if (linkPublishStatus === 'UNPUBLISHED') return !isPublished;
                        return true;
                    });
                }
                
                // Сортировка
                const linkSort = req.query.link_sort || 'date';
                const linkOrder = req.query.link_order || 'desc';
                
                brokenLinks.sort((a, b) => {
                    let valA, valB;
                    if (linkSort === 'title') {
                        valA = a.title.toLowerCase();
                        valB = b.title.toLowerCase();
                    } else if (linkSort === 'type' || linkSort === 'problem') {
                        valA = (a.url || '').toLowerCase();
                        valB = (b.url || '').toLowerCase();
                    } else {
                        // date
                        valA = new Date(a.created_at || 0).getTime();
                        valB = new Date(b.created_at || 0).getTime();
                    }
                    
                    if (valA < valB) return linkOrder === 'asc' ? -1 : 1;
                    if (valA > valB) return linkOrder === 'asc' ? 1 : -1;
                    return 0;
                });
                
                if (data.last_scan) {
                    const scanDate = new Date(data.last_scan);
                    linksStats.lastScan = scanDate.toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                }
            }
        } catch (e) {
            console.error('Ошибка чтения links_report.json', e);
        }

        const linkPage = parseInt(req.query.link_page) || 1;
        const linkLimit = take;
        const totalLinks = brokenLinks.length;
        const linkTotalPages = Math.ceil(totalLinks / linkLimit) || 1;
        brokenLinks = brokenLinks.slice((linkPage - 1) * linkLimit, linkPage * linkLimit);

        // Обогащаем brokenLinks флагом hasRetroLinks из базы
        if (brokenLinks.length > 0) {
            const brokenLinkIds = brokenLinks.map(link => link.id).filter(id => id);
            const dbReports = await prisma.diagnosticReport.findMany({
                where: { id: { in: brokenLinkIds } },
                select: { id: true, full_analysis_markdown: true, summary: true }
            });
            const dbReportsMap = {};
            dbReports.forEach(r => {
                dbReportsMap[r.id] = (r.full_analysis_markdown || r.summary || '').includes('ПДД и эксплуатация') || (r.full_analysis_markdown || r.summary || '').includes('ПДД и полезные ресурсы');
            });
            brokenLinks.forEach(link => {
                link.hasRetroLinks = !!dbReportsMap[link.id];
            });
        }

        // Сбор проблемных SEO-заголовков и описаний (по дублям шаблонов)
        const titlePublishStatus = req.query.title_publish_status || '';
        
        let problematicTitles = [];
        let problematicDescriptions = [];
        
        try {
            if (fs.existsSync(META_REPORT_FILE)) {
                const metaData = JSON.parse(fs.readFileSync(META_REPORT_FILE, 'utf-8'));
                if (metaData.problematicTitles) problematicTitles = metaData.problematicTitles;
                if (metaData.problematicDescriptions) problematicDescriptions = metaData.problematicDescriptions;
            }
        } catch (e) {
            console.error('Ошибка чтения bad_seo_meta.json', e);
        }

        const nowForTitles = new Date();
        const titlePublishStats = { total: 0, published: 0, unpublished: 0 };
        problematicTitles.forEach(t => {
            titlePublishStats.total++;
            if (new Date(t.created_at) <= nowForTitles) {
                titlePublishStats.published++;
            } else {
                titlePublishStats.unpublished++;
            }
        });

        if (titlePublishStatus === 'PUBLISHED') {
            problematicTitles = problematicTitles.filter(t => new Date(t.created_at) <= nowForTitles);
        } else if (titlePublishStatus === 'UNPUBLISHED') {
            problematicTitles = problematicTitles.filter(t => new Date(t.created_at) > nowForTitles);
        }

        const titleSort = req.query.title_sort || 'card';
        const titleOrder = req.query.title_order === 'desc' ? 'desc' : 'asc';

        problematicTitles.sort((a, b) => {
            let valA = '';
            let valB = '';
            if (titleSort === 'card') {
                valA = `${a.brand} ${a.model} ${a.code}`.toLowerCase();
                valB = `${b.brand} ${b.model} ${b.code}`.toLowerCase();
            } else if (titleSort === 'title') {
                valA = a.seoTitle ? a.seoTitle.toLowerCase() : '';
                valB = b.seoTitle ? b.seoTitle.toLowerCase() : '';
            }
            if (valA < valB) return titleOrder === 'asc' ? -1 : 1;
            if (valA > valB) return titleOrder === 'asc' ? 1 : -1;
            return 0;
        });

        const titlePage = parseInt(req.query.title_page) || 1;
        const titleLimit = take;
        const totalTitles = problematicTitles.length;
        const titleTotalPages = Math.ceil(totalTitles / titleLimit) || 1;
        problematicTitles = problematicTitles.slice((titlePage - 1) * titleLimit, titlePage * titleLimit);

        const descPublishStatus = req.query.desc_publish_status || '';

        const descPublishStats = { total: 0, published: 0, unpublished: 0 };
        problematicDescriptions.forEach(d => {
            descPublishStats.total++;
            if (new Date(d.created_at) <= nowForTitles) {
                descPublishStats.published++;
            } else {
                descPublishStats.unpublished++;
            }
        });

        if (descPublishStatus === 'PUBLISHED') {
            problematicDescriptions = problematicDescriptions.filter(d => new Date(d.created_at) <= nowForTitles);
        } else if (descPublishStatus === 'UNPUBLISHED') {
            problematicDescriptions = problematicDescriptions.filter(d => new Date(d.created_at) > nowForTitles);
        }

        const descSort = req.query.desc_sort || 'card';
        const descOrder = req.query.desc_order === 'desc' ? 'desc' : 'asc';

        problematicDescriptions.sort((a, b) => {
            let valA = '';
            let valB = '';
            if (descSort === 'card') {
                valA = `${a.brand} ${a.model} ${a.code}`.toLowerCase();
                valB = `${b.brand} ${b.model} ${b.code}`.toLowerCase();
            } else if (descSort === 'desc') {
                valA = a.seoDescription ? a.seoDescription.toLowerCase() : '';
                valB = b.seoDescription ? b.seoDescription.toLowerCase() : '';
            }
            if (valA < valB) return descOrder === 'asc' ? -1 : 1;
            if (valA > valB) return descOrder === 'asc' ? 1 : -1;
            return 0;
        });

        const descPage = parseInt(req.query.desc_page) || 1;
        const descLimit = take;
        const totalDesc = problematicDescriptions.length;
        const descTotalPages = Math.ceil(totalDesc / descLimit) || 1;
        problematicDescriptions = problematicDescriptions.slice((descPage - 1) * descLimit, descPage * descLimit);

        const mode = req.query.mode || 'seo';

        res.render('admin_seo_detector', {
            problematicTitles,
            titlePublishStatus,
            titlePublishStats,
            titleSort,
            titleOrder,
            titlePage,
            titleLimit,
            titleTotalPages,
            totalTitles,
            problematicDescriptions,
            descPublishStatus,
            descPublishStats,
            descSort,
            descOrder,
            descPage,
            descLimit,
            descTotalPages,
            totalDesc,
            reports: reports,
            page,
            limit: take,
            totalPages: Math.ceil(total / take) || 1,
            currentRisk: riskFilter || 'ALL',
            currentPublishStatus: publishStatus || '',
            showDuplicates: showDuplicates,
            duplicatesCount: duplicatesCount,
            currentSort: sortField,
            currentOrder: sortOrder,
            mode: mode,
            linksStats: linksStats,
            orphans: orphans,
            brokenLinks: brokenLinks,
            linkPage,
            linkLimit,
            linkTotalPages,
            totalLinks,
            stats: {
                safe: safeCount,
                warning: warningCount,
                total: totalCount
            },
            brokenLinksStats: linkStatsObj,
            linkFilter: req.query.link_filter || 'ALL',
            linkSort: req.query.link_sort || 'date',
            linkOrder: req.query.link_order || 'desc',
            linkPublishStatus: linkPublishStatus,
            linkPublishStats: linkPublishStats,
            publishStats: {
                published: publishedCount,
                unpublished: unpublishedCount,
                total: totalPublishCount
            },
            scanStats: {
                scanned: scannedCount,
                total: totalCards,
                lastScanTime: lastScanTime
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка загрузки SEO детектора");
    }
});

// API для ручного pSEO обогащения
router.post('/api/seo/enrich-single', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID обязателен' });

    try {
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });

        const result = await enrichSeoCard(report, prisma);
        if (result.success) {
            res.json({ success: true, report: result.report });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при обогащении' });
    }
});

// API для получения детального разбора баллов (асинхронно, при открытии модалки)
// Получение полных данных карточки по ID (для модалки из таблицы битых ссылок)
router.get('/api/seo-detector/report/:id', async (req, res) => {
    try {
        const report = await prisma.diagnosticReport.findUnique({
            where: { id: req.params.id }
        });
        if (!report) return res.json({ success: false, error: 'Не найдено' });
        res.json({ success: true, report });
    } catch (e) {
        console.error(e);
        res.json({ success: false, error: 'Ошибка' });
    }
});

router.get('/api/test/dump-p0134', async (req, res) => {
    try {
        const report = await prisma.diagnosticReport.findFirst({
            where: { brand: 'hyundai', model: 'tucson', code: 'p0134' }
        });
        res.json(report);
    } catch(e) { res.json({error: e.message}); }
});

router.get('/api/seo-detector/details/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });
        
        const { details } = await calculateSeoScore(report, prisma);
        res.json({ success: true, details });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения деталей' });
    }
});

router.post('/api/seo-detector/update', async (req, res) => {
    const { id, seoTitle, seoDescription, teaser_text, full_analysis_markdown } = req.body;
    if (!id) return res.status(400).json({ error: 'ID обязателен' });

    try {
        // Получаем текущую запись, чтобы не потерять другие поля при пересчете
        const currentReport = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!currentReport) return res.status(404).json({ error: 'Отчет не найден' });

        // Подготавливаем обновленные данные для скоринга
        const updatedData = {
            ...currentReport,
            seoTitle,
            seoDescription,
            teaser_text,
            full_analysis_markdown
        };

        const { score, risk, uniquenessScore, details } = await calculateSeoScore(updatedData, prisma);

        // Сохраняем в БД
        await prisma.diagnosticReport.update({
            where: { id },
            data: {
                seoTitle,
                seoDescription,
                teaser_text,
                full_analysis_markdown,
                seoScore: score,
                seoRisk: risk,
                uniquenessScore
            }
        });

        res.json({ success: true, score, risk, uniquenessScore, details });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

router.post('/api/seo-detector/publish', async (req, res) => {
    try {
        const { id } = req.body;
        // Устанавливаем created_at в текущее время (Опубликовано)
        await prisma.diagnosticReport.update({
            where: { id },
            data: { created_at: new Date() }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка публикации' });
    }
});

router.post('/api/seo-detector/unpublish', async (req, res) => {
    try {
        const { id } = req.body;
        // Устанавливаем created_at в 2099 год (Отложено)
        const futureDate = new Date('2099-01-01T00:00:00Z');
        await prisma.diagnosticReport.update({
            where: { id },
            data: { created_at: futureDate }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка снятия с публикации' });
    }
});

router.post('/api/seo-detector/delete', async (req, res) => {
    try {
        const { id } = req.body;
        await prisma.diagnosticReport.delete({
            where: { id }
        });

        // Очищаем из локальных отчетов, чтобы не висели "призраки" после перезагрузки
        const fs = require('fs');
        const path = require('path');
        
        const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
        if (fs.existsSync(LINKS_REPORT_FILE)) {
            const data = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
            if (data.brokenLinks) data.brokenLinks = data.brokenLinks.filter(l => l.id !== id);
            if (data.orphans) data.orphans = data.orphans.filter(o => o.id !== id);
            fs.writeFileSync(LINKS_REPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
        }

        const SEO_REPORT_FILE = path.join(__dirname, '../scripts/bad_seo_meta.json');
        if (fs.existsSync(SEO_REPORT_FILE)) {
            const data = JSON.parse(fs.readFileSync(SEO_REPORT_FILE, 'utf-8'));
            if (data.badMeta) data.badMeta = data.badMeta.filter(l => l.id !== id);
            fs.writeFileSync(SEO_REPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// Асинхронный процесс массового сканирования
router.post('/api/seo-detector/rescan', async (req, res) => {
    // В идеале это нужно запускать через child_process, как другие скрипты, 
    // но для простоты сделаем быстрый батч-апдейт прямо тут без блокировки
    res.json({ success: true, message: 'Массовое сканирование запущено в фоне' });

    // Запускаем асинхронно
    (async () => {
        try {
            const allReports = await prisma.diagnosticReport.findMany();
            for (const report of allReports) {
                const { score, risk, uniquenessScore } = await calculateSeoScore(report, prisma);
                await prisma.diagnosticReport.update({
                    where: { id: report.id },
                    data: { seoScore: score, seoRisk: risk, uniquenessScore }
                });
            }
            console.log(`[SEO Detector] Массовое пересканирование завершено. Обновлено: ${allReports.length}`);
        } catch (e) {
            console.error('[SEO Detector] Ошибка массового сканирования:', e);
        }
    })();
});

// УДАЛЕНИЕ 404 ССЫЛКИ
router.post('/api/links/remove-404', async (req, res) => {
    try {
        const { id, url } = req.body;
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Карточка не найдена' });

        const fs = require('fs');
        const path = require('path');
        const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');

        // Если это особый статус (например, ошибка верстки), просто скрываем уведомление
        const specialStatuses = ['ОШИБКА ВЕРСТКИ', 'СТРАНИЦА-СИРОТА', 'ССЫЛКА НА ЧЕРНОВИК', 'АРТЕФАКТ', 'ОБОРВАННЫЙ ТЕКСТ'];
        if (specialStatuses.includes(url)) {
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const data = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                if (data.brokenLinks) data.brokenLinks = data.brokenLinks.filter(l => !(l.id === id && l.url === url));
                if (data.orphans) data.orphans = data.orphans.filter(l => !(l.id === id && l.url === url));
                fs.writeFileSync(LINKS_REPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
            }
            return res.json({ success: true });
        }

        // Экранируем URL для Regex
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\[([^\\]]+)\\]\\(${escapeRegExp(url)}\\)`, 'g');

        const fields = ['full_analysis_markdown', 'pro_tips_md', 'tools_table_md', 'oem_parts_table_md'];
        const updates = {};
        let modified = false;

        for (const field of fields) {
            if (report[field]) {
                const newContent = report[field].replace(regex, '$1');
                if (newContent !== report[field]) {
                    updates[field] = newContent;
                    modified = true;
                }
            }
        }

        if (modified) {
            await prisma.diagnosticReport.update({ where: { id }, data: updates });
            
            // Обновляем локальный JSON файл, чтобы ссылка исчезла из UI без ресканирования
            const LINKS_REPORT_FILE = path.join(__dirname, '../scripts/links_report.json');
            if (fs.existsSync(LINKS_REPORT_FILE)) {
                const data = JSON.parse(fs.readFileSync(LINKS_REPORT_FILE, 'utf-8'));
                data.brokenLinks = data.brokenLinks.filter(l => !(l.id === id && l.url === url));
                fs.writeFileSync(LINKS_REPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
            }
            
            return res.json({ success: true });
        } else {
            return res.json({ success: false, error: 'Ссылка не найдена в тексте' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Ошибка сервера при удалении ссылки' });
    }
});


// ==========================================
// 6. РЕТРОАКТИВНОЕ SEO-ОБОГАЩЕНИЕ
// ==========================================
router.post('/api/seo-enrich/all', async (req, res) => {
    try {
        const reports = await prisma.diagnosticReport.findMany({ where: { is_complete: true } });
        let updatedCount = 0;
        
        for (const report of reports) {
            const rawText = report.full_analysis_markdown || report.summary || '';
            const newText = enrichReportText(rawText, report.brand, report.model, report.code, report.drivability);
            
            if (newText !== rawText) {
                await prisma.diagnosticReport.update({
                    where: { id: report.id },
                    data: { full_analysis_markdown: newText }
                });
                updatedCount++;
            }
        }
        
        res.json({ success: true, updatedCount });
    } catch (err) {
        console.error('Ошибка массового обогащения:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/api/seo-enrich/single/:id', async (req, res) => {
    try {
        const report = await prisma.diagnosticReport.findUnique({ where: { id: req.params.id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });
        
        const rawText = report.full_analysis_markdown || report.summary || '';
        const newText = enrichReportText(rawText, report.brand, report.model, report.code, report.drivability);
        
        if (newText !== rawText) {
            await prisma.diagnosticReport.update({
                where: { id: report.id },
                data: { full_analysis_markdown: newText }
            });
        }
        
        // Всегда возвращаем recreated: true для одиночного запроса, чтобы интерфейс обновился
        return res.json({ success: true, recreated: true });
    } catch (err) {
        console.error('Ошибка одиночного обогащения:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/api/rewrite-title', async (req, res) => {
    try {
        const { id } = req.body;
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });
        
        const text = report.full_analysis_markdown || report.summary || '';
        const prompt = `Ты топовый SEO-специалист автотематики. Прочитай технический текст ошибки ниже.
Выведи только 1 короткий SEO-заголовок (строго до 70 символов). 
Формат свободный, но ОБЯЗАТЕЛЬНО:
1. Включи Код (${report.code}), Марку (${report.brand}) и Модель (${report.model}).
2. Выяви СПЕЦИФИКУ именно этого кода. Если это обрыв цепи, замыкание, рассинхронизация или конкретный датчик — укажи это максимально точно, чтобы заголовок не был похож на другие ошибки этого же узла.
3. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать слова: "симптомы", "ремонт", "причины", "можно ли ехать дальше". Никаких вопросов и кликбейта.
4. ВАЖНО: Предыдущий заголовок был "${report.seoTitle}". Твоя задача — сгенерировать ПРИНЦИПИАЛЬНО НОВУЮ формулировку. Используй другие синонимы или по-другому расставь акценты на неисправности. Твой новый вариант НЕ ДОЛЖЕН совпадать со старым.

Текст ошибки:
${text.substring(0, 1000)}`;

        const fetch = (await import('node-fetch')).default;
        const API_URL = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2 }
            })
        });

        const data = await response.json();
        let newTitle = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        newTitle = newTitle.replace(/^"|"$/g, '').replace(/\n/g, '').trim();

        if (newTitle) {
            await prisma.diagnosticReport.update({
                where: { id: report.id },
                data: { seoTitle: newTitle }
            });
            return res.json({ success: true, newTitle });
        } else {
            return res.status(500).json({ error: 'ИИ вернул пустой ответ' });
        }
    } catch (err) {
        console.error('Ошибка перегенерации заголовка:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/api/rewrite-description', async (req, res) => {
    try {
        const { id } = req.body;
        const report = await prisma.diagnosticReport.findUnique({ where: { id } });
        if (!report) return res.status(404).json({ error: 'Отчет не найден' });
        
        const text = report.full_analysis_markdown || report.summary || '';
        const prompt = `Ты топовый SEO-специалист автотематики. Прочитай технический текст ошибки ниже.
Выведи только 1 мета-описание (meta description) для страницы ошибки.
Формат свободный, но ОБЯЗАТЕЛЬНО:
1. Включи Код (${report.code}), Марку (${report.brand}) и Модель (${report.model}).
2. СТРОГИЙ ЛИМИТ ДЛИНЫ: от 140 до 160 символов. Это примерно 20-25 слов. Очень важно, чтобы текст был длинным, развернутым и не обрывался. Не делай коротких отписок.
3. Подробно опиши суть проблемы, симптомы и добавь призыв к действию (например: "Узнайте причины поломки и способы решения").
4. ВАЖНО: Предыдущее описание было "${report.seoDescription || ''}". Сделай ПРИНЦИПИАЛЬНО НОВЫЙ и уникальный вариант, выделив другую техническую специфику ошибки, не повторяй шаблон. Никаких кавычек в ответе.

Текст ошибки:
${text.substring(0, 1000)}`;

        const fetch = (await import('node-fetch')).default;
        const API_URL = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 } // Повышенная креативность для разнообразия описаний
            })
        });

        const data = await response.json();
        let newDesc = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        newDesc = newDesc.replace(/^"|"$/g, '').replace(/\n/g, ' ').trim();

        if (newDesc) {
            await prisma.diagnosticReport.update({
                where: { id: report.id },
                data: { seoDescription: newDesc }
            });
            return res.json({ success: true, newDesc });
        } else {
            return res.status(500).json({ error: 'ИИ вернул пустой ответ' });
        }
    } catch (err) {
        console.error('Ошибка перегенерации описания:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

export default router;
