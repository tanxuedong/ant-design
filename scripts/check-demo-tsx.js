const path = require('path');
const glob = require('glob');
const fs = require('fs-extra');
const ts = require('typescript');
const chalk = require('chalk');

const demoFiles = glob.sync(path.join(process.cwd(), 'components/**/demo/*.md'));

const tmpFile = path.resolve('~tmp.tsx');

function getTypescriptDemo(content) {
  const lines = content.split(/[\n\r]/);

  const tsxStartLine = lines.findIndex(line =>
    line.replace(/\s/g).toLowerCase().includes('```tsx'),
  );

  if (tsxStartLine < 0) {
    return null;
  }

  const tsxEndLine = lines.findIndex(
    (line, index) => index > tsxStartLine && line.trim() === '```',
  );

  let script = lines.slice(tsxStartLine + 1, tsxEndLine).join('\n');

  // insert React & ReactDOM
  script = `import ReactDOM from 'react-dom';\n${script}`;
  if (!script.includes('import React') && !script.includes('import * as React')) {
    script = `import React from 'react';\n${script}`;
  }

  // Replace mountNode
  script = script.replace('mountNode', `document.getElementById('#root')`);

  // Replace antd
  script = script.replace(`from 'antd'`, `from './components'`);

  return script;
}

(async () => {
  for (let i = 0; i < demoFiles.length; i += 1) {
    const demoPath = demoFiles[i];

    const content = await fs.readFile(demoPath, 'utf8');
    const script = getTypescriptDemo(content);

    // Parse TSX
    if (script) {
      await fs.writeFile(tmpFile, script, 'utf8');

      const program = ts.createProgram([tmpFile], {
        noEmitOnError: true,
        noImplicitAny: true,
        strictNullChecks: true,
        skipLibCheck: true,
        esModuleInterop: true,
        jsx: 'preserve',
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
      });
      const emitResult = program.emit();

      const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

      allDiagnostics.forEach(diagnostic => {
        if (diagnostic.file) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
            diagnostic.start,
          );
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
          console.log(`\n\n${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
          // } else {
          //   console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
      });

      const exitCode = emitResult.emitSkipped ? 1 : 0;

      if (exitCode) {
        console.log(chalk.red('Parse failed!'));
        process.exit(exitCode);
      }
    }
  }
})();