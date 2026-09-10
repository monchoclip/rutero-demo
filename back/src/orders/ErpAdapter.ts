export type ErpResult = { accepted: boolean; reference?: string; error?: string };
export interface ErpAdapter { submit(order: { id: string; totalMinor: number }): Promise<ErpResult>; }
export class SimulatedErpAdapter implements ErpAdapter {
  async submit(order: { id: string; totalMinor: number }): Promise<ErpResult> {
    if (order.totalMinor <= 0) return { accepted: false, error: "El pedido debe tener un total positivo." };
    return { accepted: true, reference: `ERP-${order.id.slice(0, 12).toUpperCase()}` };
  }
}
