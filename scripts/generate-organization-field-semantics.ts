#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';
import ts from 'typescript';
import { ORGANIZATION_SEMANTIC_COVERAGE } from '../packages/core/src/organization-coverage';

const declarations = new Map<string, Map<string, { type: string; required: boolean }>>();
for await (const path of new Bun.Glob('packages/core/src/*.ts').scan('.')) {
  const parsed = ts.createSourceFile(path, await Bun.file(path).text(), ts.ScriptTarget.Latest, true);
  for (const node of parsed.statements) if (ts.isInterfaceDeclaration(node)) {
    declarations.set(node.name.text, new Map(node.members.flatMap((member) => {
      if (ts.isMethodSignature(member) && member.name && member.type) {
        const name = member.name.getText(parsed).replace(/^['"]|['"]$/g, '');
        const parameters = member.parameters.map((parameter) => parameter.getText(parsed)).join(', ');
        return [[name, { type: `(${parameters}) => ${member.type.getText(parsed)}`, required: !member.questionToken }]];
      }
      if (!ts.isPropertySignature(member) || !member.name || !member.type) return [];
      const name = member.name.getText(parsed).replace(/^['"]|['"]$/g, '');
      return [[name, { type: member.type.getText(parsed).replace(/\s+/g, ' '), required: !member.questionToken }]];
    })));
  }
}
const targetSort: Record<string, string> = {
  'BehaviorDecl.inputs': 'types', 'BehaviorDecl.outputs': 'types', 'BehaviorDecl.tools': 'tools', 'BehaviorDecl.memories': 'memories', 'BehaviorDecl.behaviors': 'behaviors',
  'ActorDecl.behaviors': 'behaviors', 'ActorDecl.memberOf': 'units', 'ActorDecl.reportsTo': 'actors|units', 'ActorDecl.constraints': 'policies',
  'CapabilityGrant.capability': 'capabilities', 'CapabilityGrant.budget': 'budgets', 'ActivationDecl.protocol': 'protocols', 'ActivationDecl.workType': 'workTypes',
  'UnitDecl.parent': 'units', 'UnitDecl.members': 'actors|units', 'UnitDecl.goals': 'goals', 'UnitDecl.policies': 'policies', 'UnitDecl.decisionRules': 'decisions',
  'RelationDecl.from': 'actors|units', 'RelationDecl.to': 'actors|units', 'RelationDecl.protocol': 'protocols', 'RelationDecl.constraints': 'policies',
  'GoalDecl.parent': 'goals', 'GoalDecl.owner': 'actors|units', 'GoalDecl.constraints': 'policies', 'MeasureDecl.type': 'types',
  'WorkTypeDecl.requiredCapabilities': 'capabilities', 'TransitionDecl.authority': 'capabilities', 'AssignmentPolicy.candidates': 'actors|units',
  'VerificationPolicy.verifier': 'actors|units', 'ContextPolicy.compaction': 'behaviors', 'WorkItemDecl.type': 'workTypes', 'WorkItemDecl.goal': 'goals',
  'WorkItemDecl.parent': 'initialWork', 'WorkItemDecl.dependencies': 'initialWork', 'WorkItemDecl.accountable': 'actors|units', 'WorkItemDecl.assignees': 'actors|units',
  'BudgetDecl.parent': 'budgets', 'DecisionRuleDecl.participants': 'actors|units',
};
const normalizedEmpty = new Set([
  'OrganizationIR.imports', 'OrganizationIR.types', 'OrganizationIR.behaviors', 'OrganizationIR.tools', 'OrganizationIR.memories',
  'OrganizationIR.capabilities', 'OrganizationIR.units', 'OrganizationIR.relations', 'OrganizationIR.goals', 'OrganizationIR.workTypes',
  'OrganizationIR.initialWork', 'OrganizationIR.protocols', 'OrganizationIR.policies', 'OrganizationIR.budgets', 'OrganizationIR.decisions', 'OrganizationIR.artifacts',
  'BehaviorDecl.inputs', 'BehaviorDecl.outputs', 'BehaviorDecl.tools', 'BehaviorDecl.memories', 'BehaviorDecl.behaviors',
  'ActorDecl.memberOf', 'ActorDecl.reportsTo', 'ActorDecl.capabilities', 'ActorDecl.constraints', 'ActorDecl.activation', 'ActorDecl.implementation',
  'UnitDecl.members', 'UnitDecl.goals', 'UnitDecl.policies', 'UnitDecl.decisionRules', 'RelationDecl.constraints', 'GoalDecl.measures', 'GoalDecl.constraints',
  'WorkTypeDecl.requiredCapabilities', 'TransitionDecl.authority', 'WorkItemDecl.dependencies', 'WorkItemDecl.assignees', 'ProtocolDecl.roles',
  'PolicyDecl.appliesTo', 'DecisionRuleDecl.participants',
]);
const normalizedDefaults: Record<string, string> = {
  'ImportDecl.required': '`true`',
  'InstructionAssembly.precedence': '`constitution, organization, role, task, skill, conversation, runtime`',
  'InstructionAssembly.conflict': '`reject`',
  'InstructionFragment.priority': '`0`',
  'InstructionFragment.layer': 'derived from `role`',
  'WorkItemDecl.initialState': 'work type lifecycle `initial`',
};
const rows = ORGANIZATION_SEMANTIC_COVERAGE.flatMap((entry) => entry.fields.map((field) => {
  const key = `${entry.interface}.${field}`;
  const declaration = declarations.get(entry.interface)?.get(field);
  const required = declaration?.required ? 'required' : 'optional';
  const fallback = normalizedDefaults[key] ?? (normalizedEmpty.has(key) ? 'empty (materialized)' : 'none');
  const order = declaration?.type.includes('[]') || declaration?.type.startsWith('Array<') ? 'ordered sequence' : 'n/a';
  const semantic = entry.interface === 'AnnotationSet' && ['documentation', 'provenance'].includes(field) ? 'nonsemantic' : 'semantic';
  return `| \`${entry.interface}\` | \`${field}\` | \`${declaration?.type ?? 'implementation artifact'}\` | ${required} | ${fallback} | ${order} | ${targetSort[key] ?? '—'} | ${semantic} | ${entry.denotation} |`;
}));
const text = `# Organization IR field semantics\n\n` +
  `Generated by \`bun scripts/generate-organization-field-semantics.ts\`; do not edit by hand. Type notation is the ` +
  `closed structural grammar for document interfaces and the typed API contract for implementation interfaces: \`T[]\` is an ordered sequence, \`Record<K,V>\` is a string-keyed map, \`?\` is represented ` +
  `by Optionality, and quoted unions enumerate their complete scalar domain. Unknown members are rejected. A target sort ` +
  `names the catalog in which each referenced identifier resolves.\n\n` +
  `| Interface | Field | Structural type | Optionality | Normalized default | Cardinality/order | Reference target sort | Digest status | Denotation |\n` +
  `|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
writeFileSync('docs/ORGANIZATION-IR-FIELD-SEMANTICS.md', text);
