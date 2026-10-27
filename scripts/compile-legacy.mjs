// Compile the maintained Staff Tags source without adding bundler dependencies
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const modules = {
    '@vendetta/metro': 'vendetta.metro',
    '@vendetta/metro/common': 'vendetta.metro.common',
    '@vendetta/patcher': 'vendetta.patcher',
    '@vendetta/plugin': 'vendetta.plugin',
    '@vendetta/storage': 'vendetta.storage',
    '@vendetta/utils': 'vendetta.utils',
};
const source = readFileSync(process.argv[2], 'utf8').replace(
    /import\s*\{([^}]+)\}\s*from\s*"([^"]+)";/g,
    (_, names, specifier) => {
        if (!modules[specifier]) throw new Error(`Unsupported legacy import: ${specifier}`);
        return `const {${names}} = ${modules[specifier]};`;
    },
).replace('export default', 'const legacyPlugin =');
const code = stripTypeScriptTypes(source, { mode: 'strip' });
process.stdout.write(`(function (vendetta) {\n${code}\nreturn {default: legacyPlugin};\n})(vendetta)`);
