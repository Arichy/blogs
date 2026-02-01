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
tableContent += '\n| Link(English) | 链接(简体中文) |\n';
tableContent += '| ---- | ---- |\n';

const docsDir = path.join(__dirname, '../docs');

function getGithubRelativePathByFilePath(fileRelativePath) {
  return `https://github.com/${githubUsername}/${repoName}/blob/${branchName}/${encodeURIComponent(fileRelativePath)}`;
}

const map = {};
function traverseDir(dir) {
  // Check for config.json first
  const configPath = path.join(dir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      if (config.wip) {
        return;
      }

      const relativePath = path.relative(process.cwd(), dir);
      const pathParts = relativePath.split(path.sep);
      const articleName = pathParts[pathParts.length - 1]; // Use current directory name

      if (config.type === 'series') {
        if (!map[articleName]) {
          map[articleName] = {
            en: 'N/A',
            zh: 'N/A',
          };
        }

        // For series, the link points to the directory
        const githubLink = `https://github.com/${githubUsername}/${repoName}/tree/${branchName}/${encodeURIComponent(relativePath)}`;

        if (config.title) {
          if (config.title.en) {
            map[articleName].en = `[${config.title.en}](${githubLink})`;
          }
          if (config.title.zh) {
            map[articleName].zh = `[${config.title.zh}](${githubLink})`;
          }
        }

        // Stop recursion for this directory
        return;
      } else {
        // Handle single article (default)
        // Need to find the markdown files to link to.
        let enLink = null;
        let zhLink = null;

        const findMdFile = searchDir => {
          if (!fs.existsSync(searchDir)) return null;
          const files = fs.readdirSync(searchDir);
          const mdFile = files.find(f => path.extname(f) === '.md');
          if (mdFile) return path.join(searchDir, mdFile);
          return null;
        };

        // Search strategy:
        // 1. Check for 'en' or 'zh' subdirectories
        // 2. Check root of directory

        const enDir = path.join(dir, 'en');
        const zhDir = path.join(dir, 'zh');

        const enFile = findMdFile(enDir);
        const zhFile = findMdFile(zhDir);

        // Fallback: check root if no specific lang dir found, or if we need to fill gaps?
        // Usually if explicit 'article' type is used, we expect standard structure or we just look for *any* md file?
        // Let's stick to en/zh folders first as that matches the repo pattern.

        if (enFile) {
          const rel = path.relative(process.cwd(), enFile);
          enLink = getGithubRelativePathByFilePath(rel);
        }
        if (zhFile) {
          const rel = path.relative(process.cwd(), zhFile);
          zhLink = getGithubRelativePathByFilePath(rel);
        }

        // If no language specific folder, maybe flat structure?
        if (!enFile && !zhFile) {
          const rootMd = findMdFile(dir);
          if (rootMd) {
            // Assume it's English if not specified? Or use for both if valid?
            // Let's assume it assigns to English mainly, or maybe both if we don't know.
            // Given the repo, usually it's en/zh.
            const rel = path.relative(process.cwd(), rootMd);
            const link = getGithubRelativePathByFilePath(rel);
            // If only one file exists, link it to the configured titles.
            if (config.title.en) enLink = link;
            if (config.title.zh) zhLink = link;
          }
        }

        if (!map[articleName]) {
          map[articleName] = { en: 'N/A', zh: 'N/A' };
        }

        if (config.title) {
          if (config.title.en && enLink) {
            map[articleName].en = `[${config.title.en}](${enLink})`;
          }
          if (config.title.zh && zhLink) {
            map[articleName].zh = `[${config.title.zh}](${zhLink})`;
          }
        }
        return;
      }
    } catch (err) {
      console.error(`Error reading config.json in ${dir}:`, err);
    }
  }

  const files = fs.readdirSync(dir);
  files.forEach(filename => {
    if (/^\d/.test(filename)) {
      return;
    }
    const filepath = path.join(dir, filename);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      traverseDir(filepath);
    } else if (stat.isFile() && path.extname(filename) === '.md') {
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

tableContent += Object.entries(map)
  .sort((a, b) => {
    if (a[1].en < b[1].en) {
      return -1;
    }
    if (a[1].en > b[1].en) {
      return 1;
    }
    return 0;
  })
  .reduce((acc, cur) => {
    return acc + `| ${cur[1].en} | ${cur[1].zh} |\n`;
  }, '');

const newReadmeContent = `${fixedContent}\n${tableContent}`;

const readmePath = path.join(__dirname, '../README.md');
fs.writeFileSync(readmePath, newReadmeContent);

console.log('README.md updated.');
