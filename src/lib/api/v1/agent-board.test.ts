import { describe, expect, it } from 'vitest';

import {
  parseAgentStage,
  pickRoundRobin,
  slugForStageName,
  AgentError,
} from './agent-board';

describe('parseAgentStage', () => {
  it('accepts the four slugs and their column names', () => {
    expect(parseAgentStage('qualificacao')).toBe('qualificacao');
    expect(parseAgentStage('Qualificação')).toBe('qualificacao');
    expect(parseAgentStage('oportunidade')).toBe('oportunidade');
    expect(parseAgentStage('Levantamento de oportunidades')).toBe('oportunidade');
    expect(parseAgentStage('transferida')).toBe('transferida');
    expect(parseAgentStage('Transferido')).toBe('transferida');
    expect(parseAgentStage('resolvida')).toBe('resolvida');
    expect(parseAgentStage('Resolvido')).toBe('resolvida');
  });

  it('rejects an unknown column', () => {
    expect(() => parseAgentStage('fechamento')).toThrow(AgentError);
    expect(() => parseAgentStage(null)).toThrow(AgentError);
  });
});

describe('slugForStageName', () => {
  it('folds an existing column back to the agent slug', () => {
    expect(slugForStageName('Qualificação')).toBe('qualificacao');
    expect(slugForStageName('Levantamento de oportunidades')).toBe('oportunidade');
    expect(slugForStageName('Prospecção')).toBe('prospeccao');
  });
});

describe('pickRoundRobin', () => {
  const members = [
    { userId: 'b', profileId: 'pb' },
    { userId: 'a', profileId: 'pa' },
    { userId: 'c', profileId: 'pc' },
  ];

  it('picks whoever has the fewest open conversations', () => {
    const counts = new Map([
      ['a', 3],
      ['b', 1],
      ['c', 2],
    ]);
    expect(pickRoundRobin(members, counts)?.userId).toBe('b');
  });

  it('breaks a tie by user id', () => {
    const counts = new Map([
      ['a', 1],
      ['b', 1],
      ['c', 4],
    ]);
    expect(pickRoundRobin(members, counts)?.userId).toBe('a');
  });

  it('returns null for an empty pool', () => {
    expect(pickRoundRobin([], new Map())).toBeNull();
  });
});
