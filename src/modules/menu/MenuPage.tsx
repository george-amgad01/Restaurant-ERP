import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/context/SettingsContext';
import {
  ChefHat,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteMenuItem,
  listCategories,
  listIngredients,
  listMenuItems,
  listRecipes,
  saveCategory,
  saveIngredient,
  saveMenuItem,
  saveRecipe,
  toggleMenuItemAvailability,
  uploadMenuImage,
} from '@/services/menu.service';
import { errorMessage, supabase } from '@/lib/supabase';
import { cn, money } from '@/lib/utils';
import type { Category, Ingredient, MenuItem, Recipe } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui';

const EMPTY_ITEM: Partial<MenuItem> = {
  name: '',
  name_ar: '',
  price: 0,
  prep_minutes: 10,
  is_available: true,
  is_active: true,
  description: '',
  sku: '',
};

export default function MenuPage() {
  const { currency } = useSettings();
  const qc = useQueryClient();
  const [tab, setTab] = useState('meals');
  const [search, setSearch] = useState('');

  const itemsQuery = useQuery({ queryKey: ['menu-items'], queryFn: () => listMenuItems(true) });
  const catsQuery = useQuery({ queryKey: ['categories'], queryFn: () => listCategories(true) });
  const ingQuery = useQuery({ queryKey: ['ingredients'], queryFn: listIngredients });
  const recipesQuery = useQuery({ queryKey: ['recipes'], queryFn: listRecipes });

  const [itemModal, setItemModal] = useState<Partial<MenuItem> | null>(null);
  const [categoryModal, setCategoryModal] = useState<Partial<Category> | null>(null);
  const [ingredientModal, setIngredientModal] = useState<Partial<Ingredient> | null>(null);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);

  const items = itemsQuery.data ?? [];
  const categories = catsQuery.data ?? [];
  const ingredients = ingQuery.data ?? [];
  const recipes = recipesQuery.data ?? [];

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(term) ||
        (i.name_ar ?? '').toLowerCase().includes(term) ||
        (i.sku ?? '').toLowerCase().includes(term),
    );
  }, [items, search]);

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['menu-items'] }),
      qc.invalidateQueries({ queryKey: ['categories'] }),
      qc.invalidateQueries({ queryKey: ['ingredients'] }),
      qc.invalidateQueries({ queryKey: ['recipes'] }),
      qc.invalidateQueries({ queryKey: ['pos-catalog'] }),
    ]);
  }

  async function onDeleteItem(item: MenuItem) {
    if (!window.confirm(`Delete “${item.name}”? Past orders keep their snapshot.`)) return;
    try {
      await deleteMenuItem(item.id);
      toast.success('Meal deleted.');
      await refreshAll();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function toggleAvailable(item: MenuItem) {
    try {
      await toggleMenuItemAvailability(item.id, !item.is_available);
      await refreshAll();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Menu & recipes"
        subtitle="Meals, categories, ingredients and live production costing."
        actions={
          <Button onClick={() => setItemModal({ ...EMPTY_ITEM })}>
            <Plus className="h-4 w-4" /> Add meal
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'meals', label: 'Meals', count: items.length },
            { value: 'categories', label: 'Categories', count: categories.length },
            { value: 'ingredients', label: 'Ingredients', count: ingredients.length },
            { value: 'recipes', label: 'Recipes', count: recipes.length },
          ]}
        />
        {(tab === 'meals' || tab === 'ingredients') && (
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
        )}
      </div>

      {itemsQuery.isLoading ? (
        <PageLoader />
      ) : tab === 'meals' ? (
        <Card>
          {filteredItems.length === 0 ? (
            <EmptyState icon={<Utensils className="h-8 w-8" />} title="No meals yet" action={<Button size="sm" onClick={() => setItemModal({ ...EMPTY_ITEM })}>Add meal</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Meal</th>
                    <th>Category</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Margin</th>
                    <th>Available</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                            {item.image_url ? (
                              <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full place-items-center text-ink-300"><Utensils className="h-4 w-4" /></div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-ink-900">{item.name}</p>
                            <p className="text-xs text-ink-400">{item.name_ar || item.sku || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td>{item.category?.name ?? '—'}</td>
                      <td className="text-right tabular-nums">{money(item.price, currency)}</td>
                      <td className="text-right tabular-nums">{money(item.cost?.production_cost ?? 0, currency)}</td>
                      <td className="text-right">
                        <Badge
                          tone={
                            (item.cost?.margin_pct ?? 0) >= 50
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : (item.cost?.margin_pct ?? 0) >= 25
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }
                        >
                          {(item.cost?.margin_pct ?? 0).toFixed(1)}%
                        </Badge>
                      </td>
                      <td>
                        <button
                          onClick={() => void toggleAvailable(item)}
                          className={cn(
                            'relative h-5 w-9 rounded-full transition',
                            item.is_available ? 'bg-brand-600' : 'bg-ink-300',
                          )}
                        >
                          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', item.is_available ? 'left-[18px]' : 'left-0.5')} />
                        </button>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setRecipeItem(item)} title="Recipe">
                            <ChefHat className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setItemModal(item)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => void onDeleteItem(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : tab === 'categories' ? (
        <Card>
          <CardHeader title="Meal categories" actions={<Button size="sm" onClick={() => setCategoryModal({ name: '', sort_order: categories.length + 1, is_active: true })}><Plus className="h-4 w-4" /> Add</Button>} />
          <div className="divide-y divide-ink-100">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-800">{c.name}</p>
                  <p className="text-xs text-ink-400">{c.name_ar || '—'} · sort {c.sort_order}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-ink-100 text-ink-500 border-ink-200'}>
                    {c.is_active ? 'Active' : 'Hidden'}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => setCategoryModal(c)}><Pencil className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : tab === 'ingredients' ? (
        <Card>
          <CardHeader title="Ingredients" subtitle="Costs drive recipe costing (weighted average on purchases)." actions={<Button size="sm" onClick={() => setIngredientModal({ name: '', unit: 'g', cost_per_unit: 0, low_stock_threshold: 0 })}><Plus className="h-4 w-4" /> Add</Button>} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Ingredient</th><th>Unit</th><th className="text-right">Cost / unit</th><th className="text-right">Stock</th><th className="text-right">Threshold</th><th /></tr>
              </thead>
              <tbody>
                {ingredients
                  .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))
                  .map((i) => (
                    <tr key={i.id}>
                      <td className="font-medium text-ink-800">{i.name}<span className="ml-2 text-xs text-ink-400">{i.name_ar}</span></td>
                      <td className="text-ink-500">{i.unit}</td>
                      <td className="text-right tabular-nums">{money(i.cost_per_unit, currency)}</td>
                      <td className="text-right tabular-nums">
                        <span className={i.is_low ? 'font-semibold text-amber-700' : ''}>{Number(i.quantity).toFixed(1)}</span>
                      </td>
                      <td className="text-right tabular-nums text-ink-500">{i.low_stock_threshold}</td>
                      <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setIngredientModal(i)}><Pencil className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Recipes" subtitle="Costs recompute automatically when ingredient prices change." />
          <div className="divide-y divide-ink-100">
            {recipes.length === 0 ? (
              <EmptyState icon={<ChefHat className="h-8 w-8" />} title="No recipes defined" description="Open a meal and use the chef icon to build its recipe." />
            ) : (
              recipes.map((recipe: Recipe) => {
                const item = items.find((i) => i.id === recipe.menu_item_id);
                if (!item) return null;
                return (
                  <div key={recipe.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{item.name}</p>
                      <p className="text-xs text-ink-500">
                        {recipe.recipe_items.length} ingredients · yield {recipe.yield_qty}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-ink-500">Cost {money(item.cost?.production_cost ?? 0, currency)}</span>
                      <Badge tone="bg-brand-50 text-brand-700 border-brand-200">{item.cost?.margin_pct ?? 0}% margin</Badge>
                      <Button size="sm" variant="outline" onClick={() => setRecipeItem(item)}><Pencil className="h-4 w-4" /> Edit</Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {itemModal && (
        <ItemModal
          value={itemModal}
          categories={categories}
          onClose={() => setItemModal(null)}
          onSaved={async () => { setItemModal(null); await refreshAll(); }}
        />
      )}
      {categoryModal && (
        <CategoryModal
          value={categoryModal}
          onClose={() => setCategoryModal(null)}
          onSaved={async () => { setCategoryModal(null); await refreshAll(); }}
        />
      )}
      {ingredientModal && (
        <IngredientModal
          value={ingredientModal}
          onClose={() => setIngredientModal(null)}
          onSaved={async () => { setIngredientModal(null); await refreshAll(); }}
        />
      )}
      {recipeItem && (
        <RecipeModal
          item={recipeItem}
          ingredients={ingredients}
          recipes={recipes}
          onClose={() => setRecipeItem(null)}
          onSaved={async () => { setRecipeItem(null); await refreshAll(); }}
        />
      )}
    </div>
  );
}

function ItemModal({
  value,
  categories,
  onClose,
  onSaved,
}: {
  value: Partial<MenuItem>;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<MenuItem>>(value);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickImage(file: File) {
    setUploading(true);
    try {
      const url = await uploadMenuImage(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!form.name?.trim()) return toast.error('Name is required.');
    setBusy(true);
    try {
      await saveMenuItem({
        id: form.id,
        name: form.name.trim(),
        name_ar: form.name_ar || null,
        category_id: form.category_id || null,
        sku: form.sku || null,
        description: form.description || null,
        price: Number(form.price ?? 0),
        prep_minutes: Number(form.prep_minutes ?? 10),
        image_url: form.image_url || null,
        is_available: form.is_available ?? true,
        is_active: form.is_active ?? true,
        sort_order: Number(form.sort_order ?? 0),
      });
      toast.success('Meal saved.');
      await onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={form.id ? 'Edit meal' : 'Add meal'}
      size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save meal</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Arabic name"><Input value={form.name_ar ?? ''} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></Field>
        <Field label="SKU"><Input value={form.sku ?? ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
        <Field label="Category">
          <Select value={form.category_id ?? ''} onChange={(e) => setForm({ ...form, category_id: e.target.value || null })}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Price" required>
          <Input type="number" min={0} step="0.01" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        </Field>
        <Field label="Prep minutes">
          <Input type="number" min={1} value={form.prep_minutes ?? 10} onChange={(e) => setForm({ ...form, prep_minutes: Number(e.target.value) })} />
        </Field>
        <Field label="Sort order">
          <Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <label className="label">Image</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-lg bg-ink-100">
              {form.image_url ? <img src={form.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-ink-300"><ImagePlus className="h-5 w-5" /></div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void pickImage(e.target.files[0])} />
            <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>Upload image</Button>
            {form.image_url && <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, image_url: null })}>Remove</Button>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_available ?? true} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} />
          Available for sale
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Active
        </label>
      </div>
    </Modal>
  );
}

function CategoryModal({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<Category>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Category>>(value);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name?.trim()) return toast.error('Name required');
    setBusy(true);
    try {
      await saveCategory({ id: form.id, name: form.name.trim(), name_ar: form.name_ar || null, sort_order: Number(form.sort_order ?? 0), is_active: form.is_active ?? true });
      toast.success('Category saved.');
      await onSaved();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!value} onClose={onClose} title={form.id ? 'Edit category' : 'Add category'} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Arabic name"><Input value={form.name_ar ?? ''} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></Field>
        <Field label="Sort order"><Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
      </div>
    </Modal>
  );
}

function IngredientModal({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<Ingredient>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Ingredient>>(value);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.name?.trim()) return toast.error('Name required');
    setBusy(true);
    try {
      await saveIngredient({
        id: form.id,
        name: form.name.trim(),
        name_ar: form.name_ar || null,
        unit: form.unit ?? 'g',
        cost_per_unit: Number(form.cost_per_unit ?? 0),
        low_stock_threshold: Number(form.low_stock_threshold ?? 0),
        is_active: form.is_active ?? true,
      });
      toast.success('Ingredient saved.');
      await onSaved();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!value} onClose={onClose} title={form.id ? 'Edit ingredient' : 'Add ingredient'} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Unit" required>
          <Select value={form.unit ?? 'g'} onChange={(e) => setForm({ ...form, unit: e.target.value as Ingredient['unit'] })}>
            <option value="g">gram (g)</option><option value="ml">millilitre (ml)</option><option value="pcs">piece (pcs)</option>
          </Select>
        </Field>
        <Field label="Cost per unit" hint="Updated automatically by weighted average on purchases.">
          <Input type="number" min={0} step="0.0001" value={form.cost_per_unit ?? 0} onChange={(e) => setForm({ ...form, cost_per_unit: Number(e.target.value) })} />
        </Field>
        <Field label="Low stock threshold">
          <Input type="number" min={0} step="0.001" value={form.low_stock_threshold ?? 0} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
        </Field>
      </div>
    </Modal>
  );
}

function RecipeModal({
  item,
  ingredients,
  recipes,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  ingredients: (Ingredient & { quantity?: number })[];
  recipes: Recipe[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { currency } = useSettings();
  const existing = recipes.find((r) => r.menu_item_id === item.id);
  const [yieldQty, setYieldQty] = useState(existing?.yield_qty ?? 1);
  const [rows, setRows] = useState<{ ingredient_id: string; quantity: number }[]>(
    existing?.recipe_items.map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: Number(ri.quantity) })) ?? [],
  );
  const [busy, setBusy] = useState(false);

  const cost = rows.reduce((sum, row) => {
    const ing = ingredients.find((i) => i.id === row.ingredient_id);
    return sum + (ing ? Number(ing.cost_per_unit) * row.quantity : 0);
  }, 0) / Math.max(1, yieldQty);

  async function submit() {
    setBusy(true);
    try {
      await saveRecipe(item.id, yieldQty, rows.filter((r) => r.ingredient_id && r.quantity > 0));
      toast.success('Recipe saved. Meal cost updated.');
      await onSaved();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!item} onClose={onClose} title={`Recipe — ${item.name}`} subtitle="Ingredient quantities per batch" size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save recipe</Button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Batch yield (portions)" className="w-40">
            <Input type="number" min={1} step="0.1" value={yieldQty} onChange={(e) => setYieldQty(Number(e.target.value) || 1)} />
          </Field>
          <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
            <span className="text-ink-500">Batch cost </span>
            <span className="font-semibold text-ink-900">{money(cost * Math.max(1, yieldQty), currency)}</span>
            <span className="ml-3 text-ink-500">Per portion </span>
            <span className="font-semibold text-brand-700">{money(cost, currency)}</span>
          </div>
        </div>

        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-ink-400">No ingredients yet.</p>}
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-2">
              <Field label={index === 0 ? 'Ingredient' : undefined} className="flex-1">
                <Select value={row.ingredient_id} onChange={(e) => setRows((prev) => prev.map((r, i) => i === index ? { ...r, ingredient_id: e.target.value } : r))}>
                  <option value="">Choose…</option>
                  {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </Select>
              </Field>
              <Field label={index === 0 ? 'Quantity' : undefined} className="w-32">
                <Input type="number" min={0} step="0.001" value={row.quantity} onChange={(e) => setRows((prev) => prev.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
              </Field>
              <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { ingredient_id: '', quantity: 0 }])}>
          <Plus className="h-4 w-4" /> Add ingredient
        </Button>
      </div>
    </Modal>
  );
}
