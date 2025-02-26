import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  ClassDeclaration,
  Project,
  Scope,
  SourceFile,
  ScriptTarget,
  ModuleKind,
  VariableDeclarationKind,
  SyntaxKind,
  ArrowFunction,
  CodeBlockWriter
} from 'ts-morph';
import { _temporary_filename } from './shared.ts';

export interface IBaseChaincodeAST {
  source: SourceFile;
  class: ClassDeclaration;
  instance: ArrowFunction;
  input_handler: ArrowFunction;
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
export function writeASTToFile(ast: SourceFile, path?: string, emit = false) {
  formatAST(ast);

  if (path) {
    ast.move(path, { overwrite: true });
  }

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

  source.addImportDeclaration({
    namedImports: ['destr'],
    moduleSpecifier: 'destr'
  });

  const classNode = source.addClass({
    name: className,
    extends: 'Contract',
    isExported: false
  });

  classNode.addProperty({
    name: '_logic_per_instance',
    scope: Scope.Private,
    initializer: 'new Map<string, (msg: unknown) => unknown>()'
  });

  classNode.addProperty({
    name: '_cleanups',
    initializer: 'new Set<(removed?: true, done?: () => void) => void>()',
    scope: Scope.Private
  });

  classNode.addProperty({
    name: 'dispose',
    scope: Scope.Public,
    initializer: (writer) => {
      writer.writeLine('() =>');
      writer.block(() => {
        writer.writeLine('for (const cleanup of this._cleanups)');
        writer.block(() => {
          writer.writeLine('cleanup(true, () => {});');
        });
      });
    }
  });

  const init_instance = classNode.addMethod({
    name: 'initInstance',
    scope: Scope.Public,
    isAsync: true,
    parameters: [
      {
        name: 'ctx',
        type: 'Context'
      },
      {
        name: 'raw_config'
      },
      {
        name: 'instance_id'
      }
    ],
    statements: (writer) => {
      writer.writeLine('const config = destr(raw_config);');
      writer.writeLine(`await ctx.stub.putState('instance_init', Buffer.from(JSON.stringify({ config, instance_id })));`);
      writer.blankLine();
      writer.writeLine('((config) =>');
      writer.block(() => {
        writer.writeLine('this._logic_per_instance.set(instance_id, (msg) =>');
        writer.block();
        writer.write(');');
      });
      writer.write(')(config);');
    }
  });

  // The AST node of the IIFE
  const instance = init_instance.getStatements()
    .find((s) => {
      if (s.getKind() === SyntaxKind.ExpressionStatement) {
        const expressionStmt = s.asKind(SyntaxKind.ExpressionStatement);
        const expression = expressionStmt?.getExpression();

        return expression?.getKind() === SyntaxKind.CallExpression
          && expression.asKind(SyntaxKind.CallExpression)?.getExpression().getKind() === SyntaxKind.ParenthesizedExpression
          && s.getText().includes('((config) =>')
          && s.getText().includes(')(config)');
      }
      return false;
    })!.asKindOrThrow(SyntaxKind.ExpressionStatement)
    .getExpression()
    .asKindOrThrow(SyntaxKind.CallExpression)
    .getExpression()
    .asKindOrThrow(SyntaxKind.ParenthesizedExpression)
    .getExpression()
    .asKindOrThrow(SyntaxKind.ArrowFunction);
  // The AST node of the input handler logic
  const input_handler = instance.getDescendants()
    .find((node) => {
      return node.getKind() === SyntaxKind.ArrowFunction
        && node.getText().includes('(msg) =>')
        && node.getParentIfKind(SyntaxKind.CallExpression)?.getText().includes('this._logic_per_instance.set');
    })!.asKindOrThrow(SyntaxKind.ArrowFunction);

  classNode.addMethod({
    name: 'runInstance',
    scope: Scope.Public,
    isAsync: true,
    parameters: [
      {
        name: 'ctx',
        type: 'Context'
      },
      {
        name: 'raw_msg'
      },
      {
        name: 'instance_id'
      }
    ],
    statements: (writer) => {
      writer.writeLine('const msg = destr(raw_msg);');
      writer.writeLine('const result = this._logic_per_instance.get(instance_id)(msg);');
      writer.writeLine(`const new_state = { msg, result, instance_id };`);
      writer.writeLine(`await ctx.stub.putState('result', Buffer.from(JSON.stringify(new_state)));`);
      writer.writeLine('return result;');
    }
  });

  /**
   * TODO: Finish querying implementation
   */
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
      writer.writeLine(`const resultAsBytes = await ctx.stub.getState('result');`);
      writer.writeLine(`if (!resultAsBytes || resultAsBytes.length === 0)`);
      writer.block(() => {
        writer.writeLine(`throw new Error('Result does not exist');`);
      });
      writer.writeLine(`return destr(resultAsBytes.toString());`);
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
    instance,
    input_handler
  };
}

/**
 * Given the AST of the node, write the AST of the logic that connects it with the blockchain
 */
export function getNodeStatementsWriters() {
  const writeFetchCatchBlock = (writer: CodeBlockWriter) => {
    writer.write('catch (e)');
    writer.block(() => {
      writer.writeLine('this.error(e);');
    });
  };
  const start = (writer: CodeBlockWriter) => {
    writer.write('async () =>');
    writer.block(() => {
      writer.write('try');
      writer.block(() => {
        writer.writeLine('const ops = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) };');
        writer.writeLine('await fetch(`${LEDGER_URL}/chaincode/up/${PACKAGE_NAME}/${NODE_NAME}/${INSTANCE_ID}`, ops);');
      });
      writeFetchCatchBlock(writer);
    });
  };
  const input_handler = (writer: CodeBlockWriter) => {
    writer.write('this.on("input", (msg) =>');
    writer.block(() => {
      writer.writeLine('const ops = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg) };');
      writer.writeLine('promise_queue = promise_queue.then(async () =>');
      writer.block(() => {
        writer.write('try');
        writer.block(() => {
          writer.writeLine('const response = await fetch(`${LEDGER_URL}/chaincode/transaction/${PACKAGE_NAME}/${NODE_NAME}/${INSTANCE_ID}`, ops);');
          writer.writeLine('this.send(await response.json());');
        });
        writeFetchCatchBlock(writer);
      });
      writer.write(');');
    });
    writer.write(');');
  };

  return {
    start,
    input_handler
  };
}

/**
 * Reads the contents of a text file
 */
export function readTextFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Converts a file into an AST
 */
export function nodeToAST(path: string, ...project_arguments: Parameters<typeof getProject>): SourceFile {
  const project = getProject(...project_arguments);
  const source = project.createSourceFile(_temporary_filename, readTextFile(path).toString());
  formatAST(source);

  return source;
}

/**
 * Installs the passed dependencies in the passed packages
 * @param - Path to the package.json files where the packages needs to be installed
 */
export function installPackages(pack: string[], cwd: string) {
  /**
   * --package-lock-only ensures only the lockfile and package.json are updated, skipping the download
   * of the installed dependencies.
   */
  spawnSync('npm', ['install', '--package-lock-only', '--no-package-lock', '--ignore-scripts', ...pack], {
    stdio: 'ignore',
    cwd
  });
}
