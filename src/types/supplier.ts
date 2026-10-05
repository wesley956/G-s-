export type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  document: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

export type SupplierFormData = {
  name: string; contactName: string; phone: string; whatsapp: string;
  document: string; email: string; address: string; notes: string; active: boolean;
};
