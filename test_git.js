const { execSync } = require('child_process');
try {
    const gitHash = execSync('git log -1 --format="%h (%cd)" --date=short', { encoding: 'utf-8' }).trim();
    const gitMsg = execSync('git log -1 --format="%s"', { encoding: 'utf-8' }).trim();
    console.log(`${gitHash} - ${gitMsg}`);
} catch (e) {
    console.error('git error:', e.message);
}
