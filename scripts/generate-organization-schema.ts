#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';
import ts from 'typescript';

const input = Bun.argv[2] ?? 'packages/core/src/organization-ir.ts';
const rootType = Bun.argv[3] ?? 'OrganizationIR';
const output = Bun.argv[4] ?? 'packages/core/src/generated/organization-ir-v2.schema.json';
const named = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
const constants = new Map<string, string | number | boolean>();
for (const path of input.split(',')) {
  const source = ts.createSourceFile(path, await Bun.file(path).text(), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) named.set(node.name.text, node);
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
      if (ts.isStringLiteral(initializer) || ts.isNumericLiteral(initializer)) constants.set(declaration.name.text, initializer.text);
      else if (initializer.kind === ts.SyntaxKind.TrueKeyword) constants.set(declaration.name.text, true);
      else if (initializer.kind === ts.SyntaxKind.FalseKeyword) constants.set(declaration.name.text, false);
    }
  }
}

type Schema = Record<string, unknown>;
const definitions: Record<string, Schema> = {};

function textOf(node: ts.Node): string { return node.getText(node.getSourceFile()); }

function propertyName(node: ts.PropertyName): string {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  throw new Error(`unsupported property name: ${textOf(node)}`);
}

function objectMembers(members: ts.NodeArray<ts.TypeElement>, inherited: string[] = []): Schema {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  for (const base of inherited) {
    const declaration = named.get(base);
    if (!declaration || !ts.isInterfaceDeclaration(declaration)) throw new Error(`unknown interface base ${base}`);
    const baseSchema = interfaceSchema(declaration);
    Object.assign(properties, baseSchema.properties as Record<string, Schema>);
    required.push(...((baseSchema.required as string[] | undefined) ?? []));
  }
  for (const member of members) {
    if (ts.isPropertySignature(member) && member.name && member.type) {
      const name = propertyName(member.name);
      properties[name] = typeSchema(member.type);
      if (!member.questionToken) required.push(name);
    } else if (!ts.isIndexSignatureDeclaration(member) && !ts.isMethodSignature(member)) {
      throw new Error(`unsupported member: ${textOf(member)}`);
    }
  }
  return { type: 'object', properties, ...(required.length ? { required: [...new Set(required)] } : {}), additionalProperties: false };
}

function interfaceSchema(node: ts.InterfaceDeclaration): Schema {
  const inherited = (node.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => textOf(type.expression)));
  return objectMembers(node.members, inherited);
}

