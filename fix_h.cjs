const fs = require('fs');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  
  // Decrease 90vh to 85dvh and 98 to 95 for safer mobile sizing
  content = content.replace(/h-\[90vh\]/g, 'h-[85dvh]');
  content = content.replace(/max-h-\[90vh\]/g, 'max-h-[85dvh]');
  
  content = content.replace(/h-\[98vh\]/g, 'h-[95dvh]');
  content = content.replace(/max-h-\[98vh\]/g, 'max-h-[95dvh]');
  
  content = content.replace(/h-\[80vh\]/g, 'h-[80dvh]');
  content = content.replace(/max-h-\[80vh\]/g, 'max-h-[80dvh]');
  
  // For width to fit better
  content = content.replace(/w-\[90vw\]/g, 'w-[95vw] md:w-[90vw]');
  content = content.replace(/max-w-\[90vw\]/g, 'max-w-[95vw] md:max-w-[90vw]');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

['src/pages/TeacherDashboard.tsx', 'src/pages/StudentDashboard.tsx', 'src/pages/LearningSheets.tsx'].forEach(replaceInFile);
