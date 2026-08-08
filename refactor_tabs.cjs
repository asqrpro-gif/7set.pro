const fs = require('fs');

const content = fs.readFileSync('views/admin_seo_detector.ejs', 'utf-8');
const lines = content.split('\n');

// Update parameters logic at the top
let newTop = [];
let i = 0;
while (i < 87) {
    let line = lines[i];
    
    // Replace table3 params logic
    if (line.includes('tabsQueryParams += table3Params;')) {
        newTop.push("    // Параметры 4-й таблицы");
        newTop.push("    let table4Params = '';");
        newTop.push("    if (typeof descPublishStatus !== 'undefined' && descPublishStatus) table4Params += '&desc_publish_status=' + descPublishStatus;");
        newTop.push("    if (typeof descSort !== 'undefined' && descSort !== 'card') table4Params += '&desc_sort=' + descSort;");
        newTop.push("    if (typeof descOrder !== 'undefined' && descOrder !== 'asc') table4Params += '&desc_order=' + descOrder;");
        newTop.push("");
        newTop.push("    tabsQueryParams += table3Params + table4Params;");
    } else if (line.includes('publishTabsQueryParams += table3Params;')) {
        newTop.push("    publishTabsQueryParams += table3Params + table4Params;");
    } else if (line.includes('baseQueryParams += table3Params;')) {
        newTop.push("    baseQueryParams += table3Params + table4Params;");
    } else if (line.includes('table1Params += table3Params;')) {
        newTop.push("    table1Params += table3Params + table4Params;");
    } else if (line.includes('table2PublishParams += table3Params;')) {
        newTop.push("    table2PublishParams += table3Params + table4Params;");
    } else if (line.includes('let table3PublishParams = table1Params;')) {
        newTop.push(line);
    } else if (line.includes('if (typeof linkPublishStatus !== \\\'undefined\\\' && linkPublishStatus) table3PublishParams += \\\'&link_publish_status=\\\' + linkPublishStatus;')) {
        newTop.push(line);
        newTop.push("    let table4PublishParams = table3PublishParams;");
    } else if (line.includes('return `/admin/seo-detector?mode=seo&title_sort=${field}&title_order=${order}${table3PublishParams}#problematic-titles`;')) {
        newTop.push("        return `/admin/seo-detector?mode=seo&title_sort=${field}&title_order=${order}${table3PublishParams}#tab-titles`;");
        newTop.push("    }");
        newTop.push("");
        newTop.push("    // Функция для генерации ссылок сортировки 4-й таблицы");
        newTop.push("    function getDescSortLink(field) {");
        newTop.push("        let order = 'asc';");
        newTop.push("        if (typeof descSort !== 'undefined' && descSort === field && typeof descOrder !== 'undefined' && descOrder === 'asc') {");
        newTop.push("            order = 'desc';");
        newTop.push("        }");
        newTop.push("        return `/admin/seo-detector?mode=seo&desc_sort=${field}&desc_order=${order}${table4PublishParams}#tab-descriptions`;");
    } else {
        newTop.push(line);
    }
    i++;
}

const qualityChunk = lines.slice(87, 330).join('\n');
const linksChunk = lines.slice(331, 471).join('\n');
const titlesChunk = lines.slice(472, 558).join('\n');

function wrapTab(id, chunk) {
    let newChunk = chunk.replace(/<details.*?>\s*<summary[\s\S]*?<\/summary>/m, `<div id="${id}" class="tab-content bg-slate-800 rounded-xl border border-slate-700 shadow-sm hidden">`);
    newChunk = newChunk.replace(/<\/details>/, '</div>');
    return newChunk;
}

