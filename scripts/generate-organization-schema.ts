#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';
import ts from 'typescript';

const input = 'packages/core/src/organization-ir.ts';
const output = 'packages/core/src/generated/organization-ir-v2.schema.json';
const source = ts.createSourceFile(input, await Bun.file(input).text(), ts.ScriptTarget.Latest, true);
const named = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
for (const node of source.statements) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) named.set(node.name.text, node);
}

type Schema = Record<string, unknown>;

function propertyName(node: ts.PropertyName): string {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  throw new Error(`unsupported property name: ${node.getText(source)}`);
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
    } else if (!ts.isIndexSignatureDeclaration(member)) {
      throw new Error(`unsupported member: ${member.getText(source)}`);
    }
  }
  return { type: 'object', properties, ...(required.length ? { required: [...new Set(required)] } : {}), additionalProperties: false };
}

function interfaceSchema(node: ts.InterfaceDeclaration): Schema {
  const inherited = (node.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => type.expression.getText(source)));
  return objectMembers(node.members, inherited);
}

function typeSchema(node: ts.TypeNode): Schema {
  if (ts.isParenthesizedTypeNode(node)) return typeSchema(node.type);
  if (ts.isLiteralTypeNode(node)) {
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' };
    if (ts.isStringLiteral(node.literal) || ts.isNumericLiteral(node.literal)) return { const: node.literal.text };
    if (node.literal.kind === ts.SyntaxKind.TrueKeyword) return { const: true };
    if (node.literal.kind === ts.SyntaxKind.FalseKeyword) return { const: false };
  }
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: typeSchema(node.elementType) };
  if (ts.isUnionTypeNode(node)) return { anyOf: node.types.map(typeSchema) };
  if (ts.isIntersectionTypeNode(node)) return { allOf: node.types.map(typeSchema) };
  if (ts.isTypeLiteralNode(node)) return objectMembers(node.members);
  if (ts.isTupleTypeNode(node)) return { type: 'array', prefixItems: node.elements.map(typeSchema), minItems: node.elements.length, maxItems: node.elements.length };
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source);
    const args = node.typeArguments ?? [];
    if (name === 'Array' || name === 'ReadonlyArray') return { type: 'array', items: typeSchema(args[0]!) };
    if (name === 'Record') return { type: 'object', additionalProperties: typeSchema(args[1]!) };
    if (name === 'Partial') {
      const partial = typeSchema(args[0]!);
      if (partial.type === 'object') delete partial.required;
      return partial;
    }
    if (name === 'Omit' || name === 'Pick') throw new Error(`${name} is not supported in the normative grammar generator`);
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
  throw new Error(`unsupported type syntax: ${node.getText(source)}`);
}

const definitions: Record<string, Schema> = {};
for (const [name, declaration] of named) {
  definitions[name] = ts.isInterfaceDeclaration(declaration) ? interfaceSchema(declaration) : typeSchema(declaration.type);
}
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://open-autonomy.dev/schema/autonomy.organization.v2.json',
  title: 'Open Autonomy Organization IR v2',
  $ref: '#/$defs/OrganizationIR',
  $defs: definitions,
};
writeFileSync(output, `${JSON.stringify(schema, null, 2)}\n`);
