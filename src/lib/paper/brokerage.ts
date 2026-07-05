// Zero brokerage or minimal flat fee
const BROKERAGE_RATE = 0.0;
const STT_RATE = 0.001;   // 0.1% STT
const EXCHANGE_CHARGES = 0.00002; // ~0.002%
const GST_RATE = 0.18;
const SEBI_CHARGES = 0.000001;

export interface Charges {
  brokerage: number;
  stt: number;
  exchange: number;
  gst: number;
  sebi: number;
  total: number;
}

export function calculateCharges(tradeValue: number): Charges {
  const brokerage = tradeValue * BROKERAGE_RATE;
  const stt = tradeValue * STT_RATE;
  const exchange = tradeValue * EXCHANGE_CHARGES;
  const gst = (brokerage + exchange) * GST_RATE;
  const sebi = tradeValue * SEBI_CHARGES;
  return {
    brokerage,
    stt,
    exchange,
    gst,
    sebi,
    total: brokerage + stt + exchange + gst + sebi,
  };
}
