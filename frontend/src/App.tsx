import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell, PermissionBoundary } from './components/AppShell'
import { AuthPage } from './features/auth/AuthPage'
import { OverviewPage } from './features/workspace/OverviewPage'
import { BranchesPage } from './features/workspace/BranchesPage'
import { TeamPage } from './features/workspace/TeamPage'
import { DeliveriesPage } from './features/orders/DeliveriesPage'
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
import { PickupTerminalPage } from './features/orders/PickupTerminalPage'
import { SalesPage } from './features/sales/SalesPage'
import { SalesSettingsPage } from './features/sales/SalesSettingsPage'
import { SaleDetailPage } from './features/sales/SaleDetailPage'
import { CheckoutPage } from './features/sales/CheckoutPage'
import { KitchenBoardPage } from './features/kitchen/KitchenBoardPage'
import { KitchenRoutesPage } from './features/kitchen/KitchenRoutesPage'
import { PaymentMethodsPage } from './features/sales/PaymentMethodsPage'
import { TaxProfilesPage } from './features/sales/TaxProfilesPage'
import { Loading } from './components/ui'
import { PosAccess } from './features/pos/PosAccess'
import { HomeRoute } from './features/auth/HomeRoute'
const TerminalTablesPage = lazy(() =>
  import('./features/dining/TerminalTablesPage').then((module) => ({
    default: module.TerminalTablesPage,
  })),
)
const StationsPage = lazy(() =>
  import('./features/kitchen/StationsPage').then((module) => ({ default: module.StationsPage })),
)
const SecurityPage = lazy(() =>
  import('./features/auth/SecurityPage').then((module) => ({ default: module.SecurityPage })),
)
const VerifyEmailPage = lazy(() =>
  import('./features/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })),
)

const RoomsPage = lazy(() =>
  import('./features/dining/RoomsPage').then((module) => ({ default: module.RoomsPage })),
)
const ReservationsPage = lazy(() =>
  import('./features/dining/ReservationsPage').then((module) => ({
    default: module.ReservationsPage,
  })),
)
const RoomDetailPage = lazy(() =>
  import('./features/dining/RoomsPage').then((module) => ({ default: module.RoomDetailPage })),
)
const SessionsPage = lazy(() =>
  import('./features/dining/SessionsPage').then((module) => ({ default: module.SessionsPage })),
)
const SessionDetailPage = lazy(() =>
  import('./features/dining/SessionsPage').then((module) => ({
    default: module.SessionDetailPage,
  })),
)
const DiningPosPage = lazy(() =>
  import('./features/dining/DiningPosPage').then((module) => ({ default: module.DiningPosPage })),
)

const PaymentHistoryPage = lazy(() =>
  import('./features/sales/PaymentHistoryPage').then((module) => ({
    default: module.PaymentHistoryPage,
  })),
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/ingresar" element={<AuthPage key="login" />} />
      <Route path="/registro" element={<AuthPage key="register" mode="register" />} />
      <Route path="/recuperar" element={<AuthPage key="forgot" mode="forgot" />} />
      <Route path="/restablecer" element={<AuthPage key="reset" mode="reset" />} />
      <Route element={<AppShell />}>
        <Route
          path="/terminal/recogidas"
          element={
            <PermissionBoundary permission="orders.view">
              <PickupTerminalPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/terminal/domicilios"
          element={
            <PermissionBoundary permission="orders.view">
              <DeliveriesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/terminal/mesas"
          element={
            <PermissionBoundary permission="dining.view">
              <Suspense fallback={<Loading />}>
                <TerminalTablesPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/cocina/estaciones"
          element={
            <PermissionBoundary permission="kitchen.view">
              <Suspense fallback={<Loading />}>
                <StationsPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/terminal/cocina"
          element={
            <PermissionBoundary permission="kitchen.view">
              <KitchenBoardPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/cocina/rutas"
          element={
            <PermissionBoundary permission="kitchen.manage">
              <KitchenRoutesPage />
            </PermissionBoundary>
          }
        />
        <Route
          path="/verificar-correo"
          element={
            <Suspense fallback={<Loading />}>
              <VerifyEmailPage />
            </Suspense>
          }
        />
        <Route
          path="/mi-seguridad"
          element={
            <Suspense fallback={<Loading />}>
              <SecurityPage />
            </Suspense>
          }
        />
        <Route
          path="/salones/reservas"
          element={
            <PermissionBoundary permission="dining.reserve">
              <Suspense fallback={<Loading />}>
                <ReservationsPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/salones/atenciones"
          element={
            <PermissionBoundary permission="dining.view">
              <Suspense fallback={<Loading />}>
                <SessionsPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/salones/atenciones/:sessionId"
          element={
            <PermissionBoundary permission="dining.view">
              <Suspense fallback={<Loading />}>
                <SessionDetailPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/pos/atenciones/:sessionId"
          element={
            <PosAccess takingOrder>
              <PermissionBoundary permission="dining.view">
                <PermissionBoundary permission="dining.operate">
                  <Suspense fallback={<Loading />}>
                    <DiningPosPage />
                  </Suspense>
                </PermissionBoundary>
              </PermissionBoundary>
            </PosAccess>
          }
        />
        <Route
          path="/salones"
          element={
            <PermissionBoundary permission="dining.view">
              <Suspense fallback={<Loading />}>
                <RoomsPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/salones/:roomId"
          element={
            <PermissionBoundary permission="dining.view">
              <Suspense fallback={<Loading />}>
                <RoomDetailPage />
              </Suspense>
            </PermissionBoundary>
          }
        />
        <Route
          path="/pos"
          element={
            <PosAccess>
              <OrderComposer key="pos" terminal />
            </PosAccess>
          }
        />
        <Route
          path="/pos/pedidos/:orderId/cobrar"
          element={
            <PosAccess>
              <CheckoutPage terminal />
            </PosAccess>
          }
        />
        <Route
          path="/pos/ventas/:saleId"
          element={
            <PosAccess>
              <PermissionBoundary permission="sales.view">
                <SaleDetailPage terminal />
              </PermissionBoundary>
            </PosAccess>
          }
        />
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
            <PosAccess takingOrder>
              <OrderComposer key="operational-new" terminal />
            </PosAccess>
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
