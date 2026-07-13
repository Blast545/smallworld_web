import { describe, expect, it } from 'vitest';
import { createInitialState, getMap } from '../../engine/setup';
import { MAPS, mapForPlayerCount } from '../../engine/maps';
import { ALL_MARKERS } from '../../engine/data';
import { config, fresh } from './helpers';

describe('setup', () => {
  const TURNS: Record<number, number> = { 2: 10, 3: 10, 4: 9, 5: 8 };

  for (const pc of [2, 3, 4, 5]) {
    it(`creates a valid initial state for ${pc} players`, () => {
      const s = createInitialState(config(pc, 42), 42);
      const map = mapForPlayerCount(pc);
      expect(s.mapId).toBe(map.id);
      expect(s.maxTurns).toBe(TURNS[pc]);
      expect(s.turn).toBe(1);
      expect(s.activePlayer).toBe(0);
      expect(s.phase).toBe('pickCombo');

      // 6 visible combos: 5 column + stack top.
      expect(s.column.filter((c) => c !== null)).toHaveLength(5);
      expect(s.bannerStack.length).toBe(10);
      expect(s.badgeStack.length).toBe(16);
      for (const slot of s.column) expect(slot?.power).toBeTruthy();

      // Monster regions hold exactly 2 monsters; deck sized to match.
      const monsterRegions = map.regions.filter((r) => r.monsterSymbol);
      for (const mr of monsterRegions) {
        expect(s.regions[mr.id]?.monsters).toBe(2);
      }
      expect(monsterRegions.length * 2).toBeLessThanOrEqual(14);
      expect(s.markerDeck).toHaveLength(monsterRegions.length);
      expect(new Set(s.markerDeck).size).toBe(s.markerDeck.length);
      for (const m of s.markerDeck) expect(ALL_MARKERS).toContain(m);

      // Black mountains.
      const bmRegions = map.regions.filter((r) => r.terrain === 'blackMountain');
      expect(bmRegions.length).toBeLessThanOrEqual(9);
      for (const bm of bmRegions) expect(s.regions[bm.id]?.blackMountain).toBe(true);

      // Players start with 5 coins and nothing else.
      for (const p of s.players) {
        expect(p.coins).toBe(5);
        expect(p.active).toBeNull();
        expect(p.declined).toBeNull();
      }
    });
  }

  it('is deterministic per seed and varies across seeds', () => {
    const a = createInitialState(config(3, 123), 123);
    const b = createInitialState(config(3, 123), 123);
    const c = createInitialState(config(3, 124), 124);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.column)).not.toBe(JSON.stringify(c.column));
  });

  it('rejects invalid player counts', () => {
    expect(() => createInitialState(config(1), 1)).toThrow();
    expect(() => createInitialState(config(6), 1)).toThrow();
  });
});

describe('map integrity', () => {
  for (const map of MAPS) {
    describe(map.id, () => {
      it('has symmetric, irreflexive adjacency', () => {
        map.adjacency.forEach((ns, id) => {
          expect(ns).not.toContain(id);
          for (const n of ns) expect(map.adjacency[n]).toContain(id);
        });
      });

      it('every non-chasm region is reachable from an edge region', () => {
        const start = map.regions.find((r) => r.isEdge && r.terrain !== 'chasm');
        expect(start).toBeDefined();
        const seen = new Set<number>([(start as { id: number }).id]);
        const queue = [...seen];
        while (queue.length > 0) {
          const cur = queue.pop() as number;
          for (const n of map.adjacency[cur] as number[]) {
            if (!seen.has(n) && map.regions[n]?.terrain !== 'chasm') {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        const landCount = map.regions.filter((r) => r.terrain !== 'chasm').length;
        expect(seen.size).toBe(landCount);
      });

      it('river is connected with at least 2 board-edge ends', () => {
        const rivers = map.regions.filter((r) => r.terrain === 'river');
        expect(rivers.length).toBeGreaterThanOrEqual(2);
        expect(rivers.filter((r) => r.isEdge).length).toBeGreaterThanOrEqual(2);
        const seen = new Set<number>([(rivers[0] as { id: number }).id]);
        const queue = [...seen];
        while (queue.length > 0) {
          const cur = queue.pop() as number;
          for (const n of map.adjacency[cur] as number[]) {
            if (map.regions[n]?.terrain === 'river' && !seen.has(n)) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        expect(seen.size).toBe(rivers.length);
      });

      it('has a volcano chasm and no monsters on river/chasm', () => {
        expect(map.regions.some((r) => r.terrain === 'chasm' && r.volcanoSymbol)).toBe(true);
        for (const r of map.regions) {
          if (r.monsterSymbol) {
            expect(r.terrain).not.toBe('river');
            expect(r.terrain).not.toBe('chasm');
          }
        }
      });

      it('has every land terrain represented', () => {
        for (const t of ['mine', 'mushroom', 'crystal', 'mud', 'blackMountain', 'river']) {
          expect(map.regions.some((r) => r.terrain === t)).toBe(true);
        }
      });
    });
  }

  it('getMap resolves from state', () => {
    const s = fresh(4);
    expect(getMap(s).playerCount).toBe(4);
  });
});
