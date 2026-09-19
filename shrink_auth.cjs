const fs = require('fs');
const files = [
  'src/pages/register.astro',
  'src/pages/login.astro',
  'src/pages/forgot-password.astro',
  'src/pages/update-password.astro'
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let content = fs.readFileSync(f, 'utf8');

  content = content.replace(/padding: 2\.25rem 2rem;/g, 'padding: 1.75rem 2rem;');
  content = content.replace(/margin-bottom: 1\.5rem;/g, 'margin-bottom: 1rem;');
  content = content.replace(/margin: 1\.25rem 0;/g, 'margin: 1rem 0;');
  content = content.replace(/\.field \{ margin-bottom: 1rem; \}/g, '.field { margin-bottom: 0.75rem; }');
  content = content.replace(/padding: 0\.7rem 0\.9rem;/g, 'padding: 0.6rem 0.85rem;');
  content = content.replace(/padding: 0\.75rem 1rem;/g, 'padding: 0.65rem 1rem;');
  content = content.replace(/padding: 0\.8rem 1rem;/g, 'padding: 0.7rem 1rem;');

  fs.writeFileSync(f, content, 'utf8');
});