function typeSchema(node: ts.TypeNode): Schema {
  if (ts.isTypeQueryNode(node)) {
    const value = constants.get(textOf(node.exprName));
    if (value === undefined) throw new Error(`unknown type query ${textOf(node.exprName)}`);
    return { const: value };
  }
  if (ts.isParenthesizedTypeNode(node)) return typeSchema(node.type);
  if (ts.isTypeOperatorNode(node)) return node.operator === ts.SyntaxKind.UniqueKeyword ? {} : typeSchema(node.type);
  if (ts.isLiteralTypeNode(node)) {
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' };
    if (ts.isStringLiteral(node.literal)) return { const: node.literal.text };
    if (ts.isNumericLiteral(node.literal)) return { const: Number(node.literal.text) };
    if (node.literal.kind === ts.SyntaxKind.TrueKeyword) return { const: true };
    if (node.literal.kind === ts.SyntaxKind.FalseKeyword) return { const: false };
  }
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: typeSchema(node.elementType) };
  if (ts.isUnionTypeNode(node)) return { anyOf: node.types.map(typeSchema) };
  if (ts.isIntersectionTypeNode(node)) return { allOf: node.types.map(typeSchema) };
  if (ts.isTypeLiteralNode(node)) return objectMembers(node.members);
  if (ts.isTupleTypeNode(node)) return { type: 'array', prefixItems: node.elements.map(typeSchema), minItems: node.elements.length, maxItems: node.elements.length };
  if (ts.isTemplateLiteralTypeNode(node)) return { type: 'string' };
  if (ts.isTypeReferenceNode(node)) {
    const name = textOf(node.typeName);
    const args = node.typeArguments ?? [];
    if (name === 'Array' || name === 'ReadonlyArray') return { type: 'array', items: typeSchema(args[0]!) };
    if (name === 'Record') return { type: 'object', additionalProperties: typeSchema(args[1]!) };
    if (name === 'Partial') {
      const partial = typeSchema(args[0]!);
      if (partial.type === 'object') delete partial.required;
      return partial;
    }
    if (name === 'Omit' || name === 'Pick') {
      const baseName = ts.isTypeReferenceNode(args[0]!) ? textOf(args[0]!.typeName) : undefined;
      const declaration = baseName ? named.get(baseName) : undefined;
      if (!declaration || !ts.isInterfaceDeclaration(declaration)) throw new Error(`${name} requires a named interface`);
      const keyNodes = ts.isUnionTypeNode(args[1]!) ? args[1]!.types : [args[1]!];
      const keys = new Set(keyNodes.flatMap((key) => ts.isLiteralTypeNode(key) && ts.isStringLiteral(key.literal) ? [key.literal.text] : []));
      const synthetic = `${name}_${baseName}_${[...keys].sort().join('_')}`;
      if (Object.hasOwn(definitions, synthetic)) return { $ref: `#/$defs/${synthetic}` };
      definitions[synthetic] = {};
      const base = interfaceSchema(declaration);
      const properties = base.properties as Record<string, Schema>;
      for (const key of Object.keys(properties)) if ((name === 'Omit' && keys.has(key)) || (name === 'Pick' && !keys.has(key))) delete properties[key];
      if (base.required) base.required = (base.required as string[]).filter((key) => key in properties);
      definitions[synthetic] = base;
      return { $ref: `#/$defs/${synthetic}` };
    }
    if (name === 'Uint8Array') return { type: 'array', items: { type: 'integer', minimum: 0, maximum: 255 } };
    ensureDefinition(name);
    if (!named.has(name)) throw new Error(`unknown referenced type ${name}`);
    return { $ref: `#/$defs/${name}` };
  }
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword: return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword: return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword: return { type: 'boolean' };
    case ts.SyntaxKind.NullKeyword: return { type: 'null' };
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.AnyKeyword: return {};
    case ts.SyntaxKind.ObjectKeyword: return { type: 'object' };
  }
  throw new Error(`unsupported type syntax: ${textOf(node)}`);
}

function ensureDefinition(name: string): void {
  if (Object.hasOwn(definitions, name)) return;
  const declaration = named.get(name);
  if (!declaration) return;
  definitions[name] = {};
  definitions[name] = ts.isInterfaceDeclaration(declaration) ? interfaceSchema(declaration) : typeSchema(declaration.type);
  applyKnownConstraints(name, definitions[name]);
}

function applyKnownConstraints(name: string, schema: Schema): void {
  if (name === 'PackageDigest') Object.assign(schema, { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' });
  const properties = schema.properties as Record<string, Schema> | undefined;
  if (!properties) return;
  const semver = '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$';
  if (['OrganizationPackageManifest', 'PackageDependency', 'PackageLockEntry', 'RegistryVersionRecord'].includes(name) && properties.version)
    properties.version.pattern = semver;
  if (['OrganizationPackageManifest', 'PackageDependency', 'PackageLockEntry', 'RegistryVersionRecord'].includes(name) && properties.name)
    properties.name.pattern = '^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/(?!.*//)[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$';
  if (name === 'PackageFileRecord') {
    Object.assign(properties.path!, { pattern: '^(?!/)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*\\\\)(?!.*//).+$' });
    Object.assign(properties.bytes!, { type: 'integer', minimum: 0 });
  }
  if (name === 'OrganizationPackageManifest') Object.assign(properties.files!, { minItems: 1 });
  if (name === 'RegistrySnapshot') Object.assign(properties.sequence!, { type: 'integer', minimum: 0 });
}
ensureDefinition(rootType);
if (!definitions[rootType]) throw new Error(`unknown root type ${rootType}`);
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: rootType === 'OrganizationIR' ? 'https://open-autonomy.dev/schema/autonomy.organization.v2.json' : `https://open-autonomy.dev/schema/${rootType}.json`,
  title: `Open Autonomy ${rootType}`,
  $ref: `#/$defs/${rootType}`,
  $defs: definitions,
};
writeFileSync(output, `${JSON.stringify(schema, null, 2)}\n`);
