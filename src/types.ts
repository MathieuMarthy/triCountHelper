import { DEFAULT_GEMINI_MODEL } from './extraction/model';

export type Person = {
  id: string;
  name: string;
  color?: string;
};

export type ReceiptTax = {
  id: string;
  label: string;
  code: string;
  ratePercent: number | null;
  amountCents: number;
};

export type TaxRegime = {
  code: string;
  label: string;
  taxes: { code: string; label: string; ratePercent: number }[];
};

export const TAX_REGIMES: TaxRegime[] = [
  {
    code: 'QC',
    label: 'Québec',
    taxes: [
      { code: 'TPS', label: 'TPS', ratePercent: 5 },
      { code: 'TVQ', label: 'TVQ', ratePercent: 9.975 },
    ],
  },
  {
    code: 'ON',
    label: 'Ontario',
    taxes: [{ code: 'TVH', label: 'TVH', ratePercent: 13 }],
  },
  {
    code: 'GST',
    label: 'TPS seule (AB, T.N.-O., Nt, Yn)',
    taxes: [{ code: 'TPS', label: 'TPS', ratePercent: 5 }],
  },
];

export const DEFAULT_REGIME_CODE = 'QC';

export function regimeByCode(code: string): TaxRegime {
  return TAX_REGIMES.find((regime) => regime.code === code) ?? (TAX_REGIMES[0] as TaxRegime);
}

export type Assignment = {
  personId: string;
  shares: number;
};

export type ReceiptLine = {
  id: string;
  label: string;
  description?: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  taxCodes: string[] | null;
  assignments: Assignment[];
  confidence: number;
  isManual: boolean;
};

export type AdjustmentMode = 'proportional' | 'assigned';

export type Adjustment = {
  id: string;
  label: string;
  amountCents: number;
  mode: AdjustmentMode;
  assignments: Assignment[];
};

export type ReceiptStatus = 'draft' | 'settled';

export type Receipt = {
  id: string;
  createdAt: string;
  updatedAt: string;
  merchant: string | null;
  purchaseDate: string | null;
  imageBlobKey: string;
  lines: ReceiptLine[];
  taxes: ReceiptTax[];
  adjustments: Adjustment[];
  statedSubtotalCents: number | null;
  statedTotalCents: number | null;
  tipCents: number;
  tipBasis: TipBasis;
  status: ReceiptStatus;
  step: ReceiptStep;
};

export type ReceiptStep = 'capture' | 'processing' | 'verify' | 'assign' | 'results';

export type TipBasis = 'subtotal' | 'total';

export type Settings = {
  imageRetentionDays: number;
  taxRegimeCode: string;
  defaultTipPercent: number;
  defaultTipBasis: TipBasis;
  geminiApiKey: string;
  geminiModel: string;
  tricountEnabled: boolean;
  tricountShareUrl: string;
  tricountRelayUrl: string;
  tricountToken: string;
  theme: 'system' | 'light' | 'dark';
};

export const DEFAULT_SETTINGS: Settings = {
  imageRetentionDays: 90,
  taxRegimeCode: DEFAULT_REGIME_CODE,
  defaultTipPercent: 18,
  defaultTipBasis: 'subtotal',
  geminiApiKey: '',
  geminiModel: DEFAULT_GEMINI_MODEL,
  tricountEnabled: false,
  tricountShareUrl: '',
  tricountRelayUrl: '',
  tricountToken: '',
  theme: 'system',
};
