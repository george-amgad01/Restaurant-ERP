import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, ProtectedRoute, RequirePermission } from './AppLayout';
import LoginPage from '@/modules/auth/LoginPage';
import SetupPage from '@/modules/auth/SetupPage';
import DashboardPage from '@/modules/dashboard/DashboardPage';
import PosPage from '@/modules/pos/PosPage';
import OrdersPage from '@/modules/orders/OrdersPage';
import KitchenPage from '@/modules/kds/KitchenPage';
import MenuPage from '@/modules/menu/MenuPage';
import InventoryPage from '@/modules/inventory/InventoryPage';
import ExpensesPage from '@/modules/expenses/ExpensesPage';
import AnalyticsPage from '@/modules/dashboard/AnalyticsPage';
import AiPage from '@/modules/ai/AiPage';
import EmployeesPage from '@/modules/employees/EmployeesPage';
import ActivityPage from '@/modules/activity/ActivityPage';
import SyncPage from '@/modules/sync/SyncPage';
import SettingsPage from '@/modules/settings/SettingsPage';
import NotFoundPage from '@/modules/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <RequirePermission permissions={['dashboard.view']}>
                <DashboardPage />
              </RequirePermission>
            }
          />
          <Route
            path="/pos"
            element={
              <RequirePermission permissions={['pos.create_order']}>
                <PosPage />
              </RequirePermission>
            }
          />
          <Route
            path="/orders"
            element={
              <RequirePermission permissions={['orders.view']}>
                <OrdersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/kitchen"
            element={
              <RequirePermission permissions={['kds.view']}>
                <KitchenPage />
              </RequirePermission>
            }
          />
          <Route
            path="/menu"
            element={
              <RequirePermission permissions={['menu.manage']}>
                <MenuPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory"
            element={
              <RequirePermission permissions={['inventory.view']}>
                <InventoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/expenses"
            element={
              <RequirePermission permissions={['expenses.view', 'expenses.create']}>
                <ExpensesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/analytics"
            element={
              <RequirePermission permissions={['dashboard.view']}>
                <AnalyticsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/ai"
            element={
              <RequirePermission permissions={['ai.use', 'ai.view_reports']}>
                <AiPage />
              </RequirePermission>
            }
          />
          <Route
            path="/employees"
            element={
              <RequirePermission permissions={['employees.manage']}>
                <EmployeesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/activity"
            element={
              <RequirePermission permissions={['activity.view']}>
                <ActivityPage />
              </RequirePermission>
            }
          />
          <Route path="/sync" element={<SyncPage />} />
          <Route
            path="/settings"
            element={
              <RequirePermission permissions={['settings.manage']}>
                <SettingsPage />
              </RequirePermission>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
