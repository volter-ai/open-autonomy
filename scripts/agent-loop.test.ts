import { describe, expect, test } from 'bun:test';
import { runAgent, type ModelTurn, type Tool } from './agent-loop.js';

const readTool = (log: string[]): Tool => ({
  name: 'read_file',
  description: 'read a file',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  async run(args) {
    log.push(String(args.path));
    return `contents of ${args.path}`;
  },
});

const schema = { type: 'object', properties: { decision: { type: 'string' }, reason: { type: 'string' } }, required: ['decision', 'reason'] };

describe('agent loop', () => {
  test('reasons with a tool then submits a schema-valid artifact', async () => {
    const reads: string[] = [];
    // turn 1: read a file; turn 2: submit a valid decision.
    const turns: ReturnType<ModelTurn>[] = [
      Promise.resolve({ content: 'let me look', toolCalls: [{ id: 'a', name: 'read_file', args: { path: 'src/x.ts' } }] }),
      Promise.resolve({ content: 'done', toolCalls: [{ id: 'b', name: 'submit', args: { decision: 'develop', reason: 'clear scope' } }] }),
    ];
    let i = 0;
    const turn: ModelTurn = () => turns[i++];

    const { artifact, transcript } = await runAgent<{ decision: string; reason: string }>({
      system: 'you are a triager',
      goal: 'triage issue 1',
      tools: [readTool(reads)],
      schema,
      turn,
    });

    expect(artifact.decision).toBe('develop');
    expect(reads).toEqual(['src/x.ts']); // the tool actually ran
    expect(transcript).toHaveLength(2); // followable: one entry per turn
    expect(transcript[0].calls[0].name).toBe('read_file');
  });

  test('rejects an invalid submission and lets the model retry', async () => {
    const turns: ReturnType<ModelTurn>[] = [
      Promise.resolve({ content: '', toolCalls: [{ id: 'a', name: 'submit', args: { decision: 'develop' } }] }), // missing reason
      Promise.resolve({ content: '', toolCalls: [{ id: 'b', name: 'submit', args: { decision: 'develop', reason: 'ok' } }] }),
    ];
    let i = 0;
    const { artifact } = await runAgent({ system: 's', goal: 'g', tools: [], schema, turn: () => turns[i++] });
    expect((artifact as { reason: string }).reason).toBe('ok');
  });

  test('salvages a schema-valid result written as ```json text instead of a submit call', async () => {
    // Smaller models often print the answer rather than calling the tool — don't lose a correct answer.
    const turn: ModelTurn = () =>
      Promise.resolve({ content: '```json\n{"decision":"develop","reason":"clear"}\n```', toolCalls: [] });
    const { artifact } = await runAgent<{ decision: string }>({ system: 's', goal: 'g', tools: [], schema, turn, maxIterations: 3 });
    expect(artifact.decision).toBe('develop');
  });

  test('throws if the agent never submits within the iteration budget', async () => {
    const turn: ModelTurn = () => Promise.resolve({ content: 'thinking', toolCalls: [] });
    await expect(runAgent({ system: 's', goal: 'g', tools: [], schema, turn, maxIterations: 3 })).rejects.toThrow(/did not submit/);
  });
});
