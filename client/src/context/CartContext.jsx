/**
 * Carrito en el navegador (localStorage). Los precios aquí son solo para mostrar:
 * el servidor recalcula el total real con los precios de la base de datos.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'skadi_cart_v1';
const MAX_PER_ITEM = 20;
const CartContext = createContext(null);

/** Lee el carrito guardado; si no existe o está corrupto, empieza vacío. */
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** Provee el carrito a toda la app y lo guarda en localStorage en cada cambio. */
export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* modo privado o almacenamiento bloqueado: el carrito sigue en memoria */
    }
  }, [items]);

  /**
   * Agrega una variante o suma a la que ya está, sin pasar del stock ni de MAX_PER_ITEM.
   * item: { variantId, productId, slug, name, image, size, color, unitPrice, maxStock }
   */
  const addItem = useCallback((item, quantity = 1) => {
    setItems((prev) => {
      const limit = Math.min(item.maxStock ?? MAX_PER_ITEM, MAX_PER_ITEM);
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity: Math.min(i.quantity + quantity, limit) } : i));
      }
      return [...prev, { ...item, quantity: Math.min(quantity, limit) }];
    });
  }, []);

  /** Fija la cantidad de una variante, limitada entre 1 y el stock disponible (máx. MAX_PER_ITEM). */
  const updateQuantity = useCallback((variantId, quantity) => {
    setItems((prev) =>
      prev.map((i) =>
        i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(quantity, i.maxStock ?? MAX_PER_ITEM, MAX_PER_ITEM)) } : i,
      ),
    );
  }, []);

  /** Quita una variante del carrito. */
  const removeItem = useCallback((variantId) => setItems((prev) => prev.filter((i) => i.variantId !== variantId)), []);
  /** Vacía el carrito (p. ej. después de un pago aprobado). */
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      addItem,
      updateQuantity,
      removeItem,
      clear,
    }),
    [items, addItem, updateQuantity, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Acceso al carrito: { items, count, subtotal, addItem, updateQuantity, removeItem, clear }. */
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}
