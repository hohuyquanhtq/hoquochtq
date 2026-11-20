import React from 'react';
import ChemicalContentRenderer, { ChemicalContentRendererProps } from '../components/common/ChemicalContentRenderer';

export interface ChemTextProps extends ChemicalContentRendererProps {
  text?: string;
  className?: string;
  inline?: boolean;
}

/**
 * ChemRenderer: Backward-compatible wrapper delegating to the unified ChemicalContentRenderer engine.
 * Supports KaTeX, OMML formulas, Sub/Sup, Markdown tables, organic formulas, and chemical equations.
 */
export const ChemRenderer: React.FC<ChemTextProps> = (props) => {
  return <ChemicalContentRenderer {...props} />;
};

export { ChemicalContentRenderer };
export default ChemRenderer;

