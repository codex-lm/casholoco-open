import type { Fmt, NumberPrecision } from '../../../fmt';
import type { HexLens, HexQuintiles } from './hexModel';

export interface HexLegendStep { index: number; label: string }

/** Increase displayed precision only when distinct estimates would otherwise share a label. */
function adaptiveLabels(values: number[], lens: HexLens, fmt: Fmt): string[] {
  const format = (value: number, precision?: NumberPrecision) => lens === 'margin' ? fmt.signedMoney(value, precision)
    : lens === 'demand' ? fmt.lots(value, precision) : fmt.lotPrice(value, precision);
  const distinct = new Set(values).size;
  let labels = values.map((value) => format(value));
  for (let digits = 0; new Set(labels).size < distinct && digits <= 12; digits++) {
    labels = values.map((value) => format(value, digits));
  }
  return new Set(labels).size < distinct ? values.map((value) => format(value, 'exact')) : labels;
}

export function hexLegendSteps(range: [number, number] | HexQuintiles | null, lens: HexLens, fmt: Fmt,
  between: (low: string, high: string) => string, _perLotMargin = false): HexLegendStep[] {
  if (!range || lens === 'plain') return [];
  const min = range[0], max = range[range.length - 1];
  if (min === max) return [{ index: 2, label: adaptiveLabels([min], lens, fmt)[0] }];
  if (lens === 'margin' && range.length === 6) {
    const labels = adaptiveLabels(range, lens, fmt);
    // Empty quintile bands have no cells in them. Keep a final point band when the maximum is tied.
    return range.slice(0, 5).flatMap((low, index) => low === range[index + 1] && index < 4 ? []
      : [{ index, label: low === range[index + 1] ? labels[index] : between(labels[index], labels[index + 1]) }]);
  }
  const values = Array.from({ length: 5 }, (_, index) => index === 4 ? max : min + (max - min) * index / 4);
  const labels = adaptiveLabels(values, lens, fmt);
  // A range just one float wide cannot honestly supply five distinct intermediate anchors.
  return values.flatMap((value, index) => (value === max ? index < 4 : values.indexOf(value) !== index) ? []
    : [{ index, label: labels[index] }]);
}

/** The two ends of the scale, for the compact toolbar version (null without a scale, one label for a single value). */
export function hexLegendEnds(range: [number, number] | HexQuintiles | null, lens: HexLens, fmt: Fmt, _perLotMargin = false): [string] | [string, string] | null {
  if (!range || lens === 'plain') return null;
  const min = range[0], max = range[range.length - 1];
  if (min === max) return [adaptiveLabels([min], lens, fmt)[0]];
  const [low, high] = adaptiveLabels([min, max], lens, fmt);
  return [low, high];
}

/** What the colours measure: absolute or relative to the reference product's own cell. */
export function hexLegendTitle(lens: HexLens, delta: boolean,
  h: { legendMargin: string; legendDelta: string; legendDemand: string; legendPlain: string },
  freight: { lensTransport: string; lensTransportDelta: string },
  delivery?: { margin: string; transport: string; demand: string }): string {
  if (delivery && lens !== 'plain') return delivery[lens];
  return lens === 'margin' ? delta ? h.legendDelta : h.legendMargin
    : lens === 'transport' ? delta ? freight.lensTransportDelta : freight.lensTransport
    : lens === 'demand' ? h.legendDemand : h.legendPlain;
}
