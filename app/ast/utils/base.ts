import {
  ArrayLiteralExpression,
  ClassDeclaration,
  MethodDeclaration,
  Project,
  Scope,
  SourceFile,
  ScriptTarget,
  ModuleKind,
  SyntaxKind
} from 'ts-morph';
import { readFileSync } from 'node:fs';

const _temporary_filename = '_TMP_';

export interface IBaseChaincodeAST {
  source: SourceFile;
  class: ClassDeclaration;
  args: ArrayLiteralExpression;
  body: MethodDeclaration;
}

/**
 * Formats the AST
 */
function formatAST(source: SourceFile) {
  source.formatText({
    ensureNewLineAtEndOfFile: true
  });
}

/**
 * Gets a new project instance
 */
function getProject(useMemory = true) {
  return new Project({
    compilerOptions: {
      target: ScriptTarget.ESNext,
      module: ModuleKind.Preserve
    },
    useInMemoryFileSystem: useMemory
  });
}

/**
 * Writes the resulting AST to a file
 */
export async function writeASTToFile(ast: IBaseChaincodeAST, path: string) {
  formatAST(ast.source);
  ast.source.move(path, { overwrite: true });
  await ast.source.save();
  await ast.source.emit();
}

/**
 * Factory function for getting default AST for class
 * Generated using TypeScript AST Viewer
 */
export function getBaseChaincodeAST(className = 'Chaincode'): IBaseChaincodeAST {
  const project = getProject(false);
  const source = project.createSourceFile(
    _temporary_filename
  );

  source.addImportDeclaration({
    namedImports: ['Contract'],
    moduleSpecifier: 'fabric-contract-api'
  });

  const classNode = source.addClass({
    name: className,
    extends: 'Contract',
    isExported: false
  });

  const arguments_ = classNode.addProperty({
    name: '_arguments',
    scope: Scope.Private,
    initializer: '[]'
  }).getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  classNode.addProperty({
    name: '_result',
    scope: Scope.Private
  });

  const body = classNode.addMethod({
    name: '_internalLogic',
    scope: Scope.Private,
    parameters: [{
      name: 'args',
      isRestParameter: true
    }]
  });

  classNode.addProperty({
    name: '_run',
    scope: Scope.Private,
    initializer: (writer) => {
      writer.write('() =>');
      writer.block(() => {
        writer.write('this._result = this._internalLogic(...this._arguments);');
      });
    }
  });

  classNode.addProperty({
    name: 'setArgsAndRun',
    scope: Scope.Public,
    initializer: (writer) => {
      writer.write('(...args) =>');
      writer.block(() => {
        writer.write('this._arguments = args;');
        writer.newLine();
        writer.write('this._run();');
      });
    }
  });

  formatAST(source);

  return {
    source,
    class: classNode,
    body,
    args: arguments_
  };
}

/**
 * Converts a file into an AST
 */
export function fileToAST(path: string) {
  const project = getProject();
  const source = project.createSourceFile(_temporary_filename, readFileSync(path).toString());
  formatAST(source);

  return source;
}
