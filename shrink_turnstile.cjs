const fs = require('fs');
const files = [
  'src/pages/register.astro',
  'src/pages/login.astro'
];

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let content = fs.readFileSync(f, 'utf8');

  content = content.replace(/margin: 1rem 0 0\.5rem;/g, 'margin: 0.5rem 0 0.5rem;');

  fs.writeFileSync(f, content, 'utf8');
});
