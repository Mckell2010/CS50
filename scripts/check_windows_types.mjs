// Emulate case-insensitive lookup for project sources, even on a Linux runner.
// This catches .ts/.tsx module stems that collide on Windows. It is not a full Windows runtime test.
import ts from "typescript";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
import path from "node:path";
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const files = new Map(
  parsed.fileNames.map((file) => [path.resolve(file).toLowerCase(), file]),
);
const actual = (file) => files.get(path.resolve(file).toLowerCase()) || file;
const host = ts.createCompilerHost(parsed.options);
host.useCaseSensitiveFileNames = () => false;
host.getCanonicalFileName = (file) => file.toLowerCase();
host.fileExists = (file) => ts.sys.fileExists(actual(file));
host.readFile = (file) => ts.sys.readFile(actual(file));
host.getSourceFile = (file, languageVersion) => {
  const source = host.readFile(file);
  return source === undefined
    ? undefined
    : ts.createSourceFile(file, source, languageVersion);
};
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = [
  ...(config.error ? [config.error] : []),
  ...parsed.errors,
  ...ts.getPreEmitDiagnostics(program),
];
console.log(
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: host.getCanonicalFileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }),
);
if (!diagnostics.length)
  console.log("Case-insensitive TypeScript module resolution passed.");
process.exitCode = diagnostics.length ? 1 : 0;
