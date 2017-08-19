import * as paper from 'paper';

import { AbstractTool, HitTestArgs, SelectionBoundsHelper } from './AbstractTool';
import * as ToolsUtil from './ToolsUtil';
import { SelectionState } from './ToolsUtil';

export class PenTool extends AbstractTool {
  private pathId = -1;
  private mode: string;
  private hitResult: paper.HitResult;
  private mouseStartPos: paper.Point;
  private originalHandleIn: paper.Point;
  private originalHandleOut: paper.Point;
  private currentSegment: paper.Segment;

  constructor(helper: SelectionBoundsHelper) {
    super();

    this.on({
      activate: () => ToolsUtil.setCanvasCursor('cursor-pen-add'),
      deactivate: () => {
        if (helper.getToolMode() !== 'tool-pen') {
          this.closePath();
          helper.updateSelectionBounds();
        }
        this.currentSegment = undefined;
      },
      mousedown: (event: paper.MouseEvent) => {
        ToolsUtil.deselectAllPoints();

        if (this.mode === 'create') {
          let path = ToolsUtil.findItemById(this.pathId);
          if (!path) {
            ToolsUtil.deselectAll();
            path = new paper.Path();
            path.strokeColor = 'black';
            this.pathId = path.id;
          }
          this.currentSegment = path.add(event.point);

          this.mouseStartPos = event.point.clone();
          this.originalHandleIn = this.currentSegment.handleIn.clone();
          this.originalHandleOut = this.currentSegment.handleOut.clone();
        } else if (this.mode === 'insert') {
          if (this.hitResult !== undefined) {
            const location = this.hitResult.location;

            const values = (location.curve as any).getValues();
            const isLinear = location.curve.isLinear();
            const parts = (paper.Curve as any).subdivide(values, location.parameter);
            const left = parts[0];
            const right = parts[1];

            const x = left[6];
            const y = left[7];
            const segment = new paper.Segment(
              new paper.Point(x, y),
              !isLinear && new paper.Point(left[4] - x, left[5] - y),
              !isLinear && new paper.Point(right[2] - x, right[3] - y),
            );

            const seg = (this.hitResult.item as paper.Path).insert(location.index + 1, segment);

            if (!isLinear) {
              seg.previous.handleOut.x = left[2] - left[0];
              seg.previous.handleOut.y = left[3] - left[1];
              seg.next.handleIn.x = right[4] - right[6];
              seg.next.handleIn.y = right[5] - right[7];
            }

            ToolsUtil.deselectAllPoints();
            seg.selected = true;

            this.hitResult = undefined;
          }
        } else if (this.mode === 'close') {
          if (this.pathId !== -1) {
            ToolsUtil.findItemById(this.pathId).closed = true;
          }

          this.currentSegment = this.hitResult.segment;
          this.currentSegment.handleIn.x = 0;
          this.currentSegment.handleIn.y = 0;

          this.mouseStartPos = event.point.clone();
          this.originalHandleIn = this.currentSegment.handleIn.clone();
          this.originalHandleOut = this.currentSegment.handleOut.clone();
        } else if (this.mode === 'adjust') {
          this.currentSegment = this.hitResult.segment;
          this.currentSegment.handleOut.x = 0;
          this.currentSegment.handleOut.y = 0;

          this.mouseStartPos = event.point.clone();
          this.originalHandleIn = this.currentSegment.handleIn.clone();
          this.originalHandleOut = this.currentSegment.handleOut.clone();
        } else if (this.mode === 'continue') {
          if (this.hitResult.segment.index === 0) {
            this.hitResult.item.reverseChildren();
          }

          this.pathId = this.hitResult.item.id;
          this.currentSegment = this.hitResult.segment;
          this.currentSegment.handleOut.x = 0;
          this.currentSegment.handleOut.y = 0;

          this.mouseStartPos = event.point.clone();
          this.originalHandleIn = this.currentSegment.handleIn.clone();
          this.originalHandleOut = this.currentSegment.handleOut.clone();
        } else if (this.mode === 'convert') {
          this.pathId = this.hitResult.item.id;
          this.currentSegment = this.hitResult.segment;
          this.currentSegment.handleIn.x = 0;
          this.currentSegment.handleIn.y = 0;
          this.currentSegment.handleOut.x = 0;
          this.currentSegment.handleOut.y = 0;

          this.mouseStartPos = event.point.clone();
          this.originalHandleIn = this.currentSegment.handleIn.clone();
          this.originalHandleOut = this.currentSegment.handleOut.clone();
        } else if (this.mode === 'join') {
          const path = ToolsUtil.findItemById(this.pathId);
          if (path !== undefined) {
            const oldPoint = this.hitResult.segment.point.clone();
            if (this.hitResult.segment.index !== 0) {
              (this.hitResult.item as paper.Path).reverse();
            }
            path.join(this.hitResult.item);
            // Find nearest point to the hit point.
            let imin = -1;
            let dmin = 0;
            for (let i = 0; i < path.segments.length; i++) {
              const d = oldPoint.getDistance(path.segments[i].point);
              if (imin === -1 || d < dmin) {
                dmin = d;
                imin = i;
              }
            }
            this.currentSegment = path.segments[imin];
            this.currentSegment.handleIn.x = 0;
            this.currentSegment.handleIn.y = 0;

            this.mouseStartPos = event.point.clone();
            this.originalHandleIn = this.currentSegment.handleIn.clone();
            this.originalHandleOut = this.currentSegment.handleOut.clone();
          } else {
            this.currentSegment = undefined;
          }
        } else if (this.mode === 'remove') {
          if (this.hitResult !== undefined) {
            (this.hitResult.item as paper.Path).removeSegment(this.hitResult.segment.index);
            this.hitResult = undefined;
          }
        }

        if (this.currentSegment) {
          this.currentSegment.selected = true;
        }
      },
      mouseup: (event: paper.MouseEvent) => {
        if (this.mode === 'close') {
          this.closePath();
        } else if (this.mode === 'join') {
          this.closePath();
        } else if (this.mode === 'convert') {
          this.closePath();
        }
        // undo.snapshot('Pen');
        this.mode = undefined;
        this.currentSegment = undefined;
      },
      mousedrag: (event: paper.MouseEvent) => {
        if (!this.currentSegment) {
          return;
        }
        const path = ToolsUtil.findItemById(this.pathId);
        if (!path) {
          return;
        }

        let dragIn = false;
        let dragOut = false;
        let invert = false;

        if (this.mode === 'create') {
          dragOut = true;
          if (this.currentSegment.index > 0) {
            dragIn = true;
          }
        } else if (this.mode === 'close') {
          dragIn = true;
          invert = true;
        } else if (this.mode === 'continue') {
          dragOut = true;
        } else if (this.mode === 'adjust') {
          dragOut = true;
        } else if (this.mode === 'join') {
          dragIn = true;
          invert = true;
        } else if (this.mode === 'convert') {
          dragIn = true;
          dragOut = true;
        }

        if (dragIn || dragOut) {
          let delta = event.point.subtract(this.mouseStartPos);
          if (invert) {
            delta = new paper.Point(-delta.x, -delta.y);
          }
          if (dragIn && dragOut) {
            let handlePos = this.originalHandleOut.add(delta);
            if (event.modifiers.shift) {
              handlePos = ToolsUtil.snapDeltaToAngle(handlePos, Math.PI * 2 / 8);
            }
            this.currentSegment.handleOut = handlePos;
            this.currentSegment.handleIn = new paper.Point(-handlePos.x, -handlePos.y);
          } else if (dragOut) {
            let handlePos = this.originalHandleOut.add(delta);
            if (event.modifiers.shift) {
              handlePos = ToolsUtil.snapDeltaToAngle(handlePos, Math.PI * 2 / 8);
            }
            this.currentSegment.handleOut = handlePos;
            this.currentSegment.handleIn = handlePos.normalize(-this.originalHandleIn.length);
          } else {
            let handlePos = this.originalHandleIn.add(delta);
            if (event.modifiers.shift) {
              handlePos = ToolsUtil.snapDeltaToAngle(handlePos, Math.PI * 2 / 8);
            }
            this.currentSegment.handleIn = handlePos;
            this.currentSegment.handleOut = handlePos.normalize(-this.originalHandleOut.length);
          }
        }
      },
      mousemove: (event: paper.MouseEvent) => this.hitTest(event),
    });
  }

