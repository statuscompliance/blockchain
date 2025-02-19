import {
  ClassDeclaration,
  MethodDeclaration,
  Project,
  Scope,
  SourceFile,
  ScriptTarget,
  ModuleKind,
  VariableDeclarationKind
} from 'ts-morph';
import { readFileSync, writeFileSync } from 'node:fs';
import { _temporary_filename } from './shared.ts';

export interface IBaseChaincodeAST {
  source: SourceFile;
  class: ClassDeclaration;
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
// eslint-disable-next-line unicorn/prefer-module
export function getProject({ useMemory = true, module = ModuleKind.Preserve } = {}) {
  return new Project({
    compilerOptions: {
      target: ScriptTarget.ESNext,
      module: module
    },
    useInMemoryFileSystem: useMemory
  });
}

/**
 * Writes the resulting AST to a file
 */
export function writeASTToFile(ast: SourceFile, path: string, emit = false) {
  formatAST(ast);
  ast.move(path, { overwrite: true });
  ast.saveSync();

  if (emit) {
    ast.emitSync();
  }
}

/**
 * Factory function for getting default AST for class
 * Generated using TypeScript AST Viewer
 */
export function getBaseChaincodeAST(className = 'Chaincode'): IBaseChaincodeAST {
  const project = getProject({ useMemory: false });
  const source = project.createSourceFile(
    _temporary_filename
  );

  source.addImportDeclaration({
    namedImports: ['Contract', {
      name: 'Context',
      isTypeOnly: true
    }],
    moduleSpecifier: 'fabric-contract-api'
  });

  const classNode = source.addClass({
    name: className,
    extends: 'Contract',
    isExported: false
  });

  classNode.addProperty({
    name: '_msg',
    scope: Scope.Private,
    initializer: '{}'
  });

  classNode.addProperty({
    name: '_config',
    scope: Scope.Private,
    initializer: '{}'
  });

  classNode.addProperty({
    name: '_cleanups',
    initializer: 'new Set<(removed?: true, done?: () => void) => void>()',
    scope: Scope.Private
  });

  classNode.addProperty({
    name: '_result',
    scope: Scope.Private
  });

  const body = classNode.addMethod({
    name: '_internalLogic',
    scope: Scope.Private,
    parameters: [{
      name: 'msg'
    }, {
      name: 'config',
      initializer: 'this._config'
    }]
  });

  classNode.addProperty({
    name: '_run',
    scope: Scope.Private,
    initializer: (writer) => {
      writer.write('() =>');
      writer.block(() => {
        writer.write('this._result = this._internalLogic(this._msg, this._config);');
      });
    }
  });

  classNode.addProperty({
    name: 'dispose',
    scope: Scope.Public,
    initializer: (writer) => {
      writer.write('() =>');
      writer.block(() => {
        writer.write('for (const cleanup of this._cleanups)');
        writer.block(() => {
          writer.write('cleanup(true, () => {});');
        });
      });
    }
  });

  classNode.addMethod({
    name: 'setArgsAndRun',
    scope: Scope.Public,
    isAsync: true,
    parameters: [
      {
        name: 'ctx',
        type: 'Context'
      },
      {
        name: 'msg'
      },
      {
        name: 'config'
      }
    ],
    statements: (writer) => {
      writer.write('this._msg = JSON.parse(msg);');
      writer.write('this._config = JSON.parse(config);');
      writer.newLine();
      writer.write('this._run();');
      writer.newLine();
      writer.write(`await ctx.stub.putState('result', Buffer.from(JSON.stringify(this._result)));`);
    }
  });

  classNode.addMethod({
    name: 'getResult',
    isAsync: true,
    parameters: [
      {
        name: 'ctx',
        type: 'Context'
      }
    ],
    statements: (writer) => {
    //
      writer.write(`const resultAsBytes = await ctx.stub.getState('result');`);
      writer.write(`if (!resultAsBytes || resultAsBytes.length === 0)`);
      writer.newLine();
      writer.block(() => {
        writer.write(`throw new Error('Result does not exist');`);
      });
      writer.write(`return JSON.parse(resultAsBytes.toString());`);
    }
  });

  source.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [{
      name: 'contracts',
      initializer: '[Chaincode]'
    }]
  });

  formatAST(source);

  return {
    source,
    class: classNode,
    body
  };
}

/**
 * Converts a file into an AST
 */
export function nodeToAST(path: string, ...project_arguments: Parameters<typeof getProject>): SourceFile {
  const project = getProject(...project_arguments);
  const source = project.createSourceFile(_temporary_filename, readFileSync(path).toString());
  formatAST(source);

  return source;
}

/**
 * Reads the contents of an HTML file
 */
export function readHTMLFile(htmlPath: string): string {
  return readFileSync(htmlPath, 'utf8');
}

/**
 * Writes the modified script tags into the HTML file
 */
export function writeModifiedHTML({ originalContents, originalScript, newScript, htmlPath }: {
  originalContents: string;
  originalScript: string;
  newScript: string;
  htmlPath: string;
}) {
  writeFileSync(htmlPath, originalContents.replace(originalScript, newScript));
}
