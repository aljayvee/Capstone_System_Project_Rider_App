export const API_BASE_URL = "http://192.168.8.138:5000/api";

export interface Errand {
  id: string;
  category: string;
  description: string;
  pickupAddress: string;
  deliveryAddress: string;
  estimatedCost: number;
  deliveryFee: number;
  tip: number;
  totalCost: number;
  status: "PENDING" | "ASSIGNED" | "TRAVELING" | "AT_STORE" | "PURCHASED" | "EN_ROUTE" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  customerId: number;
  riderId?: number;
  customerName?: string;
  customerPhone?: string;
}

export const riderApiService = {
  async getAssignedErrands(riderId: number): Promise<Errand[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/errands?riderId=${riderId}`);
      if (!res.ok) throw new Error("Failed to fetch errands");
      return await res.json();
    } catch (err) {
      console.warn("Backend API offline, using initial mockup feed", err);
      return [
        {
          id: "ERR-1002",
          category: "Groceries & Supermarkets",
          description: "Buy fresh milk, bread, and fruits from KCC Mall",
          pickupAddress: "KCC Mall, Gensan Drive, Tacurong City",
          deliveryAddress: "Barangay Poblacion, House #142",
          estimatedCost: 350,
          deliveryFee: 65,
          tip: 20,
          totalCost: 435,
          status: "ASSIGNED",
          customerId: 101,
          riderId: 3,
          customerName: "Maria Santos",
          customerPhone: "09181112233",
        },
      ];
    }
  },

  async updateErrandStatus(errandId: string, status: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/errands/${errandId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return res.ok;
    } catch (err) {
      console.warn("Failed to update status on server", err);
      return false;
    }
  },
};
