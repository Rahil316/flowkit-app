import type { FlowStoryDef, InteractionRule } from '@flowkit/types/index'
import type { PageResolver } from '@flowkit-features/flowStory/compileFlowStory'
import { compileFlowStory, FlowStoryCompileError } from '@flowkit-features/flowStory/compileFlowStory'
import { describe, expect, it } from 'vitest'
// (InteractionRule used in the `on`-wiring test below)

// A fake screen component (compiler only needs identity + label).
const C = () => null

// Resolver that accepts any pageId and echoes a label.
const resolveAny: PageResolver = id => ({ id, label: `${id} label`, component: C })

function emptyRegistry(): Map<string, FlowStoryDef> {
  return new Map()
}

/** Helper: resolve a compiled step's advance target (string or fork-fn result). */
function goToFor(
  config: ReturnType<typeof compileFlowStory>,
  compiledScreenId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Record<string, any> = {}
): string {
  const step = config.__flowStory.steps.find(s => s.pageId === compiledScreenId)
  if (!step) throw new Error(`no compiled step for ${compiledScreenId}`)
  const goTo = step.next!
  return typeof goTo === 'function' ? goTo({ db, flowState: {} }) : (goTo as string)
}

describe('compileFlowStory', () => {
  it('8. maps steps to ordered screens[] with resolver labels', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a' }, { pageId: 'b' }, { pageId: 'c' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.pages.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(cfg.pages[0].label).toBe('a label')
    expect(cfg.initialPage).toBe('a')
    expect(cfg.__flowStory.steps.map(s => s.pageId)).toEqual(['a', 'b', 'c'])
  })

  it('9. sequential transitions advance to the next screen; last completes', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a' }, { pageId: 'b' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(goToFor(cfg, 'a')).toBe('b')
    expect(goToFor(cfg, 'b')).toBe('__complete__')
  })

  it('9b. step.on keys the advance interaction on the named element id', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'cart', on: 'checkout' }, { pageId: 'pay' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    // The interaction is keyed on the REAL element id, not a synthetic one.
    expect(cfg.interactions).toBeDefined()
    const rule = cfg.interactions!['checkout'] as InteractionRule
    expect(rule).toBeDefined()
    expect(rule.goTo).toBe('pay')
    // No synthetic __advance__ keys leak into interactions.
    expect(Object.keys(cfg.interactions!).some(k => k.startsWith('__advance__'))).toBe(false)
    // The compiled step records its `on` + resolved next for FlowMaster/gating.
    const cartStep = cfg.__flowStory.steps.find(s => s.pageId === 'cart')!
    expect(cartStep.on).toBe('checkout')
    expect(cartStep.next).toBe('pay')
  })

  it('9c. all-tap-anywhere flow leaves interactions undefined (sequential fallback)', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a' }, { pageId: 'b' }], // no `on`
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.interactions).toBeUndefined()
    // …but the resolved next targets are still on the steps for FlowMaster.
    expect(goToFor(cfg, 'a')).toBe('b')
  })

  it('carries step db patch + notes into __flowStory.steps', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a', actionNote: 'tap go', db: { 'local.x': 1 }, annotation: 'note' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    const step = cfg.__flowStory.steps[0]
    expect(step.actionNote).toBe('tap go')
    expect(step.db).toEqual({ 'local.x': 1 })
    expect(step.annotation).toBe('note')
  })

  it('10. terminal fork: branch entry chosen by db, branch end completes', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'cart',
          forks: [{ label: 'empty', db: { 'cart.count': 0 }, steps: [{ pageId: 'cart-empty' }] }],
        },
        { pageId: 'pay' },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    // db matches the fork → go to branch entry
    expect(goToFor(cfg, 'cart', { cart: { count: 0 } })).toBe('cart-empty')
    // db does NOT match → fall through to sequential next
    expect(goToFor(cfg, 'cart', { cart: { count: 2 } })).toBe('pay')
    // terminal branch's last step completes the flow
    expect(goToFor(cfg, 'cart-empty')).toBe('__complete__')
    // the branch screen exists in screens[]
    expect(cfg.pages.map(s => s.id)).toContain('cart-empty')
  })

  it("11. mergesTo:'next' rejoins the parent at the step after the fork", () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'pay',
          forks: [
            {
              label: 'fail',
              db: { 'pay.failed': true },
              mergesTo: 'next',
              steps: [{ pageId: 'pay-error' }],
            },
          ],
        },
        { pageId: 'confirm' },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    // fork matches → branch entry
    expect(goToFor(cfg, 'pay', { pay: { failed: true } })).toBe('pay-error')
    // branch's last step merges to parent's next step (confirm), NOT complete
    expect(goToFor(cfg, 'pay-error')).toBe('confirm')
    // no match → sequential
    expect(goToFor(cfg, 'pay', {})).toBe('confirm')
  })

  it('12. recursive fork (fork inside a fork branch) inlines correctly', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'root',
          forks: [
            {
              label: 'outer',
              db: { o: true },
              steps: [
                {
                  pageId: 'mid',
                  forks: [{ label: 'inner', db: { i: true }, steps: [{ pageId: 'leaf' }] }],
                },
              ],
            },
          ],
        },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.pages.map(s => s.id)).toEqual(expect.arrayContaining(['root', 'mid', 'leaf']))
    expect(goToFor(cfg, 'root', { o: true })).toBe('mid')
    expect(goToFor(cfg, 'mid', { i: true })).toBe('leaf')
    expect(goToFor(cfg, 'leaf')).toBe('__complete__') // terminal
  })

  it('13. flowStory-ref inlines referenced steps with namespaced screen ids', () => {
    const checkout: FlowStoryDef = {
      id: 'checkout',
      name: 'Checkout',
      steps: [{ pageId: 'cart' }, { pageId: 'pay' }],
    }
    const registry = new Map([['checkout', checkout]])
    const plan: FlowStoryDef = {
      id: 'quick',
      name: 'Quick',
      steps: [{ pageId: 'home' }, { ref: 'checkout' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, registry)
    expect(cfg.pages.map(s => s.id)).toEqual(['home', 'checkout::cart', 'checkout::pay'])
    // home advances into the ref's first (namespaced) screen
    expect(goToFor(cfg, 'home')).toBe('checkout::cart')
    expect(goToFor(cfg, 'checkout::cart')).toBe('checkout::pay')
    expect(goToFor(cfg, 'checkout::pay')).toBe('__complete__')
  })

  it("13b. ref'd steps preserve `on`; interaction keys on the element id, targets namespaced", () => {
    const checkout: FlowStoryDef = {
      id: 'checkout',
      name: 'Checkout',
      steps: [{ pageId: 'cart', on: 'checkout-btn' }, { pageId: 'pay' }],
    }
    const registry = new Map([['checkout', checkout]])
    const plan: FlowStoryDef = {
      id: 'quick',
      name: 'Quick',
      steps: [{ pageId: 'home', on: 'reorder' }, { ref: 'checkout' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, registry)
    // `on` element ids are NOT namespaced (they're DOM ids), but their goTo
    // targets ARE the namespaced compiled screen ids.
    const homeRule = cfg.interactions!['reorder'] as InteractionRule
    expect(homeRule.goTo).toBe('checkout::cart')
    const cartRule = cfg.interactions!['checkout-btn'] as InteractionRule
    expect(cartRule.goTo).toBe('checkout::pay')
    // The compiled step records the source `on`.
    const cartStep = cfg.__flowStory.steps.find(s => s.pageId === 'checkout::cart')!
    expect(cartStep.on).toBe('checkout-btn')
  })

  it('14. circular ref throws a named error (no infinite loop)', () => {
    const a: FlowStoryDef = { id: 'a', name: 'A', steps: [{ ref: 'b' }] }
    const b: FlowStoryDef = { id: 'b', name: 'B', steps: [{ ref: 'a' }] }
    const registry = new Map([
      ['a', a],
      ['b', b],
    ])
    expect(() => compileFlowStory(a, resolveAny, registry)).toThrowError(
      /circular flowStory reference/
    )
  })

  it('15. missing ref throws a clear error', () => {
    const plan: FlowStoryDef = { id: 'p', name: 'P', steps: [{ ref: 'ghost' }] }
    expect(() => compileFlowStory(plan, resolveAny, emptyRegistry())).toThrowError(
      /flowStory not found: "ghost"/
    )
  })

  it('16. single-step plan compiles to a valid FlowConfig', () => {
    const plan: FlowStoryDef = { id: 'p', name: 'P', steps: [{ pageId: 'only' }] }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.pages).toHaveLength(1)
    expect(cfg.initialPage).toBe('only')
    expect(goToFor(cfg, 'only')).toBe('__complete__')
  })

  it('throws on missing screen with a clear error', () => {
    const plan: FlowStoryDef = { id: 'p', name: 'P', steps: [{ pageId: 'nope' }] }
    const resolveNone: PageResolver = () => undefined
    expect(() => compileFlowStory(plan, resolveNone, emptyRegistry())).toThrowError(
      FlowStoryCompileError
    )
  })

  it('empty plan throws', () => {
    const plan: FlowStoryDef = { id: 'p', name: 'P', steps: [] }
    expect(() => compileFlowStory(plan, resolveAny, emptyRegistry())).toThrowError(/has no steps/)
  })

  it('CP1. fork with db.key === 0 (falsy number) still matches', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'root',
          forks: [{ label: 'zero', db: { key: 0 }, steps: [{ pageId: 'branch' }] }],
        },
        { pageId: 'fallback' },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(goToFor(cfg, 'root', { key: 0 })).toBe('branch')
    expect(goToFor(cfg, 'root', { key: 1 })).toBe('fallback')
  })

  it('CP2. fork with db.key === false (falsy bool) still matches', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'root',
          forks: [{ label: 'falsy', db: { enabled: false }, steps: [{ pageId: 'branch' }] }],
        },
        { pageId: 'fallback' },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(goToFor(cfg, 'root', { enabled: false })).toBe('branch')
    expect(goToFor(cfg, 'root', { enabled: true })).toBe('fallback')
  })

  it('CP3. unconditional fork (no db) always matches; first unconditional wins when multiple forks', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'root',
          forks: [
            { label: 'unconditional', steps: [{ pageId: 'first' }] },
            { label: 'conditional', db: { x: 1 }, steps: [{ pageId: 'second' }] },
          ],
        },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    // Unconditional fork is first — wins regardless of db
    expect(goToFor(cfg, 'root', {})).toBe('first')
    expect(goToFor(cfg, 'root', { x: 1 })).toBe('first')
  })

  it('CP4. ref chain A → B → C inlines all steps with correct double-namespace', () => {
    const c: FlowStoryDef = {
      id: 'c',
      name: 'C',
      steps: [{ pageId: 'screen' }],
    }
    const b: FlowStoryDef = {
      id: 'b',
      name: 'B',
      steps: [{ ref: 'c' }],
    }
    const registry = new Map([
      ['b', b],
      ['c', c],
    ])
    const plan: FlowStoryDef = {
      id: 'a',
      name: 'A',
      steps: [{ pageId: 'a-screen' }, { ref: 'b' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, registry)
    expect(cfg.initialPage).toBe('a-screen')
    expect(cfg.pages.map(s => s.id)).toContain('b::c::screen')
    expect(goToFor(cfg, 'a-screen')).toBe('b::c::screen')
    expect(goToFor(cfg, 'b::c::screen')).toBe('__complete__')
  })

  it("CP5. ref'd plan inside a fork branch — namespace applied correctly", () => {
    const inner: FlowStoryDef = {
      id: 'inner',
      name: 'Inner',
      steps: [{ pageId: 'detail' }],
    }
    const registry = new Map([['inner', inner]])
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'root',
          forks: [{ label: 'branch', db: { go: true }, steps: [{ ref: 'inner' }] }],
        },
        { pageId: 'end' },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, registry)
    expect(goToFor(cfg, 'root', { go: true })).toBe('inner::detail')
    expect(cfg.pages.map(s => s.id)).toContain('inner::detail')
  })

  it('CP6. plan.simulator.controls propagated to cfg.__flowStory.simulatorControls', () => {
    const controls = [
      { id: 'ctrl1', label: 'Network', type: 'toggle' as const },
      { id: 'ctrl2', label: 'Latency', type: 'select' as const, options: ['fast', 'slow'] },
    ]
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a' }],
      simulator: { controls },
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.__flowStory.simulatorControls).toEqual(controls)
  })

  it('CP7. missing plan.simulator → simulatorControls defaults to []', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a' }],
      // no simulator field
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.__flowStory.simulatorControls).toEqual([])
  })

  it('CP9. fork db with dot-path key matches nested db value via get()', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [
        {
          pageId: 'root',
          forks: [
            {
              label: 'pro',
              db: { 'user.plan': 'pro' },
              steps: [{ pageId: 'pro-screen' }],
            },
          ],
        },
        { pageId: 'fallback' },
      ],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(goToFor(cfg, 'root', { user: { plan: 'pro' } })).toBe('pro-screen')
    expect(goToFor(cfg, 'root', { user: { plan: 'free' } })).toBe('fallback')
    expect(goToFor(cfg, 'root', {})).toBe('fallback')
  })

  it('CP10. decisionNote is carried into __flowStory.steps', () => {
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ pageId: 'a', decisionNote: 'choose path here' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, emptyRegistry())
    expect(cfg.__flowStory.steps[0].decisionNote).toBe('choose path here')
  })

  it("CP8. sourcePageId on ref'd steps is the pre-namespace original id", () => {
    const ref: FlowStoryDef = {
      id: 'ref',
      name: 'Ref',
      steps: [{ pageId: 'screen' }],
    }
    const registry = new Map([['ref', ref]])
    const plan: FlowStoryDef = {
      id: 'p',
      name: 'P',
      steps: [{ ref: 'ref' }],
    }
    const cfg = compileFlowStory(plan, resolveAny, registry)
    const step = cfg.__flowStory.steps.find(s => s.pageId === 'ref::screen')!
    expect(step).toBeDefined()
    expect(step.sourcePageId).toBe('screen')
  })
})
