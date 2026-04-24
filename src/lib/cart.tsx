import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  price: number; // unit price snapshot at add time (server will recalc)
  quantity: number;
}

interface CartCtx {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addToCart: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeFromCart: (product_id: string) => void;
  updateQuantity: (product_id: string, qty: number) => void;
  clearCart: () => void;
}

const Ctx = createContext<CartCtx | undefined>(undefined);
const KEY = "sunburst.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* noop */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydrated) return; // don't overwrite storage before hydration
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, hydrated]);

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        setItems(e.newValue ? JSON.parse(e.newValue) : []);
      } catch { /* noop */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addToCart: CartCtx["addToCart"] = (item, qty = 1) =>
    setItems((cur) => {
      const i = cur.findIndex((c) => c.product_id === item.product_id);
      if (i >= 0) {
        const next = [...cur];
        next[i] = { ...next[i], quantity: next[i].quantity + qty, price: item.price };
        return next;
      }
      return [...cur, { ...item, quantity: qty }];
    });

  const removeFromCart: CartCtx["removeFromCart"] = (id) =>
    setItems((cur) => cur.filter((c) => c.product_id !== id));

  const updateQuantity: CartCtx["updateQuantity"] = (id, qty) =>
    setItems((cur) =>
      qty <= 0 ? cur.filter((c) => c.product_id !== id) : cur.map((c) => (c.product_id === id ? { ...c, quantity: qty } : c)),
    );

  const clearCart = () => setItems([]);

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <Ctx.Provider value={{ items, itemCount, subtotal, addToCart, removeFromCart, updateQuantity, clearCart }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
