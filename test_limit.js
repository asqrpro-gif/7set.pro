fetch('http://localhost:3005/admin/seo-detector?limit=50').then(r=>r.text()).then(t=>console.log(t.split('<tr class=\"hover:bg-slate-700/30\"').length - 1)).catch(console.error);
