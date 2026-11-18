import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell, PermissionBoundary } from './components/AppShell'
import { AuthPage } from './features/auth/AuthPage'
import { OverviewPage } from './features/workspace/OverviewPage'
import { BranchesPage } from './features/workspace/BranchesPage'
import { TeamPage } from './features/workspace/TeamPage'
import { RolesPage } from './features/workspace/RolesPage'
import { SettingsPage } from './features/workspace/SettingsPage'
import { StudioPage } from './features/studio/StudioPage'
import { AboutPage, NotFoundPage } from './features/workspace/AboutPage'
import { ProductsPage } from './features/catalog/ProductsPage'
import { CategoriesPage } from './features/catalog/CategoriesPage'
import { ProductDetailPage } from './features/catalog/ProductDetailPage'
import { CashPage } from './features/cash/CashPage'
import { CashSessionPage } from './features/cash/CashSessionPage'
import { OrdersPage } from './features/orders/OrdersPage'
import { OrderDetailPage } from './features/orders/OrderDetailPage'
import { OrderComposer } from './features/orders/OrderComposer'
import { SalesPage } from './features/sales/SalesPage'
import { SalesSettingsPage } from './features/sales/SalesSettingsPage'
import { SaleDetailPage } from './features/sales/SaleDetailPage'
import { CheckoutPage } from './features/sales/CheckoutPage'
import { PaymentMethodsPage } from './features/sales/PaymentMethodsPage'
import { TaxProfilesPage } from './features/sales/TaxProfilesPage'
import { Loading } from './components/ui'

const PaymentHistoryPage = lazy(() =>
  import('./features/sales/PaymentHistoryPage').then((module) => ({
    default: module.PaymentHistoryPage,
  })),
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inicio" replace />} />
      <Route path="/ingresar" element={<AuthPage key="login" />} />
      <Route path="/registro" element={<AuthPage key="register" mode="register" />} />
      <Route path="/recuperar" element={<AuthPage key="forgot" mode="forgot" />} />
      <Route path="/restablecer" element={<AuthPage key="reset" mode="reset" />} />
      <Route element={<AppShell />}>
        <Route
          path="/ventas/historial"
          element={
            <PermissionBoundary permission="sales.view">
              <Suspense fallback={<Loading />}>
                <PaymentHistoryPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/ventas/impuestos"
          element={
            <PermissionBoundary permission="sales.configure">
              <TaxProfilesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/ventas/metodos"
          element={
            <PermissionBoundary permission="sales.configure">
              <PaymentMethodsPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/ventas"
          element={
            <PermissionBoundary permission="sales.view">
              <SalesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/ventas/configuracion"
          element={
            <PermissionBoundary permission="sales.configure">
              <SalesSettingsPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/ventas/:saleId"
          element={
            <PermissionBoundary permission="sales.view">
              <SaleDetailPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/pedidos/:orderId/cobrar"
          element={
            <PermissionBoundary permission="sales.collect">
              <PermissionBoundary permission="orders.view">
                <CheckoutPage />
              </PermissionBoundary>
            </PermissionBoundary>
          }
        />
        <Route
          path="/caja"
          element={
            <PermissionBoundary permission="cash.view">
              <CashPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/caja/sesiones/:sessionId"
          element={
            <PermissionBoundary permission="cash.view">
              <CashSessionPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/pedidos"
          element={
            <PermissionBoundary permission="orders.view">
              <OrdersPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/pedidos/nuevo"
          element={
            <PermissionBoundary permission="orders.manage">
              <OrderComposer />
            </PermissionBoundary>
          }
        />
        <Route
          path="/pedidos/:orderId"
          element={
            <PermissionBoundary permission="orders.view">
              <OrderDetailPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/productos/:productId"
          element={
            <PermissionBoundary permission="catalog.view">
              <ProductDetailPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/productos"
          element={
            <PermissionBoundary permission="catalog.view">
              <ProductsPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/categorias"
          element={
            <PermissionBoundary permission="catalog.view">
              <CategoriesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/inicio"
          element={
            <PermissionBoundary permission="dashboard.view">
              <OverviewPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/sucursales"
          element={
            <PermissionBoundary permission="branches.view">
              <BranchesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/equipo"
          element={
            <PermissionBoundary permission="team.view">
              <TeamPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/roles"
          element={
            <PermissionBoundary permission="roles.view">
              <RolesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/studio"
          element={
            <PermissionBoundary permission="studio.view">
              <StudioPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/configuracion"
          element={
            <PermissionBoundary permission="settings.view">
              <SettingsPage />
            </PermissionBoundary>
          }
        />
        <Route path="/acerca" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
