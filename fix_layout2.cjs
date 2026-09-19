const fs = require('fs');
const files = [
  'src/pages/register.astro',
  'src/pages/login.astro',
  'src/pages/forgot-password.astro',
  'src/pages/update-password.astro'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Replace the flexbox styles with grid styles in #app-scroll-container
  const regex = /#app-scroll-container\s*\{[^}]+\}/;
  const replacement = `#app-scroll-container {
      min-height: 100vh !important;
      height: auto !important;
      width: 100% !important;
      display: grid !important;
      place-items: center !important;
      padding: clamp(2rem, 5vh, 4rem) 1.25rem !important;
      box-sizing: border-box !important;
    }`;
  
  content = content.replace(regex, replacement);

  // Fix auth-wrap margin
  content = content.replace(/margin: auto !important;/g, 'margin: 0 auto !important;');

  fs.writeFileSync(f, content, 'utf8');
});
