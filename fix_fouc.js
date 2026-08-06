const fs = require('fs');
const path = require('path');
const dir = './views';

const scriptStr = `<script>
    if (localStorage.getItem('theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    }
  </script>`;

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.ejs')) {
        const fullPath = path.join(dir, file);
        let content = fs.readFileSync(fullPath, 'utf8');
        if (!content.includes("localStorage.getItem('theme')")) {
            content = content.replace(/<head>/, '<head>\n  ' + scriptStr);
            fs.writeFileSync(fullPath, content);
            console.log('Updated ' + file);
        }
    }
});