const tabQuality = wrapTab('tab-quality', qualityChunk);
const tabTitles = wrapTab('tab-titles', titlesChunk)
    .replace(/#problematic-titles/g, '#tab-titles');
const tabLinks = wrapTab('tab-links', linksChunk);

let tabDescriptions = wrapTab('tab-descriptions', titlesChunk)
    .replace(/problematicTitles/g, 'problematicDescriptions')
    .replace(/titlePublishStatus/g, 'descPublishStatus')
    .replace(/titlePublishStats/g, 'descPublishStats')
    .replace(/table3PublishParams/g, 'table4PublishParams')
    .replace(/titleSort/g, 'descSort')
    .replace(/titleOrder/g, 'descOrder')
    .replace(/getTitleSortLink/g, 'getDescSortLink')
    .replace(/btn-rewrite-/g, 'btn-rewrite-desc-')
    .replace(/title-text-/g, 'desc-text-')
    .replace(/rewriteSeoTitle/g, 'rewriteSeoDescription')
    .replace(/#problematic-titles/g, '#tab-descriptions')
    .replace(/Текущий заголовок \(seoTitle\)/g, 'Текущее описание (seoDescription)')
    .replace(/Проблемных заголовков не найдено/g, 'Проблемных описаний не найдено')
    .replace(/seoTitle/g, 'seoDescription');

const tabsHtml = `
<!-- Tab Navigation -->
<div class="flex gap-2 overflow-x-auto mb-4 border-b border-slate-700 pb-2">
    <button onclick="switchTab('tab-quality')" id="btn-tab-quality" class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm transition-colors text-slate-400 hover:text-white hover:bg-slate-700/50 flex items-center gap-2 whitespace-nowrap">
        <i data-lucide="list-checks" class="w-4 h-4"></i>
        Качество карточек
    </button>
    <button onclick="switchTab('tab-titles')" id="btn-tab-titles" class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm transition-colors text-slate-400 hover:text-white hover:bg-slate-700/50 flex items-center gap-2 whitespace-nowrap">
        <i data-lucide="text-cursor-input" class="w-4 h-4"></i>
        SEO-заголовки
    </button>
    <button onclick="switchTab('tab-descriptions')" id="btn-tab-descriptions" class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm transition-colors text-slate-400 hover:text-white hover:bg-slate-700/50 flex items-center gap-2 whitespace-nowrap">
        <i data-lucide="file-text" class="w-4 h-4"></i>
        SEO-описания
    </button>
    <button onclick="switchTab('tab-links')" id="btn-tab-links" class="tab-btn px-4 py-2 rounded-t-lg font-medium text-sm transition-colors text-slate-400 hover:text-white hover:bg-slate-700/50 flex items-center gap-2 whitespace-nowrap">
        <i data-lucide="link-2-off" class="w-4 h-4"></i>
        Проблемные ссылки
    </button>
</div>

<script>
    function switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => {
            el.classList.remove('text-blue-400', 'border-b-2', 'border-blue-400', 'bg-slate-800/50');
            el.classList.add('text-slate-400');
        });
        
        const activeTab = document.getElementById(tabId);
        const activeBtn = document.getElementById('btn-' + tabId);
        
        if (activeTab) activeTab.classList.remove('hidden');
        if (activeBtn) {
            activeBtn.classList.remove('text-slate-400');
            activeBtn.classList.add('text-blue-400', 'border-b-2', 'border-blue-400', 'bg-slate-800/50');
        }
        
        window.location.hash = tabId;
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        const hash = window.location.hash.substring(1) || 'tab-quality';
        switchTab(hash);
    });
</script>

${tabQuality}
${tabTitles}
${tabDescriptions}
${tabLinks}
`;

// Also inject the rewriteSeoDescription function at the bottom script
let suffixChunk = lines.slice(558).join('\n');
const rewriteFunction = `
async function rewriteSeoDescription(id) {
    const btn = document.getElementById('btn-rewrite-desc-' + id);
    const titleSpan = document.getElementById('desc-text-' + id);
    
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Думает...';
    btn.disabled = true;
    if(typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const res = await fetch('/admin/api/rewrite-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        
        if (data.success) {
            titleSpan.textContent = data.newDesc;
            titleSpan.classList.add('text-green-400');
            btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-green-400"></i> Готово';
            setTimeout(() => {
                titleSpan.classList.remove('text-green-400');
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                if(typeof lucide !== 'undefined') lucide.createIcons();
            }, 3000);
        } else {
            alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    } catch (e) {
        alert('Сетевая ошибка');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
}
`;

suffixChunk = suffixChunk.replace('async function rewriteSeoTitle(id) {', rewriteFunction + '\n\nasync function rewriteSeoTitle(id) {');

const finalHtml = newTop.join('\n') + '\n' + tabsHtml + '\n' + suffixChunk;
fs.writeFileSync('views/admin_seo_detector.ejs', finalHtml);
console.log('Refactoring complete!');
