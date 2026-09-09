import { describe, it, expect, beforeEach } from 'vitest';
import {
  newProject,
  newPage,
  newPanel,
  newText,
  validateProject,
  worldOrigin,
  visualBounds,
  type Panel,
} from '../src/core/model';
import { panelWidth, reflow, panelExtents } from '../src/core/layout';
import { useEditor, insertionTarget } from '../src/core/store';
import { exportSlices } from '../src/core/render';

describe('Grade e paginação determinística', () => {
  it('divide dois quadros pela metade com 16 px de intervalo', () => {
    const p = newProject('Teste');
    const a = newPanel(p.pages[0]),
      b = newPanel(p.pages[0]);
    a.span = b.span = 6;
    a.order = 0;
    b.order = 1;
    p.nodes = [a, b];
    reflow(p);
    expect(a.width).toBe(368);
    expect(b.x).toBe(408);
    expect(a.y).toBe(b.y);
    expect(b.x + b.width).toBe(776);
  });
  it('mantém a linha inteira ao passar para a continuação', () => {
    const p = newProject('Teste', 800, 1000);
    const a = newPanel(p.pages[0]),
      b = newPanel(p.pages[0]),
      c = newPanel(p.pages[0]);
    a.height = 600;
    b.height = c.height = 300;
    b.span = c.span = 6;
    a.order = 0;
    b.order = 1;
    c.order = 2;
    p.nodes = [a, b, c];
    reflow(p);
    expect(p.pages).toHaveLength(2);
    expect(b.pageId).toBe(c.pageId);
    expect(a.pageId).not.toBe(b.pageId);
    expect(b.y).toBe(24);
    const id = p.pages[1].id;
    reflow(p);
    expect(p.pages[1].id).toBe(id);
  });
  it('preserva sequências manuais e páginas livres', () => {
    const p = newProject('Teste', 800, 1000);
    const root = p.pages[0],
      manual = newPage(940, 1000);
    p.pages.push(manual);
    const a = newPanel(root),
      b = newPanel(root),
      c = newPanel(manual);
    a.height = b.height = 600;
    b.order = 1;
    p.nodes = [a, b, c];
    reflow(p);
    expect(p.pages).toHaveLength(3);
    expect(p.pages[2].id).toBe(manual.id);
    b.mode = 'free';
    a.height = 100;
    reflow(p);
    expect(p.pages).toHaveLength(3);
    expect(b.pageId).toBe(p.pages[1].id);
  });
  it('considera transbordamento acima e abaixo, sem sobrepor linhas', () => {
    const p = newProject('Teste'),
      a = newPanel(p.pages[0]),
      b = newPanel(p.pages[0]);
    a.height = b.height = 100;
    b.order = 1;
    const text = newText('caption');
    text.panelId = a.id;
    text.y = -50;
    text.height = 250;
    p.nodes = [a, b, text];
    reflow(p);
    expect(panelExtents(p, a)).toEqual({ top: -50, bottom: 200, height: 250 });
    expect(a.y).toBe(74);
    expect(b.y).toBe(354);
    text.overflow = false;
    reflow(p);
    expect(a.y).toBe(24);
    expect(b.y).toBe(204);
  });
  it('rejeita quadro excessivo sem criar páginas indefinidamente', () => {
    const p = newProject('Teste', 800, 1000),
      a = newPanel(p.pages[0]);
    a.height = 2000;
    p.nodes = [a];
    expect(() => reflow(p)).toThrow(/maiores que a página/);
    expect(p.pages).toHaveLength(1);
  });
  it('reordena por ordem, libera espaço e não altera quadros livres', () => {
    const p = newProject('Teste'),
      a = newPanel(p.pages[0]),
      b = newPanel(p.pages[0]);
    a.height = b.height = 100;
    a.order = 2;
    b.order = 1;
    p.nodes = [a, b];
    reflow(p);
    expect(b.y).toBe(24);
    expect(a.y).toBe(204);
    a.mode = 'free';
    a.y = 900;
    reflow(p);
    expect(a.y).toBe(900);
    expect(b.y).toBe(24);
  });
  it('limita 20 páginas', () => {
    const p = newProject('Teste', 800, 1000);
    p.nodes = Array.from({ length: 21 }, (_, i) => ({ ...newPanel(p.pages[0]), height: 900, order: i }));
    expect(() => reflow(p)).toThrow(/20 páginas/);
  });
  it('processa dez páginas com centenas de objetos sem alterar coordenadas na repetição', () => {
    const p = newProject('Carga', 800, 10000);
    p.pages = Array.from({ length: 10 }, () => newPage());
    for (const pg of p.pages)
      for (let i = 0; i < 30; i++) {
        const a = newPanel(pg);
        a.height = 120;
        a.span = 6;
        a.order = i;
        const b = newText('speech');
        b.panelId = a.id;
        b.height = 80;
        b.width = 160;
        b.tailY = 90;
        b.fontSize = 12;
        p.nodes.push(a, b);
      }
    const start = performance.now();
    reflow(p);
    validateProject(p);
    expect(p.pages).toHaveLength(10);
    const first = JSON.stringify(p);
    reflow(p);
    expect(JSON.stringify(p)).toBe(first);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('Modelo e histórico', () => {
  beforeEach(() => {
    useEditor.getState().load(newProject('História'));
  });
  it('desfaz uma alteração completa e preserva o projeto quando rejeitada', () => {
    const s = useEditor.getState();
    s.addPanel();
    const id = useEditor.getState().selection[0];
    s.patch([id], { span: 6 });
    expect((useEditor.getState().project!.nodes[0] as Panel).width).toBe(368);
    s.undo();
    expect((useEditor.getState().project!.nodes[0] as Panel).width).toBe(752);
    s.redo();
    expect((useEditor.getState().project!.nodes[0] as Panel).span).toBe(6);
    const before = useEditor.getState().project;
    s.patch([id], { height: 100000 });
    expect(useEditor.getState().project).toBe(before);
  });
  it('guarda apenas as últimas cem operações', () => {
    for (let i = 0; i < 110; i++)
      useEditor.getState().run('Nome', (p) => {
        p.name = String(i);
      });
    expect(useEditor.getState().past).toHaveLength(100);
  });
  it('inserção no meio da página ignora quadro selecionado fora da tela', () => {
    const s = useEditor.getState();
    s.addPanel();
    s.setView({ x: 40, y: -5000, zoom: 1, width: 1000, height: 800 });
    const target = insertionTarget(useEditor.getState());
    expect(target.panel).toBeNull();
    expect(target.point).toEqual({ x: 460, y: 5400 });
  });
  it('quadro invisível na arte recebe conteúdo por hit test', () => {
    const s = useEditor.getState();
    s.addPanel();
    s.patch(useEditor.getState().selection, { strokeWidth: 0, fill: 'transparent' });
    const p = useEditor.getState().project!,
      panel = p.nodes[0];
    expect(insertionTarget(useEditor.getState(), { x: 50, y: 50 }).panel?.id).toBe(panel.id);
    s.select([]);
    expect(insertionTarget(useEditor.getState(), { x: 50, y: 50 }).panel?.id).toBe(panel.id);
  });
  it('copiar um quadro inclui seus filhos com novos vínculos', () => {
    const s = useEditor.getState();
    s.addPanel();
    const id = useEditor.getState().selection[0];
    s.addText();
    s.select([id]);
    s.duplicate();
    const p = useEditor.getState().project!;
    expect(p.nodes).toHaveLength(4);
    const panels = p.nodes.filter((n) => n.type === 'panel');
    expect(panels).toHaveLength(2);
    expect(
      p.nodes
        .filter((n) => n.type === 'text')
        .map((n) => n.panelId)
        .sort(),
    ).toEqual(panels.map((n) => n.id).sort());
  });
  it('desvincular conserva transformação e posição mundial', () => {
    const s = useEditor.getState();
    s.addPanel();
    s.addText('speech');
    const id = useEditor.getState().selection[0];
    s.patch([id], { rotation: 765, flipX: true, flipY: true });
    const p = useEditor.getState().project!,
      old = worldOrigin(p, p.nodes[1]);
    s.detach(id);
    const n = useEditor.getState().project!.nodes[1];
    expect(n).toMatchObject({ ...old, rotation: 765, flipX: true, flipY: true, panelId: null });
  });
  it('somente leitura não modifica documento', () => {
    const p = newProject('Leitura');
    useEditor.getState().load(p, true);
    useEditor.getState().addPanel();
    expect(useEditor.getState().project).toEqual(p);
    expect(p.nodes).toHaveLength(0);
  });
  it('rejeita vínculos corrompidos e dimensões fora dos limites', () => {
    const p = newProject('Inválido');
    const n = newText();
    n.panelId = 'ausente';
    p.nodes = [n];
    expect(() => validateProject(p)).toThrow();
    p.nodes = [];
    p.pages[0].height = 20000;
    expect(() => validateProject(p)).toThrow();
  });
  it('mede giro e ponteiro nos limites visuais', () => {
    const n = newText('speech');
    n.width = 100;
    n.height = 50;
    n.tailX = 50;
    n.tailY = 100;
    n.rotation = 90;
    const b = visualBounds(n);
    expect(b.width).toBeCloseTo(110);
    expect(b.height).toBeCloseTo(100);
  });
});

describe('Fatias de exportação', () => {
  const opts = {
    mime: 'image/png' as const,
    quality: 0.9,
    pages: [],
    preset: 'webtoon' as const,
    sliceHeight: 1280,
    width: 800,
  };
  it('não perde nem repete nenhuma linha na emenda', () => {
    const slices = exportSlices(newPage(800, 10000), opts);
    expect(slices).toHaveLength(8);
    expect(slices.at(-1)?.height).toBe(1040);
    expect(slices.reduce((s, n) => s + n.height, 0)).toBe(10000);
    for (let i = 1; i < slices.length; i++)
      expect(slices[i].offset).toBe(slices[i - 1].offset + slices[i - 1].height);
  });
  it('preserva dimensões originais e escala Tapas proporcionalmente', () => {
    expect(exportSlices(newPage(), { ...opts, preset: 'whole' })).toEqual([
      { width: 800, height: 10000, offset: 0 },
    ]);
    const tapas = exportSlices(newPage(), { ...opts, preset: 'tapas' });
    expect(tapas.reduce((s, n) => s + n.height, 0)).toBe(11750);
    expect(tapas[0].width).toBe(940);
  });
});
