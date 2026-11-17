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
