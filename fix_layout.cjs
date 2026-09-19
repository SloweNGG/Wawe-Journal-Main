const fs = require('fs');
const files = [
  'src/pages/forgot-password.astro',
  'src/pages/login.astro',
  'src/pages/update-password.astro'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Fix html, body
  content = content.replace(/html, body \{\s+width: 100%;\s+height: 100%;/g, 'html, body {\n      width: 100%;\n      min-height: 100vh;');
  // Also handle cases where width is not there
  content = content.replace(/html, body \{\s+height: 100%;/g, 'html, body {\n      width: 100%;\n      min-height: 100vh;');

  // Fix #app-scroll-container
  content = content.replace(/height: 100% !important;/g, 'height: auto !important;');
  
  // Update padding for consistency
  content = content.replace(/padding: clamp\(1\.5rem, 4vh, 3rem\) 1\.25rem !important;/g, 'padding: clamp(2rem, 5vh, 4rem) 1.25rem !important;');

  fs.writeFileSync(f, content, 'utf8');
});