  testHot(type: string, event: { point: paper.Point; modifiers?: any }, mode: string) {
    if (mode !== 'tool-pen') {
      return false;
    }
    const modifiers = event.modifiers || {};
    if (modifiers.command) {
      return false;
    }
    if (type === 'keyup') {
      if (modifiers.key === 'enter' || modifiers.key === 'escape') {
        this.closePath();
      }
    }
    return this.hitTest(event);
  }

  private hitTest({ point, modifiers = {} }: { point: paper.Point; modifiers?: any }) {
    const hitSize = 4;
    let result = undefined;
    // var isKeyEvent = type ==='mode' || type ==='command' || type ==='keydown' || type ==='keyup';

    this.currentSegment = undefined;
    this.hitResult = undefined;

    if (point) {
      result = paper.project.hitTest(point, {
        segments: true,
        stroke: true,
        tolerance: hitSize,
      });
    }

    if (result) {
      if (result.type === 'stroke') {
        if (result.item.selected) {
          // Insert point.
          this.mode = 'insert';
          ToolsUtil.setCanvasCursor('cursor-pen-add');
        } else {
          result = undefined;
        }
      } else if (result.type === 'segment') {
        const last = result.item.segments.length - 1;
        if (!result.item.closed && (result.segment.index === 0 || result.segment.index === last)) {
          if (result.item.id === this.pathId) {
            if (result.segment.index === 0) {
              // Close
              this.mode = 'close';
              ToolsUtil.setCanvasCursor('cursor-pen-close');
              this.updateTail(result.segment.point);
            } else {
              // Adjust last handle
              this.mode = 'adjust';
              ToolsUtil.setCanvasCursor('cursor-pen-adjust');
            }
          } else {
            if (this.pathId !== -1) {
              this.mode = 'join';
              ToolsUtil.setCanvasCursor('cursor-pen-join');
              this.updateTail(result.segment.point);
            } else {
              this.mode = 'continue';
              ToolsUtil.setCanvasCursor('cursor-pen-edit');
            }
          }
        } else if (result.item.selected) {
          if (modifiers.option) {
            this.mode = 'convert';
            ToolsUtil.setCanvasCursor('cursor-pen-adjust');
          } else {
            this.mode = 'remove';
            ToolsUtil.setCanvasCursor('cursor-pen-remove');
          }
        } else {
          result = undefined;
        }
      }
    }

    if (!result) {
      this.mode = 'create';
      ToolsUtil.setCanvasCursor('cursor-pen-create');
      if (point) {
        this.updateTail(point);
      }
    }

    this.hitResult = result;

    return true;
  }

  private closePath() {
    if (this.pathId !== -1) {
      ToolsUtil.deselectAllPoints();
      this.pathId = -1;
    }
  }

  private updateTail(point: paper.Point) {
    const path = ToolsUtil.findItemById(this.pathId);
    if (path === undefined) {
      return;
    }
    const nsegs = path.segments.length;
    if (nsegs === 0) {
      return;
    }

    const color = (paper.project.activeLayer as any).getSelectedColor();
    const tail = new paper.Path();
    tail.strokeColor = color ? color : '#009dec';
    tail.strokeWidth = 1 / paper.view.zoom;
    (tail as any).guide = true;

    const prevPoint = path.segments[nsegs - 1].point;
    const prevHandleOut = path.segments[nsegs - 1].point.add(path.segments[nsegs - 1].handleOut);

    tail.moveTo(prevPoint);
    tail.cubicCurveTo(prevHandleOut, point, point);

    tail.removeOn({
      drag: true,
      up: true,
      down: true,
      move: true,
    });
  }
}