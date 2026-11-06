import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getCache, setCache } from '@/offline/cache';
import type { OrderTypeSetting, PaymentMethod, RestaurantSettings } from '@/types';

interface SettingsContextValue {
  settings: RestaurantSettings | null;
  paymentMethods: PaymentMethod[];
  orderTypes: OrderTypeSetting[];
  loading: boolean;
  currency: string;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<RestaurantSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const CACHE_KEY = 'settings-bundle';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderTypeSetting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, p, o] = await Promise.all([
      supabase.from('restaurant_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('payment_methods').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('order_type_settings').select('*').order('order_type'),
    ]);

    if (!s.error) {
      setSettings(s.data as RestaurantSettings);
      setPaymentMethods((p.data ?? []) as PaymentMethod[]);
      setOrderTypes((o.data ?? []) as OrderTypeSetting[]);
      await setCache(CACHE_KEY, { settings: s.data, paymentMethods: p.data, orderTypes: o.data });
    } else {
      const cached = await getCache<{
        settings: RestaurantSettings;
        paymentMethods: PaymentMethod[];
        orderTypes: OrderTypeSetting[];
      }>(CACHE_KEY);
      if (cached) {
        setSettings(cached.data.settings);
        setPaymentMethods(cached.data.paymentMethods);
        setOrderTypes(cached.data.orderTypes);
      }
    }
    setLoading(false);
  }, []);

  // Settings are protected by RLS, so wait until a session exists. Running this
  // only once at app boot would leave the POS without payment methods after a
  // fresh sign-in until the page is reloaded.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [user?.id, load]);

  const updateSettings = useCallback(
    async (patch: Partial<RestaurantSettings>) => {
      const { error } = await supabase.from('restaurant_settings').update(patch).eq('id', 1);
      if (error) throw error;
      await load();
    },
    [load],
  );

  const value = useMemo(
    () => ({
      settings,
      paymentMethods,
      orderTypes,
      loading,
      currency: settings?.currency ?? 'EGP',
      refresh: load,
      updateSettings,
    }),
    [settings, paymentMethods, orderTypes, loading, load, updateSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
