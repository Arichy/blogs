const fs = require('fs');
const path = require('path');

const githubUsername = 'arichy';
const repoName = 'blogs';
const branchName = 'main';

const startMarker = '<!-- START -->';
const endMarker = '<!-- END -->';

let fixedContent = '';
const readmeTemplatePath = path.join(__dirname, '../README_TEMPLATE.md');

if (fs.existsSync(readmeTemplatePath)) {
  const readmeTemplateContent = fs.readFileSync(readmeTemplatePath, 'utf-8');

  const startIndex = readmeTemplateContent.indexOf(startMarker);
  const endIndex = readmeTemplateContent.indexOf(endMarker) + endMarker.length;
  if (startIndex !== -1 && endIndex !== -1) {
    fixedContent = readmeTemplateContent.substring(0, startIndex);
  } else {
    fixedContent = '# My blogs\n\n<!-- START -->\ngenerated table\n<!-- END -->\n';
  }
} else {
  fixedContent = '# My blogs\n\n<!-- START -->\ngenerated table\n<!-- END -->\n';
}

let tableContent = '';
tableContent += '\n| Link | 链接 |\n';
tableContent += '| ---- | ---- |\n';

const docsDir = path.join(__dirname, '../docs');

function getGithubRelativePathByFilePath(fileRelativePath) {
  return `https://github.com/${githubUsername}/${repoName}/blob/${branchName}/${encodeURIComponent(fileRelativePath)}`;
}

const map = {};
function traverseDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(filename => {
    if (/^\d/.test(filename)) {
      return;
    }
    const filepath = path.join(dir, filename);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      traverseDir(filepath);
    } else if (stat.isFile() && path.extname(filename) === '.md' && !filename.startsWith('.')) {
      // . means WIP
      // handle .md files
      const relativePath = path.relative(process.cwd(), filepath);
      const pathParts = relativePath.split(path.sep);

      let articleName = '';
      let enTitle = '';
      let zhTitle = '';

      if (pathParts.includes('en') || pathParts.includes('zh')) {
        // under en or zh directory
        const langIndex = pathParts.findIndex(part => part === 'en' || part === 'zh');
        const lang = pathParts[langIndex];
        articleName = pathParts[langIndex - 1];
        const title = path.basename(filename, '.md');
        if (lang === 'en') {
          enTitle = title;
        } else {
          zhTitle = title;
        }
      } else {
        // under other directories
        articleName = pathParts[pathParts.length - 2];
        enTitle = path.basename(filename, '.md');
      }

      if (!map[articleName]) {
        map[articleName] = {
          en: 'N/A',
          zh: 'N/A',
        };
      }

      const githubLink = getGithubRelativePathByFilePath(relativePath);

      if (zhTitle) {
        map[articleName].zh = `[${zhTitle}](${githubLink})`;
      } else {
        map[articleName].en = `[${enTitle}](${githubLink})`;
      }
    }
  });
}
traverseDir(docsDir);

tableContent += Object.entries(map).reduce((acc, cur) => {
  return acc + `| ${cur[1].en} | ${cur[1].zh} |\n`;
}, '');

const newReadmeContent = `${fixedContent}\n${tableContent}`;

const readmePath = path.join(__dirname, '../README.md');
fs.writeFileSync(readmePath, newReadmeContent);

console.log('README.md updated.');
