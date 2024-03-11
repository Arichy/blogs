const fs = require('fs');
const path = require('path');

const baseUrl = 'https://github.com/Arichy/blogs/blob/main/';

const files = process.argv.slice(2);

function getGithubPathByRelPath(filePath, relPath) {
  const dirPath = path.dirname(filePath);
  const imgAbsPath = path.resolve(dirPath, relPath);
  const imgGithubRelativePath = path.relative(process.cwd(), imgAbsPath);
  const githubPath = `${baseUrl}${imgGithubRelativePath}?raw=true`;

  return githubPath;
}

function handle(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // split by code blocks
  const splitByCodeBlocks = content.split(/(```[\s\S]*?```|`[\s\S]*?`)/);

  // handle non-code text
  const processedContent = splitByCodeBlocks
    .map((section, index) => {
      if (index % 2 === 0) {
        return section
          .replace(/!\[.*?\]\((?!http)(.*?)\)/g, (match, p1) => {
            const githubPath = getGithubPathByRelPath(filePath, p1);
            return `${match.slice(0, match.lastIndexOf('(') + 1)}${githubPath})`;
          })
          .replace(/<img [^>]*src="(?!http)([^"]+)"[^>]*>/g, (match, p1) => {
            const githubPath = getGithubPathByRelPath(filePath, p1);
            return match.replace(p1, `${githubPath}`);
          });
      } else {
        return section;
      }
    })
    .join('');

  fs.writeFileSync(filePath, processedContent, 'utf8');
}

files.forEach(handle);

console.log(`${files.length} file(s) processed.`);
