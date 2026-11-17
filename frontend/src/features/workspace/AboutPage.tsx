import { Link } from 'react-router-dom'
import { ArrowRight, Check, CircleDashed, Code2, Layers3, Sparkles } from 'lucide-react'
import { PageTitle } from '../../components/ui'

export function AboutPage() {
  return (
    <>
      <PageTitle
        eyebrow="EL FUTURO SE CONSTRUYE PASO A PASO"
        title="Un espacio para evolucionar."
        description="Conoce qué está disponible hoy y hacia dónde vamos."
      />
      <div className="about-intro panel">
        <Sparkles size={32} />
        <h2>Nexora POS</h2>
        <p>El futuro de tu restaurante.</p>
        <span className="pill violet">Versión 0.4 · Caja y pedidos</span>
      </div>
      <div className="roadmap-list">
        {[
          [
            '01',
            'Cimientos del sistema',
            'Registro empresarial, autenticación, sucursales, roles, permisos e identidad visual persistente.',
            'Base disponible',
          ],
          [
            '02',
            'La operación, conectada',
            'Catálogo, apertura y cierre de caja, movimientos manuales y pedidos con preparación. Ventas, pagos y mesas pendientes.',
            'Operación inicial disponible',
          ],
          [
            '03',
            'Una gestión más completa',
            'Cocina, inventario, recetas, proveedores, compras, empleados y reportes.',
            false,
          ],
          [
            '04',
            'Nexora Studio',
            'Editor visual, widgets, documentos y automatizaciones con acciones permitidas.',
            false,
          ],
          [
            '05',
            'Una plataforma comercial',
            'Superadministración, planes, suscripciones, módulos y sitio comercial.',
            false,
          ],
          [
            '06',
            'Más allá del escritorio',
            'Aplicaciones móvil y de escritorio, offline, menú QR, domicilios e integraciones.',
            false,
          ],
        ].map(([number, title, description, current]) => (
          <article className="panel roadmap-item" key={String(number)}>
            <span className={`roadmap-number ${current ? 'current' : ''}`}>{number}</span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <span className={`pill ${current ? 'green' : 'neutral'}`}>
              {current ? <Check size={13} /> : <CircleDashed size={13} />}
              {current || 'Planificado'}
            </span>
          </article>
        ))}
      </div>
      <div className="info-strip">
        <Code2 size={22} />
        <div>
          <h3>Construido con una base compartida y modular.</h3>
          <p>
            Las funciones futuras se incorporarán progresivamente. Las integraciones de hardware,
            DIAN y operación offline aún no están implementadas.
          </p>
        </div>
        <Layers3 size={25} />
      </div>
    </>
  )
}
export function NotFoundPage() {
  return (
    <div className="empty-state">
      <h1>Este lugar aún no existe.</h1>
      <p>Regresa a tu espacio para continuar.</p>
      <Link className="button primary" to="/inicio">
        Volver al inicio
        <ArrowRight size={17} />
      </Link>
    </div>
  )
}
