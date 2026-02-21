/**
 * VizLayoutManager: Responsive collapse/expand logic for viz-options groups
 * 
 * Manages the layout of visualization option groups in a horizontal strip,
 * automatically collapsing/expanding groups based on available space and user interaction.
 * 
 * Features:
 * - Responsive layout that adapts to viewport width
 * - User-driven expansion via stub clicks
 * - Priority-based auto-expansion when space permits
 * - Smooth scrolling to focused groups
 * - Overflow affordances (edge fade indicators)
 */

export interface VizGroup {
  id: string;
  priority: number;
  expandedWidth: number;
  el: HTMLElement;
}

export interface VizLayoutManagerOptions {
  stubWidth?: number;
}

export class VizLayoutManager {
  private host: HTMLElement;
  private viewport: HTMLElement;
  private strip: HTMLElement;
  private groups: VizGroup[];
  private S: number; // stub width
  private N: number; // number of groups
  private capExpandedCount: number;
  private maxWi: number;
  private MIN_SCROLL_WIDTH: number;
  private userChosen: Set<string>;
  private lastUser: string | null;
  private ro: ResizeObserver;
  private _frozenId: string | null = null;
  private _t: number | null = null;

  constructor(
    hostEl: HTMLElement,
    viewportEl: HTMLElement,
    stripEl: HTMLElement,
    groups: VizGroup[],
    opts: VizLayoutManagerOptions = {}
  ) {
    this.host = hostEl;
    this.viewport = viewportEl;
    this.strip = stripEl;
    this.groups = groups;

    this.S = opts.stubWidth ?? 44;
    this.N = groups.length;
    this.capExpandedCount = this.N; // Allow all groups expanded when space permits

    this.maxWi = Math.max(...groups.map(g => g.expandedWidth));
    this.MIN_SCROLL_WIDTH = (this.N - 1) * this.S + this.maxWi;

    this.userChosen = new Set();
    this.lastUser = null;

    this.strip.style.minWidth = this.MIN_SCROLL_WIDTH + 'px';

    this.ro = new ResizeObserver(() => this.scheduleLayout());
    this.ro.observe(this.host);

    // Wire up stub click handlers
    for (const g of this.groups) {
      const stub = g.el.querySelector('.groupStub') as HTMLElement;
      if (stub) {
        stub.addEventListener('click', () => this.toggleChoice(g.id));
        stub.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.toggleChoice(g.id);
          }
        });
      }
    }

    this.viewport.addEventListener('scroll', () => this.updateOverflowAffordances());
    this.layout(true);
    this.updateOverflowAffordances();
  }

  scheduleLayout() {
    if (this._t !== null) clearTimeout(this._t);
    this._t = window.setTimeout(() => {
      this.layout(false);
      this.updateOverflowAffordances();
    }, 30);
  }

  availableWidth() {
    return this.host.clientWidth;
  }

  constrained() {
    return this.availableWidth() < this.MIN_SCROLL_WIDTH;
  }

  groupById(id: string): VizGroup | null {
    return this.groups.find(g => g.id === id) ?? null;
  }

  sortedByPriorityAsc(list: VizGroup[]): VizGroup[] {
    return [...list].sort((a, b) => a.priority - b.priority);
  }

  resetVisual() {
    for (const g of this.groups) {
      g.el.classList.remove('expanded', 'chosen');
    }
  }

  markChosen() {
    for (const g of this.groups) {
      if (this.userChosen.has(g.id)) g.el.classList.add('chosen');
    }
  }

  totalWidthForExpandedSet(E: Set<string>): number {
    let total = this.N * this.S;
    for (const id of E) {
      const g = this.groupById(id);
      if (g) total += (g.expandedWidth - this.S);
    }
    return total;
  }

  defaultExpandedSetResponsive(): Set<string> {
    const E = new Set<string>();
    const budget = this.availableWidth() - this.N * this.S;
    let used = 0;
    for (const g of this.sortedByPriorityAsc(this.groups)) {
      if (E.size >= this.capExpandedCount) break;
      const extra = g.expandedWidth - this.S;
      if (used + extra <= budget) {
        E.add(g.id);
        used += extra;
      }
    }
    if (E.size === 0) E.add(this.sortedByPriorityAsc(this.groups)[0].id);
    return E;
  }

  evictUntilFits(E: Set<string>, protectId: string | null = null) {
    while (E.size > this.capExpandedCount) {
      const v = this.pickEvictionCandidate(E, protectId);
      if (!v) break;
      E.delete(v.id);
      this.userChosen.delete(v.id);
      if (this.lastUser === v.id) this.lastUser = null;
    }
    while (this.totalWidthForExpandedSet(E) > this.availableWidth()) {
      const v = this.pickEvictionCandidate(E, protectId);
      if (!v) break;
      E.delete(v.id);
      this.userChosen.delete(v.id);
      if (this.lastUser === v.id) this.lastUser = null;
    }
  }

  pickEvictionCandidate(E: Set<string>, protectId: string | null): VizGroup | null {
    const candidates = [...E]
      .map(id => this.groupById(id))
      .filter((g): g is VizGroup => g !== null)
      .filter(g => g.id !== protectId);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0];
  }

  toggleChoice(id: string) {
    const already = this.userChosen.has(id);
    if (already) {
      this.userChosen.delete(id);
      if (this.lastUser === id) this.lastUser = null;
    } else {
      this.userChosen.add(id);
      this.lastUser = id;
    }
    this.layout(false);
    const target = this.groupById(this.lastUser ?? id);
    if (target) requestAnimationFrame(() => this.scrollGroupIntoView(target.el));
  }

  expandedIdConstrained(): string {
    if (this.lastUser) return this.lastUser;
    return this.sortedByPriorityAsc(this.groups)[0].id;
  }

  layout(first: boolean) {
    const isCon = this.constrained();
    this.viewport.classList.toggle('constrained', isCon);
    this.resetVisual();
    this.markChosen();

    if (isCon) {
      const id = this.expandedIdConstrained();
      const g = this.groupById(id) ?? this.sortedByPriorityAsc(this.groups)[0];
      g.el.classList.add('expanded');
      if (this._frozenId !== g.id || first) {
        this._frozenId = g.id;
        requestAnimationFrame(() => this.scrollGroupIntoView(g.el));
      }
      return;
    }

    let E = this.defaultExpandedSetResponsive();
    const orderedChosen: VizGroup[] = [];
    if (this.lastUser) {
      const lu = this.groupById(this.lastUser);
      if (lu) orderedChosen.push(lu);
    }
    for (const g of this.sortedByPriorityAsc([...this.userChosen].map(id => this.groupById(id)).filter((g): g is VizGroup => g !== null))) {
      if (!orderedChosen.find(x => x.id === g.id)) orderedChosen.push(g);
    }
    for (const cg of orderedChosen) {
      E.add(cg.id);
      this.evictUntilFits(E, this.lastUser ?? cg.id);
    }
    for (const g of this.sortedByPriorityAsc(this.groups)) {
      if (E.size >= this.capExpandedCount) break;
      if (E.has(g.id)) continue;
      const t = new Set(E);
      t.add(g.id);
      if (this.totalWidthForExpandedSet(t) <= this.availableWidth()) E = t;
    }
    if (E.size === 0) E.add(this.sortedByPriorityAsc(this.groups)[0].id);
    for (const id of E) {
      const g = this.groupById(id);
      if (g) g.el.classList.add('expanded');
    }
  }

  scrollGroupIntoView(groupEl: HTMLElement) {
    if (!this.viewport.classList.contains('constrained')) return;
    const vp = this.viewport;
    const vpR = vp.getBoundingClientRect();
    const elR = groupEl.getBoundingClientRect();
    if (elR.left >= vpR.left && elR.right <= vpR.right) return;
    const ld = elR.left - vpR.left;
    const rd = elR.right - vpR.right;
    let t = vp.scrollLeft;
    if (ld < 0) t += ld - 16;
    else if (rd > 0) t += rd + 16;
    vp.scrollTo({ left: t, behavior: 'smooth' });
  }

  updateOverflowAffordances() {
    const vp = this.viewport;
    const hasOverflow = vp.classList.contains('constrained') && (vp.scrollWidth > vp.clientWidth + 1);
    if (!hasOverflow) {
      vp.classList.remove('hasLeftOverflow', 'hasRightOverflow');
      return;
    }
    vp.classList.toggle('hasLeftOverflow', vp.scrollLeft > 2);
    vp.classList.toggle('hasRightOverflow', vp.scrollLeft < (vp.scrollWidth - vp.clientWidth - 2));
  }

  destroy() {
    this.ro.disconnect();
  }
}
