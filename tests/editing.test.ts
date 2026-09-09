import { describe, it, expect } from 'vitest';
import { newProject, newPanel, newText, validateProject, worldOrigin, placeBalloon } from '../src/core/model';
import { reflow } from '../src/core/layout';
import { useEditor } from '../src/core/store';
import { alignmentTargets, snapRect } from '../src/core/snapping';
import { moveLayer } from '../src/core/layers';

describe('Edição livre e camadas', () => {
  it('preserva compatibilidade com projetos anteriores aos padrões de estilo', () => {
    const legacy = newProject('Projeto antigo') as unknown as Record<string, unknown>;
    const balloon = newText('caption') as unknown as Record<string, unknown>;
    delete legacy.styleDefaults;
    delete balloon.shape;
    legacy.nodes = [balloon];
    const migrated = validateProject(legacy);
    expect(migrated.styleDefaults).toEqual({ panel: {}, balloons: {} });
    expect(migrated.nodes[0]).toMatchObject({ type: 'balloon', shape: 'rounded' });
  });

  it('usa o último estilo como padrão apenas no mesmo tipo de balão e entre páginas', () => {
    useEditor.getState().load(newProject('Padrões de balão'));
    useEditor.getState().addText('caption');
    const caption = useEditor.getState().project!.nodes[0];
    useEditor.getState().patch([caption.id], {
      shape: 'rect',
      fontSize: 36,
      bold: true,
      strokeWidth: 8,
    });
    useEditor.getState().addPage();
    useEditor.getState().addText('caption');
    useEditor.getState().addText('thought');
    const balloons = useEditor.getState().project!.nodes.filter((n) => n.type === 'balloon');
    expect(balloons[1]).toMatchObject({
      kind: 'caption',
      shape: 'rect',
      fontSize: 36,
      bold: true,
      strokeWidth: 8,
      pageId: useEditor.getState().activePage,
    });
    expect(balloons[2]).toMatchObject({
      kind: 'thought',
      shape: 'rounded',
      fontSize: 28,
      bold: false,
      strokeWidth: 2,
    });
  });

  it('reaproveita aparência de quadro sem remover as exceções dos presets', () => {
    useEditor.getState().load(newProject('Padrões de quadro'));
    useEditor.getState().addPanel();
    const first = useEditor.getState().project!.nodes[0];
    useEditor.getState().patch([first.id], { shape: 'rounded', strokeWidth: 8, fill: '#eeeeee' });
    useEditor.getState().addPanel('square');
    useEditor.getState().addPanel('borderless');
    const panels = useEditor.getState().project!.nodes.filter((n) => n.type === 'panel');
    expect(panels[1]).toMatchObject({ shape: 'rounded', strokeWidth: 8, fill: '#eeeeee' });
    expect(panels[2]).toMatchObject({ shape: 'rounded', strokeWidth: 0, fill: 'transparent' });
  });

  it('migra balões antigos sem mover, girar ou inverter a arte nem alterar o original', () => {
    const p = newProject('Legado');
    const panel = newPanel(p.pages[0]);
    Object.assign(panel, { x: 200, y: 400 });
    const balloon = newText('speech');
    Object.assign(balloon, { panelId: panel.id, x: -25, y: 75, rotation: 765, flipX: true });
    p.nodes = [panel, balloon];
    const before = worldOrigin(p, balloon),
      migrated = validateProject(p);
    expect(migrated.nodes[1]).toMatchObject({
      panelId: null,
      pageId: panel.pageId,
      ...before,
      rotation: 765,
      flipX: true,
    });
    expect(balloon.panelId).toBe(panel.id);
    expect(validateProject(migrated)).toEqual(migrated);
  });
  it('balões não alteram fluxo nem são excluídos ou copiados com os quadros', () => {
    useEditor.getState().load(newProject('Independência'));
    const s = useEditor.getState();
    s.addPanel();
    const frame = structuredClone(useEditor.getState().project!.nodes[0]);
    s.addText('speech');
    const balloon = useEditor.getState().project!.nodes[1];
    expect(balloon).toMatchObject({
      type: 'balloon',
      panelId: null,
      pageId: useEditor.getState().activePage,
    });
    s.patch([balloon.id], { height: 15000, tailY: 16000 });
    expect(useEditor.getState().project!.nodes[0]).toEqual(frame);
    s.select([frame.id]);
    s.copy();
    expect(useEditor.getState().clipboard).toHaveLength(1);
    s.remove();
    expect(useEditor.getState().project!.nodes.map((n) => n.id)).toEqual([balloon.id]);
  });
  it('posiciona na página e duplica sem criar vínculo com quadro', () => {
    useEditor.getState().load(newProject('Cópia'));
    const s = useEditor.getState();
    s.addPanel();
    s.addText('thought');
    s.duplicate();
    const p = useEditor.getState().project!;
    expect(
      p.nodes
        .filter((n) => n.type === 'balloon')
        .every((n) => n.panelId === null && n.pageId === p.pages[0].id),
    ).toBe(true);
    const balloon = newText('caption');
    placeBalloon(p, balloon, { x: -600, y: 0 });
    expect(balloon.pageId).toBeNull();
  });
  it('mantém quadro parcialmente fora da página, com uma parte alcançável', () => {
    const p = newProject('Sangria'),
      frame = newPanel(p.pages[0]);
    Object.assign(frame, { mode: 'free', x: -200, y: -100, width: 400, height: 300 });
    p.nodes = [frame];
    reflow(p);
    expect(frame).toMatchObject({ x: -200, y: -100 });
    frame.x = -2000;
    reflow(p);
    expect(frame.x).toBe(8 - frame.width);
  });
  it('encaixa em margens, centro e dimensões vizinhas com tolerância visual', () => {
    const p = newProject('Guias'),
      targets = alignmentTargets(p, []);
    expect(snapRect({ x: 26, y: 100, width: 300, height: 200 }, targets, 1)).toMatchObject({
      dx: -2,
      guides: { x: 24 },
    });
    expect(snapRect({ x: 252, y: 100, width: 300, height: 200 }, targets, 1)).toMatchObject({
      dx: -2,
      guides: { x: 400 },
    });
    expect(
      snapRect(
        { x: 20, y: 200, width: 299, height: 199 },
        [{ x: 400, y: 10, width: 300, height: 200 }],
        1,
        true,
      ),
    ).toMatchObject({ dx: 1, dy: 1 });
    expect(snapRect({ x: 32, y: 100, width: 300, height: 200 }, targets, 1).dx).toBe(0);
    expect(snapRect({ x: 32, y: 100, width: 300, height: 200 }, targets, 0.5).dx).toBe(-8);
  });
  it('reordena balões e quadros sem mudar parentesco, posição ou fluxo', () => {
    const p = newProject('Camadas'),
      frame = newPanel(p.pages[0]),
      a = newText('caption'),
      b = newText('speech');
    a.pageId = b.pageId = frame.pageId;
    p.nodes = [frame, a, b];
    moveLayer(p, a.id, frame.id, false);
    expect(p.nodes.map((n) => n.id)).toEqual([a.id, frame.id, b.id]);
    moveLayer(p, a.id, b.id, true);
    expect(p.nodes.map((n) => n.id)).toEqual([frame.id, b.id, a.id]);
    expect(a.panelId).toBeNull();
    expect(frame.order).toBe(0);
  });
});
