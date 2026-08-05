const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'views/admin_seo_ops.ejs');
let content = fs.readFileSync(file, 'utf8');

const correctEnd = `    async function restoreSelected() {
        const checkboxes = document.querySelectorAll('.card-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.value);
        
        if (!confirm(\`Вернуть \${ids.length} карточек из мусора (они пропадут из этого списка)?\`)) return;

        document.getElementById('restoreBtn').disabled = true;
        document.getElementById('restoreBtn').innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Восстановление...';
        lucide.createIcons();

        try {
            const res = await fetch('/admin/api/seo-ops/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (res.ok) window.location.reload();
            else alert('Ошибка восстановления');
        } catch (e) {
            alert('Сетевая ошибка');
        }
    }
</script>
</div>
<% } else if (typeof mode !== 'undefined' && mode === 'links') { 
    const tab = (typeof tab !== 'undefined') ? tab : 'orphans';
%>
    <div class="bg-slate-800 rounded-xl border border-slate-700 shadow-sm flex flex-col h-[calc(100vh-142px)]">
        <div class="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center shrink-0">
            <h2 class="font-semibold text-white flex items-center gap-2 text-sm md:text-base">
                <i data-lucide="activity" class="w-4 h-4 md:w-5 md:h-5 text-blue-400"></i>
                Радар Перелинковки
            </h2>
            <div class="flex items-center gap-4">
                <div class="text-xs text-slate-400 hidden md:block">
                    Последний скан: <%= linksStats.lastScan || 'Никогда' %>
                </div>
                <button onclick="startLinksScan(this)" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-1.5 px-3 rounded flex items-center gap-2 transition-colors shadow-sm">
                    <i data-lucide="play" class="w-3.5 h-3.5"></i>
                    <span class="hidden md:inline">Запустить скан</span>
                    <span class="md:hidden">Скан</span>
                </button>
            </div>
        </div>

        <!-- Вкладки -->
        <div class="flex gap-2 p-3 border-b border-slate-700 bg-slate-800/50 shrink-0">
            <a href="?mode=links&tab=orphans" class="px-4 py-2 text-sm font-medium rounded-lg transition-colors <%= tab === 'orphans' ? 'bg-orange-500/20 text-orange-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white' %> flex items-center gap-2">
                <i data-lucide="unlink" class="w-4 h-4"></i>
                Страницы-сироты (<%= orphans.length %>)
            </a>
            <a href="?mode=links&tab=broken" class="px-4 py-2 text-sm font-medium rounded-lg transition-colors <%= tab === 'broken' ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:bg-slate-700 hover:text-white' %> flex items-center gap-2">
                <i data-lucide="link-2-off" class="w-4 h-4"></i>
                Битые ссылки (<%= brokenLinks.length %>)
            </a>
        </div>`;

const searchFor = `    async function restoreSelected() {`;
let parts = content.split(searchFor);

// Take part 0 and append correctEnd + the rest of the file which is orphans logic
// Actually I need to restore the full file because EJS is totally mangled now.
`;
