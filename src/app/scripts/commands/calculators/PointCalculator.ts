import { Calculator, BBox, Line } from '.';
import { SvgChar, ProjectionResult, CommandBuilder } from '..';
import { MathUtil, Point } from '../../common';

export class PointCalculator implements Calculator {
  private readonly svgChar: SvgChar;
  private readonly point: Point;

  constructor(svgChar: SvgChar, point: Point) {
    this.svgChar = svgChar;
    this.point = point;
  }

  getPathLength() {
    return 0;
  }

  project(point: Point) {
    const x = this.point.x;
    const y = this.point.y;
    const t = 0.5;
    const d = MathUtil.distance(this.point, point);
    return { x, y, t, d } as ProjectionResult;
  }

  split(t1: number, t2: number) {
    return new PointCalculator(this.svgChar, this.point);
  }

  convert(svgChar: SvgChar) {
    return new PointCalculator(svgChar, this.point);
  }

  findTimeByDistance(distance: number) {
    return distance;
  }

  toCommand() {
    let points;
    switch (this.svgChar) {
      case 'L':
      case 'Z':
        points = [this.point, this.point];
        break;
      case 'Q':
        points = [this.point, this.point, this.point];
        break;
      case 'C':
        points = [this.point, this.point, this.point, this.point];
        break;
      default:
        throw new Error('Invalid command type: ' + this.svgChar);
    }
    return new CommandBuilder(this.svgChar, points).build();
  }

  getBoundingBox() {
    const x = { min: this.point.x, max: this.point.x };
    const y = { min: this.point.y, max: this.point.y };
    return { x, y } as BBox;
  }

  intersects(line: Line) {
    const areCollinear = MathUtil.areCollinear(line.p1, this.point, line.p2);
    return areCollinear ? [0.5] : [];
  }
}