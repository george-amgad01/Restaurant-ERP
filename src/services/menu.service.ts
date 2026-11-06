import { supabase } from '@/lib/supabase';
import { getCache, setCache } from '@/offline/cache';
import type { Category, MenuItem, MenuItemCost } from '@/types';

export async function listCategories(includeInactive = false) {
  let query = supabase.from('categories').select('*').order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function saveCategory(input: Partial<Category> & { name: string }) {
  if (input.id) {
    const { error } = await supabase.from('categories').update(input).eq('id', input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from('categories').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function listMenuItems(includeInactive = false) {
  let query = supabase.from('menu_items').select('*, category:categories(*)').order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const [itemsRes, costsRes] = await Promise.all([
    query,
    supabase.from('menu_item_costs').select('*'),
  ]);
  if (itemsRes.error) throw itemsRes.error;

  const costs = new Map<string, MenuItemCost>(
    ((costsRes.data ?? []) as MenuItemCost[]).map((c) => [c.menu_item_id, c]),
  );

  return ((itemsRes.data ?? []) as MenuItem[]).map((item) => ({
    ...item,
    cost: costs.get(item.id) ?? null,
  }));
}

/** Network-first catalog with an IndexedDB fallback so POS survives outages. */
export async function listPosCatalog(): Promise<{ items: MenuItem[]; categories: Category[] }> {
  try {
    const [items, categories] = await Promise.all([listMenuItems(), listCategories()]);
    await setCache('pos-catalog', { items, categories });
    return { items, categories };
  } catch (err) {
    const cached = await getCache<{ items: MenuItem[]; categories: Category[] }>('pos-catalog');
    if (cached) return cached.data;
    throw err;
  }
}

export async function saveMenuItem(input: Partial<MenuItem> & { name: string; price: number }) {
  const payload = { ...input };
  delete payload.cost;
  delete payload.category;
  if (payload.id) {
    const { error } = await supabase.from('menu_items').update(payload).eq('id', payload.id);
    if (error) throw error;
    return payload.id;
  }
  const { data, error } = await supabase.from('menu_items').insert(payload).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function toggleMenuItemAvailability(id: string, isAvailable: boolean) {
  const { error } = await supabase.from('menu_items').update({ is_available: isAvailable }).eq('id', id);
  if (error) throw error;
}

export async function deleteMenuItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadMenuImage(file: File) {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function listIngredients() {
  const { data, error } = await supabase.from('v_inventory_stock').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as (import('@/types').Ingredient & {
    quantity: number;
    stock_value: number;
    is_low: boolean;
  })[];
}

export async function saveIngredient(
  input: Partial<import('@/types').Ingredient> & { name: string; unit: string },
) {
  const payload = { ...input };
  delete (payload as Record<string, unknown>).quantity;
  if (payload.id) {
    const { error } = await supabase.from('ingredients').update(payload).eq('id', payload.id);
    if (error) throw error;
    return payload.id;
  }
  const { data, error } = await supabase.from('ingredients').insert(payload).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function listRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_items(*, ingredient:ingredients(*))')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as import('@/types').Recipe[];
}

export async function getRecipe(menuItemId: string) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_items(*, ingredient:ingredients(*))')
    .eq('menu_item_id', menuItemId)
    .maybeSingle();
  if (error) throw error;
  return data as import('@/types').Recipe | null;
}

export async function saveRecipe(
  menuItemId: string,
  yieldQty: number,
  items: { ingredient_id: string; quantity: number }[],
  notes?: string,
) {
  const { data: existing } = await supabase
    .from('recipes')
    .select('id')
    .eq('menu_item_id', menuItemId)
    .maybeSingle();

  let recipeId = existing?.id as string | undefined;
  if (recipeId) {
    const { error } = await supabase
      .from('recipes')
      .update({ yield_qty: yieldQty, notes: notes ?? null })
      .eq('id', recipeId);
    if (error) throw error;
    const { error: delError } = await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
    if (delError) throw delError;
  } else {
    const { data, error } = await supabase
      .from('recipes')
      .insert({ menu_item_id: menuItemId, yield_qty: yieldQty, notes: notes ?? null })
      .select('id')
      .single();
    if (error) throw error;
    recipeId = data.id as string;
  }

  if (items.length) {
    const { error } = await supabase.from('recipe_items').insert(
      items.map((i) => ({ recipe_id: recipeId, ingredient_id: i.ingredient_id, quantity: i.quantity })),
    );
    if (error) throw error;
  }
  return recipeId;
}
