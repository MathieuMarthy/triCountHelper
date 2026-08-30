export type ExtractedLine = {
  label: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  taxCodes: string[] | null;
  confidence: number;
};

export type ExtractedTax = {
  code: string;
  label: string;
  ratePercent: number | null;
  amountCents: number;
};

export type ExtractionResult = {
  lines: ExtractedLine[];
  taxes: ExtractedTax[];
  statedSubtotalCents: number | null;
  statedTotalCents: number | null;
  merchant: string | null;
  purchaseDate: string | null;
  discarded: string[];
};

export const EMPTY_EXTRACTION: ExtractionResult = {
  lines: [],
  taxes: [],
  statedSubtotalCents: null,
  statedTotalCents: null,
  merchant: null,
  purchaseDate: null,
  discarded: [],
};
